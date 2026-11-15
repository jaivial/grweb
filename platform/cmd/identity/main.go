// Command identity runs the identity service (users, sessions, roles, permissions, team).
package main

import (
	"github.com/jaivial/grweb/platform/internal/identity"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(identity.Service()) }
