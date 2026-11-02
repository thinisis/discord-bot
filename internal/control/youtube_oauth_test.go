package control

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
	assets "github.com/thinisis/discord-bot"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestOAuthEncryptionAndVerificationURL(t *testing.T) {
	token := "fake-refresh-token-for-unit-test"
	first, err := encryptOAuth("session-secret-one", token)
	if err != nil {
		t.Fatal(err)
	}
	second, err := encryptOAuth("session-secret-one", token)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(first, []byte(token)) || bytes.Equal(first, second) {
		t.Fatal("token must be encrypted with a fresh nonce")
	}
	plain, err := decryptOAuth("session-secret-one", first)
	if err != nil || plain != token {
		t.Fatal("cannot decrypt valid token")
	}
	if _, err = decryptOAuth("different-secret", first); err == nil {
		t.Fatal("wrong key accepted")
	}
	first[len(first)-1] ^= 1
	if _, err = decryptOAuth("session-secret-one", first); err == nil {
		t.Fatal("tampered data accepted")
	}
	for _, u := range []string{"https://www.google.com/device", "https://accounts.google.com/device"} {
		if !oauthVerificationURL(u) {
			t.Errorf("valid Google URL rejected: %s", u)
		}
	}
	for _, u := range []string{"http://www.google.com/device", "https://google.com.evil.example/device", "https://attacker@www.google.com/device", "https://www.google.com:444/device"} {
		if oauthVerificationURL(u) {
			t.Errorf("unsafe URL accepted: %s", u)
		}
	}
}
func TestYouTubeOAuthIntegration(t *testing.T) {
	dsn := os.Getenv("OAUTH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires an isolated PostgreSQL test database")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = migrate(ctx, db, assets.Files); err != nil {
		t.Fatal(err)
	}
	const refresh = "fake-private-refresh-token-for-test"
	const device = "fake-private-device-code-for-test"
	var tokenRequests atomic.Int32
	var rejectApply atomic.Bool
	var applied atomic.Int32
	var cleared atomic.Int32
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method", 405)
			return
		}
		var input map[string]string
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Error(err)
			http.Error(w, "json", 400)
			return
		}
		switch r.URL.Path {
		case "/device":
			json.NewEncoder(w).Encode(map[string]any{"device_code": device, "user_code": "ABCD-EFGH", "verification_url": "https://www.google.com/device", "expires_in": 600, "interval": 5})
		case "/token":
			if input["code"] != device {
				t.Error("wrong device code")
			}
			if tokenRequests.Add(1) == 1 {
				w.WriteHeader(400)
				json.NewEncoder(w).Encode(map[string]string{"error": "authorization_pending"})
				return
			}
			json.NewEncoder(w).Encode(map[string]string{"refresh_token": refresh})
		default:
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()
	lava := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/youtube" || r.Header.Get("Authorization") != "fake-lava-password" {
			http.Error(w, "bad request", 400)
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["poToken"] != "" || body["visitorData"] != "" {
			t.Error("existing poToken must not be changed")
		}
		if rejectApply.Load() {
			http.Error(w, "unavailable", 503)
			return
		}
		if body["refreshToken"] == nil {
			cleared.Add(1)
		} else if body["refreshToken"] == refresh {
			applied.Add(1)
		} else {
			t.Error("unexpected token")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer lava.Close()
	app := &App{cfg: Config{Secret: "isolated-test-session-secret-long", LavaURL: lava.URL, LavaPassword: "fake-lava-password"}, ctx: ctx, db: db, attempts: map[string]*attempt{}}
	app.youtube = newYoutubeOAuth(app)
	app.youtube.deviceURL = provider.URL + "/device"
	app.youtube.tokenURL = provider.URL + "/token"
	id, sid := uid(), uid()
	if _, err = db.Exec(ctx, `INSERT INTO "AdminUser" (id,username,"passwordHash","updatedAt") VALUES($1,$2,$3,CURRENT_TIMESTAMP)`, id, "oauth-test-"+id, "unused"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `INSERT INTO "AdminSession" (id,"adminUserId","expiresAt") VALUES($1,$2,$3)`, sid, id, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	cookie := &http.Cookie{Name: sessionCookie, Value: app.sign(sid)}
	handler := app.routes()
	call := func(method, path string, authorized bool, origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		if authorized {
			req.AddCookie(cookie)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		return res
	}
	if got := call("GET", "/api/integrations/youtube/oauth", false, "").Code; got != 401 {
		t.Fatalf("unauthenticated OAuth status: %d", got)
	}
	if got := call("POST", "/api/integrations/youtube/oauth/start", true, "https://attacker.example").Code; got != 403 {
		t.Fatalf("cross-origin OAuth start: %d", got)
	}
	res := call("POST", "/api/integrations/youtube/oauth/start", true, "")
	if res.Code != 200 {
		t.Fatalf("start status %d: %s", res.Code, res.Body.String())
	}
	var state oauthStatus
	if err = json.Unmarshal(res.Body.Bytes(), &state); err != nil || state.State != "pending" || state.UserCode != "ABCD-EFGH" {
		t.Fatalf("bad start response: %s", res.Body.String())
	}
	if strings.Contains(res.Body.String(), device) || strings.Contains(res.Body.String(), refresh) {
		t.Fatal("secret returned to browser")
	}
	// A different session must not see the pending device code.
	isolated, err := app.youtube.payload(ctx, "another-session", "")
	if err != nil || isolated.UserCode != "" || isolated.State != "idle" {
		t.Fatal("OAuth flow leaked to another session")
	}
	res = call("POST", "/api/integrations/youtube/oauth/poll", true, "")
	if res.Code != 200 || !strings.Contains(res.Body.String(), `"state":"pending"`) {
		t.Fatalf("pending: %s", res.Body.String())
	}
	app.youtube.mu.Lock()
	for _, flow := range app.youtube.flows {
		flow.nextPoll = time.Time{}
	}
	app.youtube.mu.Unlock()
	res = call("POST", "/api/integrations/youtube/oauth/poll", true, "")
	if res.Code != 200 || strings.Contains(res.Body.String(), refresh) {
		t.Fatalf("completion error or token leak: %s", res.Body.String())
	}
	if err = json.Unmarshal(res.Body.Bytes(), &state); err != nil || state.State != "connected" || !state.Applied {
		t.Fatalf("not connected: %s", res.Body.String())
	}
	if applied.Load() != 1 {
		t.Fatal("credential was not applied")
	}
	var stored []byte
	if err = db.QueryRow(ctx, `SELECT ciphertext FROM "IntegrationSecret" WHERE name=$1`, youtubeSecretName).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored, []byte(refresh)) {
		t.Fatal("refresh token stored in plaintext")
	}
	app.youtube = newYoutubeOAuth(app)
	if err = app.youtube.restore(ctx); err != nil || !app.youtube.applied.Load() || applied.Load() != 2 {
		t.Fatal("could not restore encrypted credential after restart")
	}
	rejectApply.Store(true)
	if got := call("DELETE", "/api/integrations/youtube/oauth", true, "").Code; got != 502 {
		t.Fatalf("disconnect failure status: %d", got)
	}
	if saved, _ := app.youtube.saved(ctx); !saved {
		t.Fatal("failed disconnect must retain saved credential")
	}
	rejectApply.Store(false)
	res = call("DELETE", "/api/integrations/youtube/oauth", true, "")
	if res.Code != 200 || cleared.Load() != 1 {
		t.Fatalf("disconnect failed: %d", res.Code)
	}
	if saved, _ := app.youtube.saved(ctx); saved {
		t.Fatal("credential still saved after disconnect")
	}
	io.Copy(io.Discard, res.Result().Body)
}
