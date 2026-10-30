// Command raffle runs the raffle service (charity raffle: tickets, payments, verifiable draw).
package main

import (
	"github.com/jaivial/grweb/platform/internal/raffle"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(raffle.Service()) }
