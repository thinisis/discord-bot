package main

import (
	assets "github.com/thinisis/discord-bot"
	"github.com/thinisis/discord-bot/internal/control"
	"log"
)

func main() {
	if err := control.Run(assets.Files); err != nil {
		log.Fatal(err)
	}
}
