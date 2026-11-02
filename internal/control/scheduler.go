package control

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

var gmt7 = time.FixedZone("GMT+7", 7*3600)

type Schedule struct {
	ID        string     `json:"id,omitempty"`
	Name      string     `json:"name"`
	GuildID   string     `json:"guildId"`
	ChannelID string     `json:"channelId"`
	Message   string     `json:"message"`
	Frequency string     `json:"frequency"`
	Days      *string    `json:"daysOfWeek"`
	Hour      *int       `json:"hour"`
	Minute    *int       `json:"minute"`
	RunAt     *time.Time `json:"runAt"`
	Enabled   bool       `json:"enabled"`
	NextRun   *time.Time `json:"nextRunAt,omitempty"`
	LastSent  *time.Time `json:"lastSentAt,omitempty"`
	CreatedAt *time.Time `json:"createdAt,omitempty"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

func days(s *string) []int {
	out := []int{}
	if s == nil {
		return out
	}
	for _, v := range strings.FieldsFunc(*s, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' }) {
		n, e := strconv.Atoi(v)
		if e == nil && n >= 0 && n <= 6 {
			seen := false
			for _, i := range out {
				if i == n {
					seen = true
				}
			}
			if !seen {
				out = append(out, n)
			}
		}
	}
	sort.Ints(out)
	return out
}
func (s Schedule) Validate(now time.Time) error {
	if strings.TrimSpace(s.Name) == "" || len(s.Name) > 160 || !snowflake(s.GuildID) || !snowflake(s.ChannelID) || strings.TrimSpace(s.Message) == "" || len([]rune(s.Message)) > 2000 {
		return errors.New("Tên, guild, kênh hoặc nội dung lịch gửi không hợp lệ.")
	}
	if s.Frequency == "ONCE" {
		if s.RunAt == nil || !s.RunAt.After(now) {
			return errors.New("Thời gian gửi phải ở tương lai.")
		}
		return nil
	}
	if s.Frequency != "DAILY" && s.Frequency != "WEEKLY" {
		return errors.New("Tần suất không hợp lệ.")
	}
	if s.Hour == nil || s.Minute == nil || *s.Hour < 0 || *s.Hour > 23 || *s.Minute < 0 || *s.Minute > 59 {
		return errors.New("Giờ gửi GMT+7 không hợp lệ.")
	}
	if s.Frequency == "WEEKLY" && len(days(s.Days)) == 0 {
		return errors.New("Chọn ít nhất một ngày trong tuần.")
	}
	return nil
}
func (s Schedule) Next(now time.Time) *time.Time {
	if !s.Enabled {
		return nil
	}
	if s.Frequency == "ONCE" {
		if s.RunAt != nil && s.RunAt.After(now) {
			v := s.RunAt.UTC()
			return &v
		}
		return nil
	}
	if s.Hour == nil || s.Minute == nil {
		return nil
	}
	local := now.In(gmt7)
	for offset := 0; offset <= 7; offset++ {
		t := time.Date(local.Year(), local.Month(), local.Day()+offset, *s.Hour, *s.Minute, 0, 0, gmt7)
		if !t.After(now) {
			continue
		}
		allowed := s.Frequency == "DAILY"
		for _, d := range days(s.Days) {
			if int(t.Weekday()) == d {
				allowed = true
			}
		}
		if allowed {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}
func (a *App) saveSchedule(w http.ResponseWriter, r *http.Request) {
	var in Schedule
	if !decode(w, r, &in) {
		return
	}
	if e := in.Validate(time.Now()); e != nil {
		fail(w, 400, e.Error())
		return
	}
	if a.bot != nil {
		ch, e := a.bot.session.Channel(in.ChannelID)
		if e != nil || ch.GuildID != in.GuildID {
			fail(w, 400, "Kênh không thuộc guild đã chọn hoặc bot không truy cập được.")
			return
		}
	}
	if in.Frequency == "ONCE" {
		in.Hour = nil
		in.Minute = nil
		in.Days = nil
	} else {
		in.RunAt = nil
		if in.Frequency == "DAILY" {
			in.Days = nil
		} else {
			parts := []string{}
			for _, d := range days(in.Days) {
				parts = append(parts, strconv.Itoa(d))
			}
			v := strings.Join(parts, ",")
			in.Days = &v
		}
	}
	next := in.Next(time.Now())
	id := r.PathValue("id")
	var e error
	if id == "" {
		id = uid()
		_, e = a.db.Exec(r.Context(), `INSERT INTO "ScheduledMessage" (id,name,"guildId","channelId",message,frequency,"daysOfWeek",hour,minute,"runAt",enabled,"nextRunAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6::"ScheduledMessageFrequency",$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, in.Name, in.GuildID, in.ChannelID, in.Message, in.Frequency, in.Days, in.Hour, in.Minute, in.RunAt, in.Enabled, next)
	} else {
		tag, err := a.db.Exec(r.Context(), `UPDATE "ScheduledMessage" SET name=$2,"guildId"=$3,"channelId"=$4,message=$5,frequency=$6::"ScheduledMessageFrequency","daysOfWeek"=$7,hour=$8,minute=$9,"runAt"=$10,enabled=$11,"nextRunAt"=$12,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1`, id, in.Name, in.GuildID, in.ChannelID, in.Message, in.Frequency, in.Days, in.Hour, in.Minute, in.RunAt, in.Enabled, next)
		e = err
		if e == nil && tag.RowsAffected() == 0 {
			fail(w, 404, "Không tìm thấy lịch.")
			return
		}
	}
	if e != nil {
		fail(w, 500, "Không thể lưu lịch.")
		return
	}
	jsonResponse(w, 200, map[string]string{"id": id})
}
func (a *App) deleteSchedule(w http.ResponseWriter, r *http.Request) {
	_, e := a.db.Exec(r.Context(), `DELETE FROM "ScheduledMessage" WHERE id=$1`, r.PathValue("id"))
	if e != nil {
		fail(w, 500, "Không thể xóa lịch.")
		return
	}
	jsonResponse(w, 200, map[string]bool{"ok": true})
}
func (b *Bot) scheduler() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-b.ctx.Done():
			return
		case <-ticker.C:
			if b.ready.Load() {
				b.pollSchedules()
			}
		}
	}
}
func (b *Bot) pollSchedules() {
	for i := 0; i < 20; i++ {
		tx, e := b.app.db.Begin(b.ctx)
		if e != nil {
			return
		}
		var raw []byte
		e = tx.QueryRow(b.ctx, `SELECT to_jsonb(t) || jsonb_build_object('runAt',t."runAt" AT TIME ZONE 'UTC','nextRunAt',t."nextRunAt" AT TIME ZONE 'UTC','lastSentAt',t."lastSentAt" AT TIME ZONE 'UTC','createdAt',t."createdAt" AT TIME ZONE 'UTC','updatedAt',t."updatedAt" AT TIME ZONE 'UTC') FROM "ScheduledMessage" t WHERE enabled=true AND "nextRunAt"<=CURRENT_TIMESTAMP ORDER BY "nextRunAt" FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&raw)
		if e != nil {
			tx.Rollback(b.ctx)
			return
		}
		var s Schedule
		if e = json.Unmarshal(raw, &s); e != nil {
			tx.Rollback(b.ctx)
			b.app.record("error", "Invalid scheduled message: "+e.Error())
			return
		}
		now := time.Now()
		var next *time.Time
		enabled := s.Enabled
		last := s.LastSent
		if e = b.send(s.ChannelID, s.Message); e != nil {
			retry := now.Add(5 * time.Minute)
			next = &retry
			b.app.record("error", "Scheduled message "+s.ID+": "+e.Error())
		} else {
			last = &now
			next = s.Next(now)
			if s.Frequency == "ONCE" {
				enabled = false
			}
			b.app.record("info", "Scheduled message sent: "+s.Name)
		}
		_, e = tx.Exec(b.ctx, `UPDATE "ScheduledMessage" SET "lastSentAt"=$2,"nextRunAt"=$3,enabled=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE id=$1`, s.ID, last, next, enabled)
		if e != nil {
			tx.Rollback(b.ctx)
			return
		}
		if e = tx.Commit(b.ctx); e != nil {
			b.app.record("error", "Scheduler commit: "+e.Error())
			return
		}
	}
}
