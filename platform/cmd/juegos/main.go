// Command juegos runs the games service (contract §6: wallets, porra, fantasy, prizes and classifications).
// The same binary serves the HTTP API (`juegos`) and consumes the events (`juegos worker` = juegos-worker).
package main

import (
	"github.com/jaivial/grweb/platform/internal/juegos"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(juegos.Service()) }
