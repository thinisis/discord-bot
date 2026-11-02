package control

import (
	"context"
	"fmt"
	"github.com/bwmarrin/discordgo"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var commandNames = []string{"help", "ping", "play", "search", "pause", "resume", "skip", "join", "summon", "leave", "queue", "volume"}

type searchResult struct {
	User, Guild, Channel string
	Tracks               []Track
	Expires              time.Time
}
type Bot struct {
	app         *App
	session     *discordgo.Session
	music       *Music
	ctx         context.Context
	cancel      context.CancelFunc
	ready       atomic.Bool
	mu          sync.Mutex
	tag, userID string
	searches    map[string]searchResult
}

func NewBot(a *App) *Bot {
	ctx, cancel := context.WithCancel(a.ctx)
	b := &Bot{app: a, ctx: ctx, cancel: cancel, searches: map[string]searchResult{}}
	b.music = NewMusic(b)
	return b
}
func (b *Bot) Start(ctx context.Context) error {
	s, e := discordgo.New("Bot " + b.app.cfg.Token)
	if e != nil {
		return e
	}
	s.Identify.Intents = discordgo.IntentsGuilds | discordgo.IntentsGuildVoiceStates
	s.Client = &http.Client{Timeout: 20 * time.Second}
	b.session = s
	s.AddHandler(func(s *discordgo.Session, r *discordgo.Ready) {
		b.mu.Lock()
		b.tag = r.User.Username + "#" + r.User.Discriminator
		b.userID = r.User.ID
		b.mu.Unlock()
		b.ready.Store(true)
		b.app.record("info", "Discord ready as "+r.User.Username)
		go b.music.Run(b.ctx, r.User.ID)
		go b.register()
	})
	s.AddHandler(func(s *discordgo.Session, e *discordgo.Disconnect) { b.ready.Store(false) })
	s.AddHandler(func(s *discordgo.Session, e *discordgo.Resumed) { b.ready.Store(true) })
	s.AddHandler(func(s *discordgo.Session, g *discordgo.GuildCreate) { b.upsertGuild(g.Guild) })
	s.AddHandler(func(s *discordgo.Session, i *discordgo.InteractionCreate) { go b.interaction(i) })
	s.AddHandler(func(s *discordgo.Session, v *discordgo.VoiceServerUpdate) { b.music.VoiceServer(v) })
	s.AddHandler(func(s *discordgo.Session, v *discordgo.VoiceStateUpdate) {
		b.music.VoiceState(v)
		if v.UserID != b.UserID() {
			b.voiceLog(v)
		}
	})
	s.AddHandler(func(s *discordgo.Session, e *discordgo.ChannelCreate) {
		b.channelLog(e.Channel, "CHANNEL_CREATE", "Tạo kênh #"+e.Name)
	})
	s.AddHandler(func(s *discordgo.Session, e *discordgo.ChannelUpdate) {
		b.channelLog(e.Channel, "CHANNEL_UPDATE", "Cập nhật kênh #"+e.Name)
	})
	s.AddHandler(func(s *discordgo.Session, e *discordgo.ChannelDelete) {
		b.channelLog(e.Channel, "CHANNEL_DELETE", "Xóa kênh #"+e.Name)
	})
	if e = s.Open(); e != nil {
		return e
	}
	go b.scheduler()
	go b.presence()
	return nil
}
func (b *Bot) Stop()          { b.cancel(); b.music.Close(); b.session.Close(); b.ready.Store(false) }
func (b *Bot) UserID() string { b.mu.Lock(); defer b.mu.Unlock(); return b.userID }
func (b *Bot) Status() map[string]any {
	b.mu.Lock()
	tag := b.tag
	b.mu.Unlock()
	b.session.State.RLock()
	count := len(b.session.State.Guilds)
	b.session.State.RUnlock()
	return map[string]any{"ready": b.ready.Load(), "enabled": true, "currentUserTag": tag, "guildCount": count, "pingMs": b.session.HeartbeatLatency().Milliseconds()}
}
func (b *Bot) upsertGuild(g *discordgo.Guild) {
	_, e := b.app.db.Exec(b.ctx, `INSERT INTO "GuildConfig" ("guildId","guildName","createdAt","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT("guildId") DO UPDATE SET "guildName"=$2,"updatedAt"=CURRENT_TIMESTAMP`, g.ID, g.Name)
	if e != nil {
		b.app.record("error", "Guild sync: "+e.Error())
	}
}
func (b *Bot) send(channel, content string) error {
	_, e := b.session.ChannelMessageSendComplex(channel, &discordgo.MessageSend{Content: content, AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}}})
	return e
}
func (b *Bot) guildName(id string) string {
	g, e := b.session.State.Guild(id)
	if e != nil {
		return id
	}
	return g.Name
}
func (b *Bot) channelLog(ch *discordgo.Channel, action, message string) {
	if ch.GuildID != "" && b.app.guildEnabled(b.ctx, ch.GuildID) {
		actor := ""
		actionType := map[string]int{"CHANNEL_CREATE": 10, "CHANNEL_UPDATE": 11, "CHANNEL_DELETE": 12}[action]
		if entries, err := b.session.GuildAuditLog(ch.GuildID, "", "", actionType, 5); err == nil {
			for _, entry := range entries.AuditLogEntries {
				when, err := discordgo.SnowflakeTimestamp(entry.ID)
				if err == nil && entry.TargetID == ch.ID && time.Since(when) < 20*time.Second {
					actor = entry.UserID
					message += " · thực hiện bởi <@" + actor + ">"
					break
				}
			}
		}
		b.app.guildLog(b.ctx, ch.GuildID, b.guildName(ch.GuildID), action, message, ch.ID, actor, ch.ID)
	}
}
func (b *Bot) voiceLog(v *discordgo.VoiceStateUpdate) {
	if !b.app.guildEnabled(b.ctx, v.GuildID) {
		return
	}
	old := ""
	if v.BeforeUpdate != nil {
		old = v.BeforeUpdate.ChannelID
	}
	if old == v.ChannelID {
		return
	}
	action := "VOICE_JOIN"
	message := "<@" + v.UserID + "> vào voice <#" + v.ChannelID + ">"
	if v.ChannelID == "" {
		action = "VOICE_LEAVE"
		message = "<@" + v.UserID + "> rời voice <#" + old + ">"
	} else if old != "" {
		action = "VOICE_MOVE"
		message = "<@" + v.UserID + "> chuyển từ <#" + old + "> đến <#" + v.ChannelID + ">"
	}
	b.app.guildLog(b.ctx, v.GuildID, b.guildName(v.GuildID), action, message, v.ChannelID, v.UserID, "")
}
func commands() []*discordgo.ApplicationCommand {
	s := discordgo.ApplicationCommandOptionString
	i := discordgo.ApplicationCommandOptionInteger
	ch := discordgo.ApplicationCommandOptionChannel
	bo := discordgo.ApplicationCommandOptionBoolean
	min := float64(1)
	zero := float64(0)
	return []*discordgo.ApplicationCommand{
		{Name: "help", Description: "Xem danh sách lệnh"}, {Name: "ping", Description: "Kiểm tra trạng thái bot"},
		{Name: "play", Description: "Phát bài, playlist hoặc từ khóa", Options: []*discordgo.ApplicationCommandOption{{Type: s, Name: "query", Description: "URL hoặc từ khóa", Required: true}}},
		{Name: "search", Description: "Tìm bài trên YouTube và chọn kết quả", Options: []*discordgo.ApplicationCommandOption{{Type: s, Name: "query", Description: "Từ khóa tìm kiếm", Required: true}}},
		{Name: "pause", Description: "Tạm dừng nhạc"}, {Name: "resume", Description: "Tiếp tục phát nhạc"},
		{Name: "skip", Description: "Bỏ qua bài hoặc mục trong hàng chờ", Options: []*discordgo.ApplicationCommandOption{{Type: i, Name: "position", Description: "Vị trí trong hàng chờ", MinValue: &min}, {Type: bo, Name: "all", Description: "Xóa toàn bộ hàng chờ"}}},
		{Name: "join", Description: "Vào voice channel", Options: []*discordgo.ApplicationCommandOption{{Type: ch, Name: "channel", Description: "Voice channel đích", ChannelTypes: []discordgo.ChannelType{discordgo.ChannelTypeGuildVoice, discordgo.ChannelTypeGuildStageVoice}}}},
		{Name: "summon", Description: "Gọi bot vào voice channel", Options: []*discordgo.ApplicationCommandOption{{Type: ch, Name: "channel", Description: "Voice channel đích", ChannelTypes: []discordgo.ChannelType{discordgo.ChannelTypeGuildVoice, discordgo.ChannelTypeGuildStageVoice}}}},
		{Name: "leave", Description: "Rời voice và xóa hàng chờ"}, {Name: "queue", Description: "Hiển thị hàng chờ"},
		{Name: "volume", Description: "Chỉnh âm lượng", Options: []*discordgo.ApplicationCommandOption{{Type: i, Name: "value", Description: "Âm lượng 0–200%", Required: true, MinValue: &zero, MaxValue: 200}}},
	}
}
func (b *Bot) register() {
	_, e := b.session.ApplicationCommandBulkOverwrite(b.app.cfg.Application, b.app.cfg.Guild, commands())
	if e != nil {
		b.app.record("error", "Register commands: "+e.Error())
	} else {
		b.app.record("info", "Registered all 12 slash commands")
	}
	for _, name := range commandNames {
		_, e = b.app.db.Exec(b.ctx, `INSERT INTO "CommandPolicy" ("commandName","createdAt","updatedAt") VALUES ($1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING`, name)
		if e != nil {
			b.app.record("error", e.Error())
		}
	}
}
func interactionUser(i *discordgo.InteractionCreate) *discordgo.User {
	if i.Member != nil {
		return i.Member.User
	}
	return i.User
}
func (b *Bot) allowed(guild, name, user string) bool {
	if !b.app.guildEnabled(b.ctx, guild) {
		return false
	}
	var level string
	e := b.app.db.QueryRow(b.ctx, `SELECT "accessLevel" FROM "CommandPolicy" WHERE "commandName"=$1`, name).Scan(&level)
	if e != nil {
		b.app.record("error", "Command policy lookup failed: "+e.Error())
		return false
	}
	if level != "OWNER" {
		return true
	}
	sys, e := b.app.system(b.ctx)
	return e == nil && contains(ownerIDs(str(sys["ownerDiscordIds"])), user)
}
func (b *Bot) reply(i *discordgo.InteractionCreate, message string) {
	if len([]rune(message)) > 1900 {
		message = string([]rune(message)[:1900]) + "…"
	}
	_, e := b.session.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Content: &message, AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}}})
	if e != nil {
		b.app.record("error", "Interaction reply: "+e.Error())
	}
}
func (b *Bot) interaction(i *discordgo.InteractionCreate) {
	u := interactionUser(i)
	if u == nil {
		return
	}
	if i.Type == discordgo.InteractionMessageComponent {
		b.component(i, u)
		return
	}
	if i.Type != discordgo.InteractionApplicationCommand {
		return
	}
	data := i.ApplicationCommandData()
	name := data.Name
	if i.GuildID == "" || !b.allowed(i.GuildID, name, u.ID) {
		b.session.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseChannelMessageWithSource, Data: &discordgo.InteractionResponseData{Content: "Bot đang tắt tại guild này hoặc bạn không có quyền dùng lệnh.", Flags: discordgo.MessageFlagsEphemeral}})
		return
	}
	if e := b.session.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredChannelMessageWithSource}); e != nil {
		b.app.record("error", "Defer interaction: "+e.Error())
		return
	}
	opts := map[string]*discordgo.ApplicationCommandInteractionDataOption{}
	for _, o := range data.Options {
		opts[o.Name] = o
	}
	voice := ""
	if o := opts["channel"]; o != nil {
		voice = o.ChannelValue(b.session).ID
	} else if v, e := b.session.State.VoiceState(i.GuildID, u.ID); e == nil {
		voice = v.ChannelID
	}
	if contains([]string{"pause", "resume", "skip", "volume", "leave"}, name) && !b.sameVoice(i.GuildID, u.ID) {
		b.reply(i, "Bạn cần ở cùng voice channel với bot để điều khiển player.")
		return
	}
	var message string
	var err error
	switch name {
	case "help":
		message = "**Lệnh bot**\n/" + strings.Join(commandNames, " · /")
	case "ping":
		message = fmt.Sprintf("Bot online · Gateway %d ms · Lavalink %t", b.session.HeartbeatLatency().Milliseconds(), b.music.connected.Load())
	case "play":
		if opts["query"] == nil {
			err = fmt.Errorf("Thiếu từ khóa.")
			break
		}
		var tracks []Track
		var title string
		tracks, title, err = b.music.Load(opts["query"].StringValue())
		if err == nil {
			err = b.music.Enqueue(i.GuildID, voice, i.ChannelID, u.ID, tracks)
			if err == nil {
				message = fmt.Sprintf("Đã thêm **%s** · %d bài.", title, len(tracks))
			}
		}
	case "search":
		if opts["query"] == nil {
			err = fmt.Errorf("Thiếu từ khóa.")
			break
		}
		var tracks []Track
		tracks, _, err = b.music.Load("ytsearch:" + opts["query"].StringValue())
		if err == nil {
			if len(tracks) > 10 {
				tracks = tracks[:10]
			}
			key := uid()
			b.mu.Lock()
			for id, v := range b.searches {
				if time.Now().After(v.Expires) {
					delete(b.searches, id)
				}
			}
			b.searches[key] = searchResult{u.ID, i.GuildID, voice, tracks, time.Now().Add(5 * time.Minute)}
			b.mu.Unlock()
			options := []discordgo.SelectMenuOption{}
			for index, t := range tracks {
				options = append(options, discordgo.SelectMenuOption{Label: truncate(t.Info.Title, 95), Value: strconv.Itoa(index), Description: truncate(t.Info.Author, 95)})
			}
			content := "Chọn bài để phát (hết hạn sau 5 phút)."
			_, err = b.session.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Content: &content, Components: &[]discordgo.MessageComponent{discordgo.ActionsRow{Components: []discordgo.MessageComponent{discordgo.SelectMenu{CustomID: "search:" + key, Placeholder: "Chọn bài hát", Options: options}}}}})
			if err == nil {
				return
			}
		}
	case "join", "summon":
		err = b.music.Join(i.GuildID, voice, i.ChannelID)
		message = "Đã vào voice channel."
	case "leave":
		err = b.music.Leave(i.GuildID)
		message = "Đã rời voice và xóa hàng chờ."
	case "pause", "resume":
		err = b.music.Pause(i.GuildID, name == "pause")
		message = map[bool]string{true: "Đã tạm dừng.", false: "Đã tiếp tục phát."}[name == "pause"]
	case "volume":
		if opts["value"] == nil {
			err = fmt.Errorf("Thiếu âm lượng.")
			break
		}
		v := int(opts["value"].IntValue())
		err = b.music.Volume(i.GuildID, v)
		message = fmt.Sprintf("Âm lượng %d%%.", v)
	case "skip":
		pos := 0
		all := false
		if opts["position"] != nil {
			pos = int(opts["position"].IntValue())
		}
		if opts["all"] != nil {
			all = opts["all"].BoolValue()
		}
		err = b.music.Skip(i.GuildID, pos, all)
		message = "Đã cập nhật hàng chờ."
	case "queue":
		b.queueReply(i, 0, false)
		return
	default:
		err = fmt.Errorf("Lệnh không hợp lệ.")
	}
	if err != nil {
		message = err.Error()
		b.app.record("error", "Command /"+name+": "+message)
	}
	b.reply(i, message)
}
func (b *Bot) component(i *discordgo.InteractionCreate, u *discordgo.User) {
	d := i.MessageComponentData()
	name := "play"
	if strings.HasPrefix(d.CustomID, "queue:") || d.CustomID == "music:player:queue" {
		name = "queue"
	}
	if d.CustomID == "music:player:skip" {
		name = "skip"
	}
	if d.CustomID == "music:player:leave" {
		name = "leave"
	}
	if d.CustomID == "music:player:toggle" {
		name = "pause"
		if b.music.IsPaused(i.GuildID) {
			name = "resume"
		}
	}

	if !b.allowed(i.GuildID, name, u.ID) {
		b.session.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseChannelMessageWithSource, Data: &discordgo.InteractionResponseData{Content: "Bạn không có quyền dùng thao tác này.", Flags: discordgo.MessageFlagsEphemeral}})
		return
	}
	if strings.HasPrefix(d.CustomID, "music:player:") {
		b.session.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredChannelMessageWithSource, Data: &discordgo.InteractionResponseData{Flags: discordgo.MessageFlagsEphemeral}})
		if name == "queue" {
			b.queueReply(i, 0, false)
			return
		}
		if !b.sameVoice(i.GuildID, u.ID) {
			b.reply(i, "Bạn cần ở cùng voice channel với bot.")
			return
		}
		var err error
		switch name {
		case "pause", "resume":
			err = b.music.Pause(i.GuildID, name == "pause")
		case "skip":
			err = b.music.Skip(i.GuildID, 0, false)
		case "leave":
			err = b.music.Leave(i.GuildID)
		}
		if err != nil {
			b.reply(i, err.Error())
		} else {
			b.reply(i, "Đã cập nhật player.")
		}
		return
	}
	if strings.HasPrefix(d.CustomID, "queue:") {
		b.session.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredMessageUpdate})
		b.queueReply(i, integer(strings.TrimPrefix(d.CustomID, "queue:")), true)
		return
	}
	if !strings.HasPrefix(d.CustomID, "search:") {
		return
	}
	b.session.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{Type: discordgo.InteractionResponseDeferredChannelMessageWithSource, Data: &discordgo.InteractionResponseData{Flags: discordgo.MessageFlagsEphemeral}})
	key := strings.TrimPrefix(d.CustomID, "search:")
	b.mu.Lock()
	result, ok := b.searches[key]
	b.mu.Unlock()
	if !ok || result.User != u.ID || result.Guild != i.GuildID || time.Now().After(result.Expires) || len(d.Values) != 1 {
		b.reply(i, "Kết quả đã hết hạn hoặc không thuộc bạn.")
		return
	}
	index, e := strconv.Atoi(d.Values[0])
	if e != nil || index < 0 || index >= len(result.Tracks) {
		b.reply(i, "Lựa chọn không hợp lệ.")
		return
	}
	v, e := b.session.State.VoiceState(i.GuildID, u.ID)
	if e != nil || v.ChannelID == "" {
		b.reply(i, "Bạn cần vào voice channel.")
		return
	}
	if e = b.music.Enqueue(i.GuildID, v.ChannelID, i.ChannelID, u.ID, []Track{result.Tracks[index]}); e != nil {
		b.reply(i, e.Error())
		return
	}
	b.mu.Lock()
	delete(b.searches, key)
	b.mu.Unlock()
	b.reply(i, "Đã thêm **"+result.Tracks[index].Info.Title+"**.")
}
func (b *Bot) queueReply(i *discordgo.InteractionCreate, page int, update bool) {
	sys, _ := b.app.system(b.ctx)
	size := 10
	if n, ok := sys["queuePageSize"].(float64); ok {
		size = int(n)
	}
	content, pages := b.music.Queue(i.GuildID, page, size)
	if page < 0 {
		page = 0
	}
	if page >= pages {
		page = pages - 1
	}
	components := []discordgo.MessageComponent{discordgo.ActionsRow{Components: []discordgo.MessageComponent{discordgo.Button{Label: "Trước", CustomID: fmt.Sprintf("queue:%d", page-1), Style: discordgo.SecondaryButton, Disabled: page <= 0}, discordgo.Button{Label: "Sau", CustomID: fmt.Sprintf("queue:%d", page+1), Style: discordgo.SecondaryButton, Disabled: page >= pages-1}}}}
	_, e := b.session.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Content: &content, Components: &components})
	if e != nil {
		b.app.record("error", e.Error())
	}
}
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n-1]) + "…"
	}
	return s
}
func (b *Bot) presence() {
	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-b.ctx.Done():
			return
		case <-tick.C:
			if !b.ready.Load() {
				continue
			}
			sys, e := b.app.system(b.ctx)
			if e != nil {
				continue
			}
			hour := time.Now().In(gmt7).Hour()
			key := "idleNightText"
			if hour >= 5 && hour < 11 {
				key = "idleMorningText"
			} else if hour >= 11 && hour < 17 {
				key = "idleNoonText"
			} else if hour >= 17 && hour < 22 {
				key = "idleEveningText"
			}
			text := str(sys[key])
			kind := discordgo.ActivityTypeWatching
			if title := b.music.PlayingTitle(); title != "" {
				text = title
				kind = discordgo.ActivityTypeListening
			}
			e = b.session.UpdateStatusComplex(discordgo.UpdateStatusData{Status: "online", Activities: []*discordgo.Activity{{Name: truncate(text, 120), Type: kind}}})
			if e != nil {
				b.app.record("warn", "Presence: "+e.Error())
			}
		}
	}
}

func playerComponents() []discordgo.MessageComponent {
	return []discordgo.MessageComponent{discordgo.ActionsRow{Components: []discordgo.MessageComponent{discordgo.Button{Label: "Tạm dừng / Tiếp tục", CustomID: "music:player:toggle", Style: discordgo.SecondaryButton}, discordgo.Button{Label: "Queue", CustomID: "music:player:queue", Style: discordgo.SecondaryButton}, discordgo.Button{Label: "Bỏ qua", CustomID: "music:player:skip", Style: discordgo.SecondaryButton}, discordgo.Button{Label: "Rời voice", CustomID: "music:player:leave", Style: discordgo.DangerButton}}}}
}
func (b *Bot) sameVoice(guild, user string) bool {
	v, e := b.session.State.VoiceState(guild, user)
	if e != nil || v.ChannelID == "" {
		return false
	}
	b.music.mu.Lock()
	defer b.music.mu.Unlock()
	p := b.music.players[guild]
	return p != nil && p.ChannelID == v.ChannelID
}
func (m *Music) IsPaused(guild string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	p := m.players[guild]
	return p != nil && p.Paused
}
