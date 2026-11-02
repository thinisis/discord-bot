package control

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const sessionCookie = "discord_bot_admin_session"

type attempt struct {
	Count int
	Last  time.Time
}

func (a *App) sign(id string) string {
	m := hmac.New(sha256.New, []byte(a.cfg.Secret))
	m.Write([]byte(id))
	return id + "." + base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}
func (a *App) session(r *http.Request) (string, string, error) {
	c, e := r.Cookie(sessionCookie)
	if e != nil {
		return "", "", e
	}
	i := strings.LastIndex(c.Value, ".")
	if i < 1 || subtle.ConstantTimeCompare([]byte(a.sign(c.Value[:i])), []byte(c.Value)) != 1 {
		return "", "", errors.New("invalid session")
	}
	var id, name string
	e = a.db.QueryRow(r.Context(), `SELECT u.id,u.username FROM "AdminSession" s JOIN "AdminUser" u ON u.id=s."adminUserId" WHERE s.id=$1 AND s."expiresAt">CURRENT_TIMESTAMP`, c.Value[:i]).Scan(&id, &name)
	return id, name, e
}
func (a *App) cookie(w http.ResponseWriter, r *http.Request, value string, ttl int) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: value, Path: "/", HttpOnly: true, Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteStrictMode, MaxAge: ttl})
}
func sameOrigin(r *http.Request) bool {
	if s := r.Header.Get("Origin"); s != "" {
		u, e := url.Parse(s)
		return e == nil && u.Host == r.Host
	}
	return r.Header.Get("Sec-Fetch-Site") != "cross-site"
}
func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]any{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, 400, "Dữ liệu không hợp lệ.")
		return false
	}
	return true
}
func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	ip := r.Header.Get("X-Real-IP")
	if ip == "" {
		ip, _, _ = net.SplitHostPort(r.RemoteAddr)
	}
	now := time.Now()
	a.mu.Lock()
	for k, v := range a.attempts {
		if now.Sub(v.Last) > 15*time.Minute {
			delete(a.attempts, k)
		}
	}
	at := a.attempts[ip]
	if at != nil && at.Count >= 8 {
		a.mu.Unlock()
		fail(w, 429, "Thử lại sau 15 phút.")
		return
	}
	a.mu.Unlock()
	var id, hash string
	err := a.db.QueryRow(r.Context(), `SELECT id,"passwordHash" FROM "AdminUser" WHERE username=$1`, strings.TrimSpace(in.Username)).Scan(&id, &hash)
	if err != nil {
		hash = "$2a$12$Cnvt0O0T/zHwyDQqA0C9meSDAxD/5Aa9zZPxcO.hYRftkDjTHrg96"
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil || err != nil {
		a.mu.Lock()
		if a.attempts[ip] == nil {
			a.attempts[ip] = &attempt{}
		}
		a.attempts[ip].Count++
		a.attempts[ip].Last = now
		a.mu.Unlock()
		fail(w, 401, "Tên đăng nhập hoặc mật khẩu không đúng.")
		return
	}
	sid := uid()
	tx, e := a.db.Begin(r.Context())
	if e != nil {
		fail(w, 500, "Không thể tạo phiên.")
		return
	}
	defer tx.Rollback(r.Context())
	// Serialize login with password changes so an old password cannot create a new session.
	var currentHash string
	if e = tx.QueryRow(r.Context(), `SELECT "passwordHash" FROM "AdminUser" WHERE id=$1 FOR UPDATE`, id).Scan(&currentHash); e != nil {
		fail(w, 500, "Không thể tạo phiên.")
		return
	}
	if currentHash != hash {
		fail(w, 401, "Mật khẩu đã thay đổi. Vui lòng đăng nhập lại.")
		return
	}
	_, e = tx.Exec(r.Context(), `INSERT INTO "AdminSession" (id,"adminUserId","expiresAt","lastSeenAt","createdAt") VALUES($1,$2,$3,$4,$4)`, sid, id, now.Add(a.cfg.SessionTTL), now)
	if e == nil {
		_, e = tx.Exec(r.Context(), `UPDATE "AdminUser" SET "lastLoginAt"=$1,"updatedAt"=$1 WHERE id=$2`, now, id)
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 500, "Không thể tạo phiên.")
		return
	}
	a.mu.Lock()
	delete(a.attempts, ip)
	a.mu.Unlock()
	a.cookie(w, r, a.sign(sid), int(a.cfg.SessionTTL.Seconds()))
	jsonResponse(w, 200, map[string]any{"username": in.Username})
}
func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	if c, e := r.Cookie(sessionCookie); e == nil {
		if i := strings.LastIndex(c.Value, "."); i > 0 {
			a.db.Exec(r.Context(), `DELETE FROM "AdminSession" WHERE id=$1`, c.Value[:i])
		}
	}
	a.cookie(w, r, "", -1)
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (a *App) bootstrap(ctx context.Context) error {
	var count int
	if e := a.db.QueryRow(ctx, `SELECT count(*) FROM "AdminUser"`).Scan(&count); e != nil {
		return e
	}
	if count > 0 {
		return nil
	}
	user, password := os.Getenv("ADMIN_BOOTSTRAP_USERNAME"), os.Getenv("ADMIN_BOOTSTRAP_PASSWORD")
	if user == "" || len(password) < 8 {
		return errors.New("set bootstrap admin credentials for a new database")
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(password), 12)
	if e != nil {
		return e
	}
	_, e = a.db.Exec(ctx, `INSERT INTO "AdminUser" (id,username,"passwordHash","createdAt","updatedAt") VALUES($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, uid(), user, string(hash))
	return e
}

// validatePasswordChange enforces bcrypt's byte limit without silently truncating Unicode passwords.
func validatePasswordChange(current, next, confirmation string) error {
	if len([]rune(next)) < 8 {
		return errors.New("Mật khẩu mới cần ít nhất 8 ký tự.")
	}
	if len(next) > 72 {
		return errors.New("Mật khẩu mới không được vượt quá 72 byte.")
	}
	if next != confirmation {
		return errors.New("Xác nhận mật khẩu mới không khớp.")
	}
	if next == current {
		return errors.New("Mật khẩu mới phải khác mật khẩu hiện tại.")
	}
	return nil
}
func (a *App) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Current string `json:"currentPassword"`
		New     string `json:"newPassword"`
		Confirm string `json:"confirmPassword"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := validatePasswordChange(in.Current, in.New, in.Confirm); err != nil {
		fail(w, 400, err.Error())
		return
	}
	id, _, err := a.session(r)
	if err != nil {
		fail(w, 401, "Vui lòng đăng nhập lại.")
		return
	}
	key := "password:" + id
	now := time.Now()
	a.mu.Lock()
	previous := a.attempts[key]
	blocked := previous != nil && previous.Count >= 8 && now.Sub(previous.Last) < 15*time.Minute
	a.mu.Unlock()
	if blocked {
		fail(w, 429, "Đổi mật khẩu bị tạm khóa. Thử lại sau 15 phút.")
		return
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Không thể đổi mật khẩu.")
		return
	}
	defer tx.Rollback(r.Context())
	var hash string
	if err = tx.QueryRow(r.Context(), `SELECT "passwordHash" FROM "AdminUser" WHERE id=$1 FOR UPDATE`, id).Scan(&hash); err != nil {
		fail(w, 500, "Không thể đổi mật khẩu.")
		return
	}
	c, _ := r.Cookie(sessionCookie)
	oldSession := c.Value[:strings.LastIndex(c.Value, ".")]
	var valid bool
	if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM "AdminSession" WHERE id=$1 AND "adminUserId"=$2 AND "expiresAt">CURRENT_TIMESTAMP)`, oldSession, id).Scan(&valid); err != nil {
		fail(w, 500, "Không thể kiểm tra phiên đăng nhập.")
		return
	}
	if !valid {
		fail(w, 401, "Phiên đăng nhập đã hết hiệu lực.")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Current)) != nil {
		a.mu.Lock()
		at := a.attempts[key]
		if at == nil || now.Sub(at.Last) >= 15*time.Minute {
			at = &attempt{}
			a.attempts[key] = at
		}
		at.Count++
		at.Last = now
		a.mu.Unlock()
		fail(w, 400, "Mật khẩu hiện tại không đúng.")
		return
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(in.New), 12)
	if err != nil {
		fail(w, 500, "Không thể mã hóa mật khẩu mới.")
		return
	}
	_, err = tx.Exec(r.Context(), `UPDATE "AdminUser" SET "passwordHash"=$2,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1`, id, string(hashed))
	if err == nil {
		_, err = tx.Exec(r.Context(), `DELETE FROM "AdminSession" WHERE "adminUserId"=$1`, id)
	}
	sid := uid()
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO "AdminSession" (id,"adminUserId","expiresAt","lastSeenAt","createdAt") VALUES($1,$2,$3,$4,$4)`, sid, id, now.Add(a.cfg.SessionTTL), now)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		fail(w, 500, "Không thể lưu mật khẩu mới.")
		return
	}
	a.mu.Lock()
	delete(a.attempts, key)
	a.mu.Unlock()
	a.cookie(w, r, a.sign(sid), int(a.cfg.SessionTTL.Seconds()))
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
