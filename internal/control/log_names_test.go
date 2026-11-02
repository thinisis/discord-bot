package control

import (
	"github.com/bwmarrin/discordgo"
	"testing"
)

func TestVoiceLogNamesMatchLegacyFormat(t *testing.T) {
	tests := []struct{ old, new, oldName, newName, action, want string }{
		{"", "1148891457969721425", "", "CS2", "VOICE_JOIN", "thinnguyenvn đã vào voice channel CS2."},
		{"1148891457969721425", "", "CS2", "", "VOICE_LEAVE", "thinnguyenvn đã rời voice channel CS2."},
		{"111111111111111111", "222222222222222222", "CS2", "Phòng nhạc", "VOICE_MOVE", "thinnguyenvn đã chuyển từ CS2 sang Phòng nhạc."},
	}
	for _, test := range tests {
		action, message := voiceLogMessage("thinnguyenvn", test.old, test.new, test.oldName, test.newName)
		if action != test.action || message != test.want {
			t.Fatalf("%s: %s", action, message)
		}
	}
	if action, message := voiceLogMessage("user", "same", "same", "CS2", "CS2"); action != "" || message != "" {
		t.Fatal("same channel should not produce a voice log")
	}
}
func TestRewriteStoredVoiceMentions(t *testing.T) {
	user := func(id string) string {
		if id == "448715770696826890" {
			return "thinnguyenvn"
		}
		return id
	}
	channel := func(id string) string {
		if id == "1148891457969721425" {
			return "CS2"
		}
		if id == "222222222222222222" {
			return "Phòng nhạc"
		}
		return id
	}
	tests := map[string]string{
		"<@448715770696826890> vào voice <#1148891457969721425>":                           "thinnguyenvn đã vào voice channel CS2.",
		"<@!448715770696826890> rời voice <#1148891457969721425>":                          "thinnguyenvn đã rời voice channel CS2.",
		"<@448715770696826890> chuyển từ <#1148891457969721425> đến <#222222222222222222>": "thinnguyenvn đã chuyển từ CS2 sang Phòng nhạc.",
		"thinnguyenvn đã rời voice channel CS2.":                                           "thinnguyenvn đã rời voice channel CS2.",
		"<@999999999999999999> vào voice <#1148891457969721425>":                           "<@999999999999999999> vào voice <#1148891457969721425>",
		"<@448715770696826890> vào voice <#999999999999999999>":                            "<@448715770696826890> vào voice <#999999999999999999>",
	}
	for input, want := range tests {
		if got := rewriteVoiceMentions(input, user, channel); got != want {
			t.Fatalf("got %q want %q", got, want)
		}
	}
}
func TestDiscordUsernameTag(t *testing.T) {
	if got := userTag(&discordgo.User{Username: "thinnguyenvn", Discriminator: "0"}); got != "thinnguyenvn" {
		t.Fatal(got)
	}
	if got := userTag(&discordgo.User{Username: "Member Count", Discriminator: "7205"}); got != "Member Count#7205" {
		t.Fatal(got)
	}
}
