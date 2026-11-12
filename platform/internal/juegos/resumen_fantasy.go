package juegos

// filaFantasyPublic is one row of the home fantasy top 3 (BIZ-143: by the grade of the lineup, no fan id).
type filaFantasyPublic struct {
	Puesto int     `json:"puesto"`
	Alias  string  `json:"alias"`
	Nota   float64 `json:"nota" doc:"Media de la alineación (0,00–10,00)"`
	Valor  int64   `json:"valor" doc:"Valor de la alineación (suma de cláusulas)"`
	Saldo  int64   `json:"saldo"`
}
