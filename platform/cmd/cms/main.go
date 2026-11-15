// Command cms runs the web content service (home sections, FAQ, sponsors, SEO, legal, pages, gallery, media).
package main

import (
	"github.com/jaivial/grweb/platform/internal/cms"
	"github.com/jaivial/grweb/platform/pkg/app"
)

func main() { app.Run(cms.Service()) }
