// Command gateway runs the API edge (routing, auth, rate limits, CORS, health, OpenAPI).
package main

import (
	"github.com/jaivial/grweb/platform/internal/gateway"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(gateway.Service()) }
