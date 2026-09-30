package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrUsernameTaken = errors.New("用户名已被占用")
	ErrNoSession     = errors.New("未登录")
)

type User struct {
	ID             int64
	Username       string
	PasswordHash   string
	Birthday       string // "YYYY-MM-DD"，空串表示未设置
	RetirementAge  int
	LifeExpectancy int
}

type Store struct{ db *sql.DB }

func OpenStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// 单连接串行化写入，规避 SQLite 锁竞争
	db.SetMaxOpenConns(1)
	for _, pragma := range []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA busy_timeout = 5000`,
		`PRAGMA foreign_keys = ON`,
	} {
		if _, err := db.Exec(pragma); err != nil {
			return nil, err
		}
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS users (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	username        TEXT    NOT NULL UNIQUE,
	password_hash   TEXT    NOT NULL,
	birthday        TEXT    NOT NULL DEFAULT '',
	retirement_age  INTEGER NOT NULL DEFAULT 60,
	life_expectancy INTEGER NOT NULL DEFAULT 100,
	created_at      INTEGER NOT NULL
)`); err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS sessions (
	token      TEXT    PRIMARY KEY,
	user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
)`); err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

func scanUser(row interface{ Scan(dest ...any) error }) (*User, error) {
	u := &User{}
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Birthday, &u.RetirementAge, &u.LifeExpectancy); err != nil {
		return nil, err
	}
	return u, nil
}

const userCols = `id, username, password_hash, birthday, retirement_age, life_expectancy`

func (s *Store) CreateUser(username, passwordHash string) (*User, error) {
	res, err := s.db.Exec(`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, passwordHash, time.Now().Unix())
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrUsernameTaken
		}
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &User{ID: id, Username: username, RetirementAge: defaultRetirementAge, LifeExpectancy: defaultLifeExpectancy}, nil
}

// GetUserByUsername / GetUserByID：未命中返回 (nil, nil)
func (s *Store) GetUserByUsername(username string) (*User, error) {
	row := s.db.QueryRow(`SELECT `+userCols+` FROM users WHERE username = ?`, username)
	u, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return u, err
}

func (s *Store) GetUserByID(id int64) (*User, error) {
	row := s.db.QueryRow(`SELECT `+userCols+` FROM users WHERE id = ?`, id)
	u, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return u, err
}

func (s *Store) UpdateProfile(id int64, birthday string, retirementAge, lifeExpectancy int) error {
	_, err := s.db.Exec(`UPDATE users SET birthday = ?, retirement_age = ?, life_expectancy = ? WHERE id = ?`,
		birthday, retirementAge, lifeExpectancy, id)
	return err
}

func (s *Store) CreateSession(userID int64, ttl time.Duration) (token string, expires time.Time, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", time.Time{}, err
	}
	token = hex.EncodeToString(buf)
	expires = time.Now().Add(ttl)
	_, err = s.db.Exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
		token, userID, expires.Unix())
	return token, expires, err
}

func (s *Store) UserByToken(token string) (*User, error) {
	if token == "" {
		return nil, ErrNoSession
	}
	row := s.db.QueryRow(`
SELECT u.id, u.username, u.password_hash, u.birthday, u.retirement_age, u.life_expectancy
FROM sessions se JOIN users u ON u.id = se.user_id
WHERE se.token = ? AND se.expires_at > ?`, token, time.Now().Unix())
	u, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoSession
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Store) DeleteSession(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (s *Store) DeleteExpiredSessions() error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE expires_at <= ?`, time.Now().Unix())
	return err
}
