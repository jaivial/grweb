import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, afterNextRender, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrIcon, GrLiveStatus, type GrLiveEstado } from '@grcup/ui';
import { MOV, ORD, catLarga, gl, kg, type Categoria, type Directo, type EnPlataforma, type Fila, type Mov } from '../../core/directo';

const MOVS: Mov[] = ['sq', 'bp', 'dl'];
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
              <td class="px-3 py-3"><p class="text-label-s">@if (f.slug) { <a [routerLink]="'/atletas/' + f.slug" class="hover:text-accent-text">{{ f.nombre }}</a> } @else { {{ f.nombre }} }</p><p class="text-body-xs text-text-tertiary">{{ f.club || (f.nombre === 'Atleta' ? 'Perfil privado' : 'Independiente') }}</p></td>
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
        <li class="rounded-lg border bg-bg-card" [class]="abierto() === i ? 'border-accent/60' : 'border-line-subtle'">
          <button type="button" class="flex w-full items-center gap-3 px-4 py-4 text-left" (click)="abierto.set(abierto() === i ? -1 : i)" [attr.aria-expanded]="abierto() === i">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full border text-label-s" [class]="f.medalla ? med[f.medalla] : 'border-line-strong'">{{ f.puesto || '–' }}</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-label-l">{{ f.nombre }}</span><span class="block text-body-xs text-text-tertiary [overflow-wrap:anywhere]">{{ f.club || 'Independiente' }} · {{ c().titulo.replace(/^(Femenino|Masculino)\s*/, '') }}</span></span>
            <span class="text-right">@if (f.total) { <span class="block font-display text-[26px] leading-none text-accent-text italic">{{ kg(f.total) }}</span><span class="block text-body-xs text-text-tertiary">kg total</span> }
              @else { <span class="block font-mono text-mono-s text-text-secondary">{{ f.sinTotal ? 'Sin total' : f.subtotal ? kg(f.subtotal) : '–' }}</span>@if (f.subtotal) { <span class="block text-mono-xs text-text-tertiary">parcial</span> } }</span>
            <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/8"><gr-icon name="chevron-down" [size]="16" class="text-text-secondary transition-transform" [class.rotate-180]="abierto() === i" /></span>
          </button>
          @if (abierto() === i) {
            <div class="flex flex-col gap-2.5 px-4 pb-4">
              @for (m of movs; track m) {
                <div class="flex items-center gap-2"><p class="w-28 shrink-0 text-body-s text-text-secondary">{{ MOVN[m] }}</p>
                  @for (x of f.intentos[m]; track $index) { <span class="flex h-9 flex-1 items-center justify-center rounded-sm text-mono-s" [class]="x.resultado === 'valido' ? 'bg-success/12 text-success' : x.resultado === 'nulo' ? 'bg-accent/12 text-accent-text line-through' : 'bg-white/5 text-text-muted'">{{ x.resultado === 'pendiente' ? '·' : x.resultado === 'renuncia' ? '—' : kg(x.peso) }}</span> }</div>
              }
              @if (f.pesoCorporal || f.gl) { <p class="mt-1 flex justify-between border-t border-line-subtle pt-3 text-body-xs text-text-tertiary"><span>@if (f.pesoCorporal) { Peso corporal {{ kg(f.pesoCorporal) }} kg }@if (f.division) { · {{ f.division }} }</span>@if (f.gl) { <span>{{ gl(f.gl) }} puntos GL</span> }</p> }
            </div>
          }
        </li>
      }
    </ul>
  `,
  imports: [RouterLink, GrIcon],
})
export class Clasificacion {
  readonly c = input.required<Categoria>();
  /** Mobile: open the first card (Figma 25 mobile, «Tarjeta desplegada»). */
  readonly abrir = input(false);
  protected readonly abierto = linkedSignal<number>(() => (this.abrir() ? 0 : -1));
  protected readonly movs = MOVS;
  protected readonly MOVN = MOV;
  protected readonly med = MEDALLA;
  protected readonly kg = kg;
  protected readonly gl = gl;
  protected intentos(f: Fila, m: Mov): string {
    return `${MOV[m]}: ` + (f.intentos[m] ?? []).map((c) => (c.resultado === 'pendiente' ? '·' : c.resultado === 'renuncia' ? '—' : (c.resultado === 'nulo' ? '✗ ' : '') + kg(c.peso))).join(' / ');
  }
}

/**
 * «Tarima» tab of /en-directo: who is on the tarima, the next ones and the Tarima · Clasificación · Horario sub-tabs
 * (moved as-is from the page; pending its own redesign). Only shown while live.
 */
@Component({
  selector: 'gr-tarima-view',
  imports: [RouterLink, GrIcon, GrLiveStatus, Luces, Clasificacion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let d = directo();
    @if (d.fase === 'en_directo') {
      <div class="flex flex-col gap-4">
                  <!-- Figma «Live status»: state of the real-time connection -->
                  <!-- Figma 70 shows the live badge on the player: the pill only appears when the connection drops -->
                  @if (conexion() !== 'en-directo') { <gr-live-status class="self-start" [estado]="conexion()" /> }
                  <div class="flex flex-col gap-4 lg:grid lg:grid-cols-[324px_minmax(0,1fr)] lg:items-start">
                  @if (enPlataforma(); as a) {
                    <section class="rounded-lg border border-accent/40 bg-[linear-gradient(150deg,#3a0f17,#1b1112_70%)] p-5" aria-live="polite">
                      <p class="flex justify-between text-label-xs text-text-tertiary uppercase"><span>{{ mostrandoUltimo() ? 'Último intento' : 'En la tarima' }}</span></p>
                      <p class="mt-3 font-display text-[30px] leading-none uppercase italic">@if (a.slug) { <a [routerLink]="'/atletas/' + a.slug" class="hover:text-accent-text">{{ a.nombre }}</a> } @else { {{ a.nombre }} }</p>
                      <p class="mt-1 text-body-s text-text-secondary">{{ a.club ? a.club + ' · ' : '' }}{{ catLarga(a.sexo, a.categoria) }}</p>
                      <div class="mt-4 flex items-end justify-between gap-3">
                        <div><p class="text-label-s">{{ MOVN[a.movimiento] }}</p><p class="text-body-xs text-text-tertiary">{{ ORD[a.numero] }} intento</p></div>
                        <p class="font-display text-[40px] leading-none text-accent-text italic">{{ kg(a.peso) }} KG</p>
                      </div>
                      <div class="mt-4 flex items-center gap-3"><gr-luces [votos]="mostrandoUltimo() ? a.votos : ''" />
                        @if (mostrandoUltimo()) { <span class="text-label-s" [class]="a.resultado === 'valido' ? 'text-success' : 'text-accent-text'">{{ a.resultado === 'valido' ? 'Válido' : a.resultado === 'nulo' ? 'Nulo' : 'Renuncia' }}</span> }</div>
                    </section>
                  } @else {
                    <section class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ d.flight ? 'Cambio de movimiento' : 'Preparando la siguiente ronda' }}</p><p class="mt-1 text-body-s text-text-tertiary">En unos minutos sale el siguiente atleta.</p></section>
                  }
                  <!-- on mobile «Siguientes» lives in the «Tarima» sub-tab (Figma 27) -->
                  <section class="hidden lg:block">
                    <p class="text-label-s">Siguientes</p>
                    <ul class="mt-2 divide-y divide-line-subtle">
                      @for (s of d.siguientes; track $index) {
                        <li class="flex items-center gap-3 px-4 py-3"><span class="flex size-7 shrink-0 items-center justify-center rounded-pill border border-line-strong text-mono-xs">{{ $index + 1 }}</span>
                          <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ s.nombre }}</span><span class="block text-body-xs text-text-tertiary">{{ MOVN[s.movimiento] }} · {{ ORD[s.numero] }} intento</span></span>
                          <span class="font-mono text-mono-s">{{ kg(s.peso) }} kg</span></li>
                      } @empty { <li class="px-4 py-3 text-body-s text-text-tertiary">Último atleta de la ronda.</li> }
                    </ul>
                  </section>
                  </div>
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
                @case ('tarima') {
                  <section class="mb-4 lg:hidden">
                    <p class="text-label-xs text-text-tertiary uppercase">Siguientes</p>
                    <ul class="mt-2 divide-y divide-line-subtle">
                      @for (s of d.siguientes; track $index) {
                        <li class="flex items-center gap-3 py-3"><span class="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-label-xs">{{ s.numero }}</span>
                          <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ s.nombre }}</span><span class="block text-body-xs text-text-tertiary">{{ MOVN[s.movimiento] }} · {{ ORD[s.numero] }} intento</span></span>
                          <span class="text-mono-s">{{ kg(s.peso) }} kg</span></li>
                      } @empty { <li class="py-3 text-body-s text-text-tertiary">Último atleta de la ronda.</li> }
                    </ul>
                  </section>
                  <div class="grid gap-3 md:grid-cols-3">
                    <div class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-mono-xs text-text-tertiary">Bloque</p><p class="mt-1 text-label-m">{{ d.flight?.titulo || '–' }}</p></div>
                    <div class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-mono-xs text-text-tertiary">Movimiento</p><p class="mt-1 text-label-m">{{ MOVN[d.movimiento] }}</p><p class="text-body-xs text-text-tertiary">{{ d.ronda <= 3 ? 'Ronda ' + d.ronda + ' de 3' : 'Terminado' }}</p></div>
                    <div class="rounded-lg border border-line-subtle bg-bg-card p-4"><p class="text-mono-xs text-text-tertiary">Último intento</p>
                      @if (d.ultimo; as u) { <p class="mt-1 text-label-m">{{ u.nombre }} · {{ kg(u.peso) }} kg</p><div class="mt-1 flex items-center gap-2"><gr-luces [votos]="u.votos" [size]="14" /><span class="text-body-xs text-text-tertiary">{{ MOVN[u.movimiento] }} {{ ORD[u.numero] }}</span></div> }
                      @else { <p class="mt-1 text-body-s text-text-tertiary">Aún ninguno</p> }</div>
                  </div>
                }
                @case ('horario') {
                  <div class="rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ d.retrasoMin ? 'Vamos con ' + d.retrasoMin + ' min de retraso' : 'Vamos en hora' }}</p>
                    <p class="mt-1 text-body-s text-text-tertiary">Los horarios se actualizan con el retraso en directo y marcan el bloque que está en la tarima.</p>
                    <a routerLink="/horarios" class="mt-3 inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-s hover:border-white">Ver horarios <gr-icon name="arrow-right" [size]="14" /></a></div>
                }
              }
            </div>
      </div>
    } @else {
      <p class="rounded-lg border border-line-subtle bg-bg-card p-5 text-body-s text-text-tertiary">{{ d.fase === 'antes' ? 'La tarima se activa cuando empiece el directo.' : 'La competición ha terminado: consulta los resultados oficiales.' }}</p>
    }
  `,
})
export class TarimaView {
  readonly directo = input.required<Directo>();
  /** State of the real-time connection of the page (the pill only shows when it drops). */
  readonly conexion = input<GrLiveEstado>('en-directo');

  protected readonly tab = signal<'tarima' | 'clasificacion' | 'horario'>('clasificacion');
  protected readonly cat = signal('');
  private readonly ahora = signal(Date.now());
  protected readonly tabs = [{ v: 'tarima' as const, l: 'Tarima' }, { v: 'clasificacion' as const, l: 'Clasificación' }, { v: 'horario' as const, l: 'Horario' }];
  protected readonly MOVN = MOV;
  protected readonly ORD = ORD;
  protected readonly kg = kg;
  protected readonly catLarga = catLarga;

  /** After the lights, the judged attempt stays on screen for 8 s. */
  protected readonly mostrandoUltimo = computed(() => {
    const u = this.directo().ultimo;
    return !!u?.juzgadoAt && this.ahora() - new Date(u.juzgadoAt).getTime() < 8000;
  });
  protected readonly enPlataforma = computed<EnPlataforma | undefined>(() => (this.mostrandoUltimo() ? this.directo().ultimo : this.directo().actual));
  protected readonly catSel = computed(() => {
    const d = this.directo();
    const a = d.actual;
    return this.cat() || (a ? a.sexo + a.categoria : d.clasificacion[0]?.clave) || '';
  });
  protected readonly categoria = computed<Categoria | undefined>(() => this.directo().clasificacion.find((c) => c.clave === this.catSel()) ?? this.directo().clasificacion[0]);

  constructor() {
    // mobile opens on «Tarima» (Figma 27); switched after hydration so the server HTML and the first render match
    afterNextRender(() => { if (window.matchMedia('(max-width: 1023px)').matches) this.tab.set('tarima'); });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const tick = setInterval(() => this.ahora.set(Date.now()), 1000);
      inject(DestroyRef).onDestroy(() => clearInterval(tick));
    }
  }
}
