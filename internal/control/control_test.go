package control

import (
	"context"
	"encoding/json"
	"github.com/gorilla/websocket"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func pint(n int) *int { return &n }
func TestScheduleTimezone(t *testing.T) {
	s := Schedule{Frequency: "DAILY", Hour: pint(8), Minute: pint(15), Enabled: true}
	now := time.Date(2026, 11, 1, 2, 0, 0, 0, time.UTC)
	want := time.Date(2026, 11, 2, 1, 15, 0, 0, time.UTC)
	if got := s.Next(now); got == nil || !got.Equal(want) {
		t.Fatalf("next=%v want=%v", got, want)
	}
	d := "1,3,1"
	s.Frequency = "WEEKLY"
	s.Days = &d
	if got := s.Next(now); got == nil || got.In(gmt7).Weekday() != time.Monday {
		t.Fatalf("weekly next=%v", got)
	}
	s.Enabled = false
	if s.Next(now) != nil {
		t.Fatal("disabled schedule must not run")
	}
}
func TestScheduleValidation(t *testing.T) {
	s := Schedule{Name: "test", GuildID: "123456789012345678", ChannelID: "123456789012345679", Message: "hello", Frequency: "WEEKLY", Hour: pint(8), Minute: pint(0), Enabled: true}
	if s.Validate(time.Now()) == nil {
		t.Fatal("weekly schedule needs days")
	}
	s.Frequency = "ONCE"
	past := time.Now().Add(-time.Hour)
	s.RunAt = &past
	if s.Validate(time.Now()) == nil {
		t.Fatal("past one-off must be rejected")
	}
	s.Frequency = "DAILY"
	s.Hour = pint(24)
	if s.Validate(time.Now()) == nil {
		t.Fatal("hour 24 must be rejected")
	}
}
func TestOriginGuard(t *testing.T) {
	r := httptest.NewRequest("POST", "https://bot.example/api/settings", nil)
	r.Header.Set("Origin", "https://evil.example")
	if sameOrigin(r) {
		t.Fatal("cross origin accepted")
	}
	r.Header.Set("Origin", "https://bot.example")
	if !sameOrigin(r) {
		t.Fatal("same origin rejected")
	}
	r.Header.Del("Origin")
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	if sameOrigin(r) {
		t.Fatal("cross site accepted")
	}
}
func TestLegacySessionSignature(t *testing.T) {
	a := &App{cfg: Config{Secret: "known-test-secret-32-characters"}}
	if got := a.sign("session"); got != "session.Cy0cv8svrSPzgcFO1DJbVEXI-m8WOiRspMUqedKRrgw" {
		t.Fatalf("signature %s does not match legacy HMAC fixture", got)
	}
}
func TestLoadSelection(t *testing.T) {
	tracks := []Track{{Encoded: "a"}, {Encoded: "b"}, {Encoded: "c"}}
	for i := range tracks {
		tracks[i].Info.Title = tracks[i].Encoded
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.RawQuery, "list") {
			json.NewEncoder(w).Encode(map[string]any{"loadType": "playlist", "data": map[string]any{"info": map[string]any{"name": "List", "selectedTrack": 1}, "tracks": tracks}})
		} else {
			json.NewEncoder(w).Encode(map[string]any{"loadType": "search", "data": tracks})
		}
	}))
	defer server.Close()
	a := &App{cfg: Config{LavaURL: server.URL, PlaylistMax: 2}, ctx: context.Background()}
	b := NewBot(a)
	m := b.music
	got, _, err := m.Load("music query")
	if err != nil || len(got) != 1 || got[0].Encoded != "a" {
		t.Fatalf("play query: %v %v", got, err)
	}
	got, _, err = m.Load("ytsearch:music query")
	if err != nil || len(got) != 2 {
		t.Fatalf("search: %v %v", got, err)
	}
	got, _, err = m.Load("https://youtube.com/watch?list=123")
	if err != nil || len(got) != 2 || got[0].Encoded != "b" || got[1].Encoded != "c" {
		t.Fatalf("selected playlist: %v %v", got, err)
	}
}
func TestLavalinkRecoversAfterFailedHandshake(t *testing.T) {
	var attempts atomic.Int32
	upgrade := websocket.Upgrader{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v4/websocket" {
			io.WriteString(w, `{"version":{"semver":"4.2.2"},"sourceManagers":["youtube"],"plugins":[]}`)
			return
		}
		if attempts.Add(1) < 3 {
			http.Error(w, "temporarily unavailable", 503)
			return
		}
		conn, e := upgrade.Upgrade(w, r, nil)
		if e != nil {
			return
		}
		defer conn.Close()
		conn.WriteJSON(map[string]any{"op": "ready", "sessionId": "new-session", "resumed": false})
		<-ctx.Done()
	}))
	defer server.Close()
	a := &App{cfg: Config{LavaURL: server.URL}, ctx: ctx}
	b := NewBot(a)
	defer b.cancel()
	go b.music.Run(ctx, "123456789012345678")
	defer b.music.Close()
	deadline := time.After(7 * time.Second)
	tick := time.NewTicker(20 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-deadline:
			t.Fatal("Lavalink never recovered")
		case <-tick.C:
			if b.music.connected.Load() {
				if attempts.Load() < 3 {
					t.Fatal("failure path not tested")
				}
				cancel()
				return
			}
		}
	}
}

func TestLegacyDatabaseTimestampIsUTC(t *testing.T) {
	row := map[string]any{"createdAt": "2026-11-01T19:30:42.123", "runAt": nil}
	normalizeTimestamps(row)
	if row["createdAt"] != "2026-11-01T19:30:42.123Z" {
		t.Fatalf("timestamp not normalized: %v", row)
	}
	parsed, err := time.Parse(time.RFC3339Nano, row["createdAt"].(string))
	if err != nil || parsed.In(gmt7).Hour() != 2 || parsed.In(gmt7).Day() != 2 {
		t.Fatal("GMT+7 display would be incorrect")
	}
}

func TestPasswordChangeValidation(t *testing.T) {
	tests := []struct {
		name, current, next, confirmation string
		valid                             bool
	}{
		{"valid", "previous-pass", "replacement-pass", "replacement-pass", true},
		{"too short", "previous-pass", "short", "short", false},
		{"confirmation mismatch", "previous-pass", "replacement-pass", "different-pass", false},
		{"same password", "previous-pass", "previous-pass", "previous-pass", false},
		{"bcrypt byte limit", "old-password", strings.Repeat("x", 73), strings.Repeat("x", 73), false},
		{"unicode valid", "old-password", strings.Repeat("đ", 8), strings.Repeat("đ", 8), true},
		{"unicode byte limit", "old-password", strings.Repeat("đ", 37), strings.Repeat("đ", 37), false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validatePasswordChange(test.current, test.next, test.confirmation)
			if (err == nil) != test.valid {
				t.Fatalf("validation mismatch: %v", err)
			}
		})
	}
}
