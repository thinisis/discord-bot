package control

import (
	"github.com/bwmarrin/discordgo"
	"regexp"
)

func userTag(user *discordgo.User) string {
	if user == nil || user.Username == "" {
		return ""
	}
	if user.Discriminator != "" && user.Discriminator != "0" {
		return user.Username + "#" + user.Discriminator
	}
	return user.Username
}
func (b *Bot) userLabel(guild, id string, member *discordgo.Member) string {
	if member != nil && member.User != nil && member.User.ID == id {
		if name := userTag(member.User); name != "" {
			return name
		}
	}
	if member, err := b.session.State.Member(guild, id); err == nil {
		if name := userTag(member.User); name != "" {
			return name
		}
	}
	if member, err := b.session.GuildMember(guild, id); err == nil {
		if name := userTag(member.User); name != "" {
			return name
		}
	}
	if user, err := b.session.User(id); err == nil {
		if name := userTag(user); name != "" {
			return name
		}
	}
	return id
}
func (b *Bot) channelLabel(id string) string {
	if id == "" {
		return ""
	}
	if channel, err := b.session.State.Channel(id); err == nil && channel.Name != "" {
		return channel.Name
	}
	if channel, err := b.session.Channel(id); err == nil && channel.Name != "" {
		return channel.Name
	}
	return id
}
func voiceLogMessage(user, oldID, newID, oldName, newName string) (string, string) {
	if oldID == newID {
		return "", ""
	}
	if oldID == "" {
		return "VOICE_JOIN", user + " đã vào voice channel " + newName + "."
	}
	if newID == "" {
		return "VOICE_LEAVE", user + " đã rời voice channel " + oldName + "."
	}
	return "VOICE_MOVE", user + " đã chuyển từ " + oldName + " sang " + newName + "."
}

var voiceMention = regexp.MustCompile(`^<@!?([0-9]{10,25})> (vào voice|rời voice) <#([0-9]{10,25})>$`)
var moveMention = regexp.MustCompile(`^<@!?([0-9]{10,25})> chuyển từ <#([0-9]{10,25})> đến <#([0-9]{10,25})>$`)

func rewriteVoiceMentions(message string, userName, channelName func(string) string) string {
	if match := voiceMention.FindStringSubmatch(message); match != nil {
		user, channel := userName(match[1]), channelName(match[3])
		if user == match[1] || channel == match[3] || user == "" || channel == "" {
			return message
		}
		if match[2] == "vào voice" {
			_, message = voiceLogMessage(user, "", match[3], "", channel)
		} else {
			_, message = voiceLogMessage(user, match[3], "", channel, "")
		}
		return message
	}
	if match := moveMention.FindStringSubmatch(message); match != nil {
		user, old, new := userName(match[1]), channelName(match[2]), channelName(match[3])
		if user == match[1] || old == match[2] || new == match[3] || user == "" || old == "" || new == "" {
			return message
		}
		_, message = voiceLogMessage(user, match[2], match[3], old, new)
		return message
	}
	return message
}

// Resolve legacy mention messages once in the background, never in the log read API.
// IDs remain in their structured columns; only the human-readable message changes.
func (b *Bot) backfillVoiceLogNames(guild string) {
	users, channels := map[string]string{}, map[string]string{}
	userName := func(id string) string {
		if value, ok := users[id]; ok {
			return value
		}
		value := b.userLabel(guild, id, nil)
		users[id] = value
		return value
	}
	channelName := func(id string) string {
		if value, ok := channels[id]; ok {
			return value
		}
		value := b.channelLabel(id)
		channels[id] = value
		return value
	}
	cursor := ""
	updated := 0
	for b.ctx.Err() == nil {
		rows, err := b.app.db.Query(b.ctx, `SELECT id,message FROM "LogRecord" WHERE "guildId"=$1 AND action IN ('VOICE_JOIN','VOICE_LEAVE','VOICE_MOVE') AND message LIKE '<@%' AND id>$2 ORDER BY id LIMIT 100`, guild, cursor)
		if err != nil {
			b.app.record("warn", "Resolve voice log names: "+err.Error())
			return
		}
		type item struct{ id, message string }
		batch := []item{}
		for rows.Next() {
			var row item
			if err = rows.Scan(&row.id, &row.message); err != nil {
				break
			}
			batch = append(batch, row)
		}
		if err == nil {
			err = rows.Err()
		}
		rows.Close()
		if err != nil {
			b.app.record("warn", "Read voice log names: "+err.Error())
			return
		}
		if len(batch) == 0 {
			break
		}
		for _, row := range batch {
			cursor = row.id
			message := rewriteVoiceMentions(row.message, userName, channelName)
			if message == row.message {
				continue
			}
			tag, err := b.app.db.Exec(b.ctx, `UPDATE "LogRecord" SET message=$1 WHERE id=$2 AND message=$3`, message, row.id, row.message)
			if err != nil {
				b.app.record("warn", "Save voice log names: "+err.Error())
				return
			}
			updated += int(tag.RowsAffected())
		}
	}
	if updated > 0 {
		b.app.record("info", "Resolved Discord names in existing voice logs")
	}
}
