// Command chat runs the live community chat service (rooms per competition and day, WebSocket + SSE + REST,
// moderation and load milestones). See platform/docs/DIRECTO-SOCIAL.md §4.
package main

import (
	"github.com/jaivial/grweb/platform/internal/chat"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(chat.Service()) }
