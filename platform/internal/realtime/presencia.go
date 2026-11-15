package realtime

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// presenciaTTL: an editor that stops sending heartbeats (every 15 s from the BO) drops out after 40 s.
const presenciaTTL = 40 * time.Second

var recursoRe = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

type presenciaUsuario struct {
	ID     string    `json:"id"`
	Nombre string    `json:"nombre"`
	Desde  time.Time `json:"desde"`
}

// presencia (POST /api/admin/competiciones/{cid}/presencia {recurso, salir?}) registers the caller as editing a
// resource (Redis hash per resource, one field per user, pruned by TTL) and publishes presencia.actualizada to
// the admin stream when the set of editors changes. Responds with the current editors.
func (s *Svc) presencia(w http.ResponseWriter, r *http.Request) {
	cid := r.PathValue("cid")
	if _, err := uuid.Parse(cid); err != nil {
		writeErr(w, problem.NotFound("Competición no encontrada."))
		return
	}
	p, err := auth.RequireMember(r.Context(), cid)
	if err != nil {
		writeErr(w, err)
		return
	}
	var body struct {
		Recurso string `json:"recurso"`
		Salir   bool   `json:"salir"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&body) != nil || !recursoRe.MatchString(body.Recurso) {
		writeErr(w, problem.New(http.StatusUnprocessableEntity, "VALIDACION", "recurso no válido."))
		return
	}
	ctx, rdb := r.Context(), s.a.Redis
	key := fmt.Sprintf("%s:presencia:%s:%s", s.a.Stream(), cid, body.Recurso)
	now := time.Now().UTC()
	uid := p.UserID.String()
	all, err := rdb.HGetAll(ctx, key).Result()
	if err != nil && err != redis.Nil {
		writeErr(w, err)
		return
	}
	type entry struct {
		U    presenciaUsuario `json:"u"`
		Seen time.Time        `json:"s"`
	}
	antes, usuarios := map[string]bool{}, []presenciaUsuario{}
	var stale []string
	desde := now
	for id, raw := range all {
		var e entry
		if json.Unmarshal([]byte(raw), &e) != nil || now.Sub(e.Seen) > presenciaTTL {
			stale = append(stale, id)
			continue
		}
		antes[id] = true
		if id == uid {
			desde = e.U.Desde
			continue
		}
		usuarios = append(usuarios, e.U)
	}
	pipe := rdb.TxPipeline()
	if len(stale) > 0 {
		pipe.HDel(ctx, key, stale...)
	}
	if body.Salir {
		pipe.HDel(ctx, key, uid)
	} else {
		raw, _ := json.Marshal(entry{U: presenciaUsuario{ID: uid, Nombre: p.Name, Desde: desde}, Seen: now})
		pipe.HSet(ctx, key, uid, raw)
		pipe.Expire(ctx, key, presenciaTTL)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		writeErr(w, err)
		return
	}
	todos := usuarios
	if !body.Salir {
		todos = append(append([]presenciaUsuario{}, usuarios...), presenciaUsuario{ID: uid, Nombre: p.Name, Desde: desde})
	}
	sort.Slice(todos, func(i, j int) bool { return todos[i].Desde.Before(todos[j].Desde) })
	if antes[uid] == body.Salir || len(stale) > 0 { // joined, left or someone expired
		e := events.New(ctx, "presencia.actualizada", map[string]any{"recurso": body.Recurso, "usuarios": todos},
			events.Competition(cid), events.Subject("presencia:"+body.Recurso))
		if err := events.Publish(ctx, rdb, s.a.Stream(), e); err != nil {
			s.a.Log.Warn("presencia publish", "err", err)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"recurso": body.Recurso, "usuarios": usuarios, "ttlSegundos": int(presenciaTTL / time.Second)})
}

