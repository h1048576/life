package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// spaHandler 托管前端构建产物；未命中的路径回退到 index.html（SPA）。
func spaHandler(dir string) http.HandlerFunc {
	fs := http.FileServer(http.Dir(dir))
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		clean := filepath.Clean(r.URL.Path)
		if strings.HasPrefix(clean, "..") {
			http.NotFound(w, r)
			return
		}
		full := filepath.Join(dir, clean)
		if info, err := os.Stat(full); err == nil && !info.IsDir() {
			fs.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	}
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "HTTP 监听地址")
	dbPath := flag.String("db", "data/life.db", "SQLite 数据库文件路径（相对启动目录）")
	distDir := flag.String("dist", "../frontend/dist", "前端构建产物目录（相对启动目录）")
	flag.Parse()

	if err := os.MkdirAll(filepath.Dir(*dbPath), 0o755); err != nil {
		log.Fatalf("无法创建数据目录: %v", err)
	}
	store, err := OpenStore(*dbPath)
	if err != nil {
		log.Fatalf("无法打开数据库: %v", err)
	}

	api := &apiServer{store: store}
	mux := http.NewServeMux()
	api.registerRoutes(mux)
	mux.Handle("/", spaHandler(*distDir))

	log.Printf("生命刻度已启动: http://%s （数据库: %s）", *addr, *dbPath)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}
