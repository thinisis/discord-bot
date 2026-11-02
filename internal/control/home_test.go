package control

import (
	assets "github.com/thinisis/discord-bot"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHomePublicAndAdminRoutesProtected(t *testing.T) {
	app := &App{cfg: Config{Secret: "test-secret-at-least-sixteen-characters"}, assets: assets.Files}
	handler := app.routes()
	for _, test := range []struct {
		path     string
		status   int
		location string
	}{{"/", http.StatusOK, ""}, {"/login", http.StatusOK, ""}, {"/dashboard", http.StatusSeeOther, "/login"}, {"/settings", http.StatusSeeOther, "/login"}, {"/api/status", http.StatusUnauthorized, ""}} {
		req := httptest.NewRequest(http.MethodGet, test.path, nil)
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != test.status || test.location != "" && res.Header().Get("Location") != test.location {
			t.Errorf("%s: status %d, location %q", test.path, res.Code, res.Header().Get("Location"))
		}
	}
}
