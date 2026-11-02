package control

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSyncVoiceIncludesChannelAndDeduplicatesConcurrentEvents(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "PATCH" || r.URL.Path != "/v4/sessions/test-session/players/guild" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
			http.Error(w, "unexpected", 400)
			return
		}
		var body struct {
			Voice struct {
				Session  string `json:"sessionId"`
				Token    string `json:"token"`
				Endpoint string `json:"endpoint"`
				Channel  string `json:"channelId"`
			} `json:"voice"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			http.Error(w, "bad json", 400)
			return
		}
		if body.Voice.Channel != "voice-channel" || body.Voice.Session != "voice-session" || body.Voice.Endpoint != "voice.example:443" || body.Voice.Token != "test-token" {
			t.Errorf("incomplete voice state: %+v", body.Voice)
			http.Error(w, "missing voice state", 400)
			return
		}
		calls.Add(1)
		time.Sleep(30 * time.Millisecond)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	app := &App{cfg: Config{LavaURL: server.URL}, ctx: context.Background()}
	bot := NewBot(app)
	defer bot.cancel()
	music := bot.music
	music.session = "test-session"
	music.connected.Store(true)
	player := &Player{ChannelID: "voice-channel", Session: "voice-session", Endpoint: "voice.example:443", Token: "test-token", voiceVersion: 3}
	music.players["guild"] = player
	var group sync.WaitGroup
	for i := 0; i < 8; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if err := music.syncVoice("guild"); err != nil {
				t.Error(err)
			}
		}()
	}
	group.Wait()
	if got := calls.Load(); got != 1 {
		t.Fatalf("sent %d duplicate voice updates", got)
	}
	music.mu.Lock()
	player.voiceVersion++
	music.mu.Unlock()
	if err := music.syncVoice("guild"); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatal("a changed voice state was not resent")
	}
}

func TestMusicErrorsNeverExposeRemoteHTTPDetails(t *testing.T) {
	secret := `{"timestamp":1793601056722,"status":400,"path":"/v4/sessions/private/players/123"}`
	tests := []struct {
		err  error
		want string
	}{
		{&lavalinkHTTPError{Status: 400, Detail: secret}, "Không thể kết nối hoặc cập nhật trình phát. Hãy thử lại /play."},
		{&lavalinkHTTPError{Status: 401, Detail: secret}, "Dịch vụ nhạc từ chối yêu cầu. Vui lòng liên hệ quản trị viên."},
		{&lavalinkHTTPError{Status: 404, Detail: secret}, "Phiên phát nhạc đã hết hạn. Hãy thử lại /play."},
		{&lavalinkHTTPError{Status: 429, Detail: secret}, "Dịch vụ nhạc đang bận. Vui lòng thử lại sau."},
		{&lavalinkHTTPError{Status: 500, Detail: secret}, "Không thể xử lý yêu cầu phát nhạc lúc này. Vui lòng thử lại."},
		{musicUserError("Bạn cần vào voice channel."), "Bạn cần vào voice channel."},
		{fmt.Errorf("unexpected upstream response: %s", secret), "Không thể xử lý yêu cầu phát nhạc lúc này. Vui lòng thử lại."},
	}
	for _, test := range tests {
		got := musicErrorMessage(test.err)
		if got != test.want || strings.Contains(got, "/v4/") || strings.Contains(got, "HTTP 400") {
			t.Fatalf("unexpected user error %q", got)
		}
	}
}
func TestYouTubePlaybackFailureIsHumanReadable(t *testing.T) {
	var track Track
	track.Info.SourceName = "youtube"
	got := playbackFailureMessage(track, "Could not play track", "Sign in to confirm you're not a bot")
	if !strings.Contains(got, "YouTube yêu cầu xác thực") || strings.Contains(got, "Sign in") {
		t.Fatalf("unexpected error: %q", got)
	}
}
