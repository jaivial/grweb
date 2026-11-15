// Package kpiwin computes the counters of the backoffice home (Figma 52 · Inicio) for a period, the previous
// period (comparison in %) and a 7-point sparkline, so every source service answers audit the same way.
package kpiwin

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// In is the query of GET /internal/competiciones/{cid}/kpis.
type In struct {
	CID     uuid.UUID `path:"cid"`
	Periodo string    `query:"periodo" enum:"hoy,7d,todo" default:"todo"`
}

// Out is its response: values of the period, of the previous one and the sparkline of each key.
type Out struct {
	Body struct {
		Valores map[string]int64   `json:"valores"`
		Previo  map[string]int64   `json:"previo"`
		Serie   map[string][]int64 `json:"serie"`
	}
}

// Count returns the counters of the rows created in [desde, hasta).
type Count func(ctx context.Context, desde, hasta time.Time) (map[string]int64, error)

var madrid = func() *time.Location {
	if l, err := time.LoadLocation("Europe/Madrid"); err == nil {
		return l
	}
	return time.UTC
}()

// Compute: hoy = since midnight vs yesterday until the same hour; 7d = last 7 days vs the 7 before;
// todo = everything vs everything one week ago («vs. semana pasada»). Sparkline: 7 slices of the period
// (cumulative daily totals for todo).
func Compute(ctx context.Context, periodo string, f Count) (*Out, error) {
	now := time.Now()
	var cur, prev [2]time.Time
	var tramos [7][2]time.Time
	switch periodo {
	case "hoy", "7d":
		if periodo == "hoy" {
			y, m, d := now.In(madrid).Date()
			cur = [2]time.Time{time.Date(y, m, d, 0, 0, 0, 0, madrid), now}
			prev = [2]time.Time{cur[0].AddDate(0, 0, -1), cur[0].AddDate(0, 0, -1).Add(now.Sub(cur[0]))}
		} else {
			cur = [2]time.Time{now.AddDate(0, 0, -7), now}
			prev = [2]time.Time{now.AddDate(0, 0, -14), cur[0]}
		}
		step := cur[1].Sub(cur[0]) / 7
		for i := range tramos {
			tramos[i] = [2]time.Time{cur[0].Add(time.Duration(i) * step), cur[0].Add(time.Duration(i+1) * step)}
		}
		tramos[6][1] = now
	default:
		cur = [2]time.Time{time.Unix(0, 0), now}
		prev = [2]time.Time{cur[0], now.AddDate(0, 0, -7)}
		for i := range tramos {
			tramos[i] = [2]time.Time{cur[0], now.AddDate(0, 0, i-6)}
		}
	}
	o := &Out{}
	var err error
	if o.Body.Valores, err = f(ctx, cur[0], cur[1]); err != nil {
		return nil, err
	}
	if o.Body.Previo, err = f(ctx, prev[0], prev[1]); err != nil {
		return nil, err
	}
	o.Body.Serie = map[string][]int64{}
	for _, t := range tramos {
		m, err := f(ctx, t[0], t[1])
		if err != nil {
			return nil, err
		}
		for k, v := range m {
			o.Body.Serie[k] = append(o.Body.Serie[k], v)
		}
	}
	return o, nil
}
