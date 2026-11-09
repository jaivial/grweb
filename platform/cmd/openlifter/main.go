// Command openlifter runs the openlifter service (the OpenLifter desk fork ↔ athletes and live).
package main

import (
	"github.com/jaivial/grweb/platform/internal/openlifter"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(openlifter.Service()) }
