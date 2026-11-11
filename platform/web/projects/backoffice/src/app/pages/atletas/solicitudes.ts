import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrField, GrIcon, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts, fmtAgo, type GrTone } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { problemOf } from '../../core/api';
import { BoDrawer, BoPageHeader, BoToggle, errText } from '../../shared/ui';
import {
  SolicitudesApi,
  type Candidato, type CupoPrueba, type Consentimiento, type Diferencia, type EstadoSolicitud, type SolicitudDetalle, type SolicitudItem, type SolicitudLista, type TipoMatch,
} from './solicitudes-api';

type Pestana = 'todas' | 'pendiente' | 'revision' | 'menor' | 'aprobada' | 'rechazada';
type Dialogo = 'aprobar' | 'rechazar' | 'borrar' | null;

/** The 18 fields of the public form, in the order of the review panel. */
const CAMPOS: { clave: string; etiqueta: string }[] = [
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'apellidos', etiqueta: 'Apellidos' },
  { clave: 'email', etiqueta: 'Email' },
  { clave: 'telefono', etiqueta: 'Teléfono móvil' },
  { clave: 'sexo', etiqueta: 'Sexo' },
  { clave: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento' },
  { clave: 'licencia', etiqueta: 'Licencia AEP' },
  { clave: 'club', etiqueta: 'Club' },
  { clave: 'ciudad', etiqueta: 'Ciudad' },
  { clave: 'entrenador', etiqueta: 'Entrenador/a' },
  { clave: 'prueba', etiqueta: 'Competición' },
  { clave: 'frase', etiqueta: 'Frase del perfil' },
  { clave: 'bio', etiqueta: 'Sobre ti' },
  { clave: 'instagram', etiqueta: 'Instagram' },
  { clave: 'historial', etiqueta: 'Historial' },
  { clave: 'marcaSQ', etiqueta: 'Marca SQ' },
  { clave: 'marcaBP', etiqueta: 'Marca BP' },
  { clave: 'marcaDL', etiqueta: 'Marca DL' },
];

/** The 5 consent boxes of the public form, with the legal text each one proves. */
const CONSENTIMIENTOS: { clave: string; texto: string; etiqueta: string }[] = [
  { clave: 'terminos', texto: 'Acepto los términos de uso y el reglamento', etiqueta: 'Términos y reglamento' },
  { clave: 'privacidad', texto: 'He leído la política de privacidad y acepto el tratamiento de mis datos', etiqueta: 'Política de privacidad' },
  { clave: 'imagen', texto: 'Autorizo publicar mi nombre, datos deportivos y foto', etiqueta: 'Consentimiento de datos e imagen' },
  { clave: 'novedades', texto: 'Quiero recibir novedades de la GR Cup por email', etiqueta: 'Novedades por email' },
  { clave: 'whatsapp', texto: 'Quiero recibir avisos de mi alta y de la competición por WhatsApp', etiqueta: 'Avisos por WhatsApp' },
];

/** Text and tone of the match badge of a row. */
const MATCH: Record<TipoMatch, string> = { licencia: 'Licencia', email: 'Email', nombre: 'Sugerida', manual: 'Enlazado', '': 'Sin coincidencia' };
const MATCH_TONE: Record<TipoMatch, GrTone> = { licencia: 'success', email: 'info', nombre: 'warning', manual: 'info', '': 'neutral' };

/** The 18 fields of the form, with the value declared by the athlete and the difference with the linked athlete. */
interface FilaCampo {
  clave: string;
  etiqueta: string;
  nuevo: string;
  actual: string;
  tipo: 'igual' | 'distinto' | 'nuevo';
  l: string;
  tone: GrTone;
}
interface FilaConsentimiento {
  clave: string;
  texto: string;
  aceptado: boolean;
  prueba: string;
}

/**
 * «Atletas › Solicitudes» (Figma D3): the requests sent from the public form, reviewed by hand before
 * the athlete is created. Live over the admin SSE channel: a new request appears on its own, highlighted.
 */
@Component({
  selector: 'bo-solicitudes',
  imports: [A11yModule, FormsModule, RouterLink, BoDrawer, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrField, GrIcon, GrInput, GrKpi, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Solicitudes de atleta" subtitle="Altas enviadas desde el formulario público · se revisan a mano antes de publicar"
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
              class="relative flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-label-s whitespace-nowrap md:h-11 md:gap-2 md:rounded-none md:border-0 md:px-3"
              [class]="pestana() === t.k ? 'border-accent-text text-accent-text md:text-text-primary' : 'border-line-strong text-text-tertiary md:hover:text-text-primary'">
              {{ t.l }}
              <span class="md:hidden">·</span>
              <span class="text-mono-xs md:rounded-2xs md:px-1.5" [class]="destacado(t.k) ? 'bg-accent-deep/50 text-accent-text' : 'text-text-secondary md:bg-bg-raised'">{{ contador(t.k) }}</span>
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
          <div class="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <gr-kpi label="Pendientes de revisar" [value]="n(pendientes())" [delta]="deltaNuevas()" [caption]="(l.kpis?.pendientesHoy ?? 0) + ' nuevas hoy'" />
            <gr-kpi label="En revisión" [value]="n(contador('revision'))" caption="sin asignar" />
            <gr-kpi label="Aprobadas" [value]="n(contador('aprobada'))" [caption]="(l.kpis?.aprobadasHoy ?? 0) + ' hoy'" />
            <gr-kpi label="Rechazadas" [value]="n(contador('rechazada'))" caption="se borran a los 30 días" />
          </div>

          @if (cupos().length) {
            <section class="flex flex-wrap items-end gap-4 rounded-lg border border-line-subtle bg-bg-card p-5" aria-labelledby="cupos-t">
              <div class="flex min-w-0 basis-full flex-col gap-1 md:basis-auto md:flex-1">
                <h2 id="cupos-t" class="text-ui-h5">Cupo por competición</h2>
                <p class="text-body-xs text-text-tertiary">Plazas del formulario de alta. Sin cupo propio se reparten las plazas totales entre las competiciones. Una competición llena se muestra «Completa» y no se puede elegir.</p>
              </div>
              @for (c of cupos(); track c.codigo) {
                <label class="flex w-36 flex-col gap-1.5">
                  <span class="text-label-s">{{ c.nombre }} · {{ c.ocupadas }} ocupadas</span>
                  <input grInput type="number" min="0" max="100000" [disabled]="!puede()" [ngModel]="cupoEdit()[c.codigo]"
                    (ngModelChange)="ponCupo(c.codigo, $event)" [attr.aria-describedby]="c.porDefecto ? 'cupo-def-' + c.codigo : null" />
                  @if (c.porDefecto) { <span [id]="'cupo-def-' + c.codigo" class="text-body-xs text-text-tertiary">Por defecto</span> }
                </label>
              }
              @if (puede()) {
                <button grButton variant="secondary" type="button" [loading]="guardandoCupos()" [disabled]="guardandoCupos()" (click)="guardarCupos()">Guardar cupos</button>
              }
            </section>
          }

          <div class="flex flex-wrap items-center gap-2">
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
            <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
              <!-- Desktop -->
              <table class="hidden w-full table-fixed text-left lg:table">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                  <tr>
                    <th class="px-4 py-3 font-normal">Atleta</th>
                    <th class="w-40 px-3 py-3 font-normal">Coincidencia</th>
                    <th class="w-48 px-3 py-3 font-normal">Club</th>
                    <th class="w-20 px-3 py-3 font-normal">Edad</th>
                    <th class="w-28 px-3 py-3 font-normal">Recibida</th>
                    <th class="w-56 px-3 py-3 font-normal">Estado</th>
                    <th class="w-12"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of visibles(); track s.id) {
                    <tr [class]="claseFila(s)" (click)="revisar(s)">
                      <td class="relative px-4 py-3">
                        @if (resaltado(s.id)) { <span class="absolute inset-y-0 left-0 w-[3px] bg-success" aria-hidden="true"></span> }
                        <span class="flex items-center gap-3">
                          @if (miniatura(s.id); as url) { <img [src]="url" alt="" class="h-12 w-10 shrink-0 rounded-xs bg-bg-raised object-cover" loading="lazy" /> }
                          @else { <span class="flex h-12 w-10 shrink-0 items-center justify-center rounded-xs bg-bg-raised text-text-tertiary"><gr-icon name="user" [size]="18" /></span> }
                          <span class="min-w-0"><span class="block truncate text-label-s">{{ nombreCompleto(s) }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ s.email }}</span></span>
                        </span>
                      </td>
                      <td class="px-3 py-3"><gr-badge [tone]="matchTone(s.match)">{{ match(s.match) }}</gr-badge></td>
                      <td class="truncate px-3 py-3 text-body-s">{{ s.club || 'Independiente' }}</td>
                      <td class="px-3 py-3 text-body-s">{{ s.edad }}</td>
                      <td class="px-3 py-3 text-body-s">{{ hace(s.createdAt) }}</td>
                      <td class="px-3 py-3"><gr-badge [tone]="estado(s).tone">{{ estado(s).l }}</gr-badge></td>
                      <td class="px-2 py-3"><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></td>
                    </tr>
                  }
                </tbody>
              </table>

              <!-- Tablet -->
              <table class="hidden w-full table-fixed text-left md:table lg:hidden">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                  <tr>
                    <th class="px-4 py-3 font-normal">Atleta</th>
                    <th class="w-40 px-3 py-3 font-normal">Coincidencia</th>
                    <th class="w-28 px-3 py-3 font-normal">Recibida</th>
                    <th class="w-48 px-3 py-3 font-normal">Estado</th>
                    <th class="w-10"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of visibles(); track s.id) {
                    <tr [class]="claseFila(s)" (click)="revisar(s)">
                      <td class="relative px-4 py-3">
                        @if (resaltado(s.id)) { <span class="absolute inset-y-0 left-0 w-[3px] bg-success" aria-hidden="true"></span> }
                        <span class="flex items-center gap-3">
                          @if (miniatura(s.id); as url) { <img [src]="url" alt="" class="h-12 w-10 shrink-0 rounded-xs bg-bg-raised object-cover" loading="lazy" /> }
                          @else { <span class="flex h-12 w-10 shrink-0 items-center justify-center rounded-xs bg-bg-raised text-text-tertiary"><gr-icon name="user" [size]="18" /></span> }
                          <span class="min-w-0"><span class="block truncate text-label-s">{{ nombreCompleto(s) }}</span>
                            <span class="block truncate text-body-xs text-text-tertiary">{{ s.club || 'Independiente' }} · {{ s.edad }} años</span></span>
                        </span>
                      </td>
                      <td class="px-3 py-3"><gr-badge [tone]="matchTone(s.match)">{{ match(s.match) }}</gr-badge></td>
                      <td class="px-3 py-3 text-body-s">{{ hace(s.createdAt) }}</td>
                      <td class="px-3 py-3"><gr-badge [tone]="estado(s).tone">{{ estado(s).l }}</gr-badge></td>
                      <td class="px-2 py-3"><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></td>
                    </tr>
                  }
                </tbody>
              </table>

              <!-- Mobile -->
              <ul class="flex flex-col md:hidden">
                @for (s of visibles(); track s.id) {
                  <li class="border-b border-line-subtle p-4 last:border-0" [class.bg-success/10]="resaltado(s.id)">
                    <button type="button" class="flex w-full items-start gap-3 text-left" (click)="revisar(s)">
                      @if (miniatura(s.id); as url) { <img [src]="url" alt="" class="h-12 w-10 shrink-0 rounded-xs bg-bg-raised object-cover" loading="lazy" /> }
                      @else { <span class="flex h-12 w-10 shrink-0 items-center justify-center rounded-xs bg-bg-raised text-text-tertiary"><gr-icon name="user" [size]="18" /></span> }
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-label-m">{{ nombreCompleto(s) }}</span>
                        <span class="block truncate text-body-xs text-text-tertiary">{{ s.email }}</span>
                        <span class="block truncate text-body-xs text-text-tertiary">{{ s.club || 'Independiente' }} · {{ s.edad }} años · {{ hace(s.createdAt) }}</span>
                      </span>
                    </button>
                    <div class="mt-3 flex flex-wrap gap-1">
                      <gr-badge [tone]="matchTone(s.match)">{{ match(s.match) }}</gr-badge>
                      <gr-badge [tone]="estado(s).tone">{{ estado(s).l }}</gr-badge>
                    </div>
                    <button grButton class="mt-3" [block]="true" (click)="revisar(s)">Revisar solicitud</button>
                  </li>
                }
              </ul>

              <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">
                <span>Mostrando {{ desde() }}–{{ hasta() }} de {{ l.total }}</span>
                @if (paginas() > 1) {
                  <nav class="flex items-center gap-1" aria-label="Páginas">
                    <button type="button" class="flex size-9 items-center justify-center rounded-sm border border-line-strong disabled:opacity-40" [disabled]="pagina() === 1" (click)="recargar(pagina() - 1)" aria-label="Anterior"><gr-icon name="chevron-left" [size]="14" /></button>
                    <span class="px-1">{{ pagina() }} / {{ paginas() }}</span>
                    <button type="button" class="flex size-9 items-center justify-center rounded-sm border border-line-strong disabled:opacity-40" [disabled]="pagina() >= paginas()" (click)="recargar(pagina() + 1)" aria-label="Siguiente"><gr-icon name="chevron-right" [size]="14" /></button>
                  </nav>
                }
              </footer>
            </section>
          }
        }
      }
    </div>

    <!-- ===== Review (drawer) ===== -->
    <bo-drawer [(open)]="abierto" [title]="detalle() ? nombreCompleto(detalle()!) : 'Revisar solicitud'" [badge]="detalle() ? estado(detalle()!).l : ''" [badgeTone]="detalle() ? estado(detalle()!).tone : 'warning'">
      @if (detalle(); as d) {
        <div class="flex flex-col gap-5">
          <p class="text-body-xs text-text-tertiary">Solicitud recibida {{ hace(d.createdAt) }} desde el formulario de alta</p>

          <div class="flex flex-wrap gap-1">
            <gr-badge [tone]="estado(d).tone">{{ estado(d).l }}</gr-badge>
            <gr-badge [tone]="matchTone(d.match)">{{ match(d.match) }}</gr-badge>
          </div>

          @if (conflicto()) {
            <gr-alert tone="warning" title="Conflicto de edición">
              {{ conflicto() }}
              <button alertAction type="button" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text" (click)="recargarDetalle()">Refrescar <gr-icon name="arrow-right" [size]="14" /></button>
            </gr-alert>
          }
          @if (d.estado === 'aprobada') {
            <gr-alert tone="success" title="Aprobada y publicada">Perfil creado y foto publicada · enlace de acceso enviado al área de atleta.</gr-alert>
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

          <section class="flex gap-4">
            @if (foto(); as url) {
              <img [src]="url" [alt]="'Foto de ' + nombreCompleto(d)" class="h-[300px] w-[240px] max-w-full rounded-md bg-bg-raised object-contain" />
            } @else {
              <span class="flex h-[300px] w-[240px] max-w-full items-center justify-center rounded-md bg-bg-raised text-text-tertiary"><gr-icon name="camera" [size]="24" /></span>
            }
            <div class="min-w-0 flex-1">
              <p class="text-body-xs text-text-tertiary">Foto tal como se publicará</p>
              @if (foto()) {
                <button type="button" class="mt-1 text-label-s text-accent-text hover:underline" (click)="ampliada.set(true)">Ampliar foto</button>
              }
              <p class="mt-3 text-body-xs text-text-tertiary">Se publica en la ficha del atleta con su nombre y sus marcas.</p>
            </div>
          </section>

          <section>
            <h3 class="text-label-xs text-text-muted uppercase">Datos declarados vs atleta enlazado</h3>
            @if (!verTodos()) {
              <dl class="mt-2 flex flex-col gap-1.5">
                @for (f of resumen(); track f.clave) {
                  <div class="flex items-center justify-between gap-3 rounded-sm bg-bg-raised px-3 py-2">
                    <dt class="shrink-0 text-body-xs text-text-tertiary">{{ f.etiqueta }}</dt>
                    <dd class="flex min-w-0 items-center gap-2"><span class="truncate text-body-s">{{ f.nuevo || '—' }}</span><gr-badge [tone]="f.tone">{{ f.l }}</gr-badge></dd>
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
              <gr-field label="Frase del perfil" hint="Aparece en su ficha pública">
                <input grInput maxlength="80" [ngModel]="cambios.frase" (ngModelChange)="cambios.frase = $event" />
              </gr-field>
              <gr-field label="Sobre ti" hint="Máximo 280 caracteres">
                <textarea grInput rows="3" maxlength="280" [ngModel]="cambios.bio" (ngModelChange)="cambios.bio = $event"></textarea>
              </gr-field>
              <div class="grid gap-4 sm:grid-cols-2">
                <gr-field label="Instagram" hint="Oculto en menores de edad">
                  <input grInput maxlength="30" [ngModel]="cambios.instagram" (ngModelChange)="cambios.instagram = $event" />
                </gr-field>
                <gr-field label="Club">
                  <input grInput [ngModel]="cambios.club" (ngModelChange)="cambios.club = $event" />
                </gr-field>
                <gr-field label="Ciudad" hint="Del formulario">
                  <input grInput [ngModel]="cambios.ciudad" (ngModelChange)="cambios.ciudad = $event" />
                </gr-field>
                <gr-field label="Entrenador/a" hint="Opcional">
                  <input grInput [ngModel]="cambios.entrenador" (ngModelChange)="cambios.entrenador = $event" />
                </gr-field>
              </div>
              <div class="grid gap-4 sm:grid-cols-3">
                <gr-field label="Marca SQ" hint="Paso 0,5 kg">
                  <input grInput type="number" step="0.5" min="0" max="600" [ngModel]="cambios.marcaSQ" (ngModelChange)="cambios.marcaSQ = $event" />
                </gr-field>
                <gr-field label="Marca BP" hint="Paso 0,5 kg">
                  <input grInput type="number" step="0.5" min="0" max="600" [ngModel]="cambios.marcaBP" (ngModelChange)="cambios.marcaBP = $event" />
                </gr-field>
                <gr-field label="Marca DL" hint="Paso 0,5 kg">
                  <input grInput type="number" step="0.5" min="0" max="600" [ngModel]="cambios.marcaDL" (ngModelChange)="cambios.marcaDL = $event" />
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
      <ng-container drawerActions>
        @if (detalle(); as d) {
          @if (d.estado === 'aprobada') {
            <button grButton (click)="cerrar()">Cerrar</button>
            <a grButton variant="primary" [routerLink]="['/', comps.current()?.slug, 'atletas', d.atletaId]">Ver ficha del atleta</a>
          } @else if (d.estado === 'rechazada') {
            <button grButton (click)="cerrar()">Cerrar</button>
            <button grButton variant="danger" [disabled]="ocupado()" (click)="dialogo.set('borrar')">Borrar…</button>
            <p class="w-full text-body-xs text-text-tertiary">Borrar elimina solicitud, foto privada y consentimientos · confirmación en dos pasos</p>
          } @else {
            <button grButton variant="ghost" [disabled]="ocupado()" (click)="marcarRevision()">Marcar en revisión</button>
            <button grButton variant="danger" [disabled]="ocupado()" (click)="dialogo.set('rechazar')">Rechazar…</button>
            <button grButton variant="primary" [disabled]="ocupado() || bloqueadoAprobar()" (click)="dialogo.set('aprobar')">Aprobar y publicar</button>
            @if (bloqueadoAprobar()) { <p class="w-full text-body-xs text-warning">Aprobar se desbloquea al subir la autorización firmada.</p> }
          }
        }
      </ng-container>
    </bo-drawer>

    <!-- ===== Photo (full screen) ===== -->
    @if (ampliada() && foto(); as url) {
      <div class="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 p-4" (click)="ampliada.set(false)">
        <img [src]="url" [alt]="'Foto de ' + (detalle() ? nombreCompleto(detalle()!) : '')" class="max-h-[78vh] max-w-[92vw] rounded-md object-contain" (click)="$event.stopPropagation()" />
        <p class="mt-4 text-body-s text-white/85">Foto tal como se publicará · {{ detalle() ? nombreCompleto(detalle()!) : '' }}</p>
        <p class="text-body-xs text-white/50">Cierra con la tecla Esc o tocando fuera de la foto</p>
      </div>
    }

    <!-- ===== Approve ===== -->
    @if (dialogo() === 'aprobar') {
      <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" (click)="dialogo.set(null)" (keydown.escape)="dialogo.set(null)">
        <div class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Aprobar y publicar"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">Aprobar y publicar</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="dialogo.set(null)"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">{{ destinoAprueba().texto }} y se publicará su perfil con la foto en blanco y negro.</p>
          <div class="mt-5 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por email</span><span class="block text-body-xs text-text-tertiary">Le llegará un email con el enlace a su ficha y el acceso a su área de atleta</span></span>
            <bo-toggle [(value)]="avisarEmail" label="Avisar por email" />
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por WhatsApp</span><span class="block text-body-xs text-text-tertiary">Solo si el atleta lo consintió · con el número de la competición vinculado</span></span>
            <bo-toggle [(value)]="avisarWhatsApp" label="Avisar por WhatsApp" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="dialogo.set(null)">Cancelar</button>
            <button grButton variant="primary" [loading]="ocupado()" (click)="aprobar()">Aprobar y publicar</button>
          </div>
        </div>
      </div>
    }

    <!-- ===== Reject ===== -->
    @if (dialogo() === 'rechazar') {
      <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" (click)="dialogo.set(null)" (keydown.escape)="dialogo.set(null)">
        <div class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Rechazar solicitud"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">Rechazar solicitud</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="dialogo.set(null)"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">Explica el motivo (mínimo 3 caracteres): queda en el registro de auditoría y se borra la foto privada.</p>
          <div class="mt-4">
            <gr-field label="Motivo (obligatorio)" [error]="motivoError()">
              <textarea grInput rows="3" maxlength="400" [ngModel]="motivo" (ngModelChange)="motivo = $event" placeholder="p. ej. Los datos de club y licencia no coinciden con la AEP"></textarea>
            </gr-field>
            <p class="mt-1 text-body-xs text-text-tertiary">Mínimo 3 caracteres · el motivo queda en el registro de auditoría</p>
          </div>
          <div class="mt-4 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por email</span><span class="block text-body-xs text-text-tertiary">Le llegará un email con el motivo del rechazo</span></span>
            <bo-toggle [(value)]="avisarEmail" label="Avisar del rechazo por email" />
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por WhatsApp</span><span class="block text-body-xs text-text-tertiary">Solo si el atleta lo consintió · con el número de la competición vinculado</span></span>
            <bo-toggle [(value)]="avisarWhatsApp" label="Avisar del rechazo por WhatsApp" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="dialogo.set(null)">Cancelar</button>
            <button grButton variant="danger" [loading]="ocupado()" [disabled]="motivo.trim().length < 3" (click)="rechazar()">Rechazar solicitud</button>
          </div>
        </div>
      </div>
    }

    <!-- ===== Delete (RGPD) ===== -->
    @if (dialogo() === 'borrar') {
      <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" (click)="dialogo.set(null)" (keydown.escape)="dialogo.set(null)">
        <div class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Borrar solicitud"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">Borrar solicitud de {{ detalle() ? nombreCompleto(detalle()!) : '' }}</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="dialogo.set(null)"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">Se eliminarán la solicitud, la foto privada y los consentimientos. Esta acción no se puede deshacer.</p>
          <div class="mt-4">
            <gr-field label="Escribe BORRAR para confirmar" [error]="borrarError()">
              <input grInput maxlength="6" [ngModel]="borrarTexto" (ngModelChange)="borrarTexto = $event" placeholder="BORRAR" />
            </gr-field>
            <p class="mt-1 text-body-xs text-text-tertiary">La acción queda en el registro de auditoría · la foto se retira también de la web</p>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="dialogo.set(null)">Cancelar</button>
            <button grButton variant="danger" [loading]="ocupado()" [disabled]="borrarTexto.trim().toUpperCase() !== 'BORRAR'" (click)="borrar()">Borrar definitivamente</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class SolicitudesPage {
  private readonly api = inject(SolicitudesApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly live = inject(Realtime);
  private readonly toasts = inject(GrToasts);

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
  protected readonly dialogo = signal<Dialogo>(null);
  protected readonly avisarEmail = signal(true);
  protected readonly avisarWhatsApp = signal(true);
  protected readonly ultimaCarga = signal('');
  protected readonly por = signal(6);
  protected motivo = '';
  protected borrarTexto = '';
  protected cambios = { frase: '', bio: '', instagram: '', club: '', ciudad: '', entrenador: '', marcaSQ: null as number | null, marcaBP: null as number | null, marcaDL: null as number | null };

  protected readonly pestanas: { k: Pestana; l: string }[] = [
    { k: 'todas', l: 'Todas' }, { k: 'pendiente', l: 'Nuevas' }, { k: 'revision', l: 'En revisión' },
    { k: 'menor', l: 'Menor · sin autorización' }, { k: 'aprobada', l: 'Aprobadas' }, { k: 'rechazada', l: 'Rechazadas' },
  ];
  protected readonly kpiEtiquetas = [{ l: 'Pendientes de revisar' }, { l: 'En revisión' }, { l: 'Aprobadas' }, { l: 'Rechazadas' }];
  protected readonly hace = fmtAgo;
  protected readonly match = (m: TipoMatch) => MATCH[m];
  protected readonly matchTone = (m: TipoMatch) => MATCH_TONE[m];

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
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
  protected readonly motivoError = computed(() => (this.dialogo() === 'rechazar' && this.motivo.length > 0 && this.motivo.trim().length < 3 ? 'Escribe al menos 3 caracteres' : null));
  protected readonly borrarError = computed(() => (this.dialogo() === 'borrar' && this.borrarTexto.length > 0 && this.borrarTexto.trim().toUpperCase() !== 'BORRAR' ? 'Escribe BORRAR' : null));

  private t: ReturnType<typeof setTimeout> | undefined;
  private tEnlace: ReturnType<typeof setTimeout> | undefined;

  protected readonly cupos = signal<CupoPrueba[]>([]);
  protected readonly cupoEdit = signal<Record<string, number>>({});
  protected readonly guardandoCupos = signal(false);

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (cid) untracked(() => { void this.cargar(); void this.cargarCupos(); });
    });
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
      if (this.fotoUrl()) URL.revokeObjectURL(this.fotoUrl()!);
    });
  }

  // ---------------------------------------------------------------- data

  private ponCupos(c: CupoPrueba[]): void {
    this.cupos.set(c);
    this.cupoEdit.set(Object.fromEntries(c.map((x) => [x.codigo, x.plazas])));
  }

  protected ponCupo(codigo: string, v: number | string): void {
    this.cupoEdit.update((m) => ({ ...m, [codigo]: Number(v) }));
  }

  async cargarCupos(): Promise<void> {
    try {
      this.ponCupos((await this.api.cupos(this.cid())).cupos);
    } catch {
      this.cupos.set([]);
    }
  }

  async guardarCupos(): Promise<void> {
    const v = this.cupoEdit();
    if (Object.values(v).some((n) => !Number.isInteger(n) || n < 0 || n > 100000)) {
      this.toasts.error('Cupo no válido', 'Escribe un número entero de plazas (0 o más).');
      return;
    }
    this.guardandoCupos.set(true);
    try {
      this.ponCupos((await this.api.guardarCupos(this.cid(), v)).cupos);
      this.toasts.success('Cupos guardados', 'El formulario de alta ya usa las plazas nuevas.');
    } catch (e) {
      this.toasts.error('No se pudieron guardar los cupos', errText(e));
    } finally {
      this.guardandoCupos.set(false);
    }
  }

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

  protected nombreCompleto(s: { nombre: string; apellidos: string }): string {
    return [s.nombre, s.apellidos].filter(Boolean).join(' ');
  }

  protected estado(s: { estado: EstadoSolicitud; esMenor: boolean; autorizacion: boolean }): { l: string; tone: GrTone } {
    if (s.esMenor && !s.autorizacion) return { l: 'Menor · sin autorización', tone: 'warning' };
    if (s.estado === 'revision') return { l: 'En revisión', tone: 'warning' };
    if (s.estado === 'aprobada') return { l: 'Aprobada', tone: 'success' };
    if (s.estado === 'rechazada') return { l: 'Rechazada', tone: 'danger' };
    return { l: 'Nueva', tone: 'danger' };
  }

  protected claseFila(s: { id: string }): string {
    const base = 'cursor-pointer border-b border-line-subtle last:border-0';
    return this.resaltado(s.id) ? `${base} bg-success/10` : `${base} hover:bg-bg-raised/60`;
  }

  protected resaltado(id: string): boolean {
    return this.nuevas().has(id);
  }

  protected miniatura(id: string): string | undefined {
    return this.miniaturas()[id];
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

  protected async revisar(s: SolicitudItem): Promise<void> {
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

  /** Esc closes the enlarged photo; the drawer stays open. */
  protected onEscape(e: Event): void {
    if (!this.ampliada()) return;
    this.ampliada.set(false);
    e.stopImmediatePropagation();
  }

  private pendienteId = '';

  protected cerrar(): void {
    this.abierto.set(false);
    this.detalle.set(null);
    if (this.fotoUrl()) {
      URL.revokeObjectURL(this.fotoUrl()!);
      this.fotoUrl.set(null);
    }
  }

  // ---------------------------------------------------------------- fields

  protected resumen(): FilaCampo[] {
    const d = this.detalle();
    if (!d) return [];
    return ['email', 'licencia', 'club', 'marcas'].map((c) => this.fila(c));
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
    if (!d) return;
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
    if (!d) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      const cambios = this.cambiosCorregidos(d);
      const destino = this.destinoAprueba();
      await this.api.aprobar(this.cid(), d.id, d.version, {
        ...destino.cuerpo, cambios, avisarEmail: this.avisarEmail(), avisarWhatsApp: this.avisarWhatsApp(),
      });
      this.dialogo.set(null);
      this.toasts.success('Aprobada y publicada', this.avisarEmail() ? `Le hemos escrito a ${d.email}.` : '');
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

  protected async rechazar(): Promise<void> {
    const d = this.detalle();
    if (!d) return;
    if (this.motivo.trim().length < 3) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.api.rechazar(this.cid(), d.id, d.version, { motivo: this.motivo.trim(), avisarEmail: this.avisarEmail(), avisarWhatsApp: this.avisarWhatsApp() });
      this.dialogo.set(null);
      this.toasts.success('Solicitud rechazada', this.avisarEmail() ? `Le hemos escrito a ${d.email}.` : '');
      this.motivo = '';
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
    if (!d) return;
    if (this.borrarTexto.trim().toUpperCase() !== 'BORRAR') return;
    this.ocupado.set(true);
    try {
      await this.api.borrar(this.cid(), d.id);
      this.dialogo.set(null);
      this.borrarTexto = '';
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
