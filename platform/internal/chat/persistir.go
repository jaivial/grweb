package chat

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/events"
)

// persistencia (§4): one consumer group per pod family («chat-persistir») saves the room messages in batches into
// `mensajes`, one second or 200 messages at a time. The stream is the source of truth of the hot day; the table
// serves the history of older jornadas and the moderation views.
const (
	persistirGrupo     = "chat-persistir"
	persistirLoteMax   = 200
	persistirCada      = time.Second
	persistirCount     = 200
	persistirIdleClaim = 60 * time.Second // Redis 6.0: XPENDING + XCLAIM (no XAUTOCLAIM)
)

// persistir runs the room-stream persistence loop until ctx is cancelled.
func (s *Svc) persistir(ctx context.Context) {
	// the streams list grows with every room this pod has seen; the group keeps its own position per stream, so a
	// re-listed stream resumes exactly where it stopped
	lote := make([]persistRow, 0, persistirLoteMax)
	goteo := time.NewTicker(persistirCada)
	defer goteo.Stop()
	for ctx.Err() == nil {
		nombres := s.streamsActivos(ctx)
		if len(nombres) > 0 {
			// XREADGROUP wants one id per stream: «STREAMS k1 k2 > >». With a single ">" and two streams Redis
			// answers «Unbalanced XREAD list of streams» and nothing is persisted.
			streams := append([]string{}, nombres...)
			for range nombres {
				streams = append(streams, ">")
			}
			res, err := s.a.Redis.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    persistirGrupo,
				Consumer: s.pod,
				Streams:  streams,
				Count:    persistirCount,
				Block:    time.Second,
			}).Result()
			if err != nil && !errors.Is(err, redis.Nil) && ctx.Err() == nil {
				if strings.Contains(err.Error(), "NOGROUP") {
					for _, n := range nombres {
						_ = s.a.Redis.XGroupCreateMkStream(ctx, n, persistirGrupo, "0").Err()
					}
				} else if !errors.Is(err, context.DeadlineExceeded) {
					s.a.Log.Warn("chat persistir", "err", err)
					time.Sleep(2 * time.Second)
				}
			}
			for _, st := range res {
				ids := make([]string, 0, len(st.Messages))
				for _, m := range st.Messages {
					ids = append(ids, m.ID)
					var it item
					raw, _ := m.Values["d"].(string)
					if json.Unmarshal([]byte(raw), &it) == nil && (it.T == "msg" || it.T == "sistema") {
						lote = append(lote, persistRow{
							id: m.ID, cid: st.Stream, it: it, ts: tsDeID(m.ID),
						})
					}
				}
				if len(ids) > 0 {
					_ = s.a.Redis.XAck(ctx, st.Stream, persistirGrupo, ids...).Err()
				}
			}
		}
		if len(lote) >= persistirLoteMax {
			s.descargar(ctx, &lote)
		}
		select {
		case <-ctx.Done():
			s.descargar(context.Background(), &lote)
			return
		case <-goteo.C:
			s.descargar(ctx, &lote)
			s.reclamarPendientes(ctx)
		}
	}
}

type persistRow struct {
	id, cid string // stream entry id and stream key (chat:sala:<cid>:<dia>)
	it      item
	ts      int64
}

// descargar writes the batch to PostgreSQL: one multi-row INSERT, idempotent by stream entry id.
func (s *Svc) descargar(ctx context.Context, lote *[]persistRow) {
	if len(*lote) == 0 || s.a.DB == nil {
		*lote = (*lote)[:0]
		return
	}
	batch := &pgx.Batch{}
	for _, r := range *lote {
		cid, dia := cidDiaDeStream(r.cid, string(s.a.Keys))
		if cid == "" || dia == "" {
			continue // unknown stream name: skipped (never expected)
		}
		batch.Queue(`INSERT INTO mensajes (id, competition_id, dia, fan_id, alias, tipo, texto, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8/1000.0))
			ON CONFLICT (competition_id, dia, id) DO NOTHING`, r.id, cid, dia, r.it.FanID, r.it.Alias, r.it.T, r.it.Texto, r.ts)
	}
	persistPend.Store(int64(len(*lote)))
	br := s.a.DB.SendBatch(ctx, batch)
	defer br.Close()
	for range *lote {
		if _, err := br.Exec(); err != nil {
			s.a.Log.Warn("chat persistir lote", "err", err)
			break
		}
	}
	persistLotes.Add(1)
	persistPend.Store(0)
	*lote = (*lote)[:0]
}

// reclamarPendientes takes over entries left pending by a crashed pod (idle > 60 s), like events.Consumer.
func (s *Svc) reclamarPendientes(ctx context.Context) {
	for _, nombre := range s.streamsActivos(ctx) {
		pend, err := s.a.Redis.XPendingExt(ctx, &redis.XPendingExtArgs{Stream: nombre, Group: persistirGrupo, Start: "-", End: "+", Count: 100, Idle: persistirIdleClaim}).Result()
		if err != nil || len(pend) == 0 {
			continue
		}
		ids := make([]string, 0, len(pend))
		for _, p := range pend {
			if p.RetryCount > 20 {
				s.a.Log.Error("chat persistir: entrada descartada tras 20 intentos", "stream", nombre, "id", p.ID)
				_ = s.a.Redis.XAck(ctx, nombre, persistirGrupo, p.ID).Err()
				continue
			}
			ids = append(ids, p.ID)
		}
		if len(ids) == 0 {
			continue
		}
		msgs, err := s.a.Redis.XClaim(ctx, &redis.XClaimArgs{Stream: nombre, Group: persistirGrupo, Consumer: s.pod, MinIdle: persistirIdleClaim, Messages: ids}).Result()
		if err != nil {
			continue
		}
		for _, m := range msgs {
			var it item
			raw, _ := m.Values["d"].(string)
			if json.Unmarshal([]byte(raw), &it) == nil && (it.T == "msg" || it.T == "sistema") {
				fila := persistRow{id: m.ID, cid: nombre, it: it, ts: tsDeID(m.ID)}
				lote := []persistRow{fila}
				s.descargar(ctx, &lote)
			}
			_ = s.a.Redis.XAck(ctx, nombre, persistirGrupo, m.ID).Err()
		}
	}
}

// cidDiaDeStream splits the stream key «grcup:<env>:chat:sala:<cid>:<dia>» into its parts.
func cidDiaDeStream(nombre, prefijo string) (string, string) {
	rest := strings.TrimPrefix(nombre, prefijo+"chat:sala:")
	cid, dia, ok := strings.Cut(rest, ":")
	if !ok || cid == "" || !diaValido(dia) {
		return "", ""
	}
	return cid, dia
}

// ---- inyecciones (§4): consumidor de grcup:events ----

// eventos consumes the platform stream (group «chat», only new events) and injects the public facts of the live
// into the rooms: confirmed donations, sponsor banners and fan bans.
func (s *Svc) eventos(ctx context.Context) {
	c := &events.Consumer{Redis: s.a.Redis, DB: s.a.DB, Stream: s.a.Stream(), Group: "chat", Start: "$", Handle: s.inyectarEvento, Log: s.a.Log}
	c.Run(ctx)
}

// inyectarEvento handles one platform event (idempotence is provided by events.Consumer via processed_events).
func (s *Svc) inyectarEvento(ctx context.Context, e events.Event) error {
	switch e.Type {
	case "donacion.confirmada":
		var d struct {
			Alias   string `json:"alias"`
			Importe int64  `json:"importe"`
			Coins   int64  `json:"coins"`
			Mensaje string `json:"mensaje"`
			Dia     string `json:"dia"`
		}
		if json.Unmarshal(e.Data, &d) != nil {
			return nil // malformed: ack and move on (it is a best-effort injection)
		}
		dia := d.Dia
		if !diaValido(dia) {
			dia = hoy()
		}
		alias := d.Alias
		if alias == "" {
			alias = "Anónimo"
		}
		// el mensaje del donativo pasa el mismo filtro que el chat (§5): palabras prohibidas y enlaces. Si no
		// pasa, el donativo se anuncia igual pero sin el mensaje (nada de bypass del filtro de la sala).
		cfg := configPorDefecto()
		if cid, err := uuid.Parse(e.CompetitionID); err == nil {
			cfg = s.configDe(ctx, cid)
		}
		texto := ""
		if d.Mensaje != "" {
			if res := filtrar(d.Mensaje, cfg); res.OK {
				texto = d.Mensaje
			} else {
				s.a.Log.Warn("mensaje de donativo descartado", "code", res.Code, "detalle", res.Detalle, "competicion", e.CompetitionID)
			}
		}
		return s.inyectar(ctx, e.CompetitionID, dia, item{T: "donacion", Alias: alias, Importe: d.Importe, Coins: d.Coins, Texto: texto, Ts: time.Now().UnixMilli(), Dia: dia})
	case "patrocinio.banner":
		var b struct {
			BannerID       string `json:"bannerId"`
			Patrocinador   string `json:"patrocinador"`
			ImagenUrl      string `json:"imagenUrl"`
			ImagenMovilUrl string `json:"imagenMovilUrl"`
			ClicUrl        string `json:"clicUrl"`
			Tier           string `json:"tier"`
			Dia            string `json:"dia"`
		}
		if json.Unmarshal(e.Data, &b) != nil {
			return nil
		}
		dia := b.Dia
		if !diaValido(dia) {
			dia = hoy()
		}
		return s.inyectar(ctx, e.CompetitionID, dia, item{T: "banner", BannerID: b.BannerID, Patrocinador: b.Patrocinador, ImagenUrl: b.ImagenUrl, ImagenMovilUrl: b.ImagenMovilUrl, ClicUrl: b.ClicUrl, Tier: b.Tier, Ts: time.Now().UnixMilli(), Dia: dia})
	case "fans.baneado":
		return s.baneado(ctx, e)
	}
	return nil
}

// baneado silences the fan (TTL until baneado_hasta) and deletes their last messages from the active room: the
// entries leave the stream (XDEL), connected clients get `borrado` frames and the persisted rows are flagged.
func (s *Svc) baneado(ctx context.Context, e events.Event) error {
	var b struct {
		FanID  string `json:"fanId"`
		Hasta  string `json:"hasta"`
		Motivo string `json:"motivo"`
	}
	if json.Unmarshal(e.Data, &b) != nil || b.FanID == "" {
		if _, err := uuid.Parse(e.Subject); err == nil {
			b.FanID = e.Subject // the fans service may put it in the subject
		} else {
			return nil
		}
	}
	ttl := 24 * time.Hour
	if t, err := time.Parse(time.RFC3339, b.Hasta); err == nil && t.After(time.Now()) {
		ttl = time.Until(t)
	}
	if ttl > mudTTLMax {
		ttl = mudTTLMax
	}
	s.a.Redis.Set(ctx, s.a.Keys.Of("chat", "mudo", e.CompetitionID, b.FanID), "baneado", ttl)

	dia := hoy()
	nombre := s.streamDe(e.CompetitionID, dia)
	msgs, err := s.a.Redis.XRevRangeN(ctx, nombre, "+", "-", 500).Result()
	if err != nil {
		return nil // the room may not exist yet: nothing to delete
	}
	const maxBorrados = 20
	borrados := 0
	for _, m := range msgs {
		if borrados >= maxBorrados {
			break
		}
		var it item
		raw, _ := m.Values["d"].(string)
		if json.Unmarshal([]byte(raw), &it) != nil || it.T != "msg" || it.FanID != b.FanID {
			continue
		}
		if _, err := s.a.Redis.XDel(ctx, nombre, m.ID).Result(); err == nil {
			borrados++
			// el id del mensaje borrado viaja en «mensajeId» (el lector de la sala pisa «id»)
			_ = s.inyectar(ctx, e.CompetitionID, dia, item{T: "borrado", MensajeID: m.ID, Motivo: "baneado", Ts: time.Now().UnixMilli()})
			_, _ = s.a.DB.Exec(ctx, `UPDATE mensajes SET borrado = true WHERE id = $1 AND competition_id = $2 AND dia = $3`, m.ID, e.CompetitionID, dia)
		}
	}
	s.a.Log.Info("fans.baneado: mensajes borrados de la sala", "fan", b.FanID, "n", borrados, "motivo", b.Motivo)
	return nil
}
