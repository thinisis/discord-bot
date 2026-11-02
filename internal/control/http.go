package control

import (
	"io/fs"
	"net/http"
	"runtime"
	"strings"
	"time"
)

func (a *App) routes() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("POST /api/login", a.login)
	m.HandleFunc("POST /api/logout", a.logout)
	m.HandleFunc("PUT /api/account/password", a.changePassword)
	m.HandleFunc("GET /api/healthz", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, 200, map[string]any{"ok": true, "mode": a.cfg.Mode, "runtime": "go", "botReady": a.bot != nil && a.bot.ready.Load()})
	})
	m.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		_, name, _ := a.session(r)
		jsonResponse(w, 200, map[string]string{"username": name})
	})
	m.HandleFunc("GET /api/integrations/youtube/oauth", a.youtubeStatus)
	m.HandleFunc("POST /api/integrations/youtube/oauth/start", a.youtubeStart)
	m.HandleFunc("POST /api/integrations/youtube/oauth/poll", a.youtubePoll)
	m.HandleFunc("POST /api/integrations/youtube/oauth/apply", a.youtubeApply)
	m.HandleFunc("DELETE /api/integrations/youtube/oauth/pending", a.youtubeCancel)
	m.HandleFunc("DELETE /api/integrations/youtube/oauth", a.youtubeDisconnect)
	m.HandleFunc("GET /api/status", a.status)
	m.HandleFunc("GET /api/guilds", a.guilds)
	m.HandleFunc("PUT /api/guilds/{id}", a.saveGuild)
	m.HandleFunc("GET /api/logs", a.getLogs)
	m.HandleFunc("GET /api/settings", a.settings)
	m.HandleFunc("PUT /api/settings", a.saveSystem)
	m.HandleFunc("PUT /api/policies", a.savePolicies)
	m.HandleFunc("POST /api/schedules", a.saveSchedule)
	m.HandleFunc("PUT /api/schedules/{id}", a.saveSchedule)
	m.HandleFunc("DELETE /api/schedules/{id}", a.deleteSchedule)
	m.HandleFunc("GET /api/channels/{id}", a.channels)
	web, _ := fs.Sub(a.assets, "web")
	static := http.StripPrefix("/assets/", http.FileServer(http.FS(web)))
	m.Handle("GET /assets/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/assets/bundle/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=3600")
		}
		static.ServeHTTP(w, r)
	}))
	m.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/login" && r.URL.Path != "/dashboard" && r.URL.Path != "/guilds" && r.URL.Path != "/music" && r.URL.Path != "/logs" && r.URL.Path != "/settings" {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path != "/" {
			_, _, err := a.session(r)
			if err != nil && r.URL.Path != "/login" {
				http.Redirect(w, r, "/login", 303)
				return
			}
			if err == nil && r.URL.Path == "/login" {
				http.Redirect(w, r, "/dashboard", 303)
				return
			}
		}
		b, _ := fs.ReadFile(web, "index.html")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(b)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com https://i.ytimg.com data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			if r.Method != "GET" && !sameOrigin(r) {
				fail(w, 403, "Nguồn yêu cầu không hợp lệ.")
				return
			}
			if r.URL.Path != "/api/login" && r.URL.Path != "/api/healthz" {
				if _, _, e := a.session(r); e != nil {
					fail(w, 401, "Vui lòng đăng nhập.")
					return
				}
			}
		}
		m.ServeHTTP(w, r)
	})
}
func (a *App) status(w http.ResponseWriter, r *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	var guilds, logs, schedules int
	a.db.QueryRow(r.Context(), `SELECT count(*) FROM "GuildConfig"`).Scan(&guilds)
	a.db.QueryRow(r.Context(), `SELECT count(*) FROM "LogRecord"`).Scan(&logs)
	a.db.QueryRow(r.Context(), `SELECT count(*) FROM "ScheduledMessage" WHERE enabled=true`).Scan(&schedules)
	result := map[string]any{"runtime": "Go " + runtime.Version(), "uptimeSeconds": int(time.Since(a.started).Seconds()), "memoryMB": float64(mem.Alloc) / (1024 * 1024), "goroutines": runtime.NumGoroutine(), "guildCount": guilds, "logCount": logs, "scheduleCount": schedules, "startedAt": a.started, "bot": map[string]any{"ready": false, "enabled": false}, "music": map[string]any{"connected": false, "sessions": []any{}}}
	if a.bot != nil {
		result["bot"] = a.bot.Status()
		result["music"] = a.bot.music.Status()
	}
	jsonResponse(w, 200, result)
}
func (a *App) guilds(w http.ResponseWriter, r *http.Request) {
	items, e := a.rows(r.Context(), `SELECT row_to_json(t) FROM (SELECT g.*,(SELECT count(*) FROM "LogRecord" l WHERE l."guildId"=g."guildId") AS "logCount" FROM "GuildConfig" g ORDER BY "guildName") t`)
	if e != nil {
		fail(w, 500, "Không thể tải guild.")
		return
	}
	jsonResponse(w, 200, items)
}
func (a *App) channels(w http.ResponseWriter, r *http.Request) {
	if a.bot == nil {
		jsonResponse(w, 200, []any{})
		return
	}
	ch, e := a.bot.session.GuildChannels(r.PathValue("id"))
	if e != nil {
		fail(w, 502, "Không thể tải kênh Discord.")
		return
	}
	jsonResponse(w, 200, ch)
}
func (a *App) saveGuild(w http.ResponseWriter, r *http.Request) {
	var in struct {
		BotEnabled   bool   `json:"botEnabled"`
		LogChannelID string `json:"logChannelId"`
		MusicVolume  int    `json:"musicVolume"`
	}
	if !decode(w, r, &in) {
		return
	}
	if in.MusicVolume < 0 || in.MusicVolume > 200 || (in.LogChannelID != "" && !snowflake(in.LogChannelID)) {
		fail(w, 400, "Âm lượng hoặc channel ID không hợp lệ.")
		return
	}
	tag, e := a.db.Exec(r.Context(), `UPDATE "GuildConfig" SET "botEnabled"=$1,"logChannelId"=NULLIF($2,''),"musicVolume"=$3,"updatedAt"=CURRENT_TIMESTAMP WHERE "guildId"=$4`, in.BotEnabled, in.LogChannelID, in.MusicVolume, r.PathValue("id"))
	if e != nil {
		fail(w, 500, "Không thể lưu guild.")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "Không tìm thấy guild.")
		return
	}
	if a.bot != nil {
		a.bot.music.SyncGuild(r.PathValue("id"), in.BotEnabled, in.MusicVolume)
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *App) settings(w http.ResponseWriter, r *http.Request) {
	system, e := a.system(r.Context())
	if e != nil {
		fail(w, 500, "Không thể tải cấu hình.")
		return
	}
	policies, e := a.rows(r.Context(), `SELECT row_to_json(t) FROM "CommandPolicy" t ORDER BY "commandName"`)
	if e != nil {
		fail(w, 500, "Không thể tải quyền.")
		return
	}
	schedules, e := a.rows(r.Context(), `SELECT row_to_json(t) FROM "ScheduledMessage" t ORDER BY "createdAt" DESC`)
	if e != nil {
		fail(w, 500, "Không thể tải lịch.")
		return
	}
	jsonResponse(w, 200, map[string]any{"system": system, "policies": policies, "schedules": schedules, "commands": commandNames})
}
func (a *App) saveSystem(w http.ResponseWriter, r *http.Request) {
	var in struct {
		OwnerDiscordIDs string `json:"ownerDiscordIds"`
		QueuePageSize   int    `json:"queuePageSize"`
		Morning         string `json:"idleMorningText"`
		Noon            string `json:"idleNoonText"`
		Evening         string `json:"idleEveningText"`
		Night           string `json:"idleNightText"`
	}
	if !decode(w, r, &in) {
		return
	}
	ids := ownerIDs(in.OwnerDiscordIDs)
	if len(ids) == 0 || in.QueuePageSize < 5 || in.QueuePageSize > 25 {
		fail(w, 400, "Cần owner Discord ID và kích thước queue 5–25.")
		return
	}
	for _, id := range ids {
		if !snowflake(id) {
			fail(w, 400, "Owner ID không hợp lệ.")
			return
		}
	}
	for _, s := range []string{in.Morning, in.Noon, in.Evening, in.Night} {
		if strings.TrimSpace(s) == "" || len([]rune(s)) > 120 {
			fail(w, 400, "Nội dung presence cần 1–120 ký tự.")
			return
		}
	}
	_, e := a.db.Exec(r.Context(), `UPDATE "SystemConfig" SET "ownerDiscordIds"=$1,"queuePageSize"=$2,"idleMorningText"=$3,"idleNoonText"=$4,"idleEveningText"=$5,"idleNightText"=$6,"updatedAt"=CURRENT_TIMESTAMP WHERE id=1`, strings.Join(ids, "\n"), in.QueuePageSize, in.Morning, in.Noon, in.Evening, in.Night)
	if e != nil {
		fail(w, 500, "Không thể lưu cấu hình.")
		return
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *App) savePolicies(w http.ResponseWriter, r *http.Request) {
	var in map[string]string
	if !decode(w, r, &in) {
		return
	}
	for name, level := range in {
		if !contains(commandNames, name) || (level != "OWNER" && level != "EVERYONE") {
			fail(w, 400, "Quyền lệnh không hợp lệ.")
			return
		}
	}
	tx, e := a.db.Begin(r.Context())
	if e != nil {
		fail(w, 500, "Không thể lưu quyền.")
		return
	}
	defer tx.Rollback(r.Context())
	for name, level := range in {
		_, e = tx.Exec(r.Context(), `INSERT INTO "CommandPolicy" ("commandName","accessLevel","createdAt","updatedAt") VALUES ($1,$2::"CommandAccessLevel",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT("commandName") DO UPDATE SET "accessLevel"=excluded."accessLevel","updatedAt"=CURRENT_TIMESTAMP`, name, level)
		if e != nil {
			fail(w, 500, "Không thể lưu quyền.")
			return
		}
	}
	if e = tx.Commit(r.Context()); e != nil {
		fail(w, 500, "Không thể lưu quyền.")
		return
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *App) getLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := integer(q.Get("page"))
	if page < 1 {
		page = 1
	}
	size := 30
	if q.Get("source") == "system" {
		a.mu.Lock()
		items := append([]Entry{}, a.logs...)
		a.mu.Unlock()
		filtered := []Entry{}
		for i := len(items) - 1; i >= 0; i-- {
			e := items[i]
			if (q.Get("level") == "" || e.Level == q.Get("level")) && strings.Contains(strings.ToLower(e.Message), strings.ToLower(q.Get("q"))) {
				filtered = append(filtered, e)
			}
		}
		start := (page - 1) * size
		if start > len(filtered) {
			start = len(filtered)
		}
		end := start + size
		if end > len(filtered) {
			end = len(filtered)
		}
		jsonResponse(w, 200, map[string]any{"items": filtered[start:end], "total": len(filtered), "page": page})
		return
	}
	args := []any{q.Get("guildId"), q.Get("action"), "%" + q.Get("q") + "%"}
	where := ` WHERE ($1='' OR "guildId"=$1) AND ($2='' OR action=$2) AND (message ILIKE $3 OR "guildName" ILIKE $3)`
	var count int
	e := a.db.QueryRow(r.Context(), `SELECT count(*) FROM "LogRecord"`+where, args...).Scan(&count)
	if e != nil {
		fail(w, 500, "Không thể tải logs.")
		return
	}
	args = append(args, size, (page-1)*size)
	items, e := a.rows(r.Context(), `SELECT row_to_json(t) FROM (SELECT * FROM "LogRecord"`+where+` ORDER BY "createdAt" DESC LIMIT $4 OFFSET $5) t`, args...)
	if e != nil {
		fail(w, 500, "Không thể tải logs.")
		return
	}
	jsonResponse(w, 200, map[string]any{"items": items, "total": count, "page": page})
}
func contains(items []string, s string) bool {
	for _, i := range items {
		if i == s {
			return true
		}
	}
	return false
}
func snowflake(s string) bool {
	if len(s) < 10 || len(s) > 25 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
