package cms

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// English overrides («en»): every translatable CMS row keeps a partial object with the same keys as its
// visible fields. Public reads with ?lang=en overlay the non-empty values on the Spanish record.

// enField is embedded in admin inputs: absent leaves the stored overrides unchanged.
type enField struct {
	En map[string]any `json:"en,omitempty" doc:"Textos en inglés (objeto parcial con las mismas claves que los campos traducibles)"`
}

func (e *enField) enVal() map[string]any { return e.En }

type enInput interface{ enVal() map[string]any }

// enCol is embedded in admin rows (SELECT list must end with «, en»).
type enCol struct {
	En map[string]any `json:"en" db:"en"`
}

// saveEn stores the en object of an admin input, when it carries one.
func saveEn(ctx context.Context, tx pgx.Tx, table string, cid, id uuid.UUID, in any) error {
	e, ok := in.(enInput)
	if !ok || e.enVal() == nil {
		return nil
	}
	_, err := tx.Exec(ctx, `UPDATE `+table+` SET en = $3 WHERE competition_id = $1 AND id = $2`, cid, id, e.enVal())
	return err
}

// LangIn is embedded in public inputs.
type LangIn struct {
	Lang string `query:"lang" pattern:"^(es|en)?$" doc:"en: textos en inglés cuando existen"`
}

func (l LangIn) en() bool { return l.Lang == "en" }

// key suffixes a cache key with the language.
func (l LangIn) key(k string) string {
	if l.en() {
		return k + ":en"
	}
	return k
}

// tr is a SELECT list where each text column is replaced by its English override when en and non-empty.
func tr(en bool, cols ...string) string {
	if !en {
		return strings.Join(cols, ", ")
	}
	out := make([]string, len(cols))
	for i, c := range cols {
		out[i] = "COALESCE(NULLIF(en->>'" + c + "', ''), " + c + ") AS " + c
	}
	return strings.Join(out, ", ")
}

// overlay deep-merges en over base: objects by key, arrays by index, empty strings and nulls ignored.
func overlay(base, en any) any {
	switch e := en.(type) {
	case nil:
		return base
	case string:
		if strings.TrimSpace(e) == "" {
			return base
		}
		return e
	case map[string]any:
		b, ok := base.(map[string]any)
		if !ok {
			return base
		}
		for k, v := range e {
			if bv, ok := b[k]; ok {
				b[k] = overlay(bv, v)
			}
		}
		return b
	case []any:
		b, ok := base.([]any)
		if !ok {
			return base
		}
		for i := range b {
			if i < len(e) {
				b[i] = overlay(b[i], e[i])
			}
		}
		return b
	}
	return base
}

// overlayRaw applies overlay to raw JSON; on any parse problem the Spanish value is returned untouched.
func overlayRaw(base, en json.RawMessage) json.RawMessage {
	if len(en) == 0 || string(en) == "{}" || string(en) == "null" {
		return base
	}
	var b, e any
	if json.Unmarshal(base, &b) != nil || json.Unmarshal(en, &e) != nil {
		return base
	}
	out, err := json.Marshal(overlay(b, e))
	if err != nil {
		return base
	}
	return out
}
