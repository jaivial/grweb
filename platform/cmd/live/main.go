// Command live runs the live service (competition desk, arena screen and results).
package main

import (
	"github.com/jaivial/grweb/platform/internal/live"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(live.Service()) }
