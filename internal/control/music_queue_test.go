package control

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func queueTrack(encoded string) Track {
	return Track{Encoded: encoded}
}

func trackEnd(guild, encoded, reason string) map[string]json.RawMessage {
	marshal := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	return map[string]json.RawMessage{"type": marshal("TrackEndEvent"), "guildId": marshal(guild), "track": marshal(queueTrack(encoded)), "reason": marshal(reason)}
}

func TestFinishedTrackStartsQueuedTrackWithoutBlockingEvents(t *testing.T) {
	started, release := make(chan string, 1), make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Track struct {
				Encoded string `json:"encoded"`
			} `json:"track"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		started <- body.Track.Encoded
		<-release
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	app := &App{cfg: Config{LavaURL: server.URL}, ctx: context.Background()}
	bot := NewBot(app)
	m := bot.music
	m.session = "session"
	m.connected.Store(true)
	first := queueTrack("first")
	m.players["guild"] = &Player{Current: &first, Queue: []Track{queueTrack("second"), queueTrack("third")}, Volume: 100}
	done := make(chan struct{})
	go func() { m.event(trackEnd("guild", "first", "finished")); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		close(release)
		t.Fatal("event reader blocked on player update")
	}
	select {
	case got := <-started:
		if got != "second" {
			t.Fatalf("played %q", got)
		}
	case <-time.After(time.Second):
		close(release)
		t.Fatal("next track did not start")
	}
	m.mu.Lock()
	current, queue := m.players["guild"].Current.Encoded, m.players["guild"].Queue
	m.mu.Unlock()
	if current != "second" || len(queue) != 1 || queue[0].Encoded != "third" {
		t.Fatalf("current=%q queue=%v", current, queue)
	}
	close(release)
}

func TestFailedNextTrackRemainsInQueue(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "temporary failure", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	app := &App{cfg: Config{LavaURL: server.URL}, ctx: context.Background()}
	bot := NewBot(app)
	defer bot.cancel()
	m := bot.music
	m.session = "session"
	m.connected.Store(true)
	m.players["guild"] = &Player{Queue: []Track{queueTrack("second"), queueTrack("third")}}
	if err := m.next("guild"); err == nil {
		t.Fatal("expected update failure")
	}
	p := m.players["guild"]
	if p.Current != nil || !p.Paused || len(p.Queue) != 2 || p.Queue[0].Encoded != "second" || p.Queue[1].Encoded != "third" {
		t.Fatalf("queue was not retained: %+v", p)
	}
}

func TestReconcileAdvancesOnlyWhenRemoteTrackHasEnded(t *testing.T) {
	for _, remoteTrack := range []bool{true, false} {
		t.Run(fmt.Sprintf("remote_track_%t", remoteTrack), func(t *testing.T) {
			patches := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet {
					if remoteTrack {
						fmt.Fprint(w, `{"track":{"encoded":"first"}}`)
					} else {
						fmt.Fprint(w, `{"track":null}`)
					}
					return
				}
				patches++
				w.WriteHeader(http.StatusNoContent)
			}))
			defer server.Close()
			app := &App{cfg: Config{LavaURL: server.URL}, ctx: context.Background()}
			bot := NewBot(app)
			defer bot.cancel()
			m := bot.music
			m.session = "session"
			m.connected.Store(true)
			first := queueTrack("first")
			first.Info.Length = 103000
			m.players["guild"] = &Player{Current: &first, Position: 99880, Connected: true, Queue: []Track{queueTrack("second")}}
			m.reconcileFinished(context.Background())
			p := m.players["guild"]
			if remoteTrack && (patches != 0 || p.Current.Encoded != "first" || len(p.Queue) != 1) {
				t.Fatal("advanced while remote track was still present")
			}
			if !remoteTrack && (patches != 1 || p.Current.Encoded != "second" || len(p.Queue) != 0) {
				t.Fatal("did not advance after missing end event")
			}
		})
	}
}
