import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrIcon, GrLogo, GrSkeleton } from '@grcup/ui';
import { Cms, type Album, type Patrocinador } from '../core/cms';
import { COMPETITION_SLUG, type CompeticionPublica } from '../core/competition';
import { DirectoPublic, MOV, ORD, catCorta, catLarga, embed, gl, kg, type Categoria, type Directo, type Edicion, type EnPlataforma, type Fila, type Mov, type Pantalla, type ResultadosPublicos } from '../core/directo';
import { ICS_URL } from '../core/horarios';
import { Seo } from '../core/seo';
import { SectionTitle } from '../home/cms-sections';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';

const TZ = 'Europe/Madrid';
const PABELLON = 'https://jaimedigitalstudio.b-cdn.net/grcup/pabellon/pabellonentrada.webp';
const FOTO_2025 = 'https://jaimedigitalstudio.b-cdn.net/grcup/images/club/alfonso-fernandez/img-3364.webp';
const TROFEO = 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0060.webp';
const CARTEL_2025 = '/img/cartel-2025.jpg';
const MOVS: Mov[] = ['sq', 'bp', 'dl'];
const diaHora = (iso: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)).replace(',', ' ·');
const fechas = (a?: string, b?: string) => {
  if (!a) return 'Fecha por confirmar';
  const d = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...o, timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
  return b && b !== a ? `${d(a, { day: 'numeric' })}–${d(b, { day: 'numeric', month: 'long', year: 'numeric' })}` : d(a, { day: 'numeric', month: 'long', year: 'numeric' });
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const MEDALLA: Record<string, string> = { oro: 'border-[#c9a227]/60 bg-[#c9a227]/20 text-[#e3c25a]', plata: 'border-[#a9b0b8]/60 bg-[#a9b0b8]/15 text-[#d4dae0]', bronce: 'border-[#b0703e]/60 bg-[#b0703e]/20 text-[#d79a66]' };

/** Three judges' lights (white / red / pending). */
@Component({
  selector: 'gr-luces',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-2', role: 'img', '[attr.aria-label]': 'aria()' },
  template: `@for (v of luces(); track $index) { <span class="rounded-pill border" [style.width.px]="size()" [style.height.px]="size()" [class]="v === 'B' ? 'border-white bg-white' : v === 'R' ? 'border-accent bg-accent' : 'border-line-strong bg-bg-raised/60'"></span> }`,
})
export class Luces {
  readonly votos = input<string | undefined>('');
  readonly size = input(20);
  protected readonly luces = computed(() => [0, 1, 2].map((i) => (this.votos() ?? '')[i] ?? ''));
  protected readonly aria = computed(() => {
    const v = this.votos() ?? '';
    if (v.length < 3) return 'Esperando a los jueces';
    const b = [...v].filter((x) => x === 'B').length;
    return `${b} blancas y ${3 - b} rojas: ${b >= 2 ? 'válido' : 'nulo'}`;
  });
}

/** Ranking table of a category (desktop) / cards with the attempts (mobile, «Tarjeta desplegada»). */
@Component({
  selector: 'gr-clasificacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="hidden overflow-x-auto rounded-lg border border-line-subtle bg-bg-card md:block">
      <table class="w-full min-w-[760px] text-left text-body-s">
        <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">#</th><th class="px-3 py-3">Atleta</th><th class="px-3 py-3">Cat.</th><th class="px-3 py-3 text-right">Peso</th>
          <th class="px-3 py-3 text-right">Sentadilla</th><th class="px-3 py-3 text-right">Banca</th><th class="px-3 py-3 text-right">P. muerto</th><th class="px-3 py-3 text-right">Total</th><th class="px-4 py-3 text-right">GL</th></tr></thead>
        <tbody>
          @for (f of c().filas; track $index; let i = $index) {
            <tr class="border-b border-line-subtle last:border-0" [class.bg-accent-deep/20]="f.puesto === 1">
              <td class="px-4 py-3">@if (f.puesto) { <span class="flex size-7 items-center justify-center rounded-pill border text-mono-xs" [class]="f.medalla ? med[f.medalla] : 'border-line-strong'">{{ f.puesto }}</span> } @else { <span class="text-text-muted">–</span> }</td>
              <td class="px-3 py-3"><p class="text-label-s">@if (f.slug) { <a [href]="'/atletas/' + f.slug" class="hover:text-accent-text">{{ f.nombre }}</a> } @else { {{ f.nombre }} }</p><p class="text-body-xs text-text-tertiary">{{ f.club || (f.nombre === 'Atleta' ? 'Perfil privado' : 'Independiente') }}</p></td>
              <td class="px-3 py-3 text-text-secondary">{{ c().categoria.replace('-', '−') }}</td>
              <td class="px-3 py-3 text-right font-mono text-text-secondary">{{ kg(f.pesoCorporal) }}</td>
              @for (m of movs; track m) { <td class="px-3 py-3 text-right font-mono" [title]="intentos(f, m)">{{ kg(f[m]) }}</td> }
              <td class="px-3 py-3 text-right">@if (f.total) { <span class="font-display text-[20px] text-accent-text italic">{{ kg(f.total) }}</span> } @else if (f.sinTotal) { <span class="text-label-s text-text-tertiary">Sin total</span> } @else if (f.subtotal) { <span class="font-mono text-text-secondary" title="Subtotal provisional">{{ kg(f.subtotal) }}</span> } @else { <span class="text-text-muted">–</span> }</td>
              <td class="px-4 py-3 text-right font-mono text-text-secondary">{{ gl(f.gl) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <ul class="flex flex-col gap-2 md:hidden">
      @for (f of c().filas; track $index; let i = $index) {
        <li class="rounded-lg border border-line-subtle bg-bg-card">
          <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left" (click)="abierto.set(abierto() === i ? -1 : i)" [attr.aria-expanded]="abierto() === i">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-pill border text-mono-xs" [class]="f.medalla ? med[f.medalla] : 'border-line-strong'">{{ f.puesto || '–' }}</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ f.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ f.club || 'Independiente' }}</span></span>
            <span class="text-right">@if (f.total) { <span class="block font-display text-[20px] text-accent-text italic">{{ kg(f.total) }}</span><span class="block text-mono-xs text-text-tertiary">{{ gl(f.gl) }} GL</span> }
              @else { <span class="block font-mono text-mono-s text-text-secondary">{{ f.sinTotal ? 'Sin total' : f.subtotal ? kg(f.subtotal) : '–' }}</span>@if (f.subtotal) { <span class="block text-mono-xs text-text-tertiary">parcial</span> } }</span>
            <gr-icon name="chevron-down" [size]="16" class="text-text-tertiary transition-transform" [class.rotate-180]="abierto() === i" />
          </button>
          @if (abierto() === i) {
            <div class="grid grid-cols-3 gap-2 border-t border-line-subtle px-4 py-3 text-center">
              @for (m of movs; track m) {
                <div><p class="text-mono-xs text-text-tertiary">{{ MOVN[m] }}</p>
                  @for (x of f.intentos[m]; track $index) { <p class="font-mono text-mono-s" [class]="x.resultado === 'valido' ? 'text-success' : x.resultado === 'nulo' ? 'text-accent-text line-through' : 'text-text-muted'">{{ x.resultado === 'pendiente' ? '·' : x.resultado === 'renuncia' ? '—' : kg(x.peso) }}</p> }</div>
              }
            </div>
            @if (f.pesoCorporal) { <p class="px-4 pb-3 text-body-xs text-text-tertiary">Peso corporal {{ kg(f.pesoCorporal) }} kg@if (f.division) { · {{ f.division }} }</p> }
          }
        </li>
      }
    </ul>
  `,
  imports: [GrIcon],
})
export class Clasificacion {
  readonly c = input.required<Categoria>();
  protected readonly abierto = signal(-1);
  protected readonly movs = MOVS;
  protected readonly MOVN = MOV;
  protected readonly med = MEDALLA;
  protected readonly kg = kg;
  protected readonly gl = gl;
  protected intentos(f: Fila, m: Mov): string {
    return `${MOV[m]}: ` + (f.intentos[m] ?? []).map((c) => (c.resultado === 'pendiente' ? '·' : c.resultado === 'renuncia' ? '—' : (c.resultado === 'nulo' ? '✗ ' : '') + kg(c.peso))).join(' / ');
  }
}

/** Public SSE of the competition: reloads on the live events (no personal data travels in them). */
function escuchar(tipos: string[], recargar: () => void): () => void {
  const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
  let t: ReturnType<typeof setTimeout> | undefined;
  const fn = () => {
    clearTimeout(t);
    t = setTimeout(recargar, 300);
  };
  for (const ev of tipos) es.addEventListener(ev, fn);
  return () => {
    clearTimeout(t);
    es.close();
  };
}
const EVENTOS = ['directo.estado', 'directo.intento', 'directo.veredicto', 'directo.correccion', 'resultados.publicados', 'resultados.retirados', 'reconectar'];

// ============================================================ /en-directo ===

/** /en-directo (Figma page 27): before the event (countdown, first block), live (stream, athlete on the platform, next ones,
 *  provisional ranking) and finished (replay, results, previous edition). */
@Component({
  selector: 'gr-en-directo',
  imports: [Page, GrAlert, GrIcon, GrSkeleton, Luces, Clasificacion, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="GRStrength Cup" accent="en directo" section="El evento" crumb="En directo">
      @let d = dir();
      @if (d === undefined) { <gr-skeleton class="h-[480px] rounded-lg" /> }
      @else if (d === null) { <gr-alert tone="warning" title="No hemos podido cargar el directo">Vuelve a intentarlo en unos segundos.</gr-alert> }
      @else {
        @if (d.pausa && d.fase === 'en_directo') { <gr-alert class="mb-5" tone="warning" title="Pausa técnica">Volvemos enseguida.@if (d.retrasoMin) { Vamos con {{ d.retrasoMin }} min de retraso. }</gr-alert> }
        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <!-- Video -->
          <section class="relative aspect-video overflow-hidden rounded-lg border border-line-subtle bg-black" aria-label="Retransmisión">
            @if (video(); as v) {
              <iframe [src]="v" class="absolute inset-0 size-full border-0" title="Retransmisión de la GR Strength Cup" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
            } @else {
              <img [src]="d.fase === 'finalizado' ? foto2025 : pabellon" alt="" class="absolute inset-0 size-full object-cover opacity-50" />
              <div class="absolute inset-0 bg-[linear-gradient(180deg,rgb(20_16_18/0.2),rgb(20_16_18/0.85))]"></div>
              @if (d.fase === 'antes') {
                <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <p class="text-mono-xs text-text-secondary">{{ futuro() ? 'La retransmisión empieza en' : 'La retransmisión empezará con el primer flight' }}</p>
                  @if (futuro()) { <p class="font-display text-[34px] leading-none uppercase italic md:text-[56px]">{{ cuentaTexto() }}</p> }
                  <a [href]="ics" class="mt-2 inline-flex h-10 items-center gap-2 rounded-pill border border-line-strong bg-bg-base/60 px-4 text-label-s hover:border-white">Recordármelo <gr-icon name="arrow-right" [size]="14" /></a>
                </div>
              } @else if (d.fase === 'finalizado') {
                @if (d.replayUrl) { <a [href]="d.replayUrl" target="_blank" rel="noopener" class="absolute inset-0 flex items-center justify-center" aria-label="Ver la repetición"><span class="flex size-16 items-center justify-center rounded-pill bg-accent shadow-glow"><gr-icon name="play" [size]="28" /></span></a> }
                <p class="absolute bottom-4 left-4 text-label-s">{{ d.replayUrl ? 'Repetición completa' : 'La repetición estará disponible en breve' }}</p>
              } @else {
                <p class="absolute inset-0 flex items-center justify-center px-6 text-center text-body-m text-text-secondary">La emisión en vídeo empieza en breve. Sigue los intentos aquí al momento.</p>
              }
            }
            @if (d.fase === 'en_directo') {
              <span class="absolute top-3 left-3 inline-flex h-7 items-center gap-1.5 rounded-pill bg-accent px-2.5 text-mono-xs text-white"><gr-icon name="radio" [size]="12" />En directo</span>
              @if (d.espectadores) { <span class="absolute top-3 right-3 inline-flex h-7 items-center gap-1.5 rounded-pill bg-black/60 px-2.5 text-mono-xs"><gr-icon name="eye" [size]="12" />{{ d.espectadores }}</span> }
              @if (d.actual; as a) {
                <div class="absolute bottom-3 left-3 flex items-end gap-3 rounded-md bg-black/70 px-3 py-2">
                  <div><p class="text-label-s">{{ a.nombre }} · {{ a.categoria.replace('-', '−') }} kg</p><p class="text-body-xs text-text-tertiary">{{ MOVN[a.movimiento] }} · {{ ORD[a.numero] }} intento</p></div>
                  <p class="font-display text-[22px] leading-none text-accent-text italic">{{ kg(a.peso) }} KG</p>
                </div>
              }
            }
          </section>

          <!-- Side panel -->
          <aside class="flex flex-col gap-4">
            @switch (d.fase) {
              @case ('en_directo') {
                @if (enPlataforma(); as a) {
                  <section class="rounded-lg border border-accent/40 bg-[linear-gradient(150deg,#3a0f17,#1b1112_70%)] p-5" aria-live="polite">
                    <p class="flex justify-between text-mono-xs text-text-tertiary"><span>{{ mostrandoUltimo() ? 'Último intento' : 'En la plataforma' }}</span><span>Flight {{ d.flight?.codigo }}</span></p>
                    <p class="mt-3 font-display text-[30px] leading-none uppercase italic">@if (a.slug) { <a [href]="'/atletas/' + a.slug" class="hover:text-accent-text">{{ a.nombre }}</a> } @else { {{ a.nombre }} }</p>
                    <p class="mt-1 text-body-s text-text-secondary">{{ a.club ? a.club + ' · ' : '' }}{{ catLarga(a.sexo, a.categoria) }}</p>
                    <div class="mt-4 flex items-end justify-between gap-3">
                      <div><p class="text-label-s">{{ MOVN[a.movimiento] }}</p><p class="text-body-xs text-text-tertiary">{{ ORD[a.numero] }} intento</p></div>
                      <p class="font-display text-[40px] leading-none text-accent-text italic">{{ kg(a.peso) }} KG</p>
                    </div>
                    <div class="mt-4 flex items-center gap-3"><gr-luces [votos]="mostrandoUltimo() ? a.votos : ''" />
                      @if (mostrandoUltimo()) { <span class="text-label-s" [class]="a.resultado === 'valido' ? 'text-success' : 'text-accent-text'">{{ a.resultado === 'valido' ? 'Válido' : a.resultado === 'nulo' ? 'Nulo' : 'Renuncia' }}</span> }</div>
                  </section>
                } @else {
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ d.flight ? 'Cambio de movimiento' : 'Preparando el siguiente flight' }}</p><p class="mt-1 text-body-s text-text-tertiary">En unos minutos sale el siguiente atleta.</p></section>
                }
                <section>
                  <p class="text-mono-xs text-text-tertiary">Siguientes</p>
                  <ul class="mt-2 divide-y divide-line-subtle rounded-lg border border-line-subtle bg-bg-card">
                    @for (s of d.siguientes; track $index) {
                      <li class="flex items-center gap-3 px-4 py-3"><span class="flex size-7 shrink-0 items-center justify-center rounded-pill border border-line-strong text-mono-xs">{{ s.numero }}</span>
                        <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ s.nombre }}</span><span class="block text-body-xs text-text-tertiary">{{ MOVN[s.movimiento] }} · {{ ORD[s.numero] }} intento</span></span>
                        <span class="font-mono text-mono-s">{{ kg(s.peso) }} kg</span></li>
                    } @empty { <li class="px-4 py-3 text-body-s text-text-tertiary">Último atleta de la ronda.</li> }
                  </ul>
                </section>
              }
              @case ('antes') {
                @if (futuro()) {
                  <div class="grid grid-cols-4 gap-2" role="timer" [attr.aria-label]="'Faltan ' + cuentaTexto()">
                    @for (p of cuenta(); track p.l) { <div class="flex h-[76px] flex-col items-center justify-center rounded-md border border-line-subtle bg-bg-card"><span class="text-display-s tabular-nums">{{ p.v }}</span><span class="text-mono-xs text-text-tertiary">{{ p.l }}</span></div> }
                  </div>
                }
                @if (d.proximo; as p) {
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                    <p class="text-mono-xs text-text-tertiary">Primer bloque</p>
                    <p class="mt-2 text-label-m first-letter:uppercase">{{ diaHora(p.inicio) }} · {{ p.titulo }}</p>
                    <a href="/horarios" class="mt-3 inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-s hover:border-white">Ver horarios <gr-icon name="arrow-right" [size]="14" /></a>
                  </section>
                } @else {
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">Los horarios se publican unas 2 semanas antes</p><a href="/horarios" class="mt-3 inline-flex text-label-s text-accent-text">Ver horarios →</a></section>
                }
                <a [href]="ics" class="flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-label-m text-white shadow-glow hover:bg-accent-hover"><gr-icon name="calendar-plus" [size]="18" />Recordármelo</a>
              }
              @case ('finalizado') {
                <gr-alert tone="success" title="La competición ha terminado">Ya puedes consultar los resultados oficiales.
                  <a [href]="'/resultados/' + anio()" class="mt-2 block text-label-s text-accent-text hover:underline">Ver resultados →</a></gr-alert>
                <a href="/ediciones/2025" class="group overflow-hidden rounded-lg border border-line-subtle bg-bg-card transition-colors hover:border-line-strong">
                  <div class="relative h-40"><img [src]="foto2025" alt="" class="size-full object-cover object-top" /><p class="absolute bottom-3 left-4 font-display text-[44px] leading-none italic">2025</p></div>
                  <div class="p-4"><span class="rounded-2xs border border-line-strong px-1.5 py-0.5 text-mono-xs text-text-tertiary">Celebrada</span>
                    <p class="mt-2 font-display text-[22px] uppercase italic">GRStrength Cup 2025</p>
                    <p class="mt-1 text-body-xs text-text-tertiary">1–2 marzo 2025 · Llíria (Valencia) · AEP-2 Regional</p>
                    <span class="mt-3 inline-flex text-label-s group-hover:text-accent-text">Ver la edición →</span></div>
                </a>
              }
            }
          </aside>
        </div>

        @if (d.fase === 'en_directo') {
          <nav class="mt-8 grid grid-cols-3 border-b border-line-subtle" aria-label="Directo">
            @for (t of tabs; track t.v) {
              <button type="button" class="relative h-11 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null" (click)="tab.set(t.v)">{{ t.l }}
                @if (tab() === t.v) { <span class="absolute inset-x-6 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }</button>
            }
          </nav>
          <div class="mt-5">
            @switch (tab()) {
              @case ('clasificacion') {
                @if (d.clasificacion.length > 1) {
                  <div class="mb-3 flex flex-wrap gap-2">@for (c of d.clasificacion; track c.clave) { <button type="button" class="h-9 rounded-pill border px-3 text-label-s" [class]="catSel() === c.clave ? 'border-accent bg-accent-deep/40' : 'border-line-strong text-text-secondary'" (click)="cat.set(c.clave)">{{ c.corto }}</button> }</div>
                }
                @if (categoria(); as c) { <gr-clasificacion [c]="c" /> <p class="mt-2 text-body-xs text-text-tertiary">Clasificación provisional: la oficial se publica en /resultados al terminar la categoría.</p> }
              }
              @case ('plataforma') {
                <div class="grid gap-3 md:grid-cols-3">
                  <div class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-mono-xs text-text-tertiary">Flight</p><p class="mt-1 text-label-m">{{ d.flight?.codigo }} · {{ d.flight?.titulo }}</p><p class="text-body-xs text-text-tertiary">Plataforma {{ d.flight?.plataforma }}</p></div>
                  <div class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-mono-xs text-text-tertiary">Movimiento</p><p class="mt-1 text-label-m">{{ MOVN[d.movimiento] }}</p><p class="text-body-xs text-text-tertiary">{{ d.ronda <= 3 ? 'Ronda ' + d.ronda + ' de 3' : 'Terminado' }}</p></div>
                  <div class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-mono-xs text-text-tertiary">Último intento</p>
                    @if (d.ultimo; as u) { <p class="mt-1 text-label-m">{{ u.nombre }} · {{ kg(u.peso) }} kg</p><div class="mt-1 flex items-center gap-2"><gr-luces [votos]="u.votos" [size]="14" /><span class="text-body-xs text-text-tertiary">{{ MOVN[u.movimiento] }} {{ ORD[u.numero] }}</span></div> }
                    @else { <p class="mt-1 text-body-s text-text-tertiary">Aún ninguno</p> }</div>
                </div>
              }
              @case ('horario') {
                <div class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ d.retrasoMin ? 'Vamos con ' + d.retrasoMin + ' min de retraso' : 'Vamos en hora' }}</p>
                  <p class="mt-1 text-body-s text-text-tertiary">Los horarios se actualizan con el retraso en directo y marcan el flight que está en la plataforma.</p>
                  <a href="/horarios" class="mt-3 inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-s hover:border-white">Ver horarios <gr-icon name="arrow-right" [size]="14" /></a></div>
              }
            }
          </div>
        } @else {
          <gr-related class="mt-14 block" titulo="Mientras tanto" [items]="mientras" />
        }
        <gr-community class="mt-14 block" />
      }
    </gr-page>
  `,
})
export class EnDirectoPage {
  private readonly api = inject(DirectoPublic);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly dir = signal<Directo | null | undefined>(undefined);
  protected readonly tab = signal<'plataforma' | 'clasificacion' | 'horario'>('clasificacion');
  protected readonly cat = signal('');
  private readonly ahora = signal(Date.now());
  protected readonly tabs = [{ v: 'plataforma' as const, l: 'Plataforma' }, { v: 'clasificacion' as const, l: 'Clasificación' }, { v: 'horario' as const, l: 'Horario' }];
  protected readonly mientras: RelatedLink[] = [
    { titulo: 'Participantes', texto: 'Busca tu bloque y flight', ruta: '/participantes' },
    { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
    { titulo: 'Reglamento', texto: 'Cómo se juzga un intento', ruta: '/reglamento' },
  ];
  protected readonly MOVN = MOV;
  protected readonly ORD = ORD;
  protected readonly kg = kg;
  protected readonly catLarga = catLarga;
  protected readonly diaHora = diaHora;
  protected readonly ics = ICS_URL;
  protected readonly pabellon = PABELLON;
  protected readonly foto2025 = FOTO_2025;
  private readonly san = inject(DomSanitizer);

  protected readonly video = computed(() => {
    const d = this.dir();
    if (!d || !this.browser) return null;
    const u = embed(d.fase === 'finalizado' ? d.replayUrl : d.fase === 'en_directo' ? d.streamUrl : undefined, location.hostname);
    return u ? this.san.bypassSecurityTrustResourceUrl(u) : null;
  });
  /** After the lights, the judged attempt stays on screen for 8 s. */
  protected readonly mostrandoUltimo = computed(() => {
    const u = this.dir()?.ultimo;
    return !!u?.juzgadoAt && this.ahora() - new Date(u.juzgadoAt).getTime() < 8000;
  });
  protected readonly enPlataforma = computed<EnPlataforma | undefined>(() => (this.mostrandoUltimo() ? this.dir()?.ultimo : this.dir()?.actual));
  protected readonly catSel = computed(() => {
    const d = this.dir();
    const a = d?.actual;
    return this.cat() || (a ? a.sexo + a.categoria : d?.clasificacion[0]?.clave) || '';
  });
  protected readonly categoria = computed<Categoria | undefined>(() => this.dir()?.clasificacion.find((c) => c.clave === this.catSel()) ?? this.dir()?.clasificacion[0]);
  private readonly ms = computed(() => {
    const p = this.dir()?.proximo;
    return p ? new Date(p.inicio).getTime() - this.ahora() : 0;
  });
  protected readonly futuro = computed(() => this.ms() > 0);
  protected readonly cuenta = computed(() => {
    const s = Math.max(0, Math.floor(this.ms() / 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    return [{ v: pad(Math.floor(s / 86400)), l: 'días' }, { v: pad(Math.floor((s % 86400) / 3600)), l: 'horas' }, { v: pad(Math.floor((s % 3600) / 60)), l: 'min' }, { v: pad(s % 60), l: 'seg' }];
  });
  protected readonly cuentaTexto = computed(() => {
    const [d, h, m] = this.cuenta();
    return `${Number(d.v)} d ${h.v} h ${m.v} min`;
  });
  protected readonly anio = computed(() => (this.dir()?.proximo?.inicio ?? new Date().toISOString()).slice(0, 4));

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      this.dir.set(await this.api.directo());
      const d = this.dir();
      await applySeo(cms, seo, '/en-directo', 'En directo · GR Strength Cup',
        d?.fase === 'en_directo' ? 'Sigue en directo la GR Strength Cup: quién está en la plataforma, los siguientes y la clasificación provisional.'
          : 'Retransmisión y resultados en directo de la GR Strength Cup: quién compite, los siguientes atletas y la clasificación al momento.');
    });
    if (this.browser) {
      const tick = setInterval(() => this.ahora.set(Date.now()), 1000);
      const recargar = async () => {
        const d = await this.api.directo();
        if (d) this.dir.set(d);
      };
      const cerrar = escuchar(EVENTOS, () => void recargar());
      const poll = setInterval(() => void recargar(), 30_000);
      inject(DestroyRef).onDestroy(() => {
        clearInterval(tick);
        clearInterval(poll);
        cerrar();
      });
    }
  }
}

// ============================================================ /resultados ===

interface EdicionCard { e: Edicion; c: CompeticionPublica | null; publicado: boolean }

/** /resultados (Figma page 25): every edition and how the rankings work. */
@Component({
  selector: 'gr-resultados-index',
  imports: [Page, GrSkeleton, SectionTitle, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Resultados de la" accent="GRStrength Cup" eyebrow="Clasificaciones" subtitle="Clasificaciones completas por categoría, podios y mejores levantadores de cada edición.">
      <gr-section-title eyebrow="Ediciones" titulo="Todas las" acento="ediciones" />
      @if (cards() === undefined) { <div class="mt-6 grid gap-5 md:grid-cols-2"><gr-skeleton class="h-96 rounded-lg" /><gr-skeleton class="h-96 rounded-lg" /></div> }
      @else {
        <div class="mt-6 grid gap-5 md:grid-cols-2">
          @for (x of cards(); track x.e.slug) {
            <article class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
              <div class="relative h-52 overflow-hidden bg-[radial-gradient(60%_80%_at_50%_30%,#4a121c,#141012)]">
                <img [src]="x.e.estado === 'finalizado' ? foto2025 : trofeo" alt="" class="size-full" [class]="x.e.estado === 'finalizado' ? 'object-cover object-top' : 'object-contain'" />
                <p class="absolute bottom-3 left-4 font-display text-[56px] leading-none italic drop-shadow-lg">{{ x.e.anio }}</p>
              </div>
              <div class="flex flex-1 flex-col p-5">
                <span class="w-fit rounded-2xs border px-1.5 py-0.5 text-mono-xs" [class]="x.e.estado === 'finalizado' ? 'border-line-strong text-text-tertiary' : 'border-info/50 text-info'">{{ x.e.estado === 'finalizado' ? 'Celebrada' : x.c?.fechaInicio ? 'Próxima edición' : 'Fecha por confirmar' }}</span>
                <h3 class="mt-3 font-display text-[24px] uppercase italic">{{ x.e.nombre }}</h3>
                <ul class="mt-2 flex flex-col gap-1 text-body-s text-text-secondary">
                  <li>{{ fechas(x.c?.fechaInicio, x.c?.fechaFin) }}</li>
                  <li>{{ x.c?.sede!.ciudad || x.e.ciudad }}@if (x.c?.sede!.provincia) { ({{ x.c?.sede!.provincia }}) }</li>
                  @if (x.c?.evento!.nivel) { <li>{{ x.c?.evento!.nivel }}</li> }
                </ul>
                <div class="mt-auto pt-5">
                  @if (x.publicado) { <a [href]="'/resultados/' + x.e.anio" class="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-white">Ver resultados →</a> }
                  @else if (x.e.slug === slug) { <a href="/" class="inline-flex h-10 items-center rounded-md bg-accent px-4 text-label-s text-white hover:bg-accent-hover">Más información</a> }
                </div>
              </div>
            </article>
          }
        </div>
      }
      <gr-section-title class="mt-16 block" eyebrow="Cómo se clasifica" titulo="Total y" acento="puntos GL" />
      <div class="mt-6 grid gap-3 md:grid-cols-3">
        @for (c of como; track c.t) { <div class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ c.t }}</p><p class="mt-2 text-body-s text-text-secondary">{{ c.d }}</p></div> }
      </div>
      <gr-related class="mt-16 block" [items]="rel" />
      <gr-community class="mt-14 block" />
    </gr-page>
  `,
})
export class ResultadosIndexPage {
  private readonly api = inject(DirectoPublic);
  private readonly http = inject(HttpClient);
  protected readonly cards = signal<EdicionCard[] | undefined>(undefined);
  protected readonly slug = COMPETITION_SLUG;
  protected readonly fechas = fechas;
  protected readonly foto2025 = FOTO_2025;
  protected readonly trofeo = TROFEO;
  protected readonly como = [
    { t: 'Por categoría', d: 'Gana el mayor total (sentadilla + banca + peso muerto, el mejor intento válido de cada uno). En caso de empate, gana quien pesó menos.' },
    { t: 'Mejor levantador', d: 'Se compara a atletas de distinto peso con los puntos GL de la IPF: el total ajustado al peso corporal.' },
    { t: 'Clasificación oficial', d: 'El acta oficial la valida la AEP tras la competición; la web publica cada categoría al terminar.' },
  ];
  protected readonly rel: RelatedLink[] = [
    { titulo: 'Edición 2025', texto: 'Llíria · 1–2 marzo 2025', ruta: '/ediciones/2025' },
    { titulo: 'Galería', texto: 'Fotos de la competición', ruta: '/galeria' },
    { titulo: 'Marcas mínimas', texto: 'Totales AEP por categoría', ruta: '/marcas-minimas' },
  ];
  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      const eds = (await this.api.ediciones()) ?? [];
      const cards = await Promise.all(eds.map(async (e) => {
        const [c, r] = await Promise.all([firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${e.slug}`)).catch(() => null), this.api.resultados(e.slug)]);
        return { e, c, publicado: !!r?.publicado };
      }));
      this.cards.set(cards);
      await applySeo(cms, seo, '/resultados', 'Resultados · GR Strength Cup', 'Clasificaciones por categoría, podios y mejores levantadores (puntos GL) de cada edición de la GR Strength Cup.');
    });
  }
}

// ============================================================ /resultados/:anio ===

/** /resultados/:anio (Figma page 25): best lifters by GL, podiums and the full ranking of every category, with filters. */
@Component({
  selector: 'gr-resultados-edicion',
  imports: [Page, FormsModule, GrAlert, GrIcon, GrSkeleton, SectionTitle, Clasificacion, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = res();
    <gr-page title="Resultados" [accent]="r?.competicion?.nombre ?? 'GRStrength Cup ' + anio()" section="Resultados" [crumb]="anio()" [eyebrow]="r ? (r.competicion.sede + ' · ' + fechas(r.competicion.fechaInicio, r.competicion.fechaFin)) : ''"
      [subtitle]="r?.publicado ? ((r.mejores['F'] || r.mejores['M']) ? 'Podios, mejores levantadores y clasificación completa por categoría.' : 'Podios y clasificación completa por categoría.') : ''">
      @if (r?.publicado) {
        <div pageStamps class="flex flex-wrap gap-2">
          @if (r!.ejemplo) { <span class="inline-flex h-8 items-center rounded-pill border border-info/50 px-3 text-mono-xs text-info">Datos de ejemplo</span> }
          @else { <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary"><gr-icon name="info" [size]="14" />Clasificación publicada · el acta oficial la valida la AEP</span> }
        </div>
      }
      @if (r === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (r === null) { <gr-alert tone="warning" title="No hemos podido cargar los resultados">Vuelve a intentarlo en unos minutos.</gr-alert> }
      @else if (!r.publicado) {
        <div class="rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
          <p class="text-ui-h4">Aún no hay resultados publicados</p>
          <p class="mx-auto mt-2 max-w-lg text-body-s text-text-secondary">Cada categoría se publica aquí al terminar. Mientras tanto, sigue la competición en directo.</p>
          <a href="/en-directo" class="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-label-s text-white hover:bg-accent-hover"><gr-icon name="radio" [size]="16" />Ver en directo</a>
        </div>
      } @else {
        <!-- GL points need the body weight: editions imported from the previous web have none -->
        @let conGL = !!(r.mejores['F'] || r.mejores['M']);
        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-56 md:max-w-xs"><span class="sr-only">Buscar atleta o club</span><gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input class="h-10 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-9 text-body-s" placeholder="Buscar atleta o club…" [ngModel]="q()" (ngModelChange)="q.set($event)" /></label>
          @for (s of sexos; track s.v) { <button type="button" class="h-10 rounded-pill border px-4 text-label-s" [class]="sexo() === s.v ? 'border-accent bg-accent-deep/40' : 'border-line-strong text-text-secondary hover:text-text-primary'" (click)="sexo.set(s.v)">{{ s.l }}</button> }
          <select class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s" aria-label="Categoría" [ngModel]="cat()" (ngModelChange)="cat.set($event)"><option value="">Categoría</option>@for (c of r.categorias; track c.clave) { <option [value]="c.clave">{{ c.titulo }}</option> }</select>
          <select class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s md:ml-auto" aria-label="Ordenar" [ngModel]="orden()" (ngModelChange)="orden.set($event)"><option value="puesto">Ordenar: posición</option><option value="total">Ordenar: total</option>@if (conGL) { <option value="gl">Ordenar: puntos GL</option> }</select>
        </div>

        @if (!q() && !cat()) {
          @if (conGL) {
          <gr-section-title class="mt-12 block" eyebrow="01 · Mejores levantadores" titulo="Mejor" acento="levantador/a" />
          <p class="mt-2 text-body-s text-text-tertiary">Por puntos GL de la IPF.</p>
          <div class="mt-5 grid gap-3 md:grid-cols-2">
            @for (s of sx; track s) {
              @if (r.mejores[s]; as f) {
                <div class="flex items-center gap-4 rounded-lg border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_70%)] p-5">
                  <span class="flex size-12 shrink-0 items-center justify-center rounded-pill border border-[#c9a227]/60 bg-[#c9a227]/15 text-[#e3c25a]"><gr-icon name="award" [size]="22" /></span>
                  <div class="min-w-0 flex-1"><p class="text-mono-xs text-text-tertiary">{{ s === 'F' ? 'Femenino' : 'Masculino' }}</p><p class="truncate font-display text-[24px] uppercase italic">{{ f.nombre }}</p><p class="text-body-xs text-text-tertiary">{{ f.club }}</p></div>
                  <div class="text-right"><p class="font-display text-[28px] leading-none text-accent-text italic">{{ gl(f.gl) }} GL</p><p class="text-mono-xs text-text-tertiary">{{ kg(f.total) }} kg</p></div>
                </div>
              }
            }
          </div>

          }
          <gr-section-title class="block" [class]="conGL ? 'mt-14' : 'mt-12'" [eyebrow]="(conGL ? '02' : '01') + ' · Podios'" titulo="Podio por" acento="categoría" />
          <div class="mt-5 grid gap-3 md:grid-cols-2">
            @for (c of r.categorias; track c.clave) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <header class="flex items-baseline justify-between"><h3 class="font-display text-[20px] uppercase italic">{{ c.titulo }}</h3><span class="text-mono-xs text-text-tertiary">{{ c.atletas }} atletas</span></header>
                <div class="mt-4 grid grid-cols-3 items-end gap-2">
                  @for (p of podio(c); track $index) {
                    <div class="flex flex-col items-center gap-1 text-center">
                      @if (p) { <p class="w-full truncate text-label-s">{{ p.nombre }}</p><p class="text-mono-xs text-text-tertiary">{{ kg(p.total) }} kg</p> }
                      <div class="flex w-full items-center justify-center rounded-t-md border font-display text-[34px] italic" [style.height.px]="[96, 124, 76][$index]"
                        [class]="$index === 1 ? 'border-accent/60 bg-accent-deep/60 text-[#e3c25a]' : $index === 0 ? 'border-line-strong bg-bg-raised' : 'border-[#b0703e]/50 bg-[#b0703e]/15 text-[#d79a66]'">{{ [2, 1, 3][$index] }}</div>
                    </div>
                  }
                </div>
              </section>
            }
          </div>
        }

        <gr-section-title class="mt-14 block" [eyebrow]="(conGL ? '03' : '02') + ' · Clasificación'" [titulo]="cat() ? '' : 'Clasificación'" [acento]="cat() ? tituloCat() : 'completa'" />
        @for (c of filtradas(); track c.clave) {
          @if (!cat()) { <h3 class="mt-8 font-display text-[22px] uppercase italic">{{ c.titulo }}</h3> }
          <gr-clasificacion class="mt-3 block" [c]="c" />
        } @empty { <p class="mt-6 text-body-s text-text-tertiary">Nadie coincide con la búsqueda.</p> }
        <div class="mt-6 flex flex-wrap gap-2">
          <button type="button" class="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-white" (click)="compartir()"><gr-icon name="send" [size]="16" />{{ copiado() ? 'Enlace copiado' : 'Compartir resultados' }}</button>
        </div>
      }
      <gr-related class="mt-16 block" [items]="rel()" />
      <gr-community class="mt-14 block" />
    </gr-page>
  `,
})
export class ResultadosEdicionPage {
  private readonly api = inject(DirectoPublic);
  private readonly cms = inject(Cms);
  protected readonly anio = signal(inject(ActivatedRoute).snapshot.paramMap.get('anio') ?? '');
  protected readonly res = signal<ResultadosPublicos | null | undefined>(undefined);
  protected readonly q = signal('');
  protected readonly sexo = signal<'' | 'F' | 'M'>('');
  protected readonly cat = signal('');
  protected readonly orden = signal<'puesto' | 'total' | 'gl'>('puesto');
  protected readonly copiado = signal(false);
  protected readonly sx: ('F' | 'M')[] = ['F', 'M'];
  protected readonly sexos = [{ v: '' as const, l: 'Todas' }, { v: 'F' as const, l: 'Femenino' }, { v: 'M' as const, l: 'Masculino' }];
  protected readonly fechas = fechas;
  protected readonly kg = kg;
  protected readonly gl = gl;
  protected readonly tituloCat = computed(() => this.res()?.categorias.find((c) => c.clave === this.cat())?.titulo ?? '');
  protected readonly rel = computed<RelatedLink[]>(() => [
    { titulo: `Edición ${this.anio()}`, texto: 'Crónica y fotos', ruta: `/ediciones/${this.anio()}` },
    { titulo: 'Galería', texto: 'Fotos por álbum', ruta: '/galeria' },
    { titulo: 'Marcas mínimas', texto: '¿Te ves en la lista?', ruta: '/marcas-minimas' },
  ]);
  protected readonly filtradas = computed<Categoria[]>(() => {
    const r = this.res();
    if (!r) return [];
    const q = norm(this.q());
    return r.categorias
      .filter((c) => (!this.sexo() || c.sexo === this.sexo()) && (!this.cat() || c.clave === this.cat()))
      .map((c) => {
        let filas = q.length > 1 ? c.filas.filter((f) => norm(f.nombre + ' ' + (f.club ?? '')).includes(q)) : c.filas;
        if (this.orden() === 'gl') filas = [...filas].sort((a, b) => (b.gl ?? -1) - (a.gl ?? -1));
        if (this.orden() === 'total') filas = [...filas].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
        return { ...c, filas };
      })
      .filter((c) => c.filas.length);
  });
  protected podio(c: Categoria): (Fila | undefined)[] {
    const t = c.filas.filter((f) => f.puesto);
    return [t[1], t[0], t[2]];
  }
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const eds = await this.api.ediciones();
      const e = eds?.find((x) => String(x.anio) === this.anio());
      if (!e) {
        this.res.set(null);
        if (eds) this.cms.notFound();
        return;
      }
      const r = await this.api.resultados(e.slug);
      this.res.set(r);
      const mejores = r ? Object.values(r.mejores).map((f) => `${f!.nombre} (${gl(f!.gl)} GL)`).join(' y ') : '';
      await applySeo(this.cms, seo, `/resultados/${this.anio()}`, `Resultados ${e.nombre} · Clasificación por categoría`,
        r?.publicado ? `Podios, mejores levantadores${mejores ? ' — ' + mejores : ''} y la clasificación completa por categoría de la ${e.nombre}.` : `Resultados de la ${e.nombre}: se publican al terminar cada categoría.`);
    });
  }
  protected async compartir(): Promise<void> {
    const url = location.href;
    if (navigator.share) {
      await navigator.share({ title: document.title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }
}

// ============================================================ /ediciones/:anio ===

/** /ediciones/:anio (Figma page 28): the archive of a past edition: poster, facts, gallery and sponsors. */
@Component({
  selector: 'gr-edicion',
  imports: [Page, GrSkeleton, GrIcon, SectionTitle, Related],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = comp();
    <gr-page title="GRStrength Cup" [accent]="anio()" eyebrow="Edición anterior" section="Ediciones" [crumb]="anio()" [subtitle]="c?.evento?.descripcion ?? ''">
      @if (c) {
        <div pageStamps class="flex flex-wrap gap-2">
          <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary"><gr-icon name="info" [size]="14" />Fuente: cartel oficial de la edición {{ anio() }}</span>
          <span class="inline-flex h-8 items-center rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary">Celebrada</span>
        </div>
      }
      @if (c === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (c) {
        <div class="grid gap-8 md:grid-cols-[300px_minmax(0,1fr)]">
          @if (cartel()) { <img [src]="cartel()" [alt]="'Cartel de la ' + c.nombre" class="w-full rounded-lg border border-line-subtle" width="300" height="400" /> }
          <div>
            <dl class="grid gap-4 sm:grid-cols-2">
              @for (x of datos(); track x.l) {
                <div class="flex gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon [name]="x.i" [size]="18" /></span>
                  <div><dt class="text-mono-xs text-text-tertiary">{{ x.l }}</dt><dd class="text-label-m">{{ x.v }}</dd></div></div>
              }
            </dl>
            <div class="mt-6 flex flex-wrap gap-2">
              <a [href]="'/resultados/' + anio()" class="inline-flex h-10 items-center rounded-md bg-accent px-4 text-label-s text-white hover:bg-accent-hover">Ver resultados</a>
              <a href="/galeria" class="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong px-4 text-label-s hover:border-white">Ver galería <gr-icon name="arrow-right" [size]="14" /></a>
            </div>
          </div>
        </div>

        @if (fotos().length) {
          <gr-section-title class="mt-16 block" eyebrow="Galería" titulo="Así fue" [acento]="'la edición ' + anio()" />
          <div class="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            @for (f of fotos(); track f.url) { <img [src]="f.url" [alt]="f.alt" loading="lazy" class="aspect-[4/5] w-full rounded-md object-cover" [style.object-position]="f.focalX + '% ' + f.focalY + '%'" /> }
          </div>
        }
        @if (sponsors().length) {
          <gr-section-title class="mt-16 block" eyebrow="Patrocinadores" titulo="Gracias a" acento="nuestros colaboradores" />
          <ul class="mt-6 flex flex-wrap gap-3">
            @for (p of sponsors(); track p.nombre) { <li class="flex h-16 w-36 items-center justify-center rounded-md border border-line-subtle bg-bg-card p-3"><img [src]="p.logoUrl" [alt]="p.nombre" class="max-h-full max-w-full object-contain" loading="lazy" /></li> }
          </ul>
          <p class="mt-3 text-body-xs text-text-tertiary">Logos del cartel de la edición {{ anio() }}.</p>
        }
        <gr-related class="mt-16 block" [items]="rel()" />
        <section class="mt-14 overflow-hidden rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-6 md:flex md:items-center md:justify-between md:p-10">
          <div><p class="flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>Edición {{ siguiente() }}</p>
            <h2 class="mt-3 text-display-xs md:text-display-m">Compite en la GRStrength Cup</h2><p class="mt-2 text-body-s text-text-secondary">Plazas limitadas. La inscripción se hace a través de la AEP.</p></div>
          <a href="/inscripcion" class="mt-5 inline-flex h-11 items-center rounded-md bg-accent px-5 text-label-m text-white hover:bg-accent-hover md:mt-0">Inscribirse</a>
        </section>
      }
    </gr-page>
  `,
})
export class EdicionPage {
  private readonly api = inject(DirectoPublic);
  private readonly http = inject(HttpClient);
  private readonly cms = inject(Cms);
  protected readonly anio = signal(inject(ActivatedRoute).snapshot.paramMap.get('anio') ?? '');
  protected readonly comp = signal<CompeticionPublica | null | undefined>(undefined);
  protected readonly fotos = signal<Album['fotos']>([]);
  protected readonly sponsors = signal<Patrocinador[]>([]);
  protected readonly siguiente = computed(() => Number(this.anio()) + 1);
  protected readonly cartel = computed(() => (this.anio() === '2025' ? CARTEL_2025 : ''));
  protected readonly datos = computed(() => {
    const c = this.comp();
    if (!c) return [];
    return [
      { l: 'Fecha', v: fechas(c.fechaInicio, c.fechaFin), i: 'calendar' as const },
      { l: 'Sede', v: [c.sede.ciudad, c.sede.provincia].filter(Boolean).join(' (') + (c.sede.provincia ? ')' : ''), i: 'map-pin' as const },
      { l: 'Nivel', v: c.evento.nivel, i: 'award' as const },
      { l: 'Organiza', v: c.evento.organizador, i: 'users' as const },
    ];
  });
  protected readonly rel = computed<RelatedLink[]>(() => [
    { titulo: `Resultados ${this.anio()}`, texto: 'Podios y clasificación', ruta: `/resultados/${this.anio()}` },
    { titulo: 'Galería', texto: 'Todas las fotos', ruta: '/galeria' },
    { titulo: `Edición ${this.siguiente()}`, texto: 'Próxima competición', ruta: '/' },
  ]);
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const eds = await this.api.ediciones();
      const e = eds?.find((x) => String(x.anio) === this.anio() && x.estado === 'finalizado');
      if (!e) {
        this.comp.set(null);
        if (eds) this.cms.notFound();
        return;
      }
      const [c, albums, pats] = await Promise.all([firstValueFrom(this.http.get<CompeticionPublica>(`/api/competiciones/${e.slug}`)).catch(() => null), this.cms.galeria(), this.cms.patrocinadores()]);
      this.comp.set(c);
      this.fotos.set(albums?.find((a) => a.slug === `gr-cup-${this.anio()}`)?.fotos ?? []);
      this.sponsors.set(pats ?? []);
      if (c) {
        await applySeo(this.cms, seo, `/ediciones/${this.anio()}`, `${c.nombre} · ${c.sede.ciudad} · Edición anterior`, `${fechas(c.fechaInicio, c.fechaFin)} en ${c.sede.ciudad}. ${c.evento.descripcion}`, this.cartel() || undefined, {
          jsonLd: { '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nombre, sport: 'Powerlifting', startDate: c.fechaInicio, endDate: c.fechaFin, eventStatus: 'https://schema.org/EventScheduled',
            location: { '@type': 'Place', name: c.sede.nombre, address: c.sede.ciudad }, organizer: { '@type': 'Organization', name: c.evento.organizador } },
        });
      }
    });
  }
}

// ============================================================ /pantalla/:slug ===

/** Arena screen (Figma page 44 · «Pantalla del pabellón»): 1920 × 1080 scaled to the window, fed by the public SSE. */
@Component({
  selector: 'gr-pantalla',
  imports: [GrLogo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fixed inset-0 overflow-hidden bg-[#0d0a0b]' },
  template: `
    @let p = data();
    <div class="absolute top-0 left-0 h-[1080px] w-[1920px] origin-top-left overflow-hidden bg-[radial-gradient(70%_80%_at_25%_30%,#3a0f17,#120d0f_70%)] text-white" [style.transform]="'scale(' + escala() + ')'">
      @if (p === 'enlace') {
        <div class="flex size-full flex-col items-center justify-center gap-6"><gr-logo [height]="120" /><p class="text-[40px]">Este enlace de pantalla ya no vale.</p><p class="text-[28px] text-white/60">Copia el nuevo desde el backoffice: Directo › Pantalla del pabellón.</p></div>
      } @else if (p) {
        @let d = p.directo;
        <header class="absolute top-[60px] left-[80px] flex items-center gap-8">
          <gr-logo [height]="76" />
          @if (d.fase === 'en_directo') { <span class="rounded-pill border border-accent/70 px-4 py-1.5 font-mono text-[18px] text-accent-text">● En directo</span> }
          @if (d.flight) { <span class="font-display text-[30px] text-white/70 uppercase italic">Plataforma {{ d.flight.plataforma }} · Flight {{ d.flight.codigo }}</span> }
        </header>

        @if (d.fase === 'en_directo' && d.pausa) {
          <div class="absolute top-[300px] left-[80px]"><p class="font-display text-[150px] leading-none uppercase italic">Pausa técnica</p><p class="mt-6 text-[40px] text-white/70">Volvemos enseguida@if (d.retrasoMin) { · {{ d.retrasoMin }} min de retraso }</p></div>
        } @else if (d.fase === 'en_directo' && foco(); as a) {
          <div class="absolute top-[230px] left-[80px] w-[1180px]">
            <p class="truncate font-display text-[150px] leading-[0.95] uppercase italic">{{ a.nombre }}</p>
            <p class="mt-6 font-display text-[40px] text-white/85 uppercase italic">{{ a.club ? a.club + ' · ' : '' }}{{ catLarga(a.sexo, a.categoria) }}@if (a.division) { · {{ a.division }} }</p>
            <p class="mt-3 font-display text-[44px] text-accent-text uppercase italic">{{ MOVN[a.movimiento] }} · {{ ORD[a.numero] }} intento</p>
            <div class="mt-6 flex items-center gap-10">
              <p class="font-display text-[260px] leading-[0.85] italic">{{ kg(a.peso) }}</p>
              <span class="self-end pb-8 font-display text-[60px] text-white/70 italic">KG</span>
              <div class="flex gap-6 self-center">@for (v of luces(); track $index) { <span class="size-[110px] rounded-pill border-4" [class]="v === 'B' ? 'border-white bg-white' : v === 'R' ? 'border-accent bg-accent' : 'border-white/25'"></span> }</div>
            </div>
          </div>
        } @else {
          <div class="absolute top-[300px] left-[80px] w-[1180px]">
            <p class="font-display text-[130px] leading-none uppercase italic">{{ d.fase === 'finalizado' ? '¡Gracias!' : p.nombre }}</p>
            <p class="mt-8 text-[44px] text-white/75">{{ d.fase === 'finalizado' ? 'Resultados en la web: /resultados' : d.proximo ? 'Empezamos ' + diaHora(d.proximo.inicio) : 'Enseguida empezamos' }}</p>
          </div>
        }

        <aside class="absolute top-[60px] right-[80px] flex w-[560px] flex-col gap-8">
          @if (p.pantalla.siguientes && d.fase === 'en_directo' && d.siguientes.length) {
            <section class="rounded-[24px] border border-white/10 bg-white/[0.04] p-8">
              <p class="font-display text-[28px] text-white/70 uppercase italic">A continuación</p>
              @for (s of d.siguientes; track $index) { <p class="mt-5 flex justify-between font-display text-[34px] uppercase italic"><span class="truncate pr-4">{{ s.nombre }}</span><span class="text-accent-text">{{ kg(s.peso) }} kg</span></p> }
            </section>
          }
          @if (podio(); as c) {
            <section class="rounded-[24px] border border-white/10 bg-white/[0.04] p-8">
              <p class="font-display text-[28px] text-white/70 uppercase italic">Clasificación {{ c.corto }} kg</p>
              @for (f of c.filas.slice(0, 3); track $index) { <p class="mt-5 flex justify-between font-display text-[34px] uppercase italic"><span class="truncate pr-4"><span class="text-accent-text">{{ $index + 1 }}</span>  {{ f.nombre }}</span><span [class.text-white/60]="!f.total">{{ kg(f.total ?? f.subtotal) }}</span></p> }
            </section>
          }
        </aside>

        @if (p.pantalla.qr && qr()) {
          <section class="absolute right-[80px] bottom-[60px] flex w-[560px] items-center gap-6 rounded-[24px] border border-accent/50 bg-accent-deep/40 p-6">
            <img [src]="qr()" alt="" class="size-[150px] rounded-md bg-white p-2" />
            <div><p class="font-display text-[30px] uppercase italic">Sigue el directo</p><p class="mt-2 text-[22px] text-white/75">{{ host() }}/en-directo · sigue a tus atletas y recibe aviso antes de que compitan</p></div>
          </section>
        }
        @if (p.pantalla.carrusel && sponsors().length) {
          <div class="absolute bottom-[70px] left-[80px] flex h-[90px] w-[1100px] items-center gap-14 overflow-hidden">
            @for (s of visibles(); track s.nombre) { <img [src]="s.logoUrl" [alt]="s.nombre" class="max-h-[70px] max-w-[200px] object-contain opacity-90" /> }
          </div>
        }
      }
    </div>
  `,
})
export class PantallaPublicaPage {
  private readonly api = inject(DirectoPublic);
  private readonly cms = inject(Cms);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly data = signal<Pantalla | 'enlace' | null>(null);
  protected readonly escala = signal(1);
  protected readonly qr = signal('');
  protected readonly sponsors = signal<Patrocinador[]>([]);
  private readonly ahora = signal(Date.now());
  private readonly giro = signal(0);
  protected readonly MOVN = MOV;
  protected readonly ORD = ORD;
  protected readonly kg = kg;
  protected readonly catLarga = catLarga;
  protected readonly diaHora = diaHora;
  protected readonly host = signal('');
  private readonly dir = computed(() => {
    const p = this.data();
    return p && p !== 'enlace' ? p.directo : null;
  });
  private readonly reciente = computed(() => {
    const u = this.dir()?.ultimo;
    return !!u?.juzgadoAt && this.ahora() - new Date(u.juzgadoAt).getTime() < 8000;
  });
  /** The judged attempt stays 8 s with its lights, then the next athlete. */
  protected readonly foco = computed<EnPlataforma | undefined>(() => (this.reciente() ? this.dir()?.ultimo : this.dir()?.actual));
  protected readonly luces = computed(() => [0, 1, 2].map((i) => (this.reciente() ? (this.dir()?.ultimo?.votos ?? '')[i] : '') ?? ''));
  protected readonly podio = computed<Categoria | undefined>(() => {
    const d = this.dir();
    const a = this.foco();
    return d?.clasificacion.find((c) => a && c.clave === a.sexo + a.categoria) ?? d?.clasificacion[0];
  });
  protected readonly visibles = computed(() => {
    const l = this.sponsors();
    const n = Math.min(5, l.length);
    return Array.from({ length: n }, (_, i) => l[(this.giro() + i) % l.length]);
  });

  constructor() {
    if (!this.browser) return;
    const slug = this.route.snapshot.paramMap.get('slug') ?? COMPETITION_SLUG;
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    const previa = this.route.snapshot.queryParamMap.has('previa');
    this.host.set(location.host);
    const ajustar = () => this.escala.set(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    ajustar();
    window.addEventListener('resize', ajustar);
    const cargar = async () => {
      const r = await this.api.pantalla(slug, token, previa);
      if (r) this.data.set(r);
    };
    void cargar();
    void this.cms.patrocinadores().then((p) => this.sponsors.set(p ?? []));
    void import('qrcode').then(async (m) => this.qr.set(await (m.default ?? m).toDataURL(`${location.origin}/en-directo`, { margin: 1, width: 300 })));
    const cerrar = escuchar(EVENTOS, () => void cargar());
    const tick = setInterval(() => this.ahora.set(Date.now()), 500);
    const poll = setInterval(() => void cargar(), 20_000); // also the «en línea» ping of the backoffice
    const rot = setInterval(() => this.giro.update((g) => g + 1), 8000);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', ajustar);
      cerrar();
      clearInterval(tick);
      clearInterval(poll);
      clearInterval(rot);
    });
  }
}
