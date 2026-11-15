// Command athletes runs the athletes service (AEP list import, records, public profiles, weigh-in, athlete area).
package main

import (
	"github.com/jaivial/grweb/platform/internal/athletes"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(athletes.Service()) }
