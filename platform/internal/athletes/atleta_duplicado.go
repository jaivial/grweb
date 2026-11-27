package athletes

// BIZ-211 · Una persona, una ficha.
//
// A request can arrive with a typo in the email («gmail.con») and the approval would create a second record of
// somebody who already has one. These rules link it to the record that is the same person without ever trusting the
// name alone (two athletes can share a name): the same phone with a compatible name, or the same normalised name and
// the same birth date. They are the same rules before the approval (the «Ficha existente» of the request) and when
// approving it.

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// personaAtleta is what the duplicate rules compare of a request or of a record.
type personaAtleta struct {
	Nombre     string
	Apellidos  string
	Telefono   string
	Nacimiento *time.Time
}

// rowsQuerier is the pool or a transaction: the rules only read athletes.
type rowsQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// telDigitos is a phone as digits only («+34 684 00 70 55» → «34684007055»).
func telDigitos(t string) string {
	out := make([]byte, 0, len(t))
	for i := 0; i < len(t); i++ {
		if t[i] >= '0' && t[i] <= '9' {
			out = append(out, t[i])
		}
	}
	return string(out)
}

// atletaPorTelefono is the record of the competition with the same phone and a compatible name. A shared phone (a
// family) or a homonym does not match: both have to agree.
func (s *Svc) atletaPorTelefono(ctx context.Context, q rowsQuerier, cid uuid.UUID, p personaAtleta) (uuid.UUID, bool, error) {
	tel := telDigitos(p.Telefono)
	if len(tel) < 9 {
		return uuid.Nil, false, nil
	}
	// The last nine digits are the national number: a number stored with the +34 prefix and one without it are the
	// same phone.
	rows, err := q.Query(ctx, `SELECT id, nombre, apellidos FROM atletas
		WHERE competition_id = $1 AND estado <> 'baja' AND length(regexp_replace(telefono, '[^0-9]', '', 'g')) >= 9
			AND right(regexp_replace(telefono, '[^0-9]', '', 'g'), 9) = $2
		ORDER BY estado = 'confirmado' DESC, created_at`, cid, tel[len(tel)-9:])
	if err != nil {
		return uuid.Nil, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var nombre, apellidos string
		if err := rows.Scan(&id, &nombre, &apellidos); err != nil {
			return uuid.Nil, false, err
		}
		// The name as the matcher compares it (tokens, accents, crossed surnames).
		if puntuar(p.Nombre, p.Apellidos, nombre, apellidos) >= empFuerte {
			return id, true, nil
		}
	}
	return uuid.Nil, false, rows.Err()
}

// atletaPorNombreYNacimiento is the record of the competition with the same normalised name and the same birth date
// (two records of the same person are the same date; a homonym is another day).
func (s *Svc) atletaPorNombreYNacimiento(ctx context.Context, q rowsQuerier, cid uuid.UUID, p personaAtleta) (uuid.UUID, bool, error) {
	if p.Nacimiento == nil || normNombre(p.Nombre) == "" || normNombre(p.Apellidos) == "" {
		return uuid.Nil, false, nil
	}
	rows, err := q.Query(ctx, `SELECT id, nombre, apellidos FROM atletas
		WHERE competition_id = $1 AND estado <> 'baja' AND fecha_nacimiento = $2`, cid, *p.Nacimiento)
	if err != nil {
		return uuid.Nil, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var nombre, apellidos string
		if err := rows.Scan(&id, &nombre, &apellidos); err != nil {
			return uuid.Nil, false, err
		}
		if normNombre(nombre) == normNombre(p.Nombre) && normNombre(apellidos) == normNombre(p.Apellidos) {
			return id, true, nil
		}
	}
	return uuid.Nil, false, rows.Err()
}

// tipoMatchTelefono and tipoMatchNacimiento are the value of solicitudes_atleta.match_tipo of the two rules (the
// panel names them «Por teléfono» and «Por nombre y fecha de nacimiento»).
const (
	tipoMatchTelefono   = "telefono"
	tipoMatchNacimiento = "nacimiento"
)

// reglaMatch names the rule of a match in the record and the panel: «por teléfono», «por nombre y fecha de
// nacimiento». It is empty for the rules that already name themselves (licence, email, manual).
func reglaMatch(tipo string) string {
	switch tipo {
	case tipoMatchTelefono:
		return "por teléfono"
	case tipoMatchNacimiento:
		return "por nombre y fecha de nacimiento"
	}
	return ""
}

// atletaDuplicado is the record the request is about, by a rule stronger than the name alone: the phone with the same
// name first, the name and the birth date after. It answers the athlete and the rule that matched it.
func (s *Svc) atletaDuplicado(ctx context.Context, q rowsQuerier, cid uuid.UUID, p personaAtleta) (*uuid.UUID, string, error) {
	if id, ok, err := s.atletaPorTelefono(ctx, q, cid, p); err != nil {
		return nil, "", err
	} else if ok {
		return &id, tipoMatchTelefono, nil
	}
	if id, ok, err := s.atletaPorNombreYNacimiento(ctx, q, cid, p); err != nil {
		return nil, "", err
	} else if ok {
		return &id, tipoMatchNacimiento, nil
	}
	return nil, "", nil
}
