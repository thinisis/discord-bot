package control

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// Only errors deliberately created by the application may be sent verbatim to Discord.
type musicUserError string

func (e musicUserError) Error() string { return string(e) }

type lavalinkHTTPError struct {
	Status int
	Detail string
}

func (e *lavalinkHTTPError) Error() string {
	return fmt.Sprintf("Lavalink HTTP %d: %s", e.Status, e.Detail)
}
func youtubeVerificationRequired(detail string) bool {
	lower := strings.ToLower(detail)
	return strings.Contains(lower, "sign in to confirm") || strings.Contains(lower, "requires login") || strings.Contains(lower, "confirm you’re not a bot") || strings.Contains(lower, "confirm you're not a bot")
}
func musicErrorMessage(err error) string {
	if err == nil {
		return ""
	}
	var safe musicUserError
	if errors.As(err, &safe) {
		return string(safe)
	}
	if youtubeVerificationRequired(err.Error()) {
		return "YouTube yêu cầu xác thực. Hãy liên kết YouTube trong trang quản trị hoặc thử nguồn khác."
	}
	var remote *lavalinkHTTPError
	if errors.As(err, &remote) {
		switch remote.Status {
		case http.StatusBadRequest:
			return "Không thể kết nối hoặc cập nhật trình phát. Hãy thử lại /play."
		case http.StatusUnauthorized, http.StatusForbidden:
			return "Dịch vụ nhạc từ chối yêu cầu. Vui lòng liên hệ quản trị viên."
		case http.StatusNotFound:
			return "Phiên phát nhạc đã hết hạn. Hãy thử lại /play."
		case http.StatusTooManyRequests:
			return "Dịch vụ nhạc đang bận. Vui lòng thử lại sau."
		}
	}
	return "Không thể xử lý yêu cầu phát nhạc lúc này. Vui lòng thử lại."
}
func playbackFailureMessage(track Track, message, cause string) string {
	if (track.Info.SourceName == "youtube" || strings.Contains(track.Info.URI, "youtube.com") || strings.Contains(track.Info.URI, "youtu.be")) && youtubeVerificationRequired(message+" "+cause) {
		return "YouTube yêu cầu xác thực. Hãy liên kết YouTube trong trang quản trị hoặc thử nguồn khác."
	}
	return "Không thể phát bài này. Vui lòng thử bài khác."
}
