// Package ipfgl computes the IPF GL points of a powerlifting result with the IPF GL 2020 coefficients: points =
// result × 100 / (A − B × e^(−C × bodyweight)), the coefficient rounded to 6 decimals as the IPF does.
package ipfgl

import "math"

type coeficientes struct {
	a, b, c float64
}

type clave struct {
	sexo     string
	equipado bool
	banca    bool
}

// coeficientes per sex, equipment and lift (banca = bench press only; otherwise the full powerlifting total).
var tabla = map[clave]coeficientes{
	{"M", true, false}:  {1236.25115, 1449.21864, 0.01644},
	{"M", false, false}: {1199.72839, 1025.18162, 0.00921},
	{"M", true, true}:   {381.22073, 733.79378, 0.02398},
	{"M", false, true}:  {320.98041, 281.40258, 0.01008},
	{"F", true, false}:  {758.63878, 949.31382, 0.02435},
	{"F", false, false}: {610.32796, 1045.59282, 0.03048},
	{"F", true, true}:   {221.82209, 357.00377, 0.02937},
	{"F", false, true}:  {142.40398, 442.52671, 0.04724},
}

// pesoMinimo is the bodyweight (kg) under which the IPF GL does not apply.
var pesoMinimo = map[string]float64{"M": 40, "F": 35}

// Puntos returns the IPF GL points rounded to 2 decimals. ok is false when the result cannot be scored: unknown
// sex, bodyweight under the IPF minimum or a non-positive denominator.
func Puntos(resultadoKg, pesoCorporalKg float64, sexo string, equipado bool, soloBanca bool) (float64, bool) {
	c, ok := tabla[clave{sexo, equipado, soloBanca}]
	if !ok || pesoCorporalKg < pesoMinimo[sexo] {
		return 0, false
	}
	d := c.a - c.b*math.Exp(-c.c*pesoCorporalKg)
	if d <= 0 {
		return 0, false
	}
	coef := math.Round(100/d*1e6) / 1e6
	return math.Round(resultadoKg*coef*100) / 100, true
}
