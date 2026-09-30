package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	sessionCookieName     = "life_session"
	sessionTTL            = 30 * 24 * time.Hour
	defaultRetirementAge  = 60
	defaultLifeExpectancy = 100
)

type apiServer struct{ store *Store }

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type meResponse struct {
	ID             int64  `json:"id"`
	Username       string `json:"username"`
	Birthday       string `json:"birthday"`
	RetirementAge  int    `json:"retirement_age"`
	LifeExpectancy int    `json:"life_expectancy"`
}

func meFrom(u *User) meResponse {
	return meResponse{ID: u.ID, Username: u.Username, Birthday: u.Birthday, RetirementAge: u.RetirementAge, LifeExpectancy: u.LifeExpectancy}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func readJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		fail(w, http.StatusBadRequest, "请求格式有误")
		return false
	}
	return true
}

func (s *apiServer) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/api/register", s.handleRegister)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/logout", s.handleLogout)
	mux.HandleFunc("/api/me", s.withUser(s.handleMe))
	mux.HandleFunc("/api/profile", s.withUser(s.handleProfile))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		fail(w, http.StatusNotFound, "接口不存在")
	})
}

func (s *apiServer) startSession(w http.ResponseWriter, userID int64) {
	token, expires, err := s.store.CreateSession(userID, sessionTTL)
	if err != nil {
		fail(w, http.StatusInternalServerError, "服务器错误")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *apiServer) withUser(next func(http.ResponseWriter, *http.Request, *User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || cookie.Value == "" {
			fail(w, http.StatusUnauthorized, "请先登录")
			return
		}
		user, err := s.store.UserByToken(cookie.Value)
		if err != nil {
			if errors.Is(err, ErrNoSession) {
				fail(w, http.StatusUnauthorized, "登录已过期，请重新登录")
				return
			}
			fail(w, http.StatusInternalServerError, "服务器错误")
			return
		}
		next(w, r, user)
	}
}

func (s *apiServer) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}
	var creds credentials
	if !readJSON(w, r, &creds) {
		return
	}
	username := strings.TrimSpace(creds.Username)
	switch {
	case username == "" || utf8.RuneCountInString(username) > 32:
		fail(w, http.StatusBadRequest, "用户名需为 1-32 个字符")
		return
	case strings.ContainsAny(username, " \t\r\n"):
		fail(w, http.StatusBadRequest, "用户名不能包含空白字符")
		return
	case utf8.RuneCountInString(creds.Password) < 6 || len(creds.Password) > 72:
		fail(w, http.StatusBadRequest, "密码长度需为 6-72 位")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(creds.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(w, http.StatusInternalServerError, "服务器错误")
		return
	}
	user, err := s.store.CreateUser(username, string(hash))
	if err != nil {
		if errors.Is(err, ErrUsernameTaken) {
			fail(w, http.StatusConflict, "用户名已被占用")
			return
		}
		fail(w, http.StatusInternalServerError, "服务器错误")
		return
	}
	_ = s.store.DeleteExpiredSessions()
	s.startSession(w, user.ID)
	writeJSON(w, http.StatusOK, meFrom(user))
}

func (s *apiServer) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}
	var creds credentials
	if !readJSON(w, r, &creds) {
		return
	}
	user, err := s.store.GetUserByUsername(strings.TrimSpace(creds.Username))
	if err != nil {
		fail(w, http.StatusInternalServerError, "服务器错误")
		return
	}
	if user == nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(creds.Password)) != nil {
		fail(w, http.StatusUnauthorized, "用户名或密码错误")
		return
	}
	s.startSession(w, user.ID)
	writeJSON(w, http.StatusOK, meFrom(user))
}

func (s *apiServer) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, http.StatusMethodNotAllowed, "仅支持 POST")
		return
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_ = s.store.DeleteSession(cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *apiServer) handleMe(w http.ResponseWriter, _ *http.Request, user *User) {
	writeJSON(w, http.StatusOK, meFrom(user))
}

type profileInput struct {
	Birthday       *string `json:"birthday"`
	RetirementAge  *int    `json:"retirement_age"`
	LifeExpectancy *int    `json:"life_expectancy"`
}

func (s *apiServer) handleProfile(w http.ResponseWriter, r *http.Request, user *User) {
	if r.Method != http.MethodPut {
		fail(w, http.StatusMethodNotAllowed, "仅支持 PUT")
		return
	}
	var in profileInput
	if !readJSON(w, r, &in) {
		return
	}
	birthday := user.Birthday
	if in.Birthday != nil {
		b := strings.TrimSpace(*in.Birthday)
		if b != "" {
			t, err := time.ParseInLocation("2006-01-02", b, time.Local)
			if err != nil || t.Format("2006-01-02") != b {
				fail(w, http.StatusBadRequest, "生日格式应为 YYYY-MM-DD")
				return
			}
			if t.After(time.Now()) {
				fail(w, http.StatusBadRequest, "生日不能晚于今天")
				return
			}
		}
		birthday = b
	}
	retire := user.RetirementAge
	if in.RetirementAge != nil {
		retire = *in.RetirementAge
	}
	life := user.LifeExpectancy
	if in.LifeExpectancy != nil {
		life = *in.LifeExpectancy
	}
	switch {
	case retire < 1 || retire > 120:
		fail(w, http.StatusBadRequest, "退休年龄需在 1-120 岁之间")
		return
	case life < 1 || life > 150:
		fail(w, http.StatusBadRequest, "预期寿命需在 1-150 岁之间")
		return
	case retire > life:
		fail(w, http.StatusBadRequest, "退休年龄不能大于预期寿命")
		return
	}
	if err := s.store.UpdateProfile(user.ID, birthday, retire, life); err != nil {
		fail(w, http.StatusInternalServerError, "服务器错误")
		return
	}
	user.Birthday, user.RetirementAge, user.LifeExpectancy = birthday, retire, life
	writeJSON(w, http.StatusOK, meFrom(user))
}
