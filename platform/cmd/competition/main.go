// Command competition runs the competition service (tenant, event, state, modules, checklist, integrations).
package main

import (
	"github.com/jaivial/grweb/platform/internal/competition"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(competition.Service()) }
