// Command messaging runs the messaging service (transactional email: templates, outbox, SMTP, automations).
package main

import (
	"github.com/jaivial/grweb/platform/internal/messaging"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(messaging.Service()) }
