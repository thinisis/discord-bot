package control

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/bwmarrin/discordgo"
	"github.com/gorilla/websocket"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Track struct {
	Encoded string `json:"encoded"`
	Info    struct {
		Identifier string `json:"identifier"`
		Title      string `json:"title"`
		Author     string `json:"author"`
		Length     int64  `json:"length"`
		URI        string `json:"uri"`
		Artwork    string `json:"artworkUrl"`
		IsStream   bool   `json:"isStream"`
	} `json:"info"`
	UserData map[string]any `json:"userData,omitempty"`
}
type Player struct {
	GuildID                  string  `json:"guildId"`
	ChannelID                string  `json:"voiceChannelId"`
	TextID                   string  `json:"textChannelId"`
	Current                  *Track  `json:"currentTrack"`
	Queue                    []Track `json:"queue"`
	Paused                   bool    `json:"paused"`
	Volume                   int     `json:"volume"`
	Position                 int64   `json:"positionMs"`
	Connected                bool    `json:"connected"`
	Failures                 int     `json:"-"`
	Session, Endpoint, Token string  `json:"-"`
	voiceVersion             uint64
	sentVersion              uint64
	failedEncoded            string
	joinUntil                time.Time
}
type Music struct {
	bot       *Bot
	http      *http.Client
	mu        sync.Mutex
	players   map[string]*Player
	session   string
	socket    *websocket.Conn
	connected atomic.Bool
	running   atomic.Bool
	lastError string
	version   string
	sources   []string
	plugins   []string
	closeMu   sync.Mutex
}

func NewMusic(b *Bot) *Music {
	return &Music{bot: b, http: &http.Client{Timeout: 20 * time.Second}, players: map[string]*Player{}, sources: []string{}, plugins: []string{}}
}
func (m *Music) request(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		b, e := json.Marshal(body)
		if e != nil {
			return e
		}
		reader = bytes.NewReader(b)
	}
	req, e := http.NewRequestWithContext(ctx, method, strings.TrimRight(m.bot.app.cfg.LavaURL, "/")+path, reader)
	if e != nil {
		return e
	}
	req.Header.Set("Authorization", m.bot.app.cfg.LavaPassword)
	req.Header.Set("Content-Type", "application/json")
	res, e := m.http.Do(req)
	if e != nil {
		return e
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("Lavalink HTTP %d: %s", res.StatusCode, truncate(string(b), 250))
	}
	if out != nil {
		return json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(out)
	}
	io.Copy(io.Discard, res.Body)
	return nil
}
func (m *Music) Run(ctx context.Context, user string) {
	if !m.running.CompareAndSwap(false, true) {
		return
	}
	defer m.running.Store(false)
	delay := time.Second
	for ctx.Err() == nil {
		u, e := url.Parse(m.bot.app.cfg.LavaURL)
		if e != nil {
			return
		}
		u.Scheme = map[string]string{"http": "ws", "https": "wss"}[u.Scheme]
		u.Path = "/v4/websocket"
		headers := http.Header{"Authorization": {m.bot.app.cfg.LavaPassword}, "User-Id": {user}, "Client-Name": {"discord-bot-go/2.0"}}
		m.mu.Lock()
		sid := m.session
		m.mu.Unlock()
		if sid != "" {
			headers.Set("Session-Id", sid)
		}
		conn, _, e := (&websocket.Dialer{HandshakeTimeout: 10 * time.Second}).DialContext(ctx, u.String(), headers)
		if e == nil {
			m.mu.Lock()
			m.socket = conn
			m.mu.Unlock()
			conn.SetReadLimit(2 << 20)
			for ctx.Err() == nil {
				_, raw, readErr := conn.ReadMessage()
				if readErr != nil {
					e = readErr
					break
				}
				var msg map[string]json.RawMessage
				if json.Unmarshal(raw, &msg) != nil {
					continue
				}
				var op string
				json.Unmarshal(msg["op"], &op)
				switch op {
				case "ready":
					var session string
					var resumed bool
					json.Unmarshal(msg["sessionId"], &session)
					json.Unmarshal(msg["resumed"], &resumed)
					m.mu.Lock()
					m.session = session
					m.lastError = ""
					if !resumed {
						for _, p := range m.players {
							p.sentVersion = 0
							p.Connected = false
						}
					}
					m.mu.Unlock()
					m.connected.Store(true)
					delay = time.Second
					m.bot.app.record("info", "Lavalink connected")
					go m.onReady(ctx, session, resumed)
				case "playerUpdate":
					var gid string
					json.Unmarshal(msg["guildId"], &gid)
					var state struct {
						Position  int64 `json:"position"`
						Connected bool  `json:"connected"`
					}
					json.Unmarshal(msg["state"], &state)
					m.mu.Lock()
					if p := m.players[gid]; p != nil {
						p.Position = state.Position
						p.Connected = state.Connected
						if p.Position >= 3000 {
							p.Failures = 0
						}
					}
					m.mu.Unlock()
				case "event":
					m.event(msg)
				}
			}
			conn.Close()
			m.mu.Lock()
			if m.socket == conn {
				m.socket = nil
			}
			m.mu.Unlock()
		}
		m.connected.Store(false)
		if ctx.Err() != nil {
			return
		}
		m.mu.Lock()
		if e != nil {
			m.lastError = "Lavalink mất kết nối: " + truncate(e.Error(), 180)
		}
		m.mu.Unlock()
		m.bot.app.record("warn", "Lavalink disconnected; retry in "+delay.String())
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		delay *= 2
		if delay > 15*time.Second {
			delay = 15 * time.Second
		}
	}
}
func (m *Music) onReady(ctx context.Context, sid string, resumed bool) {
	if e := m.request(ctx, "PATCH", "/v4/sessions/"+sid, map[string]any{"resuming": true, "timeout": 60}, nil); e != nil {
		m.bot.app.record("warn", e.Error())
	}
	var info struct {
		Version struct {
			Semver string `json:"semver"`
		} `json:"version"`
		Sources []string `json:"sourceManagers"`
		Plugins []struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"plugins"`
	}
	if e := m.request(ctx, "GET", "/v4/info", nil, &info); e == nil {
		m.mu.Lock()
		m.version = info.Version.Semver
		m.sources = info.Sources
		m.plugins = []string{}
		for _, p := range info.Plugins {
			m.plugins = append(m.plugins, p.Name+" "+p.Version)
		}
		m.mu.Unlock()
	}
	if !resumed {
		m.mu.Lock()
		ids := []string{}
		for id, p := range m.players {
			if p.ChannelID != "" {
				ids = append(ids, id)
			}
		}
		m.mu.Unlock()
		for _, id := range ids {
			m.syncVoice(id)
			m.mu.Lock()
			p := m.players[id]
			var track *Track
			if p != nil {
				track = p.Current
			}
			m.mu.Unlock()
			if track != nil {
				if e := m.play(id, *track); e != nil {
					m.bot.app.record("error", e.Error())
				}
			}
		}
	}
}
func (m *Music) Close() {
	m.closeMu.Lock()
	defer m.closeMu.Unlock()
	m.mu.Lock()
	conn := m.socket
	m.mu.Unlock()
	if conn != nil {
		conn.Close()
	}
}
func (m *Music) update(guild string, payload any) error {
	m.mu.Lock()
	sid := m.session
	m.mu.Unlock()
	if !m.connected.Load() || sid == "" {
		return errors.New("Lavalink chưa sẵn sàng, hãy thử lại sau.")
	}
	return m.request(m.bot.ctx, "PATCH", "/v4/sessions/"+sid+"/players/"+guild+"?noReplace=false", payload, nil)
}
func (m *Music) Load(query string) ([]Track, string, error) {
	query = strings.TrimSpace(query)
	searchAll := strings.HasPrefix(query, "ytsearch:") || strings.HasPrefix(query, "ytmsearch:") || strings.HasPrefix(query, "scsearch:")
	if query == "" || len(query) > 2000 {
		return nil, "", errors.New("Từ khóa không hợp lệ.")
	}
	if !strings.HasPrefix(query, "https://") && !strings.HasPrefix(query, "http://") && !strings.HasPrefix(query, "ytsearch:") && !strings.HasPrefix(query, "ytmsearch:") && !strings.HasPrefix(query, "scsearch:") {
		query = "ytsearch:" + query
	}
	var result struct {
		LoadType string          `json:"loadType"`
		Data     json.RawMessage `json:"data"`
	}
	if e := m.request(m.bot.ctx, "GET", "/v4/loadtracks?identifier="+url.QueryEscape(query), nil, &result); e != nil {
		return nil, "", e
	}
	tracks := []Track{}
	title := ""
	switch result.LoadType {
	case "track":
		var t Track
		if e := json.Unmarshal(result.Data, &t); e != nil {
			return nil, "", e
		}
		tracks = append(tracks, t)
		title = t.Info.Title
	case "search":
		if e := json.Unmarshal(result.Data, &tracks); e != nil {
			return nil, "", e
		}
		if !strings.HasPrefix(query, "ytsearch:") && !strings.HasPrefix(query, "scsearch:") {
			break
		}
		title = "Kết quả tìm kiếm"
		if !searchAll && len(tracks) > 0 {
			tracks = tracks[:1]
			title = tracks[0].Info.Title
		}
	case "playlist":
		var p struct {
			Info struct {
				Name     string `json:"name"`
				Selected int    `json:"selectedTrack"`
			} `json:"info"`
			Tracks []Track `json:"tracks"`
		}
		if e := json.Unmarshal(result.Data, &p); e != nil {
			return nil, "", e
		}
		tracks = p.Tracks
		if p.Info.Selected > 0 && p.Info.Selected < len(tracks) {
			tracks = append(tracks[p.Info.Selected:], tracks[:p.Info.Selected]...)
		}
		title = p.Info.Name
	case "error":
		var errData struct {
			Message string `json:"message"`
		}
		json.Unmarshal(result.Data, &errData)
		return nil, "", fmt.Errorf("Không tải được nhạc: %s", errData.Message)
	}
	if len(tracks) == 0 {
		return nil, "", errors.New("Không tìm thấy bài hát.")
	}
	if len(tracks) > m.bot.app.cfg.PlaylistMax {
		tracks = tracks[:m.bot.app.cfg.PlaylistMax]
	}
	return tracks, title, nil
}
func (m *Music) Join(guild, channel, text string) error {
	if channel == "" {
		return errors.New("Bạn cần vào voice channel hoặc chọn kênh đích.")
	}
	if !m.connected.Load() {
		return errors.New("Lavalink chưa sẵn sàng.")
	}
	ch, e := m.bot.session.Channel(channel)
	if e != nil || ch.GuildID != guild || (ch.Type != discordgo.ChannelTypeGuildVoice && ch.Type != discordgo.ChannelTypeGuildStageVoice) {
		return errors.New("Voice channel không hợp lệ.")
	}
	permissions, e := m.bot.session.UserChannelPermissions(m.bot.UserID(), channel)
	if e != nil || permissions&discordgo.PermissionVoiceConnect == 0 || permissions&discordgo.PermissionVoiceSpeak == 0 {
		return errors.New("Bot cần quyền Connect và Speak trong kênh này.")
	}
	var volume int
	m.bot.app.db.QueryRow(m.bot.ctx, `SELECT "musicVolume" FROM "GuildConfig" WHERE "guildId"=$1`, guild).Scan(&volume)
	m.mu.Lock()
	p := m.players[guild]
	if p == nil {
		p = &Player{GuildID: guild, Queue: []Track{}, Volume: volume}
		m.players[guild] = p
	}
	if p.ChannelID != "" && p.ChannelID != channel && p.Current != nil {
		m.mu.Unlock()
		return errors.New("Bot đang phát tại một voice channel khác.")
	}
	p.TextID = text
	needs := p.ChannelID != channel || p.Session == "" || p.Endpoint == "" || p.Token == ""
	p.ChannelID = channel
	if needs {
		p.Endpoint = ""
		p.Token = ""
		p.sentVersion = 0
		p.joinUntil = time.Now().Add(15 * time.Second)
	}
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		if p := m.players[guild]; p != nil {
			p.joinUntil = time.Time{}
		}
		m.mu.Unlock()
	}()
	if needs {
		if v, err := m.bot.session.State.VoiceState(guild, m.bot.UserID()); err == nil && v.ChannelID == channel {
			if err = m.bot.session.ChannelVoiceJoinManual(guild, "", false, true); err != nil {
				return err
			}
			select {
			case <-m.bot.ctx.Done():
				return m.bot.ctx.Err()
			case <-time.After(150 * time.Millisecond):
			}
		}
		if e = m.bot.session.ChannelVoiceJoinManual(guild, channel, false, true); e != nil {
			return e
		}
	}
	deadline := time.NewTimer(15 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		m.mu.Lock()
		p = m.players[guild]
		complete := p != nil && p.ChannelID == channel && p.Session != "" && p.Endpoint != "" && p.Token != ""
		m.mu.Unlock()
		if complete {
			return m.syncVoice(guild)
		}
		select {
		case <-m.bot.ctx.Done():
			return m.bot.ctx.Err()
		case <-deadline.C:
			return errors.New("Discord chưa gửi đủ voice state. Kiểm tra quyền bot rồi thử /join lại.")
		case <-tick.C:
		}
	}
}
func (m *Music) VoiceState(v *discordgo.VoiceStateUpdate) {
	if v.UserID != m.bot.UserID() {
		return
	}
	m.mu.Lock()
	p := m.players[v.GuildID]
	if p != nil {
		if v.ChannelID == "" {
			if time.Now().Before(p.joinUntil) {
				p.Session = ""
				m.mu.Unlock()
				return
			}
			p.ChannelID = ""
			p.Session = ""
			p.Token = ""
			p.Endpoint = ""
			p.Connected = false
			p.Current = nil
			p.Queue = []Track{}
		} else {
			p.ChannelID = v.ChannelID
			p.Session = v.SessionID
			p.voiceVersion++
		}
	}
	m.mu.Unlock()
	if p != nil && v.ChannelID != "" {
		go m.syncVoice(v.GuildID)
	}
}
func (m *Music) VoiceServer(v *discordgo.VoiceServerUpdate) {
	m.mu.Lock()
	p := m.players[v.GuildID]
	if p != nil {
		p.Endpoint = v.Endpoint
		p.Token = v.Token
		p.voiceVersion++
	}
	m.mu.Unlock()
	if p != nil {
		go m.syncVoice(v.GuildID)
	}
}
func (m *Music) syncVoice(guild string) error {
	m.mu.Lock()
	p := m.players[guild]
	if p == nil || p.ChannelID == "" || p.Session == "" || p.Token == "" || p.Endpoint == "" {
		m.mu.Unlock()
		return nil
	}
	v := p.voiceVersion
	if p.sentVersion == v && v != 0 {
		m.mu.Unlock()
		return nil
	}
	voice := map[string]any{"sessionId": p.Session, "token": p.Token, "endpoint": p.Endpoint}
	m.mu.Unlock()
	e := m.update(guild, map[string]any{"voice": voice})
	if e == nil {
		m.mu.Lock()
		if p = m.players[guild]; p != nil {
			p.sentVersion = v
		}
		m.mu.Unlock()
	}
	return e
}
func (m *Music) Enqueue(guild, voice, text, user string, tracks []Track) error {
	if len(tracks) == 0 {
		return errors.New("Không có bài hát.")
	}
	if e := m.Join(guild, voice, text); e != nil {
		return e
	}
	for i := range tracks {
		tracks[i].UserData = map[string]any{"requestedById": user}
	}
	m.mu.Lock()
	p := m.players[guild]
	p.Queue = append(p.Queue, tracks...)
	start := p.Current == nil
	if start {
		p.Failures = 0
	}
	m.mu.Unlock()
	if start {
		return m.next(guild)
	}
	return nil
}
func (m *Music) next(guild string) error {
	m.mu.Lock()
	p := m.players[guild]
	if p != nil && p.Current != nil {
		m.mu.Unlock()
		return nil
	}
	if p == nil || len(p.Queue) == 0 {
		if p != nil {
			p.Current = nil
			p.Position = 0
		}
		m.mu.Unlock()
		return nil
	}
	track := p.Queue[0]
	p.Queue = p.Queue[1:]
	p.Current = &track
	p.Paused = false
	p.Position = 0
	p.failedEncoded = ""
	m.mu.Unlock()
	if e := m.play(guild, track); e != nil {
		m.mu.Lock()
		if p = m.players[guild]; p != nil {
			p.Current = nil
			p.Paused = true
		}
		m.mu.Unlock()
		return e
	}
	return nil
}
func (m *Music) play(guild string, t Track) error {
	m.mu.Lock()
	p := m.players[guild]
	if p == nil {
		m.mu.Unlock()
		return errors.New("Player không tồn tại.")
	}
	volume := p.Volume
	paused := p.Paused
	position := p.Position
	m.mu.Unlock()
	return m.update(guild, map[string]any{"track": map[string]any{"encoded": t.Encoded, "userData": t.UserData}, "volume": volume, "paused": paused, "position": position})
}
func (m *Music) Leave(guild string) error {
	m.mu.Lock()
	sid := m.session
	delete(m.players, guild)
	m.mu.Unlock()
	if sid != "" && m.connected.Load() {
		if e := m.request(m.bot.ctx, "DELETE", "/v4/sessions/"+sid+"/players/"+guild, nil, nil); e != nil {
			m.bot.app.record("warn", e.Error())
		}
	}
	return m.bot.session.ChannelVoiceJoinManual(guild, "", false, true)
}
func (m *Music) Pause(guild string, value bool) error {
	m.mu.Lock()
	p := m.players[guild]
	if p == nil || p.Current == nil {
		m.mu.Unlock()
		return errors.New("Chưa có bài đang phát.")
	}
	m.mu.Unlock()
	if e := m.update(guild, map[string]any{"paused": value}); e != nil {
		return e
	}
	m.mu.Lock()
	if p = m.players[guild]; p != nil {
		p.Paused = value
	}
	m.mu.Unlock()
	return nil
}
func (m *Music) Volume(guild string, value int) error {
	if value < 0 || value > 200 {
		return errors.New("Âm lượng phải từ 0 đến 200.")
	}
	m.mu.Lock()
	p := m.players[guild]
	m.mu.Unlock()
	if p == nil {
		return errors.New("Bot chưa vào voice.")
	}
	if e := m.update(guild, map[string]any{"volume": value}); e != nil {
		return e
	}
	m.mu.Lock()
	if p = m.players[guild]; p != nil {
		p.Volume = value
	}
	m.mu.Unlock()
	_, e := m.bot.app.db.Exec(m.bot.ctx, `UPDATE "GuildConfig" SET "musicVolume"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE "guildId"=$1`, guild, value)
	return e
}
func (m *Music) Skip(guild string, position int, all bool) error {
	m.mu.Lock()
	p := m.players[guild]
	if p == nil {
		m.mu.Unlock()
		return errors.New("Chưa có player.")
	}
	if position > 0 && !all {
		if position > len(p.Queue) {
			m.mu.Unlock()
			return errors.New("Vị trí queue không hợp lệ.")
		}
		p.Queue = append(p.Queue[:position-1], p.Queue[position:]...)
		m.mu.Unlock()
		return nil
	}
	if all {
		p.Queue = []Track{}
	}
	p.Current = nil
	m.mu.Unlock()
	if e := m.update(guild, map[string]any{"track": map[string]any{"encoded": nil}}); e != nil {
		return e
	}
	return m.next(guild)
}
func (m *Music) SyncGuild(guild string, enabled bool, volume int) {
	if !enabled {
		m.Leave(guild)
		return
	}
	m.mu.Lock()
	p := m.players[guild]
	m.mu.Unlock()
	if p != nil {
		if e := m.Volume(guild, volume); e != nil {
			m.bot.app.record("error", e.Error())
		}
	}
}
func (m *Music) event(msg map[string]json.RawMessage) {
	var kind, guild string
	json.Unmarshal(msg["type"], &kind)
	json.Unmarshal(msg["guildId"], &guild)
	var track Track
	json.Unmarshal(msg["track"], &track)
	m.mu.Lock()
	p := m.players[guild]
	if p == nil {
		m.mu.Unlock()
		return
	}
	text := p.TextID
	switch kind {
	case "TrackStartEvent":
		if p.Current == nil || p.Current.Encoded != track.Encoded {
			m.mu.Unlock()
			return
		}
		m.mu.Unlock()
		_, err := m.bot.session.ChannelMessageSendComplex(text, &discordgo.MessageSend{Content: "Đang phát **" + truncate(track.Info.Title, 180) + "**", Components: playerComponents(), AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}}})
		if err != nil {
			m.bot.app.record("error", "Player notification: "+err.Error())
		}
		return
	case "TrackExceptionEvent":
		if p.Current == nil || p.Current.Encoded != track.Encoded {
			m.mu.Unlock()
			return
		}
		p.failedEncoded = track.Encoded
		var ex struct {
			Message string `json:"message"`
			Cause   string `json:"cause"`
		}
		json.Unmarshal(msg["exception"], &ex)
		m.mu.Unlock()
		m.bot.app.record("error", "Playback "+track.Info.Identifier+": "+ex.Message+" "+truncate(ex.Cause, 300))
		m.bot.send(text, "Không phát được **"+truncate(track.Info.Title, 150)+"**: "+truncate(ex.Message, 250))
		return
	case "TrackEndEvent":
		var reason string
		json.Unmarshal(msg["reason"], &reason)
		if reason == "replaced" || reason == "stopped" || reason == "cleanup" || p.Current == nil || p.Current.Encoded != track.Encoded {
			m.mu.Unlock()
			return
		}
		p.Current = nil
		p.Position = 0
		if reason == "loadFailed" {
			p.Failures++
		} else {
			p.Failures = 0
		}
		if p.Failures >= 3 {
			p.Paused = true
			m.mu.Unlock()
			m.bot.send(text, "Đã dừng tự chuyển bài sau 3 lần phát lỗi liên tiếp. Các bài còn lại vẫn được giữ trong queue; kiểm tra nguồn nhạc rồi dùng /play.")
			return
		}
		m.mu.Unlock()
		if e := m.next(guild); e != nil {
			m.bot.app.record("error", e.Error())
		}
		return
	case "TrackStuckEvent":
		m.mu.Unlock()
		m.bot.app.record("warn", "Track stuck: "+track.Info.Identifier)
		m.Skip(guild, 0, false)
		return
	case "WebSocketClosedEvent":
		p.Connected = false
		var code int
		var reason string
		json.Unmarshal(msg["code"], &code)
		json.Unmarshal(msg["reason"], &reason)
		m.mu.Unlock()
		m.bot.app.record("warn", fmt.Sprintf("Voice gateway closed %d: %s", code, reason))
		return
	}
	m.mu.Unlock()
}
func (m *Music) Status() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	sessions := []map[string]any{}
	queued, active := 0, 0
	for _, p := range m.players {
		q := len(p.Queue)
		queued += q
		if p.Current != nil {
			active++
		}
		sessions = append(sessions, map[string]any{"guildId": p.GuildID, "voiceChannelId": p.ChannelID, "currentTrack": p.Current, "queueLength": q, "paused": p.Paused, "volume": p.Volume, "positionMs": p.Position, "connected": p.Connected})
	}
	return map[string]any{"connected": m.connected.Load(), "nodeVersion": m.version, "sources": append([]string{}, m.sources...), "plugins": append([]string{}, m.plugins...), "lastError": m.lastError, "sessions": sessions, "queuedTracks": queued, "activeTracks": active}
}
func (m *Music) PlayingTitle() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, p := range m.players {
		if p.Current != nil && !p.Paused {
			return p.Current.Info.Title
		}
	}
	return ""
}
func (m *Music) Queue(guild string, page, size int) (string, int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.players[guild]
	if p == nil {
		return "Hàng chờ trống.", 1
	}
	if size < 5 || size > 25 {
		size = 10
	}
	pages := (len(p.Queue) + size - 1) / size
	if pages < 1 {
		pages = 1
	}
	if page < 0 {
		page = 0
	}
	if page >= pages {
		page = pages - 1
	}
	var out strings.Builder
	if p.Current != nil {
		out.WriteString("**Đang phát:** " + truncate(p.Current.Info.Title, 150) + "\n")
	}
	fmt.Fprintf(&out, "**Hàng chờ · trang %d/%d**\n", page+1, pages)
	for n := page * size; n < len(p.Queue) && n < (page+1)*size; n++ {
		fmt.Fprintf(&out, "%d. %s\n", n+1, truncate(p.Queue[n].Info.Title, 65))
	}
	if len(p.Queue) == 0 {
		out.WriteString("Không có bài tiếp theo.")
	}
	return out.String(), pages
}
