import { A11yModule } from '@angular/cdk/a11y';
import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts, fmtAgo, type GrTone } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { problemOf } from '../../core/api';
import { BoPageHeader, errText } from '../../shared/ui';
import {
  SolicitudesApi,
  type Candidato, type Consentimiento, type Diferencia, type EstadoSolicitud, type SolicitudDetalle, type SolicitudItem, type SolicitudLista, type TipoMatch,
} from './solicitudes-api';
import { CAMPOS, CONSENTIMIENTOS, MATCH, estadoDe, matchTone, matchTxt, nombreCompleto, type FilaCampo, type FilaConsentimiento } from './solicitudes-model';
import { SolicitudesLista } from './solicitudes-lista';
import { SolicitudesDialogo } from './solicitudes-dialogo';
import { SolicitudesCupos } from './solicitudes-cupos';

type Pestana = 'todas' | 'pendiente' | 'revision' | 'menor' | 'aprobada' | 'rechazada';
type Dialogo = 'aprobar' | 'rechazar' | 'borrar' | null;

/**
 * «Atletas › Solicitudes» (Figma D3): the requests sent from the public form, reviewed by hand before
 * the athlete is created. Live over the admin SSE channel: a new request appears on its own, highlighted.
 */
@Component({
  selector: 'bo-solicitudes',
  imports: [A11yModule, FormsModule, RouterLink, SolicitudesLista, SolicitudesDialogo, SolicitudesCupos, BoPageHeader, GrAlert, GrBadge, GrButton, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-4 pb-24 md:gap-5">
      <bo-page-header class="hidden md:flex" title="Solicitudes de atleta" subtitle="Altas enviadas desde el formulario público · se revisan a mano antes de publicar"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Atletas', 'Solicitudes']">
        @if (puede() && l !== null && l !== undefined) {
          <ng-container actions><button grButton icon="download" [loading]="exporting()" (click)="exportar()">Exportar CSV</button></ng-container>
        }
      </bo-page-header>

      @if (!puede()) {
        <section class="mx-auto w-full max-w-2xl rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
          <span class="mx-auto flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="lock" [size]="22" /></span>
          <h2 class="mt-4 text-ui-h4">No tienes acceso a Solicitudes de atleta</h2>
          <p class="mt-2 text-body-s text-text-tertiary">Tu rol ({{ rol() }}) no incluye la revisión de solicitudes de atleta. Pide acceso a un Admin de la competición.</p>
          <div class="mt-5 flex justify-center"><button grButton variant="primary" (click)="pedirAcceso()">Solicitar acceso</button></div>
        </section>
      } @else {
        @if (!live.connected() && l !== undefined) {
          <gr-alert tone="warning" title="Conexión en vivo perdida">
            Los datos pueden estar desactualizados · últimos datos a las {{ horaUltima() }}. Las solicitudes nuevas entrarán al reconectar.
            <button alertAction type="button" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text" (click)="reconectar()">Reintentar <gr-icon name="arrow-right" [size]="14" /></button>
          </gr-alert>
        }
        <p class="sr-only" aria-live="polite">{{ anuncio() }}</p>

        <nav class="flex flex-wrap gap-2 md:gap-1 md:overflow-x-auto md:border-b md:border-line-subtle [scrollbar-width:none]" aria-label="Estado de las solicitudes">
          @for (t of pestanas; track t.k) {
            <button type="button" (click)="irPestana(t.k)" [attr.aria-current]="pestana() === t.k ? 'page' : null"
              class="relative flex h-6 shrink-0 items-center gap-1 rounded-xs border px-2 text-mono-xs uppercase whitespace-nowrap md:h-11 md:gap-2 md:rounded-none md:border-0 md:px-3 md:text-label-s md:normal-case"
              [class]="pestana() === t.k ? 'border-accent-text text-accent-text md:text-text-primary' : 'border-line-strong text-text-tertiary md:hover:text-text-primary'">
              <span class="md:hidden">{{ t.c }}</span><span class="hidden md:inline">{{ t.l }}</span>
              <span class="md:hidden">·</span>
              <span class="md:rounded-2xs md:px-1.5 md:text-mono-xs" [class]="destacado(t.k) ? 'bg-accent-deep/50 text-accent-text' : 'text-text-secondary md:bg-bg-raised'">{{ contador(t.k) }}</span>
              @if (pestana() === t.k) { <span class="absolute inset-x-2 bottom-0 hidden h-0.5 rounded-t-2xs bg-accent md:block"></span> }
            </button>
          }
        </nav>

        @if (l === undefined) {
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            @for (k of kpiEtiquetas; track k) { <gr-skeleton class="h-32 rounded-lg" /> }
          </div>
          <gr-skeleton class="h-96 rounded-lg" />
        } @else if (l === null) {
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            @for (k of kpiEtiquetas; track k) {
              <div class="flex min-w-0 flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5">
                <p class="text-label-xs text-text-tertiary">{{ k.l }}</p>
                <p class="font-sans text-[32px] leading-none font-bold tracking-tight text-text-disabled md:text-[40px]">—</p>
                <p class="text-body-xs text-text-tertiary">No disponible</p>
              </div>
            }
          </div>
          <section class="mx-auto w-full max-w-2xl rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
            <span class="mx-auto flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="circle-alert" [size]="22" /></span>
            <h2 class="mt-4 text-ui-h4">No se pudieron cargar las solicitudes</h2>
            <p class="mt-2 text-body-s text-text-tertiary">No pudimos conectar con el servidor. Ya está registrado; reintenta en unos segundos.</p>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <button grButton variant="primary" (click)="cargar()">Reintentar</button>
              <a grButton [routerLink]="['/', comps.current()?.slug, 'auditoria']">Ver estado del sistema</a>
            </div>
          </section>
        } @else {
          <div class="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-4">
            <gr-kpi label="Pendientes de revisar" [value]="n(pendientes())" [delta]="deltaNuevas()" [caption]="(l.kpis?.pendientesHoy ?? 0) + ' nuevas hoy'" />
            <gr-kpi label="En revisión" [value]="n(contador('revision'))" caption="sin asignar" />
            <gr-kpi label="Aprobadas" [value]="n(contador('aprobada'))" [caption]="(l.kpis?.aprobadasHoy ?? 0) + ' hoy'" />
            <gr-kpi label="Rechazadas" [value]="n(contador('rechazada'))" caption="se borran a los 30 días" />
          </div>

          <bo-solicitudes-cupos class="hidden md:block" [cid]="cid()" [puede]="puede()" />

          <div class="hidden flex-wrap items-center gap-2 md:flex">
            <label class="relative block w-full max-w-xs">
              <span class="sr-only">Buscar en solicitudes</span>
              <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
              <input grInput type="search" class="pl-9" placeholder="Buscar en solicitudes…" [ngModel]="q()" (ngModelChange)="buscar($event)" />
            </label>
            <gr-select tipo="filtro" etiqueta="+ Coincidencia" [ngModel]="fMatch()" (ngModelChange)="fMatch.set($event); recargar(1)" aria-label="Coincidencia">
              <option value="">Coincidencia</option>
              <option value="licencia">Licencia</option>
              <option value="email">Email</option>
              <option value="nombre">Sugerida</option>
              <option value="ninguna">Sin coincidencia</option>
            </gr-select>
            <gr-select tipo="filtro" etiqueta="+ Menor de edad" [ngModel]="fMenor()" (ngModelChange)="fMenor.set($event); recargar(1)" aria-label="Menor de edad">
              <option value="">Menor de edad</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </gr-select>
            <gr-select tipo="filtro" etiqueta="+ Recibida" [ngModel]="fRecibida()" (ngModelChange)="fRecibida.set($event)" aria-label="Recibida">
              <option value="">Recibida</option>
              <option value="hoy">Hoy</option>
              <option value="7">Últimos 7 días</option>
              <option value="30">Este mes</option>
            </gr-select>
            <span class="ml-auto text-body-xs text-text-tertiary">{{ visibles().length }} de {{ l.total }}</span>
            <button grIconButton icon="download" label="Exportar CSV" (click)="exportar()"></button>
          </div>

          @if (!visibles().length) {
            <section class="mx-auto w-full max-w-2xl rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
              <span class="mx-auto flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="user" [size]="22" /></span>
              <h2 class="mt-4 text-ui-h4">{{ l.total ? 'Ninguna solicitud con esos filtros' : 'Aún no hay solicitudes de atleta' }}</h2>
              <p class="mt-2 text-body-s text-text-tertiary">{{ l.total ? 'Prueba con otro filtro o con otra búsqueda.' : 'Cuando alguien envíe su alta desde el formulario público aparecerá aquí en vivo, con su foto y su coincidencia.' }}</p>
            </section>
          } @else {
            <bo-solicitudes-lista [items]="visibles()" [total]="l.total" [desde]="desde()" [hasta]="hasta()" [pagina]="pagina()" [paginas]="paginas()"
              [nuevas]="nuevas()" [miniaturas]="miniaturas()" (revisar)="revisar($event)" (irPagina)="recargar($event)" />
          }
        }
      }
    </div>

    <!-- ===== Review (Figma 171:81822 desktop 520 px · mobile full screen): one scroll, actions on one row ===== -->
    @if (abierto()) {
    <div class="fixed inset-0 z-40 bg-black/60" (click)="cerrar()"></div>
    <aside class="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line-strong bg-bg-card shadow-card sm:w-[520px]" role="dialog" aria-modal="true"
      [attr.aria-label]="detalle() ? 'Revisar solicitud de ' + nombreCompleto(detalle()!) : 'Revisar solicitud'" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
      <header class="flex shrink-0 flex-col gap-1 px-4 pt-3 sm:px-6 sm:pt-5">
        <div class="flex items-center gap-2 sm:hidden">
          <button grIconButton icon="x" label="Cerrar" (click)="cerrar()"></button>
          <span class="text-ui-h5">Revisar solicitud</span>
          @if (posicion(); as p) { <span class="text-body-xs text-text-tertiary">{{ p }}</span> }
        </div>
        <div class="flex items-start gap-3">
          <h2 class="min-w-0 flex-1 text-[22px] leading-7 font-semibold break-words">{{ detalle() ? nombreCompleto(detalle()!) : 'Revisar solicitud' }}</h2>
          <button grIconButton icon="x" label="Cerrar" class="hidden sm:inline-flex" (click)="cerrar()"></button>
        </div>
      </header>
      <div class="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
      @if (detalle(); as d) {
        <div class="flex flex-col gap-5">
          <p class="hidden text-body-s text-text-tertiary sm:block">Solicitud recibida {{ hace(d.createdAt) }} desde el formulario de alta</p>
          <p class="truncate text-body-s text-text-tertiary sm:hidden">{{ d.email }}</p>

          <div class="-mt-2 flex flex-wrap gap-1">
            <gr-badge [tone]="estado(d).tone">{{ estado(d).l }}</gr-badge>
            <gr-badge [tone]="matchTone(d.match)">{{ match(d.match) }}</gr-badge>
          </div>

          @if (sinPlazas()) {
            <gr-alert tone="warning" title="No quedan plazas en el evento">
              {{ sinPlazas() }} Las plazas del evento se editan en «Plazas y cupo por competición», encima de la lista.
              <span alertAction class="mt-2 flex flex-wrap gap-4">
                <button type="button" class="hidden h-9 items-center gap-1 text-label-s text-accent-text md:inline-flex" (click)="irPlazas()">Subir las plazas <gr-icon name="arrow-right" [size]="14" /></button>
                <a class="inline-flex h-9 items-center gap-1 text-label-s text-accent-text" [routerLink]="['/', comps.current()?.slug, 'atletas', 'inscripcion']">Abrir Inscripción</a>
              </span>
            </gr-alert>
          }
          @if (conflicto()) {
            <gr-alert tone="warning" title="Conflicto de edición">
              {{ conflicto() }}
              <button alertAction type="button" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text" (click)="recargarDetalle()">Refrescar <gr-icon name="arrow-right" [size]="14" /></button>
            </gr-alert>
          }
          @if (d.estado === 'aprobada') {
            @if (publicable()) {
              <gr-alert tone="success" title="Aprobada y publicada">Perfil creado y publicado con su foto (si la envió) · enlace de acceso enviado al área de atleta.</gr-alert>
            } @else {
              <gr-alert tone="success" title="Aprobada · ficha privada">Perfil creado sin publicar ({{ d.esMenor ? 'menor de edad' : 'sin consentimiento de imagen' }}): queda privado hasta que se active desde el área de atleta.</gr-alert>
            }
          }
          @if (d.estado === 'rechazada') {
            <gr-alert tone="danger" title="Solicitud rechazada">
              Motivo: {{ d.motivoRechazo || 'sin motivo' }}
            </gr-alert>
          }
          @if (d.esMenor) {
            <gr-alert [tone]="d.autorizacion ? 'success' : 'warning'" title="Menor de {{ d.edad }} años · {{ d.autorizacion ? 'autorización guardada' : 'falta autorización' }}">
              {{ d.autorizacion ? 'La autorización firmada está guardada en privado.' : 'Aprobar permanece bloqueado hasta subir la autorización firmada de madre, padre o tutor.' }}
              <a alertAction [href]="correoAutorizacion()" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text">Pedir autorización <gr-icon name="arrow-right" [size]="14" /></a>
            </gr-alert>
            <section class="flex flex-col gap-2">
              @if (d.autorizacion) {
                <div class="flex flex-wrap items-center gap-2 rounded-md border border-success/30 bg-success/5 p-4">
                  <gr-icon name="circle-check" [size]="20" class="text-success" />
                  <span class="min-w-0 flex-1 text-body-s">Autorización firmada del tutor · guardada en privado</span>
                  <button grButton size="s" icon="eye" (click)="verAutorizacion()">Ver</button>
                </div>
              } @else {
                <label class="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong p-6 text-center hover:border-text-muted">
                  <span class="flex size-10 items-center justify-center rounded-md bg-bg-raised text-accent-text"><gr-icon name="download" [size]="18" /></span>
                  <span class="text-label-s">Autorización firmada del tutor</span>
                  <span class="text-body-xs text-text-tertiary">PDF, JPG o PNG · máx. 8 MB · se guarda privada y no se publica</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" class="sr-only" (change)="subirAutorizacion($event)" />
                </label>
                @if (subiendo()) { <p class="text-body-xs text-text-tertiary">Subiendo la autorización…</p> }
              }
            </section>
          }

          @if (foto() || (d.estado !== 'aprobada' && d.estado !== 'rechazada')) {
          <section class="flex flex-col gap-3 sm:flex-row sm:gap-4">
            @if (foto(); as url) {
              <img [src]="url" [alt]="'Foto de ' + nombreCompleto(d)" class="aspect-[4/5] w-full rounded-md bg-bg-raised object-cover sm:h-[300px] sm:w-[240px]" />
            } @else {
              <span class="flex h-40 w-full items-center justify-center rounded-md bg-bg-raised text-text-tertiary sm:h-[300px] sm:w-[240px]"><gr-icon name="camera" [size]="24" /></span>
            }
            <div class="min-w-0 flex-1">
              <p class="text-body-xs text-text-tertiary">{{ !foto() ? 'Sin foto' : imagenAceptada() ? 'Foto tal como se publicará' : 'Foto enviada · no se publicará' }}</p>
              @if (foto()) {
                <button type="button" class="mt-1 text-label-s text-accent-text hover:underline" (click)="ampliada.set(true)">Ampliar foto</button>
                <p class="mt-3 text-body-xs text-text-tertiary">{{ imagenAceptada() ? 'Se publica en la ficha del atleta con su nombre y sus marcas.' : 'Sin consentimiento de imagen: al aprobar se descarta y la ficha queda privada.' }}</p>
              }
            </div>
          </section>
          }

          <section>
            <h3 class="text-label-xs text-text-muted uppercase">Datos declarados vs atleta enlazado</h3>
            @if (!verTodos()) {
              <dl class="mt-2 flex flex-col gap-1.5">
                @for (f of resumen(); track f.clave) {
                  <div class="flex items-center gap-3 rounded-sm bg-bg-raised px-3 py-2">
                    <dt class="w-24 shrink-0 text-body-xs text-text-tertiary sm:w-28">{{ f.etiqueta }}</dt>
                    <dd class="flex min-w-0 flex-1 flex-wrap items-center gap-2"><span class="min-w-0 truncate text-body-s">{{ f.nuevo || '—' }}</span><gr-badge [tone]="f.tone">{{ f.l }}</gr-badge></dd>
                  </div>
                }
              </dl>
              <button type="button" class="mt-2 text-label-s text-accent-text hover:underline" (click)="verTodos.set(true)">Ver los 17 campos del formulario y sus diferencias →</button>
            } @else {
              <p class="mt-1 text-body-xs text-text-tertiary">Todos los datos del formulario</p>
              <dl class="mt-2 flex flex-col">
                @for (f of campos(); track f.clave) {
                  <div class="flex items-start justify-between gap-3 border-b border-line-subtle py-2">
                    <dt class="w-28 shrink-0 text-body-xs text-text-tertiary">{{ f.etiqueta }}</dt>
                    <dd class="min-w-0 flex-1 text-body-s">
                      @if (f.actual) { <span class="block text-body-xs text-text-muted line-through">{{ f.actual }}</span> }
                      <span class="block">@if (f.actual) { <span class="text-text-tertiary">→ </span> }{{ f.nuevo || '—' }}</span>
                    </dd>
                    <gr-badge [tone]="f.tone">{{ f.l }}</gr-badge>
                  </div>
                }
              </dl>
              <button type="button" class="mt-2 text-label-s text-accent-text hover:underline" (click)="verTodos.set(false)">Ver solo el resumen →</button>
            }
          </section>

          <section>
            <h3 class="text-label-xs text-text-muted uppercase">Coincidencia y enlazado</h3>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <gr-badge [tone]="matchTone(d.match)">{{ match(d.match) }}</gr-badge>
              @if (d.atleta) {
                <span class="text-body-s">Atleta enlazado: {{ d.atleta.nombre }}@if (d.atleta.licencia) { · {{ d.atleta.licencia }} }</span>
              } @else {
                <span class="text-body-s">Sin atleta enlazado · se creará uno nuevo al aprobar</span>
              }
            </div>
            @if (d.estado !== 'aprobada' && d.estado !== 'rechazada') {
              <label class="relative mt-3 block">
                <span class="sr-only">Buscar un atleta para enlazar</span>
                <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
                <input grInput type="search" class="pl-9" placeholder="Enlazar otro atleta por nombre, email o licencia…" [ngModel]="qEnlace()" (ngModelChange)="buscarEnlace($event)" />
              </label>
              @if (candidatos().length) {
                <ul class="mt-2 flex flex-col gap-1">
                  @for (c of candidatos(); track c.id) {
                    <li class="flex items-center justify-between gap-3 rounded-sm bg-bg-raised px-3 py-2">
                      <span class="min-w-0"><span class="block truncate text-body-s">{{ c.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.licencia || 'sin licencia' }} · {{ c.club || 'sin club' }}</span></span>
                      <button grButton size="s" [disabled]="ocupado()" (click)="enlazar(c)">Enlazar</button>
                    </li>
                  }
                </ul>
              }
              <button type="button" class="mt-2 text-label-s text-accent-text hover:underline" [disabled]="ocupado()" (click)="crearNuevo()">Crear atleta nuevo</button>
            }
          </section>

          <section>
            <h3 class="text-label-xs text-text-muted uppercase">Consentimientos con prueba</h3>
            <div class="mt-2 flex flex-col gap-3 rounded-md bg-bg-raised p-4">
              @if (d.estado === 'aprobada') {
                <p class="text-body-s">Consentimientos aplicados al perfil publicado</p>
              } @else if (d.estado === 'rechazada') {
                <p class="text-body-s">Consentimientos guardados · se borran con la solicitud (RGPD)</p>
              }
              <ul class="flex flex-col gap-6">
                @for (c of consentimientos(); track c.clave) {
                  <li class="flex items-start gap-2">
                    @if (c.aceptado) { <gr-icon name="circle-check" [size]="16" class="mt-0.5 shrink-0 text-success" /> }
                    @else { <span class="mt-1 size-3.5 shrink-0 rounded-full border border-line-strong" aria-hidden="true"></span> }
                    <span class="min-w-0 flex-1">
                      <span class="block text-body-s">{{ c.texto }}</span>
                      <span class="block text-body-xs text-text-tertiary">{{ c.prueba }}</span>
                    </span>
                    <gr-badge [tone]="c.aceptado ? 'success' : 'neutral'">{{ c.aceptado ? 'Aceptado' : 'No marcado' }}</gr-badge>
                  </li>
                }
              </ul>
            </div>
          </section>

          @if (d.estado !== 'aprobada' && d.estado !== 'rechazada') {
            <section class="flex flex-col gap-4">
              <h3 class="text-label-xs text-text-muted uppercase">Editar antes de aprobar</h3>
              <gr-field for="ed-frase" label="Frase del perfil" hint="Aparece en su ficha pública">
                <input grInput maxlength="80" id="ed-frase" [ngModel]="cambios.frase" (ngModelChange)="cambios.frase = $event" />
              </gr-field>
              <gr-field for="ed-bio" label="Sobre ti" hint="Máximo 280 caracteres">
                <textarea grInput rows="3" maxlength="280" id="ed-bio" [ngModel]="cambios.bio" (ngModelChange)="cambios.bio = $event"></textarea>
              </gr-field>
              <div class="grid gap-4 sm:grid-cols-2">
                <gr-field for="ed-instagram" label="Instagram" hint="Oculto en menores de edad">
                  <input grInput maxlength="30" id="ed-instagram" [ngModel]="cambios.instagram" (ngModelChange)="cambios.instagram = $event" />
                </gr-field>
                <gr-field for="ed-club" label="Club">
                  <input grInput id="ed-club" [ngModel]="cambios.club" (ngModelChange)="cambios.club = $event" />
                </gr-field>
                <gr-field for="ed-ciudad" label="Ciudad" hint="Del formulario">
                  <input grInput id="ed-ciudad" [ngModel]="cambios.ciudad" (ngModelChange)="cambios.ciudad = $event" />
                </gr-field>
                <gr-field for="ed-entrenador" label="Entrenador/a" hint="Opcional">
                  <input grInput id="ed-entrenador" [ngModel]="cambios.entrenador" (ngModelChange)="cambios.entrenador = $event" />
                </gr-field>
              </div>
              <div class="grid gap-4 sm:grid-cols-3">
                <gr-field for="ed-marcaSQ" label="Marca SQ" hint="Paso 0,5 kg">
                  <input grInput type="number" step="0.5" min="0" max="600" id="ed-marcaSQ" [ngModel]="cambios.marcaSQ" (ngModelChange)="cambios.marcaSQ = $event" />
                </gr-field>
                <gr-field for="ed-marcaBP" label="Marca BP" hint="Paso 0,5 kg">
                  <input grInput type="number" step="0.5" min="0" max="600" id="ed-marcaBP" [ngModel]="cambios.marcaBP" (ngModelChange)="cambios.marcaBP = $event" />
                </gr-field>
                <gr-field for="ed-marcaDL" label="Marca DL" hint="Paso 0,5 kg">
                  <input grInput type="number" step="0.5" min="0" max="600" id="ed-marcaDL" [ngModel]="cambios.marcaDL" (ngModelChange)="cambios.marcaDL = $event" />
                </gr-field>
              </div>
              <p class="text-body-xs text-text-tertiary">Solo se aplica al aprobar · nunca se pisan los datos de la AEP ni se vacían campos</p>
            </section>
          }

          @if (error()) { <gr-alert tone="danger" title="No se pudo guardar">{{ error() }}</gr-alert> }
        </div>
      } @else {
        <div class="flex flex-col items-center gap-3 py-8 text-center">
          @if (cargandoDetalle()) {
            <gr-skeleton class="h-40 w-full rounded-lg" />
          } @else {
            <span class="flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="wifi-off" [size]="22" /></span>
            <h3 class="text-ui-h5">No se pudo abrir la solicitud</h3>
            <p class="text-body-s text-text-tertiary">{{ error() || 'No hemos podido cargar los datos de esta solicitud.' }}</p>
            <button grButton variant="primary" (click)="recargarDetalle()">Reintentar</button>
          }
        </div>
      }
      </div>
      <footer class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line-subtle bg-bg-card px-4 py-4 sm:flex-nowrap sm:px-6">
        @if (detalle(); as d) {
          @if (d.estado === 'aprobada') {
            <button grButton (click)="cerrar()">Cerrar</button>
            <a grButton variant="primary" [routerLink]="['/', comps.current()?.slug, 'atletas', d.atletaId]">Ver ficha del atleta</a>
          } @else if (d.estado === 'rechazada') {
            <button grButton (click)="cerrar()">Cerrar</button>
            <button grButton variant="danger" [disabled]="ocupado()" (click)="dialogo.set('borrar')">Borrar…</button>
          } @else {
            <!-- Mobile: Approve full width on top, the other two below; desktop: the three on one row. -->
            <button grButton variant="primary" class="order-first w-full sm:order-last sm:w-auto" [disabled]="ocupado() || bloqueadoAprobar()" (click)="dialogo.set('aprobar')">{{ publicable() ? 'Aprobar y publicar' : 'Aprobar (ficha privada)' }}</button>
            <button grButton class="flex-1 sm:flex-none" [disabled]="ocupado()" (click)="marcarRevision()">Marcar en revisión</button>
            <button grButton variant="danger" class="flex-1 sm:flex-none" [disabled]="ocupado()" (click)="dialogo.set('rechazar')">Rechazar…</button>
          }
        }
      </footer>
      @if (detalle()?.estado === 'rechazada') { <p class="shrink-0 bg-bg-card px-4 pb-4 text-body-xs text-text-tertiary sm:px-6">Borrar elimina solicitud, foto privada y consentimientos · confirmación en dos pasos</p> }
      @if (bloqueadoAprobar()) { <p class="shrink-0 bg-bg-card px-4 pb-4 text-body-xs text-warning sm:px-6">Aprobar se desbloquea al subir la autorización firmada.</p> }
    </aside>
    }

    <!-- ===== Photo (full screen) ===== -->
    @if (ampliada() && foto(); as url) {
      <div class="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 p-4" (click)="ampliada.set(false)">
        <img [src]="url" [alt]="'Foto de ' + (detalle() ? nombreCompleto(detalle()!) : '')" class="max-h-[78vh] max-w-[92vw] rounded-md object-contain" (click)="$event.stopPropagation()" />
        <p class="mt-4 text-body-s text-white/85">{{ imagenAceptada() ? 'Foto tal como se publicará' : 'Foto enviada · no se publicará' }} · {{ detalle() ? nombreCompleto(detalle()!) : '' }}</p>
        <p class="text-body-xs text-white/50">Cierra con la tecla Esc o tocando fuera de la foto</p>
      </div>
    }

    @if (dialogo(); as dl) {
      <bo-solicitudes-dialogo [tipo]="dl" [nombre]="detalle() ? nombreCompleto(detalle()!) : ''" [publicable]="publicable()" [imagenAceptada]="imagenAceptada()"
        [destino]="destinoAprueba().texto" [ocupado]="ocupado()" [(avisarEmail)]="avisarEmail" [(avisarWhatsApp)]="avisarWhatsApp"
        (cerrar)="dialogo.set(null)" (aprobar)="aprobar()" (rechazar)="rechazar($event)" (borrar)="borrar()" />
    }
  `,
})
export class SolicitudesPage {
  private readonly api = inject(SolicitudesApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly live = inject(Realtime);
  private readonly toasts = inject(GrToasts);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly cuposCmp = viewChild(SolicitudesCupos);

  protected readonly lista = signal<SolicitudLista | null | undefined>(undefined);
  protected readonly detalle = signal<SolicitudDetalle | null>(null);
  protected readonly abierto = signal(false);
  protected readonly pestana = signal<Pestana>('todas');
  protected readonly q = signal('');
  protected readonly fMatch = signal('');
  protected readonly fMenor = signal('');
  protected readonly fRecibida = signal('');
  protected readonly pagina = signal(1);
  protected readonly nuevas = signal<Set<string>>(new Set());
  protected readonly anuncio = signal('');
  protected readonly verTodos = signal(false);
  protected readonly ampliada = signal(false);
  protected readonly fotoUrl = signal<string | null>(null);
  protected readonly miniaturas = signal<Record<string, string>>({});
  protected readonly candidatos = signal<Candidato[]>([]);
  /** Athlete the reviewer chose in the search (the approval links the request to it). */
  protected readonly atletaElegido = signal<string | null>(null);
  /** The reviewer decided that a new athlete will be created when the request is approved. */
  protected readonly nuevoAtleta = signal(false);
  protected readonly cargandoDetalle = signal(false);
  protected readonly qEnlace = signal('');
  protected readonly ocupado = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected readonly conflicto = signal('');
  /** 409 INSCRIPCION_COMPLETA on approve: the event has no free place left (U33-R1-5). */
  protected readonly sinPlazas = signal('');
  protected readonly dialogo = signal<Dialogo>(null);
  protected readonly avisarEmail = signal(true);
  /** Off unless the athlete accepted the WhatsApp box (set on every detail load). */
  protected readonly avisarWhatsApp = signal(false);
  protected readonly ultimaCarga = signal('');
  protected readonly por = signal(6);
  protected cambios = { frase: '', bio: '', instagram: '', club: '', ciudad: '', entrenador: '', marcaSQ: null as number | null, marcaBP: null as number | null, marcaDL: null as number | null };

  protected readonly pestanas: { k: Pestana; l: string; c: string }[] = [
    { k: 'todas', l: 'Todas', c: 'Todas' }, { k: 'pendiente', l: 'Nuevas', c: 'Nuevas' }, { k: 'revision', l: 'En revisión', c: 'En revisión' },
    { k: 'menor', l: 'Menor · sin autorización', c: 'Menores' }, { k: 'aprobada', l: 'Aprobadas', c: 'Aprobadas' }, { k: 'rechazada', l: 'Rechazadas', c: 'Rechazadas' },
  ];
  protected readonly kpiEtiquetas = [{ l: 'Pendientes de revisar' }, { l: 'En revisión' }, { l: 'Aprobadas' }, { l: 'Rechazadas' }];
  protected readonly hace = fmtAgo;
  protected readonly match = matchTxt;
  protected readonly matchTone = matchTone;
  protected readonly estado = estadoDe;
  protected readonly nombreCompleto = nombreCompleto;

  protected readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'atletas.editar'));
  protected readonly rol = computed(() => this.auth.rolEn(this.cid()) || 'Invitado');
  protected readonly pendientes = computed(() => {
    const c = this.lista()?.contadores;
    // A minor is inside «pendiente» or «revision»: it is not counted twice.
    return c ? c.pendiente + c.revision : 0;
  });
  protected readonly visibles = computed(() => {
    const items = this.lista()?.items ?? [];
    const f = this.fRecibida();
    if (!f) return items;
    const ahora = Date.now();
    return items.filter((s) => {
      const t = new Date(s.createdAt).getTime();
      if (f === 'hoy') return new Date(s.createdAt).toDateString() === new Date().toDateString();
      return ahora - t <= (f === '7' ? 7 : 30) * 86_400_000;
    });
  });
  protected readonly total = computed(() => this.lista()?.total ?? 0);
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.total() / Math.max(1, this.por()))));
  protected readonly desde = computed(() => (this.visibles().length ? (this.pagina() - 1) * this.por() + 1 : 0));
  protected readonly hasta = computed(() => Math.min(this.pagina() * this.por(), (this.pagina() - 1) * this.por() + this.visibles().length));
  protected readonly foto = () => this.fotoUrl();
  protected readonly deltaNuevas = computed(() => {
    const k = this.lista()?.kpis?.pendientesHoy ?? 0;
    return k > 0 ? `+${k}` : null;
  });
  protected readonly bloqueadoAprobar = computed(() => {
    const d = this.detalle();
    return !!d && d.esMenor && !d.autorizacion;
  });

  private t: ReturnType<typeof setTimeout> | undefined;
  private tEnlace: ReturnType<typeof setTimeout> | undefined;


  constructor() {
    // Deep link /solicitudes/:id opens the review once the competition is known (U33-R1-4).
    const deep = this.route.snapshot.paramMap.get('id');
    let abrirDeep = !!deep;
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => {
        void this.cargar();
        if (abrirDeep && deep && this.puede()) {
          abrirDeep = false;
          void this.revisar({ id: deep }, false);
        }
      });
    });
    // Back/forward: the URL decides whether the review is open.
    const pop = this.location.subscribe((ev) => {
      const id = this.idDeUrl(ev.url ?? '');
      if (!id) this.cerrar(false);
      else if (id !== this.detalle()?.id) void this.revisar({ id }, false);
    });
    // One scroll only: the page under the review does not scroll (U33-R1-3).
    effect(() => { document.body.style.overflow = this.abierto() ? 'hidden' : ''; });
    const sub = this.live.events.subscribe((e) => {
      if (!e.tipo.startsWith('athletes.solicitud_')) return;
      const d = e.datos as { id?: string; nombre?: string; match?: string } | undefined;
      if (e.tipo === 'athletes.solicitud_creada') {
        if (d?.id) this.nuevas.update((s) => new Set(s).add(d.id!));
        this.anuncio.set(`Nueva solicitud de ${d?.nombre ?? 'un atleta'}`);
        this.toasts.info(`Nueva solicitud de ${d?.nombre ?? 'un atleta'}`, d?.match === 'nombre' ? 'Coincidencia sugerida · toca para revisarla' : 'Toca para revisarla');
      }
      this.refrescar();
    });
    const rs = this.live.resync.subscribe(() => void this.cargar());
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.t);
      clearTimeout(this.tEnlace);
      sub.unsubscribe();
      rs.unsubscribe();
      pop.unsubscribe();
      document.body.style.overflow = '';
      if (this.fotoUrl()) URL.revokeObjectURL(this.fotoUrl()!);
    });
  }

  /** /…/atletas/solicitudes/{id} → id ('' on the list). */
  private idDeUrl(url: string): string {
    return /\/atletas\/solicitudes\/([^/?#]+)/.exec(url)?.[1] ?? '';
  }

  private urlLista(): string {
    return `/${this.comps.current()?.slug ?? this.route.snapshot.paramMap.get('comp') ?? ''}/atletas/solicitudes`;
  }

  /** «3 de 12» in the mobile header: place of the open request in the current list. */
  protected posicion(): string {
    const d = this.detalle();
    const i = d ? this.visibles().findIndex((s) => s.id === d.id) : -1;
    return i < 0 ? '' : `${(this.pagina() - 1) * this.por() + i + 1} de ${this.total()}`;
  }

  /** From the «no places» alert: close the review and go to the places card. */
  protected irPlazas(): void {
    this.cerrar();
    setTimeout(() => document.getElementById('plazas-evento')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // ---------------------------------------------------------------- data

  async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid || !this.puede()) return;
    try {
      const l = await this.api.lista(cid, {
        estado: this.pestana(), match: this.fMatch(), menor: this.fMenor(), q: this.q().trim(), pagina: this.pagina(),
      });
      this.lista.set(l);
      this.por.set(Math.max(1, l.items.length));
      this.ultimaCarga.set(new Date().toISOString());
      void this.cargarMiniaturas(l.items);
    } catch (e) {
      if (!this.lista()) this.lista.set(null);
      this.toasts.error('No se pudieron cargar las solicitudes', errText(e, 'Inténtalo de nuevo.'));
    }
  }

  /** Silent refresh (the bus fired something): the list and the open request. */
  private refrescar(): void {
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      void this.cargar();
      if (this.abierto()) void this.recargarDetalle();
    }, 350);
  }

  protected recargar(p: number): void {
    this.pagina.set(p);
    void this.cargar();
  }

  protected irPestana(k: Pestana): void {
    this.pestana.set(k);
    this.pagina.set(1);
    void this.cargar();
  }

  protected buscar(v: string): void {
    this.q.set(v);
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      this.pagina.set(1);
      void this.cargar();
    }, 300);
  }

  protected reconnect(): void {
    this.live.reconnect();
    void this.cargar();
  }

  protected reconectar(): void {
    this.reconnect();
  }

  // ---------------------------------------------------------------- helpers

  protected n(v: number): string {
    return new Intl.NumberFormat('es-ES').format(v ?? 0);
  }

  protected contador(k: Pestana): number {
    const c = this.lista()?.contadores;
    if (!c) return 0;
    return c[k] ?? 0;
  }

  protected destacado(k: Pestana): boolean {
    return k === 'pendiente' && this.contador(k) > 0;
  }

  protected horaUltima(): string {
    const iso = this.ultimaCarga();
    if (!iso) return '—';
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  }

  protected pedirAcceso(): void {
    const c = this.comps.current();
    const email = c?.evento?.emailContacto ?? '';
    const asunto = encodeURIComponent('Acceso a las solicitudes de atleta');
    const cuerpo = encodeURIComponent(`Hola,\n\nNecesito acceso a las solicitudes de atleta de ${c?.nombre ?? 'la competición'}.\n\nGracias.`);
    window.location.href = `mailto:${email}?subject=${asunto}&body=${cuerpo}`;
  }

  // ---------------------------------------------------------------- photos

  /** The private photo comes as a blob: the session travels in the header, not in the URL. */
  private async cargarMiniaturas(items: SolicitudItem[]): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    for (const s of items) {
      if (this.miniaturas()[s.id]) continue;
      if (!s.fotoMiniatura) continue;
      if (s.fotoMiniatura && /^(https?:|data:)/.test(s.fotoMiniatura)) {
        this.miniaturas.update((m) => ({ ...m, [s.id]: s.fotoMiniatura }));
        continue;
      }
      try {
        const blob = await this.api.foto(cid, s.id);
        const url = URL.createObjectURL(blob);
        this.miniaturas.update((m) => ({ ...m, [s.id]: url }));
      } catch {
        /* no photo */
      }
    }
  }

  // ---------------------------------------------------------------- review

  protected async revisar(s: { id: string }, push = true): Promise<void> {
    if (push && this.idDeUrl(this.location.path()) !== s.id) this.location.go(`${this.urlLista()}/${s.id}`);
    this.abierto.set(true);
    this.pendienteId = s.id;
    this.nuevas.update((n) => {
      const c = new Set(n);
      c.delete(s.id);
      return c;
    });
    this.detalle.set(null);
    this.error.set('');
    this.conflicto.set('');
    this.sinPlazas.set('');
    this.verTodos.set(false);
    this.candidatos.set([]);
    this.qEnlace.set('');
    this.atletaElegido.set(null);
    this.nuevoAtleta.set(false);
    await this.recargarDetalle();
  }

  protected async recargarDetalle(): Promise<void> {
    const cid = this.cid();
    const d = this.detalle();
    const id = d?.id ?? this.pendienteId;
    if (!cid || !id) return;
    this.cargandoDetalle.set(true);
    try {
      const det = await this.api.detalle(cid, id);
      this.detalle.set(det);
      this.cambios = {
        frase: det.frase ?? '', bio: det.bio ?? '', instagram: det.instagram ?? '', club: det.club ?? '', ciudad: det.ciudad ?? '',
        entrenador: det.entrenador ?? '', marcaSQ: det.marcaSQ ?? null, marcaBP: det.marcaBP ?? null, marcaDL: det.marcaDL ?? null,
      };
      this.conflicto.set('');
      this.error.set('');
      this.avisarWhatsApp.set((det.consentimientos ?? []).some((c) => this.casillaDe(c.casilla) === 'whatsapp' && c.aceptado));
      if (this.fotoUrl()) {
        URL.revokeObjectURL(this.fotoUrl()!);
        this.fotoUrl.set(null);
      }
      if (det.fotoMiniatura) {
        try {
          const blob = await this.api.foto(cid, id);
          this.fotoUrl.set(URL.createObjectURL(blob));
        } catch {
          this.fotoUrl.set(null);
        }
      }
    } catch (e) {
      this.error.set(errText(e, 'No se pudo abrir la solicitud.'));
    } finally {
      this.cargandoDetalle.set(false);
    }
  }

  /** Esc closes the enlarged photo first, then the review (a confirmation dialog closes itself). */
  protected onEscape(e: Event): void {
    if (this.ampliada()) {
      this.ampliada.set(false);
      e.stopImmediatePropagation();
      return;
    }
    if (this.dialogo() || (e.target as Element | null)?.closest?.('bo-solicitudes-dialogo')) return;
    if (this.abierto()) this.cerrar();
  }

  private pendienteId = '';

  protected cerrar(push = true): void {
    if (push && this.idDeUrl(this.location.path())) this.location.go(this.urlLista());
    this.abierto.set(false);
    this.detalle.set(null);
    this.dialogo.set(null);
    this.ampliada.set(false);
    if (this.fotoUrl()) {
      URL.revokeObjectURL(this.fotoUrl()!);
      this.fotoUrl.set(null);
    }
  }

  // ---------------------------------------------------------------- fields

  protected resumen(): FilaCampo[] {
    const d = this.detalle();
    if (!d) return [];
    return ['email', 'licencia', 'prueba', 'club', 'marcas'].map((c) => this.fila(c));
  }

  protected campos(): FilaCampo[] {
    const d = this.detalle();
    if (!d) return [];
    return CAMPOS.map((c) => this.fila(c.clave));
  }

  private fila(clave: string): FilaCampo {
    const d = this.detalle()!;
    // The API sends the technical key («clave») and the label («campo»): the panel keys on the first one.
    const difs = d.diferencias ?? [];
    const dif = difs.find((x) => x.clave === clave);
    const nuevo = this.valorCampo(clave, d);
    let actual = dif?.actual ?? '';
    let tipo: 'igual' | 'distinto' | 'nuevo';
    if (clave === 'marcas') {
      // The summary of the three marks: the worst of the three.
      const tres = ['marcaSQ', 'marcaBP', 'marcaDL'].map((k) => difs.find((x) => x.clave === k)).filter((x): x is Diferencia => !!x);
      actual = tres.map((x) => x.actual).filter(Boolean).join(' · ');
      tipo = !tres.length ? 'nuevo' : tres.some((x) => x.tipo === 'distinto') ? 'distinto' : tres.some((x) => x.tipo === 'nuevo') ? 'nuevo' : 'igual';
    } else {
      // With a current value the field is never «nuevo».
      tipo = actual === '' ? 'nuevo' : dif?.tipo === 'igual' || actual === nuevo ? 'igual' : 'distinto';
    }
    const etiqueta = dif?.campo || (clave === 'marcas' ? 'Mejores marcas' : (CAMPOS.find((c) => c.clave === clave)?.etiqueta ?? clave));
    if (clave === 'prueba') {
      // The competition is not compared: it is copied to the athlete on approval (Figma «SE COPIA AL APROBAR»).
      return { clave, etiqueta, nuevo, actual, tipo, l: 'SE COPIA AL APROBAR', tone: 'neutral' };
    }
    return {
      clave, etiqueta, nuevo, actual, tipo,
      l: tipo === 'igual' ? 'IGUAL' : tipo === 'distinto' ? 'DISTINTO' : 'NUEVO',
      tone: (tipo === 'igual' ? 'neutral' : tipo === 'distinto' ? 'warning' : 'danger') as GrTone,
    };
  }

  private valorCampo(clave: string, d: SolicitudDetalle): string {
    const v = (d as unknown as Record<string, unknown>)[clave];
    switch (clave) {
      case 'marcas':
        return d.marcaSQ === null && d.marcaBP === null && d.marcaDL === null ? '' : `SQ ${d.marcaSQ ?? '—'} · BP ${d.marcaBP ?? '—'} · DL ${d.marcaDL ?? '—'}`;
      case 'marcaSQ': case 'marcaBP': case 'marcaDL':
        return v === null || v === undefined || v === '' ? '' : `${v} kg`;
      case 'fechaNacimiento':
        return v ? this.fechaLarga(String(v)) : '';
      case 'prueba':
        return v === 'aep2' ? 'AEP-2' : v === 'aep3' ? 'AEP-3' : 'Aún no lo sabe';
      case 'sexo':
        return v === 'F' ? 'F' : v === 'M' ? 'M' : '';
      case 'instagram':
        return v ? String(v) : '';
      default:
        return v === null || v === undefined ? '' : String(v);
    }
  }

  private fechaLarga(iso: string): string {
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }).format(d);
  }

  /** The athlete authorised publishing their name, data and photo (the profile can be public). */
  protected imagenAceptada(): boolean {
    return this.consentimientos().some((c) => c.clave === 'imagen' && c.aceptado);
  }

  /** The profile goes public on approval: image consent and not a minor (as the backend decides). */
  protected publicable(): boolean {
    return this.imagenAceptada() && !this.detalle()?.esMenor;
  }

  protected consentimientos(): FilaConsentimiento[] {
    const d = this.detalle();
    if (!d) return [];
    const lista: Consentimiento[] = d.consentimientos ?? [];
    return CONSENTIMIENTOS.map((c) => {
      const guardado = lista.find((x) => this.casillaDe(x.casilla) === c.clave);
      const version = guardado?.version ? ' · ' + guardado.version : '';
      const fecha = guardado?.at ? ' · ' + this.fechaHora(guardado.at) : '';
      const ip = guardado?.ip ? ' · IP ' + guardado.ip : '';
      return {
        clave: c.clave,
        texto: c.texto,
        aceptado: !!guardado?.aceptado,
        prueba: guardado?.aceptado ? `${c.etiqueta}${version}${fecha}${ip}` : `${c.etiqueta}${version} · no aceptado`,
      };
    });
  }

  private casillaDe(casilla: string): string {
    const c = (casilla ?? '').toLowerCase();
    if (c.includes('whatsapp')) return 'whatsapp';
    if (c.includes('novedad')) return 'novedades';
    if (c.includes('imagen') || c.includes('consentimiento')) return 'imagen';
    if (c.includes('privacidad')) return 'privacidad';
    return 'terminos';
  }

  private fechaHora(iso: string): string {
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).formatToParts(d);
    const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
    return `${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
  }

  // ---------------------------------------------------------------- actions

  protected async marcarRevision(): Promise<void> {
    const d = this.detalle();
    if (!d || this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.api.marcar(this.cid(), d.id, d.version, 'revision');
      this.toasts.success('Marcada en revisión');
      this.cerrar();
      await this.cargar();
    } catch (e) {
      this.gestionarError(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async aprobar(): Promise<void> {
    const d = this.detalle();
    if (!d || this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set('');
    this.sinPlazas.set('');
    try {
      const cambios = this.cambiosCorregidos(d);
      const destino = this.destinoAprueba();
      const res = await this.api.aprobar(this.cid(), d.id, d.version, {
        ...destino.cuerpo, cambios, avisarEmail: this.avisarEmail(), avisarWhatsApp: this.avisarWhatsApp(),
      });
      this.dialogo.set(null);
      this.toasts.success(res.publica ? 'Aprobada y publicada' : 'Aprobada · ficha privada', this.avisarEmail() ? `Le hemos escrito a ${d.email}.` : '');
      await this.cargar();
      await this.recargarDetalle();
    } catch (e) {
      this.gestionarError(e);
      this.dialogo.set(null);
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Where the approval will link the request: the chosen athlete, the linked one or a new one. */
  protected destinoAprueba(): { texto: string; cuerpo: { atletaId?: string; nuevo?: boolean } } {
    const d = this.detalle();
    const elegido = this.atletaElegido();
    if (elegido) {
      const c = this.candidatos().find((x) => x.id === elegido);
      const nombre = c?.nombre ?? elegido;
      return { texto: `Se actualizará el atleta ${nombre}${c?.licencia ? ' · ' + c.licencia : ''}`, cuerpo: { atletaId: elegido } };
    }
    if (this.nuevoAtleta() || !d?.atleta) {
      return { texto: `Se creará un atleta nuevo (${d ? this.nombreCompleto(d) : 'la solicitud'})`, cuerpo: { nuevo: true } };
    }
    return {
      texto: `Se actualizará el atleta enlazado (${d.atleta.nombre}${d.atleta.licencia ? ' · ' + d.atleta.licencia : ''})`,
      cuerpo: { atletaId: d.atleta.id },
    };
  }

  /** Only the fields the reviewer actually changed. */
  private cambiosCorregidos(d: SolicitudDetalle): Record<string, string | number | null> {
    const out: Record<string, string | number | null> = {};
    const pares: [string, string | number | null, string | number | null][] = [
      ['frase', this.cambios.frase, d.frase], ['bio', this.cambios.bio, d.bio], ['instagram', this.cambios.instagram, d.instagram],
      ['club', this.cambios.club, d.club], ['ciudad', this.cambios.ciudad, d.ciudad], ['entrenador', this.cambios.entrenador, d.entrenador],
      ['marcaSQ', this.cambios.marcaSQ, d.marcaSQ], ['marcaBP', this.cambios.marcaBP, d.marcaBP], ['marcaDL', this.cambios.marcaDL, d.marcaDL],
    ];
    for (const [k, nuevo, original] of pares) {
      const a = (nuevo ?? '').toString().trim();
      const b = (original ?? '').toString().trim();
      if (a !== b) out[k] = nuevo === '' ? null : nuevo;
    }
    return out;
  }

  protected async rechazar(motivo: string): Promise<void> {
    const d = this.detalle();
    if (!d || this.ocupado() || motivo.length < 3) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.api.rechazar(this.cid(), d.id, d.version, { motivo, avisarEmail: this.avisarEmail(), avisarWhatsApp: this.avisarWhatsApp() });
      this.dialogo.set(null);
      this.toasts.success('Solicitud rechazada', this.avisarEmail() ? `Le hemos escrito a ${d.email}.` : '');
      await this.cargar();
      await this.recargarDetalle();
    } catch (e) {
      this.gestionarError(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async borrar(): Promise<void> {
    const d = this.detalle();
    // Double click sends one DELETE only (U33-R1-7).
    if (!d || this.ocupado()) return;
    this.ocupado.set(true);
    try {
      await this.api.borrar(this.cid(), d.id);
      this.dialogo.set(null);
      this.toasts.success('Solicitud borrada');
      this.cerrar();
      await this.cargar();
    } catch (e) {
      this.error.set(errText(e, 'No se pudo borrar.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async subirAutorizacion(ev: Event): Promise<void> {
    const d = this.detalle();
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!d || !f) return;
    this.subiendo.set(true);
    try {
      await this.api.subirAutorizacion(this.cid(), d.id, f);
      this.toasts.success('Autorización subida');
      await this.recargarDetalle();
    } catch (e) {
      this.error.set(errText(e, 'No se pudo subir la autorización.'));
    } finally {
      this.subiendo.set(false);
    }
  }

  protected async verAutorizacion(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    const ventana = window.open('', '_blank');
    try {
      const blob = await this.api.autorizacion(this.cid(), d.id);
      const url = URL.createObjectURL(blob);
      if (ventana) ventana.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      ventana?.close();
      this.toasts.error('No se pudo abrir la autorización', errText(e));
    }
  }

  protected async buscarEnlace(v: string): Promise<void> {
    this.qEnlace.set(v);
    clearTimeout(this.tEnlace);
    this.tEnlace = setTimeout(async () => {
      if (this.qEnlace().trim().length < 2) {
        this.candidatos.set([]);
        return;
      }
      try {
        this.candidatos.set(await this.api.candidatos(this.cid(), this.qEnlace().trim()));
      } catch {
        this.candidatos.set([]);
      }
    }, 300);
  }

  protected async enlazar(c: Candidato): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    this.ocupado.set(true);
    try {
      await this.api.enlazar(this.cid(), d.id, d.version, { atletaId: c.id });
      this.atletaElegido.set(c.id);
      this.nuevoAtleta.set(false);
      this.toasts.success('Atleta enlazado');
      await this.recargarDetalle();
      await this.cargar();
    } catch (e) {
      this.gestionarError(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async crearNuevo(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    this.ocupado.set(true);
    this.nuevoAtleta.set(true);
    this.atletaElegido.set(null);
    try {
      await this.api.enlazar(this.cid(), d.id, d.version, { nuevo: true });
      this.toasts.success('Se creará un atleta nuevo al aprobar');
      await this.recargarDetalle();
      await this.cargar();
    } catch (e) {
      this.gestionarError(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  protected correoAutorizacion(): string {
    const d = this.detalle();
    const asunto = encodeURIComponent('Autorización para la GR Cup 2026');
    const cuerpo = encodeURIComponent('Hola,\n\nPara publicar tu ficha de atleta en la GR Cup 2026 necesitamos la autorización firmada de madre, padre o tutor.\n\nGracias.');
    return `mailto:${d?.email ?? ''}?subject=${asunto}&body=${cuerpo}`;
  }

  /** 409 (already reviewed) and 412 (edited meanwhile) are shown inside the panel. */
  private gestionarError(e: unknown): void {
    const p = problemOf(e);
    if (p.code === 'INSCRIPCION_COMPLETA') {
      this.sinPlazas.set(errText(e, 'No quedan plazas.'));
      this.error.set('');
      void this.cuposCmp()?.cargarCupos();
      return;
    }
    if (p.code === 'CONFLICTO_EDICION' || p.code === 'YA_REVISADA') {
      this.conflicto.set(p.code === 'YA_REVISADA'
        ? 'Otro revisor ya ha resuelto esta solicitud. Tus cambios no se guardarán.'
        : 'Otra persona ha guardado esta solicitud mientras la editabas. Tus cambios no se guardarán.');
      this.error.set('');
      return;
    }
    this.error.set(errText(e, 'No se pudo guardar.'));
  }

  protected async exportar(): Promise<void> {
    const items = this.visibles();
    if (!items.length) return;
    this.exporting.set(true);
    try {
      const esc = (x: string) => {
        // Public-form values must stay text in Excel/LibreOffice, even when they start with a formula prefix.
        const safe = /^[=+\-@\t\r]/.test(x ?? '') ? `'${x}` : (x ?? '');
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const filas = [
        ['Nombre', 'Email', 'Club', 'Edad', 'Coincidencia', 'Estado', 'Recibida'],
        ...items.map((s) => [this.nombreCompleto(s), s.email, s.club, String(s.edad), MATCH[s.match], s.estado, s.createdAt]),
      ];
      const blob = new Blob(['﻿' + filas.map((f) => f.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'solicitudes-de-atleta.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      this.exporting.set(false);
    }
  }
}
