// Command ticketing runs the ticketing service (free tickets, capacity, waiting list, door check-in).
package main

import (
	"github.com/jaivial/grweb/platform/internal/ticketing"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(ticketing.Service()) }
