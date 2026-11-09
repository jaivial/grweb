package juegos

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

// The fantasy market carries the public photo the live scoreboard sends (public profile with image consent) and
// nothing for the rest: the pitch falls back to the initials.
func TestMercadoFantasyFotoPublica(t *testing.T) {
	pdb := testDB(t)
	s := svcCompleta(pdb)
	cid, j := nuevaJornada(t, pdb, "en_juego")
	conFoto := atletaFantasiaDePrueba(t, pdb, cid, j.ID, nil, false, 0)
	sinFoto := atletaFantasiaDePrueba(t, pdb, cid, j.ID, nil, false, 0)

	// The scoreboard cache (1 s per pod) stands in for live.
	s.marc = map[string]marcEntrada{cid.String() + ":" + j.Dia: {exp: time.Now().Add(time.Minute), m: &Marcador{Atletas: []MarcadorAtleta{
		{AtletaID: conFoto, NombrePublico: "Atleta de prueba", FotoURL: "https://cdn.example.com/a.jpg", Sexo: "M", Categoria: "-93"},
		{AtletaID: sinFoto, NombrePublico: "Atleta de prueba", Sexo: "M", Categoria: "-93"},
	}}}}

	ats, err := s.mercadoFantasy(context.Background(), cid, j, uuid.Nil)
	if err != nil {
		t.Fatalf("mercado: %v", err)
	}
	fotos := map[uuid.UUID]string{}
	for _, a := range ats {
		fotos[a.AtletaID] = a.FotoURL
	}
	if got := fotos[conFoto]; got != "https://cdn.example.com/a.jpg" {
		t.Fatalf("foto del atleta con perfil público = %q", got)
	}
	if got, ok := fotos[sinFoto]; !ok || got != "" {
		t.Fatalf("el atleta sin foto pública trae %q (en la lista: %v)", got, ok)
	}
}
