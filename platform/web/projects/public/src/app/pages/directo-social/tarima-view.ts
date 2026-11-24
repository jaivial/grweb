import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrIcon, GrLiveStatus, type GrLiveEstado } from '@grcup/ui';
import { MOV, MOV_EN, gl, kg, ordenTarima, type Categoria, type Celda, type Directo, type EnPlataforma, type Fila, type Mov } from '../../core/directo';
import { hora } from '../../core/entradas';
import { HorariosPublic, type Horarios } from '../../core/horarios';
import { DivisionPipe, I18n, LocPipe, divisionEn } from '../../core/i18n';

const MOVS: Mov[] = ['sq', 'bp', 'dl'];

const T = {
  es: {
    mov: MOV,
    atleta: 'Atleta', cat: 'Cat.', peso: 'Peso', sentadilla: 'Sentadilla', banca: 'Banca', muerto: 'P. muerto', total: 'Total',
    privado: 'Perfil privado', independiente: 'Independiente', sinTotal: 'Sin total', subtotal: 'Subtotal provisional', kgTotal: 'kg total', parcial: 'parcial',
    pesoCorporal: 'Peso corporal', puntosGl: 'puntos GL',
    tarima: 'Tarima', tabs: { tarima: 'En la tarima', clasificacion: 'Clasificación', horario: 'Horario' },
    valido: 'LIFT · válido', nulo: 'NO LIFT · nulo', renuncia: 'Renuncia', esperando: 'Esperando intento',
    sexo: (s: string): string => (s === 'F' ? 'Femenino' : 'Masculino'), intento: ['', '1.er', '2.º', '3.er'], intentoTxt: 'intento',
    intentosDe: (m: string) => 'Intentos de ' + m.toLowerCase(),
    preparando: 'Preparando la siguiente ronda', enUnos: 'En unos minutos sale el siguiente atleta.', siguientes: 'Siguientes', porPeso: 'por peso solicitado',
    ultimo: 'Último atleta de la ronda.', categoria: 'Categoría', ordenado: 'Ordenado por total · se actualiza con cada intento', kgParcial: 'kg parcial', pendiente: '— pendiente',
    sinClasificacion: 'La clasificación aparece con el primer intento.', horarioJornada: ' · horario de la jornada',
    atletas: (n: number) => n + ' atletas', pesaje: 'Pesaje', cargando: 'Cargando horario…', noPublicado: 'El horario aún no está publicado.',
    antes: 'La tarima se activa cuando empiece el directo.', despues: 'La competición ha terminado: consulta los resultados oficiales.',
  },
  en: {
    mov: MOV_EN,
    atleta: 'Athlete', cat: 'Cat.', peso: 'Weight', sentadilla: 'Squat', banca: 'Bench', muerto: 'Deadlift', total: 'Total',
    privado: 'Private profile', independiente: 'Unattached', sinTotal: 'No total', subtotal: 'Provisional subtotal', kgTotal: 'kg total', parcial: 'partial',
    pesoCorporal: 'Bodyweight', puntosGl: 'GL points',
    tarima: 'Platform', tabs: { tarima: 'On the platform', clasificacion: 'Standings', horario: 'Schedule' },
    valido: 'LIFT · good', nulo: 'NO LIFT · no lift', renuncia: 'Passed', esperando: 'Waiting for the attempt',
    sexo: (s: string): string => (s === 'F' ? 'Women' : 'Men'), intento: ['', '1st', '2nd', '3rd'], intentoTxt: 'attempt',
    intentosDe: (m: string) => m + ' attempts',
    preparando: 'Getting the next round ready', enUnos: 'The next athlete is up in a few minutes.', siguientes: 'Up next', porPeso: 'by requested weight',
    ultimo: 'Last athlete of the round.', categoria: 'Category', ordenado: 'Sorted by total · updated with every attempt', kgParcial: 'kg partial', pendiente: '— pending',
    sinClasificacion: 'The standings appear with the first attempt.', horarioJornada: ' · matchday schedule',
    atletas: (n: number) => n + ' athletes', pesaje: 'Weigh-in', cargando: 'Loading schedule…', noPublicado: 'The schedule has not been published yet.',
    antes: 'The platform goes live when the live stream starts.', despues: 'The competition is over: see the official results.',
  },
};
const MEDALLA: Record<string, string> = { oro: 'border-[#c9a227]/60 bg-[#c9a227]/20 text-[#e3c25a]', plata: 'border-[#a9b0b8]/60 bg-[#a9b0b8]/15 text-[#d4dae0]', bronce: 'border-[#b0703e]/60 bg-[#b0703e]/20 text-[#d79a66]' };

/** Ranking table of a category (desktop) / cards with the attempts (mobile, «Tarjeta desplegada»). */
@Component({
  selector: 'gr-clasificacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="hidden overflow-x-auto rounded-lg border border-line-subtle bg-bg-card md:block">
      <table class="w-full min-w-[760px] text-left text-body-s">
        <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">#</th><th class="px-3 py-3">{{ t().atleta }}</th><th class="px-3 py-3">{{ t().cat }}</th><th class="px-3 py-3 text-right">{{ t().peso }}</th>
          <th class="px-3 py-3 text-right">{{ t().sentadilla }}</th><th class="px-3 py-3 text-right">{{ t().banca }}</th><th class="px-3 py-3 text-right">{{ t().muerto }}</th><th class="px-3 py-3 text-right">{{ t().total }}</th><th class="px-4 py-3 text-right">GL</th></tr></thead>
        <tbody>
          @for (f of c().filas; track $index; let i = $index) {
            <tr class="border-b border-line-subtle last:border-0" [class.bg-accent-deep/20]="f.puesto === 1">
              <td class="px-4 py-3">@if (f.puesto) { <span class="flex size-7 items-center justify-center rounded-pill border text-mono-xs" [class]="f.medalla ? med[f.medalla] : 'border-line-strong'">{{ f.puesto }}</span> } @else { <span class="text-text-muted">–</span> }</td>
              <td class="px-3 py-3"><p class="text-label-s">@if (f.slug) { <a [routerLink]="'/atletas/' + f.slug | loc" class="hover:text-accent-text">{{ f.nombre }}</a> } @else { {{ f.nombre }} }</p><p class="text-body-xs text-text-tertiary">{{ f.club || (f.nombre === 'Atleta' ? t().privado : t().independiente) }}</p></td>
              <td class="px-3 py-3 text-text-secondary">{{ c().categoria.replace('-', '−') }}</td>
              <td class="px-3 py-3 text-right font-mono text-text-secondary">{{ kg(f.pesoCorporal) }}</td>
              @for (m of movs; track m) { <td class="px-3 py-3 text-right font-mono" [title]="intentos(f, m)">{{ kg(f[m]) }}</td> }
              <td class="px-3 py-3 text-right">@if (f.total) { <span class="font-display text-[20px] text-accent-text italic">{{ kg(f.total) }}</span> } @else if (f.sinTotal) { <span class="text-label-s text-text-tertiary">{{ t().sinTotal }}</span> } @else if (f.subtotal) { <span class="font-mono text-text-secondary" [title]="t().subtotal">{{ kg(f.subtotal) }}</span> } @else { <span class="text-text-muted">–</span> }</td>
              <td class="px-4 py-3 text-right font-mono text-text-secondary">{{ gl(f.gl) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <ul class="flex flex-col gap-2 md:hidden">
      @for (f of c().filas; track $index; let i = $index) {
        <li class="rounded-lg border bg-bg-card" [class]="abierto() === i ? 'border-accent/60' : 'border-line-subtle'">
          <button type="button" class="flex w-full items-center gap-3 px-4 py-4 text-left" (click)="abierto.set(abierto() === i ? -1 : i)" [attr.aria-expanded]="abierto() === i">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full border text-label-s" [class]="f.medalla ? med[f.medalla] : 'border-line-strong'">{{ f.puesto || '–' }}</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-label-l">{{ f.nombre }}</span><span class="block text-body-xs text-text-tertiary [overflow-wrap:anywhere]">{{ f.club || t().independiente }} · {{ c().titulo.replace(/^(Femenino|Masculino)\s*/, '') }}</span></span>
            <span class="text-right">@if (f.total) { <span class="block font-display text-[26px] leading-none text-accent-text italic">{{ kg(f.total) }}</span><span class="block text-body-xs text-text-tertiary">{{ t().kgTotal }}</span> }
              @else { <span class="block font-mono text-mono-s text-text-secondary">{{ f.sinTotal ? t().sinTotal : f.subtotal ? kg(f.subtotal) : '–' }}</span>@if (f.subtotal) { <span class="block text-mono-xs text-text-tertiary">{{ t().parcial }}</span> } }</span>
            <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/8"><gr-icon name="chevron-down" [size]="16" class="text-text-secondary transition-transform" [class.rotate-180]="abierto() === i" /></span>
          </button>
          @if (abierto() === i) {
            <div class="flex flex-col gap-2.5 px-4 pb-4">
              @for (m of movs; track m) {
                <div class="flex items-center gap-2"><p class="w-28 shrink-0 text-body-s text-text-secondary">{{ t().mov[m] }}</p>
                  @for (x of f.intentos[m]; track $index) { <span class="flex h-9 flex-1 items-center justify-center rounded-sm text-mono-s" [class]="x.resultado === 'valido' ? 'bg-success/12 text-success' : x.resultado === 'nulo' ? 'bg-accent/12 text-accent-text line-through' : 'bg-white/5 text-text-muted'">{{ x.resultado === 'pendiente' ? '·' : x.resultado === 'renuncia' ? '—' : kg(x.peso) }}</span> }</div>
              }
              @if (f.pesoCorporal || f.gl) { <p class="mt-1 flex justify-between border-t border-line-subtle pt-3 text-body-xs text-text-tertiary"><span>@if (f.pesoCorporal) { {{ t().pesoCorporal }} {{ kg(f.pesoCorporal) }} kg }@if (f.division) { · {{ f.division | division }} }</span>@if (f.gl) { <span>{{ gl(f.gl) }} {{ t().puntosGl }}</span> }</p> }
            </div>
          }
        </li>
      }
    </ul>
  `,
  imports: [RouterLink, LocPipe, DivisionPipe, GrIcon],
})
export class Clasificacion {
  private readonly lang = inject(I18n).lang;
  protected readonly t = inject(I18n).dict(T);
  readonly c = input.required<Categoria>();
  /** Mobile: open the first card (Figma 25 mobile, «Tarjeta desplegada»). */
  readonly abrir = input(false);
  protected readonly abierto = linkedSignal<number>(() => (this.abrir() ? 0 : -1));
  protected readonly movs = MOVS;
  protected readonly med = MEDALLA;
  protected readonly kg = (v?: number | null) => kg(v, this.lang());
  protected readonly gl = (v?: number | null) => gl(v, this.lang());
  protected intentos(f: Fila, m: Mov): string {
    return `${this.t().mov[m]}: ` + (f.intentos[m] ?? []).map((c) => (c.resultado === 'pendiente' ? '·' : c.resultado === 'renuncia' ? '—' : (c.resultado === 'nulo' ? '✗ ' : '') + kg(c.peso))).join(' / ');
  }
}

/** «LIFT» / «NO LIFT» chip colours (Figma 393:122185 / 393:122210): OpenLifter only knows good / no lift, no judges' lights. */
const CHIP = 'inline-flex h-6 items-center rounded-pill bg-black/16 px-2.5 font-mono text-[11px] font-medium';
const RES: Record<Celda['resultado'], string> = { valido: 'text-success', nulo: 'text-[#e6606b]', pendiente: 'text-text-tertiary', renuncia: 'text-text-tertiary' };
const PUESTO = ['', 'text-[#d4af37]', 'text-[#c0c4cc]', 'text-[#c8835a]'];

/**
 * «Tarima» tab of /en-directo (Figma 393:120328 · 393:122185 · 393:122210 · 393:121379 · 393:121506): sub-tabs «En la
 * tarima» (athlete on the tarima, LIFT / NO LIFT of the attempt, the next ones in lifting order), «Clasificación» (ranking
 * of a category with the attempts) and «Horario» (blocks of the day). Only shown while live.
 */
@Component({
  selector: 'gr-tarima-view',
  imports: [GrIcon, GrLiveStatus, DivisionPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  styles: `
    /* Motion (Figma 393:122185): brief flash of the card and pop of the chip when a verdict arrives */
    .flash { animation: tarima-flash 1.4s ease-out forwards; }
    .pop { animation: tarima-pop 320ms cubic-bezier(.22,1,.36,1); }
    @keyframes tarima-flash { from { opacity: .45; } to { opacity: .12; } }
    @keyframes tarima-pop { from { transform: scale(.85); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .flash, .pop, .gr-desplegar { animation: none; } }
  `,
  template: `
    @let d = directo();
    @if (d.fase === 'en_directo') {
      <div class="flex flex-col gap-4">
        <!-- Figma 70: the pill only appears when the real-time connection drops -->
        @if (conexion() !== 'en-directo') { <gr-live-status class="self-start" [estado]="conexion()" /> }
        <nav class="flex gap-1" [attr.aria-label]="t().tarima">
          @for (tb of tabs; track tb.v) {
            <button type="button" class="h-7 rounded-pill px-3 text-[13px] font-medium transition-colors" [class]="tab() === tb.v ? 'bg-bg-raised text-white' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === tb.v ? 'page' : null" (click)="abrir(tb.v)">{{ t().tabs[tb.v] }}</button>
          }
        </nav>
        @switch (tab()) {
          @case ('tarima') {
            @if (enTarima(); as a) {
              <section class="relative -mx-4 overflow-hidden px-4 py-5 md:mx-0 md:rounded-lg" aria-live="polite">
                @if (veredicto(); as v) {
                  @for (k of [a.juzgadoAt]; track k) { <span class="flash pointer-events-none absolute inset-0" [class]="v === 'valido' ? 'bg-success' : v === 'nulo' ? 'bg-accent' : 'bg-white/10'"></span> }
                }
                <div class="relative flex flex-col gap-3">
                  <div class="flex items-center justify-between gap-3">
                    <p class="text-[12px] font-medium tracking-[0.08em] text-text-tertiary uppercase">{{ t().tabs.tarima }}</p>
                    @if (veredicto(); as v) {
                      @for (k of [a.juzgadoAt]; track k) { <span [class]="'pop ' + chip + ' text-[12px] ' + res[v]">{{ v === 'valido' ? t().valido : v === 'nulo' ? t().nulo : t().renuncia }}</span> }
                    } @else { <span [class]="chip + ' text-text-tertiary'">{{ t().esperando }}</span> }
                  </div>
                  <div class="flex flex-col gap-1">
                    <p class="font-display text-[32px] leading-none">{{ a.nombre }}</p>
                    <p class="text-[14px] text-[#d1d5db]">{{ a.club ? a.club + ' · ' : '' }}{{ t().sexo(a.sexo) }} · {{ cat(a.categoria) }} kg</p>
                  </div>
                  <div class="flex items-end justify-between gap-3">
                    <div class="flex flex-col gap-0.5"><p class="text-[16px] font-semibold">{{ t().mov[a.movimiento] }}</p><p class="text-[13px] text-text-tertiary">{{ t().intento[a.numero] }} {{ t().intentoTxt }}</p></div>
                    <p class="bg-[linear-gradient(180deg,#c42b3e,#6e2020)] bg-clip-text font-display text-[48px] leading-none text-transparent">{{ kg(a.peso) }} kg</p>
                  </div>
                  @if (previos().length) {
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="text-[12px] text-[#6b7280]">{{ t().intentosDe(t().mov[a.movimiento]) }}</p>
                      @for (x of previos(); track $index) { <span [class]="chip + ' ' + res[x.resultado]">{{ x.resultado === 'renuncia' ? '—' : kg(x.peso) + ' kg' }}</span> }
                    </div>
                  }
                </div>
              </section>
            } @else {
              <section class="py-5"><p class="text-label-m">{{ t().preparando }}</p><p class="mt-1 text-body-s text-text-tertiary">{{ t().enUnos }}</p></section>
            }
            <section class="border-t border-line-subtle py-5">
              <p class="text-[12px] font-medium tracking-[0.08em] text-text-tertiary uppercase">{{ t().siguientes }}</p>
              @if (siguientes().numero) { <p class="mt-1 text-[12px] text-[#6b7280]">{{ t().mov[d.movimiento] }} · {{ t().intento[siguientes().numero] }} {{ t().intentoTxt }} · {{ t().porPeso }}</p> }
              <ul class="mt-2">
                @for (s of siguientes().lista; track s.nombre + s.categoria + s.peso; let i = $index) {
                  <li class="flex min-h-[60px] items-center gap-3 border-b border-line-subtle last:border-0">
                    <span class="flex size-7 shrink-0 items-center justify-center rounded-pill border border-line-strong text-[12px] font-medium text-[#d1d5db]">{{ i + 1 }}</span>
                    <span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="truncate text-[15px] font-semibold">{{ s.nombre }}</span><span class="truncate text-[12px] text-text-tertiary">{{ s.club || t().independiente }} · {{ cat(s.categoria) }} kg</span></span>
                    <span class="font-mono text-[13px] whitespace-nowrap text-[#d1d5db]">{{ kg(s.peso) }} kg</span>
                  </li>
                } @empty { <li class="py-3 text-body-s text-text-tertiary">{{ t().ultimo }}</li> }
              </ul>
            </section>
          }
          @case ('clasificacion') {
            @if (categoria(); as c) {
              <div class="flex flex-col gap-3">
                <label class="relative flex h-10 items-center rounded-[10px] border border-[#433a3c] bg-[#181516] px-3">
                  <span class="sr-only">{{ t().categoria }}</span>
                  <select class="w-full appearance-none bg-transparent pr-6 text-[14px] font-semibold outline-none" [value]="c.clave" (change)="cat_.set($any($event.target).value); abierto.set(0)">
                    @for (o of d.clasificacion; track o.clave) { <option [value]="o.clave" class="bg-bg-card">{{ t().sexo(o.sexo) }} · {{ cat(o.categoria) }} kg</option> }
                  </select>
                  <gr-icon name="chevron-down" [size]="16" class="pointer-events-none absolute right-3 text-text-tertiary" />
                </label>
                <p class="text-[12px] text-[#6b7280]">{{ t().ordenado }}</p>
                <ul>
                  @for (f of c.filas; track f.nombre + $index; let i = $index) {
                    <li class="border-b border-line-subtle py-3 last:border-0">
                      <button type="button" class="flex w-full items-center gap-2.5 text-left" (click)="abierto.set(abierto() === i ? -1 : i)" [attr.aria-expanded]="abierto() === i">
                        <span class="w-4 shrink-0 text-center font-mono text-[13px] font-medium" [class]="PUESTO[f.puesto ?? 0] || 'text-text-tertiary'">{{ f.puesto || '–' }}</span>
                        @if (f.fotoUrl && !sinFoto().has(f.fotoUrl)) {
                          <img [src]="f.fotoUrl" [alt]="f.nombre" class="size-9 shrink-0 rounded-full object-cover" loading="lazy" (error)="fotoRota(f.fotoUrl)" />
                        } @else {
                          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-raised"><gr-icon name="user" [size]="18" class="text-text-tertiary" /></span>
                        }
                        <span class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="truncate text-[15px] font-semibold">{{ f.nombre }}</span><span class="truncate text-[12px] text-text-tertiary">{{ f.club || t().independiente }}</span></span>
                        <span class="flex flex-col items-end">
                          @if (f.total || f.subtotal) { <span class="font-display text-[20px] leading-tight">{{ kg(f.total || f.subtotal) }}</span><span class="font-mono text-[10px] text-[#6b7280]">{{ f.total ? 'kg' : t().kgParcial }}</span> }
                          @else { <span class="font-mono text-[13px] text-text-tertiary">{{ f.sinTotal ? t().sinTotal : '—' }}</span> }
                        </span>
                      </button>
                      @if (abierto() === i) {
                        <div class="gr-desplegar mt-3 flex flex-col gap-2.5 pl-[46px]">
                          @if (f.pesoCorporal || f.division) {
                            <div class="flex flex-wrap gap-2">
                              @if (f.pesoCorporal) { <span class="inline-flex h-6 items-center rounded-pill bg-bg-raised px-2.5 font-mono text-[11px] text-[#d1d5db]">{{ t().pesoCorporal }} {{ kg(f.pesoCorporal) }} kg</span> }
                              @if (f.division) { <span class="inline-flex h-6 items-center rounded-pill bg-bg-raised px-2.5 font-mono text-[11px] text-[#d1d5db]">{{ f.division | division }}</span> }
                            </div>
                          }
                          @for (m of movs; track m) {
                            <div class="flex items-center gap-1.5"><p class="w-[84px] shrink-0 text-[12px] text-[#d1d5db]">{{ t().mov[m] }}</p>
                              @for (x of f.intentos[m]; track $index) { <span [class]="chip + ' ' + res[x.resultado]">{{ x.resultado === 'pendiente' || x.resultado === 'renuncia' ? '—' : kg(x.peso) }}</span> }
                            </div>
                          }
                        </div>
                      }
                    </li>
                  }
                </ul>
                <div class="flex flex-wrap gap-2">
                  <span [class]="chip + ' text-success'">{{ t().valido }}</span><span [class]="chip + ' text-[#e6606b]'">{{ t().nulo }}</span><span [class]="chip + ' text-text-tertiary'">{{ t().pendiente }}</span>
                </div>
              </div>
            } @else { <p class="py-5 text-body-s text-text-tertiary">{{ t().sinClasificacion }}</p> }
          }
          @case ('horario') {
            @if (jornada(); as j) {
              <div class="flex flex-col gap-2.5">
                <p class="text-[12px] text-text-tertiary first-letter:uppercase">{{ diaSemana(j.fecha) }}{{ t().horarioJornada }}</p>
                @for (h of j.horarios; track h.id) {
                  <div class="flex items-center gap-3 rounded-2xl border border-line-subtle bg-bg-card/60 p-4">
                    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div class="flex items-center gap-2"><span class="text-[12px] font-bold tracking-[0.08em] uppercase">{{ t().sexo(h.sexo) }}</span>
                        @if (h.ep) { <span class="rounded-[6px] border border-white/35 bg-white/6 px-2 py-[3px] font-mono text-[12px] leading-none">{{ h.ep }}</span> }</div>
                      <p class="text-[16px] font-semibold text-[#d1d5db]">{{ pesos(h.titulo) }}</p>
                      <p class="text-[12px] text-text-tertiary">{{ t().atletas(h.total) }} · {{ t().pesaje }} {{ hora(h.pesajeInicio) }}–{{ hora(h.pesajeFin) }}</p>
                    </div>
                    <span class="flex items-center gap-1.5 text-[30px] font-bold tabular-nums text-[#6b7280]"><gr-icon name="clock" [size]="22" />{{ hora(h.inicio) }}</span>
                  </div>
                }
              </div>
            } @else { <p class="py-5 text-body-s text-text-tertiary">{{ horarios() === undefined ? t().cargando : t().noPublicado }}</p> }
          }
        }
      </div>
    } @else {
      <p class="rounded-lg border border-line-subtle bg-bg-card p-5 text-body-s text-text-tertiary">{{ d.fase === 'antes' ? t().antes : t().despues }}</p>
    }
  `,
})
export class TarimaView {
  readonly directo = input.required<Directo>();
  /** State of the real-time connection of the page (the pill only shows when it drops). */
  readonly conexion = input<GrLiveEstado>('en-directo');

  private readonly api = inject(HorariosPublic);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly tab = signal<'tarima' | 'clasificacion' | 'horario'>('tarima');
  protected readonly cat_ = signal('');
  protected readonly abierto = signal(0);
  protected readonly sinFoto = signal(new Set<string>());
  /** undefined = not loaded yet; null = not published or failed. */
  protected readonly horarios = signal<Horarios | null | undefined>(undefined);
  private readonly ahora = signal(Date.now());
  protected readonly tabs = [{ v: 'tarima' as const }, { v: 'clasificacion' as const }, { v: 'horario' as const }];
  protected readonly movs = MOVS;
  protected readonly PUESTO = PUESTO;
  protected readonly chip = CHIP;
  protected readonly res = RES;
  protected readonly kg = (v?: number | null) => kg(v, this.i18n.lang());
  protected readonly hora = hora;
  protected readonly cat = (c: string) => c.replace('-', '−');

  /** After the verdict, the judged attempt stays on screen for 8 s (with its LIFT / NO LIFT chip). */
  private readonly mostrandoUltimo = computed(() => {
    const u = this.directo().ultimo;
    return !!u?.juzgadoAt && this.ahora() - new Date(u.juzgadoAt).getTime() < 8000;
  });
  protected readonly enTarima = computed<EnPlataforma | undefined>(() => (this.mostrandoUltimo() ? this.directo().ultimo : this.directo().actual));
  protected readonly veredicto = computed(() => (this.mostrandoUltimo() ? this.directo().ultimo?.resultado : undefined));

  /** Row of the ranking of the athlete on the tarima (private profiles share the name «Atleta»: also match the weight). */
  private filaDe(a: EnPlataforma): Fila | undefined {
    const c = this.directo().clasificacion.find((x) => x.sexo === a.sexo && x.categoria === a.categoria);
    const l = c?.filas.filter((f) => f.nombre === a.nombre) ?? [];
    return l.length > 1 ? l.find((f) => f.intentos?.[a.movimiento]?.[a.numero - 1]?.peso === a.peso) ?? l[0] : l[0];
  }
  /** Earlier attempts of this lift (the judged one included while it is on screen). */
  protected readonly previos = computed<Celda[]>(() => {
    const a = this.enTarima();
    if (!a) return [];
    const hasta = this.veredicto() ? a.numero : a.numero - 1;
    return (this.filaDe(a)?.intentos?.[a.movimiento] ?? []).slice(0, hasta).filter((x) => x.resultado !== 'pendiente');
  });

  /**
   * «Siguientes»: lifting order computed in the client (ordenTarima), without the athlete shown on the tarima (while the
   * judged attempt stays on screen, the athlete the server has on the tarima is the first one). The server's list is the
   * fallback when the client order is empty or does not contain the server's athlete on the tarima (e.g. declared openers
   * of the session that the ranking cells do not carry yet): the list never contradicts the card above.
   */
  protected readonly siguientes = computed(() => {
    const d = this.directo();
    const { numero, orden } = ordenTarima(d.clasificacion, d.movimiento);
    const a = d.actual;
    const es = (t: { fila: Fila; sexo: string; categoria: string; numero: number }, x: EnPlataforma) =>
      t.fila.nombre === x.nombre && t.sexo === x.sexo && t.categoria === x.categoria && t.numero === x.numero;
    if (orden.length && (!a || orden.some((t) => es(t, a)))) {
      const visto = this.mostrandoUltimo() ? undefined : a;
      const lista = orden
        .filter((t) => !visto || !es(t, visto))
        .map((t) => ({ nombre: t.fila.nombre, club: t.fila.club, categoria: t.categoria, peso: t.peso }))
        .slice(0, 5);
      return { numero, lista };
    }
    const srv = this.mostrandoUltimo() && a ? [a, ...d.siguientes] : d.siguientes;
    return { numero: srv[0]?.numero ?? 0, lista: srv.map((s) => ({ nombre: s.nombre, club: s.club, categoria: s.categoria, peso: s.peso })) };
  });

  protected readonly catSel = computed(() => {
    const d = this.directo();
    const a = d.actual;
    return this.cat_() || (a ? a.sexo + a.categoria : '');
  });
  protected readonly categoria = computed<Categoria | undefined>(() => {
    const l = this.directo().clasificacion;
    const k = this.catSel();
    return l.find((c) => c.clave === k || c.sexo + c.categoria === k) ?? l[0];
  });

  /** Day of the schedule shown: today (Madrid) when it is a competition day, else the first one. */
  protected readonly jornada = computed(() => {
    const dias = this.horarios()?.dias.filter((x) => x.horarios.length) ?? [];
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(this.ahora()));
    return dias.find((x) => x.fecha.slice(0, 10) === hoy) ?? dias[0];
  });
  protected diaSemana(fecha: string): string {
    return new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(fecha.slice(0, 10) + 'T12:00:00Z'));
  }
  /** «Femenino −47 / −52 kg» → «−47 / −52 kg» (same as the home schedule). */
  protected pesos(titulo: string): string {
    const p = (titulo.match(/[−+-]\s?\d+/g) ?? []).map((x) => x.replace('-', '−').replace(/\s/g, ''));
    return p.length ? p.join(' / ') + ' kg' : titulo;
  }

  protected abrir(t: 'tarima' | 'clasificacion' | 'horario'): void {
    this.tab.set(t);
    if (t === 'horario' && this.horarios() === undefined) void this.api.get().then((h) => this.horarios.set(h?.publicado ? h : null));
  }
  protected fotoRota(url: string): void {
    this.sinFoto.update((s) => new Set(s).add(url));
  }

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const tick = setInterval(() => this.ahora.set(Date.now()), 1000);
      inject(DestroyRef).onDestroy(() => clearInterval(tick));
    }
  }
}
