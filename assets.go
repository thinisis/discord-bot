package assets

import "embed"

//go:embed web/* migrations/*.sql
var Files embed.FS
