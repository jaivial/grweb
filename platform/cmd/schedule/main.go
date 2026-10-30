// Command schedule runs the schedule service (flights planner, versioned publication, public schedule and .ics).
package main

import (
	"github.com/jaivial/grweb/platform/internal/schedule"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(schedule.Service()) }
