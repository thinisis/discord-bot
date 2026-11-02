package control

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Config struct {
	Database, Secret, Token, Application, Guild, LavaURL, LavaPassword, Mode, Host, Port string
	SessionTTL                                                                           time.Duration
	PlaylistMax                                                                          int
}

func config() (Config, error) {
	c := Config{Database: os.Getenv("DATABASE_URL"), Secret: os.Getenv("SESSION_SECRET"), Token: os.Getenv("DISCORD_TOKEN"), Application: os.Getenv("DISCORD_APPLICATION_ID"), Guild: os.Getenv("DISCORD_COMMAND_GUILD_ID"), LavaURL: os.Getenv("LAVALINK_URL"), LavaPassword: os.Getenv("LAVALINK_PASSWORD"), Mode: env("APP_MODE", "all"), Host: env("HOST", "0.0.0.0"), Port: env("PORT", "3000"), SessionTTL: time.Duration(integer(env("ADMIN_SESSION_TTL_HOURS", "168"))) * time.Hour, PlaylistMax: integer(env("MUSIC_PLAYLIST_MAX_ITEMS", "100"))}
	if c.Mode != "all" && c.Mode != "web" && c.Mode != "bot" {
		return c, errors.New("APP_MODE must be all, web or bot")
	}
	if c.Database == "" || len(c.Secret) < 16 {
		return c, errors.New("DATABASE_URL and SESSION_SECRET (16+ characters) required")
	}
	if c.Mode != "web" && (c.Token == "" || c.Application == "" || c.LavaURL == "" || c.LavaPassword == "") {
		return c, errors.New("Discord and Lavalink configuration required")
	}
	if c.SessionTTL <= 0 {
		c.SessionTTL = 168 * time.Hour
	}
	if c.PlaylistMax < 1 || c.PlaylistMax > 500 {
		c.PlaylistMax = 100
	}
	return c, nil
}
func env(k, d string) string {
	if s := os.Getenv(k); s != "" {
		return s
	}
	return d
}
func integer(s string) int { n, _ := strconv.Atoi(s); return n }
func uid() string {
	b := make([]byte, 24)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}

type Entry struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
}
type App struct {
	cfg      Config
	db       *pgxpool.Pool
	bot      *Bot
	started  time.Time
	assets   fs.FS
	mu       sync.Mutex
	logs     []Entry
	attempts map[string]*attempt
	logFile  *os.File
	ctx      context.Context
	youtube  *youtubeOAuth
}

func (a *App) record(level, message string) {
	e := Entry{uid(), time.Now().UTC(), level, message}
	a.mu.Lock()
	a.logs = append(a.logs, e)
	if len(a.logs) > 2000 {
		a.logs = a.logs[len(a.logs)-2000:]
	}
	if a.logFile != nil {
		b, _ := json.Marshal(e)
		a.logFile.Write(append(b, '\n'))
	}
	a.mu.Unlock()
	slog.Info(message, "level", level)
}
func Run(assets fs.FS) error {
	c, err := config()
	if err != nil {
		return err
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer cancel()
	db, err := pgxpool.New(ctx, c.Database)
	if err != nil {
		return err
	}
	defer db.Close()
	if err = db.Ping(ctx); err != nil {
		return err
	}
	if err = migrate(ctx, db, assets); err != nil {
		return err
	}
	os.MkdirAll("runtime", 0700)
	f, _ := os.OpenFile("runtime/go-system.log.jsonl", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if f != nil {
		defer f.Close()
	}
	a := &App{cfg: c, db: db, started: time.Now(), assets: assets, attempts: map[string]*attempt{}, logFile: f, ctx: ctx}
	a.youtube = newYoutubeOAuth(a)
	a.loadLogs()
	if err = a.bootstrap(ctx); err != nil {
		return err
	}
	if c.Mode != "web" {
		a.bot = NewBot(a)
		if err = a.bot.Start(ctx); err != nil {
			return err
		}
		defer a.bot.Stop()
	}
	if c.Mode == "bot" {
		<-ctx.Done()
		return nil
	}
	server := &http.Server{Addr: c.Host + ":" + c.Port, Handler: a.routes(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 90 * time.Second}
	go func() {
		<-ctx.Done()
		shutdown, stop := context.WithTimeout(context.Background(), 15*time.Second)
		defer stop()
		server.Shutdown(shutdown)
	}()
	a.record("info", "Go control plane listening on "+server.Addr)
	if err = server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
func migrate(ctx context.Context, db *pgxpool.Pool, files fs.FS) error {
	var exists bool
	if e := db.QueryRow(ctx, `SELECT to_regclass('public."AdminUser"') IS NOT NULL`).Scan(&exists); e != nil {
		return e
	}
	if exists {
		// Existing Node/Go installations already have the initial schema.
		// Later additive migrations must be explicitly idempotent.
		b, err := fs.ReadFile(files, "migrations/20261102000000_youtube_oauth.sql")
		if err != nil {
			return err
		}
		_, err = db.Exec(ctx, string(b))
		return err
	}
	names, e := fs.Glob(files, "migrations/*.sql")
	if e != nil {
		return e
	}
	tx, e := db.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	for _, name := range names {
		b, e := fs.ReadFile(files, name)
		if e != nil {
			return e
		}
		if _, e = tx.Exec(ctx, string(b)); e != nil {
			return fmt.Errorf("migration %s: %w", name, e)
		}
	}
	return tx.Commit(ctx)
}
func (a *App) rows(ctx context.Context, q string, args ...any) ([]map[string]any, error) {
	rows, err := a.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []map[string]any{}
	for rows.Next() {
		var b []byte
		if err = rows.Scan(&b); err != nil {
			return nil, err
		}
		var m map[string]any
		if err = json.Unmarshal(b, &m); err != nil {
			return nil, err
		}
		normalizeTimestamps(m)
		result = append(result, m)
	}
	return result, rows.Err()
}
func (a *App) system(ctx context.Context) (map[string]any, error) {
	r, e := a.rows(ctx, `SELECT row_to_json(t) FROM "SystemConfig" t WHERE id=1`)
	if e != nil {
		return nil, e
	}
	if len(r) == 0 {
		return nil, errors.New("missing system config")
	}
	return r[0], nil
}
func (a *App) guildEnabled(ctx context.Context, id string) bool {
	var enabled bool
	e := a.db.QueryRow(ctx, `SELECT "botEnabled" FROM "GuildConfig" WHERE "guildId"=$1`, id).Scan(&enabled)
	return e == nil && enabled
}
func (a *App) guildLog(ctx context.Context, gid, name, action, message, channel, user, target string) {
	_, e := a.db.Exec(ctx, `INSERT INTO "LogRecord" (id,"guildId","guildName","action",message,"channelId","userId","targetId","createdAt") VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),CURRENT_TIMESTAMP)`, uid(), gid, name, action, message, channel, user, target)
	if e != nil {
		a.record("error", "Guild log: "+e.Error())
		return
	}
	if a.bot != nil {
		var dest *string
		a.db.QueryRow(ctx, `SELECT "logChannelId" FROM "GuildConfig" WHERE "guildId"=$1`, gid).Scan(&dest)
		if dest != nil && *dest != "" {
			a.bot.send(*dest, message)
		}
	}
}
func str(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}
func ownerIDs(v string) []string {
	return strings.FieldsFunc(v, func(r rune) bool { return r == ',' || r == '\n' || r == ' ' || r == '\t' || r == '\r' })
}

func normalizeTimestamps(row map[string]any) {
	for _, key := range []string{"createdAt", "updatedAt", "lastLoginAt", "runAt", "nextRunAt", "lastSentAt"} {
		if value, ok := row[key].(string); ok {
			if t, err := time.Parse("2006-01-02T15:04:05.999999999", value); err == nil {
				row[key] = t.UTC().Format(time.RFC3339Nano)
			}
		}
	}
}
