// Command audit runs the audit service (audit log, activity, notifications, dashboard KPIs).
package main

import (
	"github.com/jaivial/grweb/platform/internal/audit"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(audit.Service()) }
