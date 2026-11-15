// Command donaciones runs the donations of the live chat (Stripe or the simulated gateway, webhook, ranking and
// refunds).
package main

import (
	"github.com/jaivial/grweb/platform/internal/donaciones"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(donaciones.Service()) }
