// Command realtime runs the Server-Sent Events service (public and admin streams).
package main

import (
	"github.com/jaivial/grweb/platform/internal/realtime"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(realtime.Service()) }
