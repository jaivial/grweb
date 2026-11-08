// Command fans runs the community accounts of «directo social» (magic link, grcup_fan session, bans).
package main

import (
	"github.com/jaivial/grweb/platform/internal/fans"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(fans.Service()) }
