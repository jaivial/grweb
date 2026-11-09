package chat

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagChatAdmin = []string{"Chat · administración"}

// registrarAdmin registers the backoffice endpoints (C/chat/*, permiso «directo.operar»), like internal/live.
func (s *Svc) registrarAdmin() {
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-config", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/chat/config",
		Summary: "Configuración del chat", Tags: tagChatAdmin, Security: bearer}, s.getConfig)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-config-guardar", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/chat/config",
		Summary: "Guardar la configuración del chat (If-Match)", Tags: tagChatAdmin, Security: bearer}, s.putConfig)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-borrar-mensaje", Method: http.MethodDelete, Path: "/api/admin/competiciones/{cid}/chat/mensajes/{id}",
		Summary: "Borrar un mensaje de la sala", Tags: tagChatAdmin, Security: bearer}, s.borrarMensaje)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-silenciar", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/chat/fans/{fanId}/silenciar",
		Summary: "Silenciar a un fan N minutos", Tags: tagChatAdmin, Security: bearer}, s.silenciar)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-des-silenciar", Method: http.MethodDelete, Path: "/api/admin/competiciones/{cid}/chat/fans/{fanId}/silenciar",
		Summary: "Levantar el silencio de un fan", Tags: tagChatAdmin, Security: bearer}, s.desSilenciar)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-mensajes-admin", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/chat/mensajes",
		Summary: "Mensajes recientes de una jornada (moderación)", Tags: tagChatAdmin, Security: bearer}, s.recientes)
	huma.Register(s.a.API, huma.Operation{OperationID: "chat-reportados", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/chat/reportados",
		Summary: "Mensajes reportados de una jornada", Tags: tagChatAdmin, Security: bearer}, s.reportados)
}

func (s *Svc) requireChat(ctx context.Context, cid uuid.UUID) error {
	if _, err := requireAny(ctx, cid, "Tu rol no puede operar el chat (permiso «directo.operar»).", "directo.operar"); err != nil {
		return err
	}
	return nil
}

// requireAny checks the staff JWT and one of the permissions on the competition (the internal/live pattern).
func requireAny(ctx context.Context, cid uuid.UUID, msg string, perms ...string) (*auth.Principal, error) {
	p, err := auth.User(ctx)
	if err != nil {
		return nil, err
	}
	for _, k := range perms {
		if p.Can(cid.String(), k) {
			return p, nil
		}
	}
	return nil, problem.Forbidden(msg)
}

type configBody struct {
	Activo             bool     `json:"activo"`
	ModoLentoSeg       int      `json:"modoLentoSeg"`
	PalabrasProhibidas []string `json:"palabrasProhibidas"`
	DominiosPermitidos []string `json:"dominiosPermitidos"`
	MaxHitos           int      `json:"maxHitos"`
	Version            int      `json:"version"`
}

type configOut struct {
	Body configBody
}

func (s *Svc) getConfig(ctx context.Context, in *struct {
	CID uuid.UUID `path:"cid"`
}) (*configOut, error) {
	if err := s.requireChat(ctx, in.CID); err != nil {
		return nil, err
	}
	cfg, version, err := s.configDB(ctx, in.CID)
	if err != nil {
		return nil, err
	}
	return &configOut{Body: configBody{
		Activo: cfg.Activo, ModoLentoSeg: cfg.ModoLentoSeg,
		PalabrasProhibidas: cfg.PalabrasProhibidas, DominiosPermitidos: cfg.DominiosPermitidos,
		MaxHitos: cfg.MaxHitos, Version: version,
	}}, nil
}

type putConfigIn struct {
	CID     uuid.UUID `path:"cid"`
	IfMatch string    `header:"If-Match" required:"true"`
	Body    struct {
		Activo             bool     `json:"activo"`
		ModoLentoSeg       int      `json:"modoLentoSeg" maximum:"3600" doc:"Segundos mínimos entre mensajes de un fan (0 = sin modo lento)"`
		PalabrasProhibidas []string `json:"palabrasProhibidas" maxItems:"200"`
		DominiosPermitidos []string `json:"dominiosPermitidos" maxItems:"50"`
		MaxHitos           int      `json:"maxHitos" minimum:"1" maximum:"1000" doc:"Tope de hitos de recompensa por fan y jornada"`
	}
}

// putConfig writes the room configuration (ETag version: If-Match → 409 CONFLICTO_EDICION) and refreshes the
// Redis copy every pod reads on the hot path.
func (s *Svc) putConfig(ctx context.Context, in *putConfigIn) (*configOut, error) {
	if err := s.requireChat(ctx, in.CID); err != nil {
		return nil, err
	}
	b := in.Body
	limpias := normalizaLista(b.PalabrasProhibidas)
	dominios := normalizaLista(b.DominiosPermitidos)
	if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		var version int
		if err := tx.QueryRow(ctx, `SELECT version FROM config_chat WHERE competition_id = $1 FOR UPDATE`, in.CID).Scan(&version); err != nil {
			version = 1
			if _, err := tx.Exec(ctx, `INSERT INTO config_chat (competition_id, activo, modo_lento_seg, palabras_prohibidas, dominios_permitidos, max_hitos, updated_por)
				VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				in.CID, b.Activo, b.ModoLentoSeg, limpias, dominios, b.MaxHitos, actor(ctx)); err != nil {
				return err
			}
			return nil
		}
		if strings.Trim(in.IfMatch, `"W/`) != strconv.Itoa(version) {
			return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado la configuración del chat. Recarga para ver la última versión.")
		}
		if _, err := tx.Exec(ctx, `UPDATE config_chat SET activo = $2, modo_lento_seg = $3, palabras_prohibidas = $4, dominios_permitidos = $5, max_hitos = $6, version = version + 1, updated_por = $7, updated_at = now() WHERE competition_id = $1`,
			in.CID, b.Activo, b.ModoLentoSeg, limpias, dominios, b.MaxHitos, actor(ctx)); err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, err
	}
	cfg := Config{Activo: b.Activo, ModoLentoSeg: b.ModoLentoSeg, PalabrasProhibidas: limpias, DominiosPermitidos: dominios, MaxHitos: b.MaxHitos}
	if cfg.MaxHitos <= 0 {
		cfg.MaxHitos = 100
	}
	s.configRefrescar(ctx, in.CID, cfg)
	// the moderation log keeps who changed what (admin SSE via permiso)
	if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		return events.Enqueue(ctx, tx, events.New(ctx, "chat.config", map[string]any{
			"despues": cfg, "por": actor(ctx),
		}, events.Competition(in.CID.String()), events.ForPermission("directo.operar"), events.Subject("config chat")))
	}); err != nil {
		s.a.Log.Warn("chat.config", "err", err)
	}
	_, version, err := s.configDB(ctx, in.CID)
	if err != nil {
		return nil, err
	}
	return &configOut{Body: configBody{Activo: cfg.Activo, ModoLentoSeg: cfg.ModoLentoSeg, PalabrasProhibidas: cfg.PalabrasProhibidas, DominiosPermitidos: cfg.DominiosPermitidos, MaxHitos: cfg.MaxHitos, Version: version}}, nil
}

// configDB reads the configuration and its ETag version straight from the DB (admin views are not on the hot path).
func (s *Svc) configDB(ctx context.Context, cid uuid.UUID) (Config, int, error) {
	var row struct {
		Activo             bool
		ModoLentoSeg       int
		PalabrasProhibidas []string
		DominiosPermitidos []string
		MaxHitos           int
		Version            int
	}
	err := s.a.DB.QueryRow(ctx, `SELECT activo, modo_lento_seg, palabras_prohibidas, dominios_permitidos, max_hitos, version FROM config_chat WHERE competition_id = $1`, cid).
		Scan(&row.Activo, &row.ModoLentoSeg, &row.PalabrasProhibidas, &row.DominiosPermitidos, &row.MaxHitos, &row.Version)
	if err != nil {
		if err == pgx.ErrNoRows {
			return configPorDefecto(), 1, nil
		}
		return Config{}, 0, problem.Internal()
	}
	cfg := Config{Activo: row.Activo, ModoLentoSeg: row.ModoLentoSeg, PalabrasProhibidas: row.PalabrasProhibidas, DominiosPermitidos: row.DominiosPermitidos, MaxHitos: row.MaxHitos}
	return cfg, row.Version, nil
}

// normalizaLista trims, drops empties and de-duplicates a config list.
func normalizaLista(in []string) []string {
	vistos := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := vistos[s]; ok {
			continue
		}
		vistos[s] = struct{}{}
		out = append(out, s)
	}
	if out == nil {
		out = []string{}
	}
	return out
}

type borrarIn struct {
	CID uuid.UUID `path:"cid"`
	ID  string    `path:"id"`
}

// borrarMensaje removes a message: it disappears from the stream (XDEL), connected clients get a `borrado` frame
// and the persisted row is flagged (the moderation list keeps what it was).
func (s *Svc) borrarMensaje(ctx context.Context, in *borrarIn) (*struct{}, error) {
	if err := s.requireChat(ctx, in.CID); err != nil {
		return nil, err
	}
	if _, _, err := parseID(in.ID); err != nil {
		return nil, problem.BadRequest("ID_INVALIDO", "El id del mensaje no es válido.")
	}
	dia := hoy()
	// the row tells us the day of the message (it may be an older jornada); the id of the stream is only unique
	// inside a room, so the most recent day wins
	var msgDia string
	var borrado bool
	if err := s.a.DB.QueryRow(ctx, `SELECT dia, borrado FROM mensajes WHERE id = $1 AND competition_id = $2 ORDER BY dia DESC LIMIT 1`, in.ID, in.CID).Scan(&msgDia, &borrado); err == nil {
		dia = msgDia
	}
	n, err := s.a.Redis.XDel(ctx, s.streamDe(in.CID.String(), dia), in.ID).Result()
	if err != nil {
		return nil, problem.Internal()
	}
	if n == 0 && err == nil && msgDia == "" {
		return nil, problem.NotFound("Mensaje no encontrado.")
	}
	_, _ = s.a.DB.Exec(ctx, `UPDATE mensajes SET borrado = true WHERE id = $1 AND competition_id = $2 AND dia = $3`, in.ID, in.CID, dia)
	// el id del mensaje borrado viaja en «mensajeId»: el lector de la sala pisa «id» con el id de la entrada
	_ = s.inyectar(ctx, in.CID.String(), dia, item{T: "borrado", MensajeID: in.ID, Ts: time.Now().UnixMilli()})
	if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		return events.Enqueue(ctx, tx, events.New(ctx, "chat.mensaje_borrado", map[string]any{"id": in.ID, "dia": dia, "por": actor(ctx)},
			events.Competition(in.CID.String()), events.ForPermission("directo.operar"), events.Subject("mensaje:"+in.ID)))
	}); err != nil {
		s.a.Log.Warn("chat.mensaje_borrado", "err", err)
	}
	return &struct{}{}, nil
}

type silenciarIn struct {
	CID   uuid.UUID `path:"cid"`
	FanID uuid.UUID `path:"fanId"`
	Body  struct {
		Minutos int    `json:"minutos" minimum:"1" maximum:"10080"`
		Motivo  string `json:"motivo,omitempty" maxLength:"200"`
	}
}

type silenciarBody struct {
	Hasta time.Time `json:"hasta"`
}

type silenciarOut struct {
	Body silenciarBody
}

// silenciar mutes a fan for N minutes: the hot path checks the Redis key (TTL), the table keeps the record.
func (s *Svc) silenciar(ctx context.Context, in *silenciarIn) (*silenciarOut, error) {
	if err := s.requireChat(ctx, in.CID); err != nil {
		return nil, err
	}
	min := in.Body.Minutos
	if min <= 0 || min > 7*24*60 {
		min = 30
	}
	hasta := time.Now().Add(time.Duration(min) * time.Minute)
	if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO silencios (competition_id, fan_id, hasta, motivo, por) VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (competition_id, fan_id) DO UPDATE SET hasta = $3, motivo = $4, por = $5, created_at = now()`,
			in.CID, in.FanID, hasta, in.Body.Motivo, actor(ctx)); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "chat.fan_silenciado", map[string]any{"fanId": in.FanID.String(), "hasta": hasta, "motivo": in.Body.Motivo, "por": actor(ctx)},
			events.Competition(in.CID.String()), events.ForPermission("directo.operar"), events.Subject("fan:"+in.FanID.String())))
	}); err != nil {
		return nil, err
	}
	ttl := time.Until(hasta)
	if ttl <= 0 {
		ttl = time.Second
	}
	s.a.Redis.Set(ctx, s.a.Keys.Of("chat", "mudo", in.CID.String(), in.FanID.String()), "silenciado", ttl)
	return &silenciarOut{Body: silenciarBody{Hasta: hasta}}, nil
}

type desSilenciarIn struct {
	CID   uuid.UUID `path:"cid"`
	FanID uuid.UUID `path:"fanId"`
}

func (s *Svc) desSilenciar(ctx context.Context, in *desSilenciarIn) (*struct{}, error) {
	if err := s.requireChat(ctx, in.CID); err != nil {
		return nil, err
	}
	_, err := s.a.DB.Exec(ctx, `DELETE FROM silencios WHERE competition_id = $1 AND fan_id = $2`, in.CID, in.FanID)
	if err != nil {
		return nil, problem.Internal()
	}
	s.a.Redis.Del(ctx, s.a.Keys.Of("chat", "mudo", in.CID.String(), in.FanID.String()))
	return &struct{}{}, nil
}

type mensajesAdminIn struct {
	CID    uuid.UUID `path:"cid"`
	Dia    string    `query:"dia"`
	Antes  string    `query:"antes"`
	Limite int       `query:"limite"`
	Search string    `query:"busca"`
}

type mensajeAdmin struct {
	ID       string    `json:"id"`
	FanID    string    `json:"fanId"`
	Alias    string    `json:"alias"`
	Texto    string    `json:"texto"`
	Borrado  bool      `json:"borrado"`
	Reportes int       `json:"reportes"`
	Fecha    time.Time `json:"fecha"`
}

type mensajesAdminOut struct {
	Body struct {
		Dia      string         `json:"dia"`
		Mensajes []mensajeAdmin `json:"mensajes"`
	}
}

// recientes lists the persisted messages of a day (moderation view; includes the deleted ones flagged).
func (s *Svc) recientes(ctx context.Context, in *mensajesAdminIn) (*mensajesAdminOut, error) {
	if err := s.requireChat(ctx, in.CID); err != nil {
		return nil, err
	}
	dia := hoy()
	if in.Dia != "" {
		if !diaValido(in.Dia) {
			return nil, problem.BadRequest("DIA_INVALIDO", "El parámetro dia tiene que ser una fecha YYYY-MM-DD.")
		}
		dia = in.Dia
	}
	limite := in.Limite
	if limite <= 0 || limite > 200 {
		limite = 100
	}
	q := `SELECT id, fan_id, alias, texto, borrado, reportes, created_at FROM mensajes WHERE competition_id = $1 AND dia = $2`
	args := []any{in.CID, dia}
	if in.Search != "" {
		q += ` AND texto ILIKE '%' || $3 || '%'`
		args = append(args, in.Search)
	}
	q += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(len(args)+1)
	args = append(args, limite)
	rows, err := s.a.DB.Query(ctx, q, args...)
	if err != nil {
		return nil, problem.Internal()
	}
	defer rows.Close()
	out := []mensajeAdmin{}
	for rows.Next() {
		var m mensajeAdmin
		if err := rows.Scan(&m.ID, &m.FanID, &m.Alias, &m.Texto, &m.Borrado, &m.Reportes, &m.Fecha); err != nil {
			continue
		}
		out = append(out, m)
	}
	var o mensajesAdminOut
	o.Body.Dia, o.Body.Mensajes = dia, out
	return &o, nil
}

// reportados lists the reported messages first (most reports on top).
func (s *Svc) reportados(ctx context.Context, in *mensajesAdminIn) (*mensajesAdminOut, error) {
	if err := s.requireChat(ctx, in.CID); err != nil {
		return nil, err
	}
	dia := hoy()
	if in.Dia != "" {
		if !diaValido(in.Dia) {
			return nil, problem.BadRequest("DIA_INVALIDO", "El parámetro dia tiene que ser una fecha YYYY-MM-DD.")
		}
		dia = in.Dia
	}
	limite := in.Limite
	if limite <= 0 || limite > 200 {
		limite = 100
	}
	rows, err := s.a.DB.Query(ctx, `SELECT id, fan_id, alias, texto, borrado, reportes, created_at FROM mensajes
		WHERE competition_id = $1 AND dia = $2 AND reportes > 0 ORDER BY reportes DESC, created_at DESC LIMIT $3`, in.CID, dia, limite)
	if err != nil {
		return nil, problem.Internal()
	}
	defer rows.Close()
	out := []mensajeAdmin{}
	for rows.Next() {
		var m mensajeAdmin
		if err := rows.Scan(&m.ID, &m.FanID, &m.Alias, &m.Texto, &m.Borrado, &m.Reportes, &m.Fecha); err != nil {
			continue
		}
		out = append(out, m)
	}
	var o mensajesAdminOut
	o.Body.Dia, o.Body.Mensajes = dia, out
	return &o, nil
}

// actor names the staff member behind the request (like internal/live).
func actor(ctx context.Context) string {
	if p, ok := auth.FromContext(ctx); ok {
		if p.Name != "" {
			return p.Name
		}
		return p.Email
	}
	return "Sistema"
}
