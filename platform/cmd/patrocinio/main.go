// Command patrocinio runs the sponsor banners of the live chat (tiers, worker with the banner picker, clicks,
// config and daily report).
package main

import (
	"github.com/jaivial/grweb/platform/internal/patrocinio"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(patrocinio.Service()) }
