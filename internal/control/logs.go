package control

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"sort"
)

func (a *App) loadLogs() {
	for _, name := range []string{"runtime/system.log.jsonl", "runtime/go-system.log.jsonl"} {
		f, e := os.Open(name)
		if e != nil {
			continue
		}
		stat, e := f.Stat()
		if e != nil {
			f.Close()
			continue
		}
		start := int64(0)
		if stat.Size() > 4<<20 {
			start = stat.Size() - (4 << 20)
		}
		scanner := bufio.NewScanner(io.NewSectionReader(f, start, stat.Size()-start))
		scanner.Buffer(make([]byte, 4096), 1<<20)
		if start > 0 {
			scanner.Scan()
		}
		for scanner.Scan() {
			var entry Entry
			if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Message != "" {
				a.logs = append(a.logs, entry)
			}
		}
		f.Close()
	}
	sort.SliceStable(a.logs, func(i, j int) bool { return a.logs[i].CreatedAt.Before(a.logs[j].CreatedAt) })
	if len(a.logs) > 2000 {
		a.logs = a.logs[len(a.logs)-2000:]
	}
}
