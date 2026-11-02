package control

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
)

// The YouTube TV device OAuth client is the same public client used by
// youtube-source 1.18.2 (YoutubeOauth2Handler). It is not a user credential.
const youtubeClientID = "861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com"
const youtubeClientSecret = "SboVhoG9s0rNafixCSGGKXAT"
const youtubeScope = "http://gdata.youtube.com https://www.googleapis.com/auth/youtube"
const youtubeSecretName = "youtube-oauth-refresh-token"

type youtubeFlow struct {
	deviceCode, userCode, verificationURL string
	expiresAt, nextPoll                   time.Time
	interval                              time.Duration
	polling                               bool
}
type youtubeOAuth struct {
	app                 *App
	client              *http.Client
	deviceURL, tokenURL string
	mu                  sync.Mutex
	startMu             sync.Mutex
	applyMu             sync.Mutex
	flows               map[string]*youtubeFlow
	applied             atomic.Bool
}
type oauthStatus struct {
	State           string     `json:"state"`
	Connected       bool       `json:"connected"`
	Applied         bool       `json:"applied"`
	VerificationURL string     `json:"verificationUrl,omitempty"`
	UserCode        string     `json:"userCode,omitempty"`
	ExpiresAt       *time.Time `json:"expiresAt,omitempty"`
	Interval        int        `json:"interval,omitempty"`
}

func newYoutubeOAuth(a *App) *youtubeOAuth {
	return &youtubeOAuth{app: a, client: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, deviceURL: "https://www.youtube.com/o/oauth2/device/code", tokenURL: "https://www.youtube.com/o/oauth2/token", flows: map[string]*youtubeFlow{}}
}
func oauthKey(r *http.Request) string {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256([]byte(c.Value))
	return hex.EncodeToString(sum[:])
}
func oauthCipher(secret string) (cipher.AEAD, error) {
	key := sha256.Sum256([]byte("discord-control/youtube-oauth/v1\x00" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func encryptOAuth(secret, token string) ([]byte, error) {
	gcm, err := oauthCipher(secret)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	out := append([]byte{1}, nonce...)
	return gcm.Seal(out, nonce, []byte(token), []byte(youtubeSecretName)), nil
}
func decryptOAuth(secret string, data []byte) (string, error) {
	gcm, err := oauthCipher(secret)
	if err != nil {
		return "", err
	}
	if len(data) < 1+gcm.NonceSize()+gcm.Overhead() || data[0] != 1 {
		return "", errors.New("invalid encrypted credential")
	}
	nonce := data[1 : 1+gcm.NonceSize()]
	plain, err := gcm.Open(nil, nonce, data[1+gcm.NonceSize():], []byte(youtubeSecretName))
	if err != nil {
		return "", errors.New("cannot decrypt credential")
	}
	return string(plain), nil
}
func (o *youtubeOAuth) token(ctx context.Context) (string, error) {
	var data []byte
	err := o.app.db.QueryRow(ctx, `SELECT ciphertext FROM "IntegrationSecret" WHERE name=$1`, youtubeSecretName).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return decryptOAuth(o.app.cfg.Secret, data)
}
func (o *youtubeOAuth) store(ctx context.Context, token string) error {
	data, err := encryptOAuth(o.app.cfg.Secret, token)
	if err != nil {
		return err
	}
	_, err = o.app.db.Exec(ctx, `INSERT INTO "IntegrationSecret" (name,ciphertext,"updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP) ON CONFLICT (name) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,"updatedAt"=CURRENT_TIMESTAMP`, youtubeSecretName, data)
	return err
}
func (o *youtubeOAuth) saved(ctx context.Context) (bool, error) {
	var exists bool
	err := o.app.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "IntegrationSecret" WHERE name=$1)`, youtubeSecretName).Scan(&exists)
	return exists, err
}
func (o *youtubeOAuth) payload(ctx context.Context, key, state string) (oauthStatus, error) {
	saved, err := o.saved(ctx)
	if err != nil {
		return oauthStatus{}, err
	}
	result := oauthStatus{State: state, Connected: saved, Applied: o.applied.Load()}
	o.mu.Lock()
	defer o.mu.Unlock()
	flow := o.flows[key]
	if flow != nil && time.Now().After(flow.expiresAt) {
		delete(o.flows, key)
		flow = nil
		if state == "" {
			result.State = "expired"
		}
	}
	if flow != nil {
		expiry := flow.expiresAt
		result.State = "pending"
		result.UserCode = flow.userCode
		result.VerificationURL = flow.verificationURL
		result.ExpiresAt = &expiry
		result.Interval = int(flow.interval.Seconds())
	} else if result.State == "" {
		if saved && result.Applied {
			result.State = "connected"
		} else if saved {
			result.State = "saved"
		} else {
			result.State = "idle"
		}
	}
	return result, nil
}
func oauthVerificationURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return false
	}
	switch strings.ToLower(u.Hostname()) {
	case "google.com", "www.google.com", "accounts.google.com", "www.youtube.com":
		return true
	}
	return false
}
func (o *youtubeOAuth) provider(ctx context.Context, endpoint string, payload any, out any) (int, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := o.client.Do(req)
	if err != nil {
		return 0, errors.New("không kết nối được tới Google")
	}
	defer res.Body.Close()
	if err = json.NewDecoder(io.LimitReader(res.Body, 16<<10)).Decode(out); err != nil {
		return res.StatusCode, errors.New("Google trả về phản hồi không hợp lệ")
	}
	return res.StatusCode, nil
}
func (o *youtubeOAuth) start(ctx context.Context, key string) (oauthStatus, error) {
	o.startMu.Lock()
	defer o.startMu.Unlock()
	o.mu.Lock()
	flow := o.flows[key]
	valid := flow != nil && time.Now().Before(flow.expiresAt)
	o.mu.Unlock()
	if valid {
		return o.payload(ctx, key, "")
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return oauthStatus{}, err
	}
	var response struct {
		DeviceCode      string `json:"device_code"`
		UserCode        string `json:"user_code"`
		VerificationURL string `json:"verification_url"`
		ExpiresIn       int    `json:"expires_in"`
		Interval        int    `json:"interval"`
	}
	status, err := o.provider(ctx, o.deviceURL, map[string]string{"client_id": youtubeClientID, "scope": youtubeScope, "device_id": hex.EncodeToString(random), "device_model": "ytlr::"}, &response)
	if err != nil {
		return oauthStatus{}, err
	}
	if status != 200 || response.DeviceCode == "" || response.UserCode == "" || len(response.UserCode) > 64 || !oauthVerificationURL(response.VerificationURL) || response.ExpiresIn <= 0 {
		return oauthStatus{}, errors.New("không thể tạo mã xác thực YouTube")
	}
	if response.ExpiresIn > 1800 {
		response.ExpiresIn = 1800
	}
	if response.Interval < 5 {
		response.Interval = 5
	}
	if response.Interval > 60 {
		response.Interval = 60
	}
	flow = &youtubeFlow{deviceCode: response.DeviceCode, userCode: response.UserCode, verificationURL: response.VerificationURL, expiresAt: time.Now().Add(time.Duration(response.ExpiresIn) * time.Second), interval: time.Duration(response.Interval) * time.Second}
	o.mu.Lock()
	for k, v := range o.flows {
		if time.Now().After(v.expiresAt) {
			delete(o.flows, k)
		}
	}
	o.flows[key] = flow
	o.mu.Unlock()
	return o.payload(ctx, key, "")
}
func (o *youtubeOAuth) apply(ctx context.Context, token *string) error {
	if o.app.cfg.LavaURL == "" || o.app.cfg.LavaPassword == "" {
		return errors.New("Lavalink chưa được cấu hình")
	}
	body, err := json.Marshal(map[string]any{"refreshToken": token, "skipInitialization": true, "poToken": "", "visitorData": ""})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(o.app.cfg.LavaURL, "/")+"/youtube", bytes.NewReader(body))
	if err != nil {
		return errors.New("địa chỉ Lavalink không hợp lệ")
	}
	req.Header.Set("Authorization", o.app.cfg.LavaPassword)
	req.Header.Set("Content-Type", "application/json")
	res, err := o.client.Do(req)
	if err != nil {
		return errors.New("không kết nối được tới Lavalink")
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
	if res.StatusCode != http.StatusNoContent {
		return fmt.Errorf("Lavalink từ chối xác thực (HTTP %d)", res.StatusCode)
	}
	return nil
}
func (o *youtubeOAuth) restore(ctx context.Context) error {
	o.applyMu.Lock()
	defer o.applyMu.Unlock()
	token, err := o.token(ctx)
	if err != nil {
		o.applied.Store(false)
		return errors.New("không thể đọc xác thực YouTube đã lưu")
	}
	if token == "" {
		o.applied.Store(false)
		return nil
	}
	err = o.apply(ctx, &token)
	o.applied.Store(err == nil)
	if err != nil {
		o.app.record("warn", "Không thể kết nối YouTube OAuth với Lavalink: "+err.Error())
	}
	return err
}
func (o *youtubeOAuth) poll(ctx context.Context, key string) (oauthStatus, error) {
	o.mu.Lock()
	flow := o.flows[key]
	if flow == nil {
		o.mu.Unlock()
		return o.payload(ctx, key, "")
	}
	now := time.Now()
	if now.After(flow.expiresAt) {
		delete(o.flows, key)
		o.mu.Unlock()
		return o.payload(ctx, key, "expired")
	}
	if flow.polling || now.Before(flow.nextPoll) {
		o.mu.Unlock()
		return o.payload(ctx, key, "")
	}
	flow.polling = true
	flow.nextPoll = now.Add(flow.interval)
	device := flow.deviceCode
	o.mu.Unlock()
	var response struct {
		RefreshToken string `json:"refresh_token"`
		Error        string `json:"error"`
	}
	status, err := o.provider(ctx, o.tokenURL, map[string]string{"client_id": youtubeClientID, "client_secret": youtubeClientSecret, "code": device, "grant_type": "http://oauth.net/grant_type/device/1.0"}, &response)
	o.mu.Lock()
	current := o.flows[key] == flow
	o.mu.Unlock()
	if !current {
		return o.payload(ctx, key, "")
	}
	if err != nil {
		o.mu.Lock()
		if o.flows[key] == flow {
			flow.polling = false
		}
		o.mu.Unlock()
		return oauthStatus{}, err
	}
	switch response.Error {
	case "authorization_pending":
		o.mu.Lock()
		if o.flows[key] == flow {
			flow.polling = false
		}
		o.mu.Unlock()
		return o.payload(ctx, key, "")
	case "slow_down":
		o.mu.Lock()
		if o.flows[key] == flow {
			flow.polling = false
			flow.interval += 5 * time.Second
			flow.nextPoll = time.Now().Add(flow.interval)
		}
		o.mu.Unlock()
		return o.payload(ctx, key, "")
	case "expired_token", "access_denied":
		o.mu.Lock()
		if o.flows[key] == flow {
			delete(o.flows, key)
		}
		o.mu.Unlock()
		if response.Error == "access_denied" {
			return o.payload(ctx, key, "denied")
		}
		return o.payload(ctx, key, "expired")
	case "":
	default:
		o.mu.Lock()
		if o.flows[key] == flow {
			flow.polling = false
		}
		o.mu.Unlock()
		return oauthStatus{}, errors.New("Google không hoàn tất xác thực; hãy thử lại")
	}
	if status != http.StatusOK || response.RefreshToken == "" {
		o.mu.Lock()
		if o.flows[key] == flow {
			delete(o.flows, key)
		}
		o.mu.Unlock()
		return oauthStatus{}, errors.New("Google không trả về quyền truy cập dài hạn; hãy thử lại sau khi xóa quyền cũ của ứng dụng trong tài khoản Google")
	}
	// Save even if the browser disconnects after Google issues a one-time refresh token.
	persistCtx, cancel := context.WithTimeout(o.app.ctx, 30*time.Second)
	defer cancel()
	o.applyMu.Lock()
	defer o.applyMu.Unlock()
	o.mu.Lock()
	current = o.flows[key] == flow
	o.mu.Unlock()
	if !current {
		return o.payload(persistCtx, key, "")
	}
	if err = o.store(persistCtx, response.RefreshToken); err != nil {
		o.mu.Lock()
		if o.flows[key] == flow {
			delete(o.flows, key)
		}
		o.mu.Unlock()
		return oauthStatus{}, errors.New("không thể lưu kết nối YouTube; hãy thử liên kết lại")
	}
	err = o.apply(persistCtx, &response.RefreshToken)
	o.applied.Store(err == nil)
	o.mu.Lock()
	if o.flows[key] == flow {
		delete(o.flows, key)
	}
	o.mu.Unlock()
	if err != nil {
		o.app.record("warn", "YouTube OAuth đã lưu nhưng chưa kết nối được Lavalink: "+err.Error())
	}
	return o.payload(persistCtx, key, "")
}
func (a *App) youtubeStatus(w http.ResponseWriter, r *http.Request) {
	state, err := a.youtube.payload(r.Context(), oauthKey(r), "")
	if err != nil {
		fail(w, 500, "Không thể tải trạng thái YouTube.")
		return
	}
	jsonResponse(w, 200, state)
}
func (a *App) youtubeStart(w http.ResponseWriter, r *http.Request) {
	state, err := a.youtube.start(r.Context(), oauthKey(r))
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	jsonResponse(w, 200, state)
}
func (a *App) youtubePoll(w http.ResponseWriter, r *http.Request) {
	state, err := a.youtube.poll(r.Context(), oauthKey(r))
	if err != nil {
		fail(w, 502, err.Error())
		return
	}
	jsonResponse(w, 200, state)
}
func (a *App) youtubeApply(w http.ResponseWriter, r *http.Request) {
	if err := a.youtube.restore(r.Context()); err != nil {
		fail(w, 502, err.Error())
		return
	}
	state, err := a.youtube.payload(r.Context(), oauthKey(r), "")
	if err != nil {
		fail(w, 500, "Không thể tải trạng thái YouTube.")
		return
	}
	jsonResponse(w, 200, state)
}
func (a *App) youtubeCancel(w http.ResponseWriter, r *http.Request) {
	a.youtube.mu.Lock()
	delete(a.youtube.flows, oauthKey(r))
	a.youtube.mu.Unlock()
	state, err := a.youtube.payload(r.Context(), oauthKey(r), "")
	if err != nil {
		fail(w, 500, "Không thể tải trạng thái YouTube.")
		return
	}
	jsonResponse(w, 200, state)
}
func (a *App) youtubeDisconnect(w http.ResponseWriter, r *http.Request) {
	o := a.youtube
	o.applyMu.Lock()
	defer o.applyMu.Unlock()
	if err := o.apply(r.Context(), nil); err != nil {
		fail(w, 502, "Không thể ngắt kết nối: "+err.Error())
		return
	}
	o.applied.Store(false)
	if _, err := a.db.Exec(r.Context(), `DELETE FROM "IntegrationSecret" WHERE name=$1`, youtubeSecretName); err != nil {
		fail(w, 500, "Không thể xóa kết nối YouTube.")
		return
	}
	o.applied.Store(false)
	o.mu.Lock()
	o.flows = map[string]*youtubeFlow{}
	o.mu.Unlock()
	jsonResponse(w, 200, oauthStatus{State: "idle"})
}
