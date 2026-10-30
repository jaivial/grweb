// Command ai runs the ai service (assistant of the campaign editor, MiniMax).
package main

import (
	"github.com/jaivial/grweb/platform/internal/ai"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(ai.Service()) }
