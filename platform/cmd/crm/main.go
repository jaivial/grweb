// Command crm runs the crm service (contacts, consents, suppressions, segments, news subscription).
package main

import (
	"github.com/jaivial/grweb/platform/internal/crm"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(crm.Service()) }
