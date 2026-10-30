import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { renderMarkdown, type Faq, type Seccion } from '../core/cms';
import type { CompeticionPublica } from '../core/competition';
import { CATEGORIAS_IPF } from '../core/atletas';
import { hora, qrDataURL, type Entradas, type SesionPub } from '../core/entradas';
import type { Horarios } from '../core/horarios';
import { ANCHO, GLOW, GrCabecera, GrEyebrow, GrTitulo, SECCION, textoTitulo } from './bloques';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);
/** «1.248» (Spanish grouping also for four digits, as in Figma). */
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const euros = (c: number) => (c % 100 ? (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : String(c / 100)) + ' €';
/** Responsive image of the home assets: «/img/home/x-l.webp» → srcset with the «-s» variant (640 px). */
const srcset = (src: string) => (/-l\.webp$/.test(src) ? `${src.replace(/-l\.webp$/, '-s.webp')} 640w, ${src} 1200w` : null);
/** Hairline photo border of Figma (white 8 %). */
const FOTO = 'border border-white/8';

/** Public raffle (GET /api/competiciones/{slug}/sorteo), the fields the home uses. */
export interface SorteoHome { estado: string; premio: string; precio: number; vendidos: number; totalMax?: number; maxPorPersona: number; premioImagen?: string }

/** «Stats band» (Figma): four headline numbers between hairlines. */
@Component({
  selector: 'gr-sec-cifras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block bg-bg-surface' },
  template: `
    <div class="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(196_43_62/0.5),transparent)]"></div>
    <dl class="mx-auto grid max-w-[1200px] grid-cols-2 px-5 py-7 md:grid-cols-4 md:px-0 md:py-10">
      @for (c of items(); track c.etiqueta; let i = $index) {
        <div class="flex flex-col items-center gap-1 px-2 py-4 text-center md:py-2" [class.md:border-l]="i > 0" [class.md:border-line-subtle]="i > 0">
          <dd class="text-display-m md:text-display-xl" [class.text-accent-text]="i === 0">{{ c.valor }}</dd>
          <dt class="text-label-xs text-text-tertiary">{{ c.etiqueta }}</dt>
        </div>
      }
    </dl>
  `,
})
export class SecCifras {
  readonly s = input<Seccion | undefined>();
  protected readonly items = computed(() => list<{ valor: string; etiqueta: string }>(this.s(), 'items'));
}

/** «Section / Inscripciones»: the registration card (state badge, places counter, bar and the actions). */
@Component({
  selector: 'gr-sec-inscripciones',
  imports: [GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-bg-base px-5 pt-10 pb-18 md:px-20 md:pt-16 md:pb-32' },
  template: `
    @let c = comp();
    <div class="relative mx-auto flex max-w-[720px] flex-col items-center gap-4 overflow-hidden rounded-2xl border border-line-subtle bg-bg-card px-5 py-8 text-center md:gap-5 md:px-14 md:py-12">
      <div class="absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,#c42b3e,transparent)]"></div>
      <span class="inline-flex h-7 items-center rounded-pill border px-3 text-label-xs" [class]="badge().clase">{{ badge().texto }}</span>
      <h2 class="text-display-m text-accent-text [text-shadow:0_0_24px_rgb(196_43_62/0.5)] md:text-display-xl">{{ s()?.['titulo'] || 'Inscripciones' }}</h2>
      @if (plazas()) {
        <p class="flex items-end gap-2"><span class="text-display-xl md:text-display-hero">{{ inscritos() ?? plazas() }}</span><span class="pb-1 text-display-xs text-text-tertiary">/ {{ plazas() }} atletas</span></p>
        <div class="h-1.5 w-full max-w-[420px] overflow-hidden rounded-[3px] bg-line-strong" role="progressbar" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100" aria-label="Plazas ocupadas">
          <div class="h-full rounded-[3px] bg-[linear-gradient(120deg,#c42b3e,#6e1420)]" [style.width.%]="pct()"></div>
        </div>
      }
      <p class="text-body-m text-text-secondary md:text-body-l">{{ s()?.['texto'] }}</p>
      <div class="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
        @if (c?.modulos?.['atletas'] !== false) { <a grButton variant="primary" size="l" href="/atletas">Ver atletas inscritos</a> }
        @if (propia()) { <a grButton variant="outline" size="l" href="/inscripcion" iconRight="arrow-right">Inscríbete</a> }
        @else if (c?.inscripcion?.url) { <a grButton variant="outline" size="l" [href]="c!.inscripcion.url" target="_blank" rel="noopener">{{ c!.inscripcion.estado === 'completa' ? 'Lista de espera en la AEP' : 'Inscripción en la AEP' }}</a> }
      </div>
    </div>
  `,
})
export class SecInscripciones {
  readonly s = input<Seccion | undefined>();
  readonly comp = input<CompeticionPublica | null>(null);
  /** Own registration with payment (athletes service): links to /inscripcion instead of the AEP. */
  readonly propia = input(false);
  /** Confirmed athletes (athletes summary); null → the counter shows the places. */
  readonly inscritos = input<number | null>(null);
  protected readonly plazas = computed(() => Number(this.s()?.['plazas'] ?? 0) || this.comp()?.inscripcion?.plazas || 0);
  protected readonly pct = computed(() => Math.min(100, Math.round(((this.inscritos() ?? this.plazas()) / (this.plazas() || 1)) * 100)));
  protected readonly badge = computed(() => {
    const e = this.comp()?.inscripcion?.estado ?? 'proximamente';
    return ({
      abierta: { texto: 'Inscripciones abiertas', clase: 'border-success/60 bg-success/12 text-success' },
      completa: { texto: 'Inscripciones completas', clase: 'border-text-tertiary/60 bg-text-tertiary/12 text-text-tertiary' },
      cerrada: { texto: 'Inscripciones cerradas', clase: 'border-text-tertiary/60 bg-text-tertiary/12 text-text-tertiary' },
    } as Record<string, { texto: string; clase: string }>)[e] ?? { texto: 'Próximamente', clase: 'border-info/60 bg-info/12 text-info' };
  });
}

/**
 * «Section / Entradas»: why to book (icons), the CTAs and live social proof, next to an example ticket (rotated −3°,
 * real QR) and the capacity meter of the fullest open session.
 */
@Component({
  selector: 'gr-sec-entradas',
  imports: [GrButton, GrIcon, GrEyebrow, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    <div [class]="glow + ' -top-40 right-[-80px] size-[480px] md:right-[-220px] md:size-[760px] bg-[radial-gradient(closest-side,rgb(110_20_32/0.22),transparent)]!'"></div>
    <div [class]="ancho + ' flex flex-col items-center gap-10 lg:flex-row lg:gap-[72px]'">
      <div class="flex w-full flex-col gap-5 lg:max-w-[728px] lg:gap-7">
        <div class="flex flex-col gap-3 md:gap-4">
          <gr-eyebrow [texto]="t('eyebrow')" />
          <h2 class="text-display-s md:text-display-l"><gr-titulo [titulo]="t('titulo')" [acento]="t('tituloAcento')" /></h2>
          <p class="text-body-m text-text-tertiary md:text-body-l">{{ t('texto') }}</p>
        </div>
        <ul class="flex flex-col gap-3">
          @for (p of puntos(); track p.titulo; let i = $index) {
            <li class="flex gap-3">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="icons[i % 3]" [size]="18" /></span>
              <span class="flex flex-col gap-1"><span class="text-label-m">{{ p.titulo }}</span><span class="text-body-s text-text-tertiary">{{ p.texto }}</span></span>
            </li>
          }
        </ul>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" href="/entradas">Reserva tu entrada gratis</a>
          <a grButton variant="glass" size="l" href="/horarios" iconRight="arrow-right">Ver horarios</a>
        </div>
        @if (entradas()?.personas) {
          <div class="flex items-center gap-3">
            <span class="flex items-center" aria-hidden="true">
              @for (a of avatares; track a) { <span class="-ml-2.5 flex size-8 items-center justify-center rounded-full border-2 border-bg-base bg-[linear-gradient(135deg,#58202b,#1b1718)] text-label-xs first:ml-0">{{ a }}</span> }
            </span>
            <span class="flex flex-col gap-1">
              <span class="text-body-s">{{ num(entradas()!.personas) }} personas ya tienen entrada</span>
              <span class="flex items-center gap-1 text-body-xs text-text-muted"><gr-icon name="radio" [size]="12" class="text-success" />Actualizado en directo</span>
            </span>
          </div>
        }
      </div>
      <div class="flex w-full max-w-[350px] shrink-0 flex-col items-center gap-4 lg:w-[400px] lg:max-w-none">
        <!-- Example ticket (Figma «Ticket / Con sorteo») -->
        <div class="w-[350px] max-w-full overflow-hidden rounded-xl border border-accent/55 bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] shadow-card lg:-rotate-3" aria-hidden="true">
          <div class="flex flex-col gap-3 px-5 pt-6 pb-4">
            <div class="flex items-center justify-between">
              <img [src]="logo" alt="" class="h-8 w-auto" />
              <span class="inline-flex h-6 items-center rounded-pill border border-success/60 bg-success/12 px-2.5 text-label-xs text-success">Entrada gratuita</span>
            </div>
            <p class="text-display-xs">{{ comp()?.nombre || 'GR Strength Cup' }}</p>
            <ul class="flex flex-col gap-2 text-body-s text-text-secondary">
              @for (m of metaTicket(); track m.t) { <li class="flex items-center gap-2.5"><gr-icon [name]="m.i" [size]="15" class="text-accent-text" />{{ m.t }}</li> }
            </ul>
            @if (sorteo()) {
              <div class="flex items-center gap-2 rounded-md border border-accent/50 bg-black/25 p-3">
                <gr-icon name="ticket" [size]="16" class="text-accent-text" />
                <span class="flex flex-col gap-1"><span class="text-label-s">Sorteo · 2 boletos pagados</span><span class="text-mono-s text-text-secondary">Nº 0412 · 0413 · {{ premioCorto() }}</span></span>
              </div>
            }
          </div>
          <div class="relative h-6">
            <div class="absolute inset-x-[30px] top-3 border-t border-dashed border-line-strong"></div>
            <span class="absolute top-0 -left-3 size-6 rounded-full border border-line-strong bg-bg-deep"></span>
            <span class="absolute top-0 -right-3 size-6 rounded-full border border-line-strong bg-bg-deep"></span>
          </div>
          <div class="flex flex-col items-center gap-2 px-5 pt-2 pb-6 text-center">
            @if (qr()) { <img [src]="qr()" alt="" class="size-[168px] rounded-[4px] bg-white" /> } @else { <span class="size-[168px] rounded-[4px] bg-white"></span> }
            <span class="text-mono-s">GRC-7K3P</span>
            <span class="text-body-xs text-text-tertiary">Enséñalo en la puerta desde el móvil (no hace falta imprimirlo)</span>
          </div>
        </div>
        @if (aforo(); as a) {
          <div class="flex w-[350px] max-w-full flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card px-4 py-5">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-2 text-label-s"><gr-icon name="users" [size]="16" class="text-accent-text" />Aforo · {{ a.s.nombre }}</span>
              <span class="text-mono-s text-text-secondary">{{ a.s.ocupadas }} / {{ a.s.aforo }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-[4px] bg-line-strong"><div class="h-full rounded-[4px] bg-[linear-gradient(120deg,#c42b3e,#6e1420)]" [style.width.%]="a.pct"></div></div>
            <p class="flex items-center gap-1.5 text-body-s" [class]="a.ultimas ? 'text-accent-text' : 'text-text-secondary'"><gr-icon [name]="a.ultimas ? 'zap' : 'ticket'" [size]="14" />{{ a.nota }}</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class SecEntradas {
  readonly s = input<Seccion | undefined>();
  readonly comp = input<CompeticionPublica | null>(null);
  readonly entradas = input<Entradas | null>(null);
  readonly sorteo = input<SorteoHome | null>(null);
  protected readonly glow = GLOW;
  protected readonly ancho = ANCHO;
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png';
  protected readonly icons: GrIconName[] = ['ticket', 'users', 'trophy'];
  protected readonly avatares = ['LG', 'CS', 'MR', 'JT'];
  protected readonly num = num;
  protected readonly qr = signal('');
  protected t = (k: string) => str(this.s(), k);
  protected readonly puntos = computed(() => list<{ titulo: string; texto: string }>(this.s(), 'puntos'));
  protected readonly premioCorto = computed(() => (this.sorteo()?.premio || 'Cinturón SBD').replace(/\s+\d+\s*mm$/i, ''));
  /** First session of the event, shown on the example ticket. */
  private readonly primera = computed<SesionPub | null>(() => this.entradas()?.sesiones?.[0] ?? null);
  protected readonly metaTicket = computed(() => {
    const s = this.primera(), c = this.comp();
    const out: { i: GrIconName; t: string }[] = [];
    if (s) {
      const d = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(s.inicio)).replace(',', '').replace('.', '');
      // «Sábado mañana» → «Sesión de mañana» (the day is already in the date)
      const sesion = s.nombre.replace(/^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s+/i, '');
      out.push({ i: 'calendar', t: `${d.charAt(0).toUpperCase() + d.slice(1)} · ${sesion === s.nombre ? s.nombre : 'Sesión de ' + sesion}` });
      out.push({ i: 'clock', t: `Puertas ${hora(s.puertas)} · hasta las ${hora(s.fin)}` });
    }
    if (c?.sede?.nombre) out.push({ i: 'map-pin', t: c.sede.nombre });
    out.push({ i: 'users', t: 'Laura Gómez + 2 acompañantes' });
    return out;
  });
  /** The open session closest to selling out (Figma «Aforo meter / Últimas»). */
  protected readonly aforo = computed(() => {
    const ss = (this.entradas()?.sesiones ?? []).filter((s) => s.aforo > 0);
    if (!ss.length) return null;
    const vivas = ss.filter((s) => s.libres > 0);
    const s = (vivas.length ? vivas : ss).reduce((a, b) => (b.libres < a.libres ? b : a));
    const ultimas = s.libres > 0 && s.libres <= Math.max(10, s.aforo * 0.1);
    const nota = s.libres <= 0 ? 'Agotadas: apúntate a la lista de espera' : ultimas ? `¡Últimas ${s.libres} entradas!` : `Quedan ${num(s.libres)} entradas`;
    return { s, pct: Math.min(100, Math.round((s.ocupadas / s.aforo) * 100)), ultimas, nota };
  });
  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    afterNextRender(() => {
      if (browser) void qrDataURL(`${location.origin}/entradas`, 336).then((u) => this.qr.set(u)).catch(() => undefined);
    });
  }
}

/** «Section / Atletas»: the two editorial rows (text and 4:5 photo; on mobile, the text over the photo). */
@Component({
  selector: 'gr-sec-atletas',
  imports: [GrEyebrow, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    <div [class]="glow + ' top-40 -left-30 size-[640px]'"></div>
    <div [class]="ancho + ' flex flex-col gap-5 md:gap-24'">
      @for (r of filas(); track $index; let i = $index) {
        <!-- desktop: text + photo; mobile: one card with the title over the photo -->
        <div class="relative flex items-center justify-center md:gap-10 lg:gap-20" [class.md:flex-row-reverse]="i % 2 === 1">
          <div class="hidden w-full max-w-[600px] min-w-0 flex-1 flex-col gap-4 md:flex" [class.items-end]="i % 2 === 1" [class.text-right]="i % 2 === 1">
            <gr-eyebrow [texto]="r.eyebrow" />
            <h2 class="text-display-m lg:text-display-xl"><gr-titulo [titulo]="r.titulo" [acento]="r.acento" /></h2>
            <span class="h-0.5 w-24" [class]="i % 2 === 1 ? 'bg-[linear-gradient(270deg,#c42b3e,transparent)]' : 'bg-[linear-gradient(90deg,#c42b3e,transparent)]'"></span>
          </div>
          <figure class="relative aspect-[350/440] w-full overflow-hidden rounded-lg md:aspect-[4/5] md:w-[320px] md:shrink-0 lg:w-[520px]" [class]="foto">
            <img [src]="r.imagen" [attr.srcset]="srcset(r.imagen)" sizes="(min-width: 768px) 520px, 100vw" [alt]="r.alt" class="absolute inset-0 size-full object-cover" loading="lazy" />
            <figcaption class="absolute inset-0 flex flex-col justify-end gap-2 bg-[linear-gradient(180deg,transparent_45%,rgb(14_12_13/0.92))] p-5 md:hidden">
              <span class="text-display-m"><gr-titulo [titulo]="r.titulo" [acento]="r.acento" /></span>
              @if (r.alt) { <span class="text-body-xs text-text-tertiary">{{ r.alt }}</span> }
            </figcaption>
          </figure>
        </div>
      }
    </div>
  `,
})
export class SecAtletas {
  readonly atletas = input<Seccion | undefined>();
  readonly dia = input<Seccion | undefined>();
  protected readonly glow = GLOW;
  protected readonly ancho = ANCHO;
  protected readonly foto = FOTO;
  protected readonly srcset = srcset;
  protected readonly filas = computed(() => [this.atletas(), this.dia()].filter((s): s is Seccion => !!s && !!str(s, 'imagen')).map((s) => ({
    eyebrow: str(s, 'eyebrow'), titulo: str(s, 'titulo'), acento: str(s, 'tituloAcento'), imagen: str(s, 'imagen'), alt: str(s, 'alt') || textoTitulo(str(s, 'titulo'), str(s, 'tituloAcento')),
  })));
}

/** «Section / Premios»: trophy, header and one tilted card per lift (a swipeable track with dots on mobile). */
@Component({
  selector: 'gr-sec-premios',
  imports: [GrCabecera, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    <div [class]="glow + ' top-0 left-1/2 size-[640px] -translate-x-1/2'"></div>
    <div [class]="ancho + ' flex flex-col items-center gap-7 md:gap-12'">
      <img src="/img/home/trofeo.webp" alt="" class="h-[82px] w-24 object-contain md:h-[129px] md:w-[150px]" loading="lazy" />
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
      <ul class="-mx-5 flex w-[calc(100%+40px)] snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:w-full md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 lg:flex lg:w-auto lg:justify-center lg:gap-10" (scroll)="alDesplazar($event)">
        @for (p of items(); track p.titulo; let i = $index) {
          <li class="w-[258px] shrink-0 snap-center md:w-auto lg:flex lg:h-[480px] lg:w-[340px] lg:items-center lg:justify-center">
            <div class="relative aspect-[300/420] w-full overflow-hidden rounded-lg shadow-card transition-transform duration-300 lg:w-[300px]"
              [class]="(i === 1 ? 'border border-accent shadow-glow-deep md:-translate-y-0' : foto) + ' ' + giro[i % 3]">
              <img [src]="p.imagen" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
              <div class="absolute inset-0 flex flex-col justify-end gap-2 bg-[linear-gradient(180deg,transparent_55%,rgb(14_12_13/0.92))] p-5">
                <span class="inline-flex h-[22px] w-fit items-center rounded-pill bg-[linear-gradient(120deg,#c42b3e,#6e1420)] px-2.5 text-label-xs">Premio · {{ (i + 1).toString().padStart(2, '0') }}</span>
                <span class="text-display-s [text-shadow:0_2px_20px_rgb(0_0_0/0.8)]">{{ p.titulo }}</span>
              </div>
            </div>
          </li>
        }
      </ul>
      <div class="flex items-center gap-1.5 md:hidden" aria-hidden="true">
        @for (p of items(); track p.titulo; let i = $index) { <span class="h-1.5 rounded-pill transition-all" [class]="i === activa() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
      </div>
      @if (t('lema')) { <p class="text-center text-display-body text-text-secondary md:text-display-xs"><gr-titulo [titulo]="t('lema')" /></p> }
    </div>
  `,
})
export class SecPremios {
  readonly s = input<Seccion | undefined>();
  protected readonly glow = GLOW;
  protected readonly ancho = ANCHO;
  protected readonly foto = FOTO;
  /** Figma: −4° · 0 · +4° (with their vertical offsets inside the 340 × 480 holders). */
  protected readonly giro = ['lg:-rotate-4 lg:-translate-y-2.5', 'lg:translate-y-0', 'lg:rotate-4 lg:translate-y-2.5'];
  protected readonly activa = signal(0);
  protected t = (k: string) => str(this.s(), k);
  protected readonly items = computed(() => list<{ titulo: string; imagen: string }>(this.s(), 'items'));
  protected alDesplazar(e: Event): void {
    const el = e.target as HTMLElement;
    this.activa.set(Math.round(el.scrollLeft / 270));
  }
}

/** «Section / Organización»: header and the 2 × 2 bento of captioned photos (a swipeable track on mobile). */
@Component({
  selector: 'gr-sec-organizacion',
  imports: [GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    <div [class]="ancho + ' flex flex-col items-center gap-7 md:gap-12'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" [texto]="t('texto')" />
      <ul class="-mx-5 flex w-[calc(100%+40px)] snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:w-full md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0" (scroll)="alDesplazar($event)">
        @for (f of fotos(); track f.imagen) {
          <li class="relative aspect-[290/380] w-[290px] shrink-0 snap-center overflow-hidden rounded-lg md:aspect-[590/420] md:w-auto" [class]="foto">
            <img [src]="f.imagen" [attr.srcset]="srcset(f.imagen)" sizes="(min-width: 768px) 590px, 290px" [alt]="f.alt || f.titulo" class="absolute inset-0 size-full object-cover" loading="lazy" />
            @if (f.titulo) {
              <div class="absolute inset-0 flex flex-col justify-end gap-2 bg-[linear-gradient(180deg,transparent_50%,rgb(14_12_13/0.92))] p-5">
                <span class="text-display-xs [text-shadow:0_2px_20px_rgb(0_0_0/0.8)]">{{ f.titulo }}</span>
                @if (f.texto) { <span class="text-body-s text-text-secondary">{{ f.texto }}</span> }
              </div>
            }
          </li>
        }
      </ul>
      <div class="flex items-center gap-1.5 md:hidden" aria-hidden="true">
        @for (f of fotos(); track f.imagen; let i = $index) { <span class="h-1.5 rounded-pill transition-all" [class]="i === activa() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
      </div>
    </div>
  `,
})
export class SecOrganizacion {
  readonly s = input<Seccion | undefined>();
  protected readonly ancho = ANCHO;
  protected readonly foto = FOTO;
  protected readonly srcset = srcset;
  protected readonly activa = signal(0);
  protected t = (k: string) => str(this.s(), k);
  protected readonly fotos = computed(() => list<{ imagen: string; alt: string; titulo: string; texto: string }>(this.s(), 'imagenes'));
  protected alDesplazar(e: Event): void { this.activa.set(Math.round((e.target as HTMLElement).scrollLeft / 302)); }
}

/** «Section / Afiliaciones»: who organises and endorses it (two cards) and the competition equipment brands. */
@Component({
  selector: 'gr-sec-afiliaciones',
  imports: [GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    <div [class]="ancho + ' flex flex-col items-center gap-6 md:gap-10'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
      <ul class="flex w-full flex-col justify-center gap-4 md:flex-row md:gap-6">
        @for (c of tarjetas(); track c.titulo) {
          <li class="relative flex w-full flex-col gap-4 overflow-hidden rounded-lg border border-line-subtle bg-bg-card p-5 md:w-[420px] md:p-7">
            <span class="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.25),transparent)]"></span>
            @if (c.tipo === 'foto') {
              <img [src]="c.imagen" alt="" class="aspect-[362/180] w-full rounded-md border border-white/8 object-cover" loading="lazy" />
            } @else {
              <span class="flex aspect-[362/180] w-full items-center justify-center rounded-md bg-white/3 px-10"><img [src]="c.imagen" [alt]="c.titulo" class="max-h-[110px] w-full object-contain" loading="lazy" /></span>
            }
            <span class="text-display-xs">{{ c.titulo }}</span>
            <span class="text-body-s text-text-tertiary">{{ c.texto }}</span>
          </li>
        }
      </ul>
      @if (t('titulo2')) {
        <gr-cabecera class="mt-1 max-w-[640px]! md:mt-14" [eyebrow]="t('eyebrow2')" [titulo]="t('titulo2')" [texto]="t('texto2')" tam="m" />
        <ul class="flex gap-4">
          @for (m of marcas(); track m.nombre) {
            <li class="flex h-[88px] w-[164px] items-center justify-center rounded-lg border border-line-subtle bg-bg-card md:h-[104px] md:w-[200px]">
              @if (m.logo) { <img [src]="m.logo" [alt]="m.nombre" class="h-[54px] w-24 object-contain" loading="lazy" /> } @else { <span class="text-display-l">{{ m.nombre }}</span> }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class SecAfiliaciones {
  readonly s = input<Seccion | undefined>();
  protected readonly ancho = ANCHO;
  protected t = (k: string) => str(this.s(), k);
  protected readonly tarjetas = computed(() => list<{ tipo: string; imagen: string; titulo: string; texto: string }>(this.s(), 'tarjetas'));
  protected readonly marcas = computed(() => list<{ nombre: string; logo: string }>(this.s(), 'marcas'));
}

/** «Section / Sorteo»: the raffle panel (title, price, sold counter and CTAs) with the belt photo. */
@Component({
  selector: 'gr-sec-sorteo',
  imports: [RouterLink, GrButton, GrIcon, GrEyebrow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block bg-bg-base md:px-20 md:py-24' },
  template: `
    @let r = sorteo();
    @let p = pagina();
    <div class="relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 overflow-hidden bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] px-5 py-14 md:rounded-2xl md:border md:border-accent/35 md:p-12 lg:flex-row lg:gap-12 lg:p-[72px]">
      <div [class]="glow + ' -top-30 right-[-60px] size-[520px] bg-[radial-gradient(closest-side,rgb(196_43_62/0.25),transparent)]!'"></div>
      <img [src]="t('imagen') || (p && r?.premioImagen) || 'https://jaimedigitalstudio.b-cdn.net/grcup/frames/belt_output_webp/frame_000090.webp'" [alt]="r?.premio || 'Cinturón SBD'"
        class="relative aspect-[350/230] w-full rounded-xl border border-white/8 object-cover lg:order-last lg:aspect-[488/380] lg:w-[488px] lg:shrink-0" [attr.loading]="p ? null : 'lazy'" [attr.fetchpriority]="p ? 'high' : null" />
      <div class="relative flex w-full flex-col items-center gap-4 text-center lg:max-w-[520px] lg:items-start lg:text-left">
        <gr-eyebrow [texto]="t('eyebrow') || 'Sorteo benéfico'" tono="claro" />
        @if (p) { <h1 class="text-display-l [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-hero">Sorteo</h1> }
        @else { <h2 class="text-display-l [text-shadow:0_2px_20px_rgb(0_0_0/0.8)] md:text-display-hero">{{ t('titulo') || 'Sorteo' }}</h2> }
        <p class="text-display-xs md:text-display-m">{{ t('subtitulo') || 'Entra en el sorteo de un ' + (r?.premio || 'cinturón SBD') }}</p>
        <p class="text-body-m text-text-secondary md:text-body-l">{{ texto() || t('texto') }}</p>
        @if (r) {
          <div class="flex flex-wrap items-center gap-3">
            <span class="inline-flex h-[35px] items-center gap-2 rounded-pill border border-white/15 bg-black/25 px-4 text-label-s"><gr-icon name="ticket" [size]="16" />{{ euros(r.precio) }} por boleto</span>
            <span class="text-body-s text-text-tertiary">{{ r.maxPorPersona ? 'Hasta ' + r.maxPorPersona + ' por persona' : 'Boletos ilimitados' }}</span>
          </div>
          <div class="flex w-full max-w-[360px] flex-col gap-2">
            <div class="flex justify-between"><span class="text-label-s text-text-secondary">Boletos vendidos</span><span class="text-mono-s">{{ num(r.vendidos) }}{{ r.totalMax ? ' / ' + num(r.totalMax) : '' }}</span></div>
            @if (r.totalMax) { <div class="h-2 overflow-hidden rounded-pill bg-bg-raised"><div class="h-full rounded-pill bg-[linear-gradient(120deg,#c42b3e,#6e1420)]" [style.width.%]="(r.vendidos / r.totalMax) * 100"></div></div> }
          </div>
        }
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          @if (!p) { <a grButton variant="display" size="l" href="/sorteo">{{ cta() }}</a> }
          @else if (r?.estado === 'en_venta') { <a grButton variant="primary" size="l" routerLink="." fragment="participa" class="rounded-pill!">Compra ya</a> }
          @if (p) { <a grButton variant="glass" size="l" routerLink="." fragment="normas" iconRight="arrow-right">Ver normas</a> }
          @else { <a grButton variant="glass" size="l" href="/politica-concurso" iconRight="arrow-right">Ver normas</a> }
        </div>
      </div>
    </div>
  `,
})
export class SecSorteo {
  readonly s = input<Seccion | undefined>();
  readonly sorteo = input<SorteoHome | null>(null);
  /** On /sorteo itself: the page's h1, «Compra ya» to the form and «Ver normas» to the rules (Figma 07 «Section / Sorteo»). */
  readonly pagina = input(false);
  readonly texto = input('');
  protected readonly glow = GLOW;
  protected readonly num = num;
  protected readonly euros = euros;
  protected t = (k: string) => str(this.s(), k);
  protected readonly cta = computed(() => ({ en_venta: 'Participa ya', sorteado: 'Ver el ganador', proximamente: 'Muy pronto' } as Record<string, string>)[this.sorteo()?.estado ?? ''] ?? 'Ver el sorteo');
}

/** «Section / Categorías»: men's and women's weight classes (a segmented switch on mobile) and the minimum totals. */
@Component({
  selector: 'gr-sec-categorias',
  imports: [GrButton, GrIcon, GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    <div class="pointer-events-none absolute top-[120px] left-1/2 aspect-square w-full max-w-[720px] -translate-x-1/2 opacity-22 md:top-20">
      <img [src]="t('imagen') || '/img/home/categorias.webp'" alt="" class="size-full object-cover" loading="lazy" />
      <div class="absolute inset-0 bg-[radial-gradient(closest-side,transparent_20%,#0e0c0d)]"></div>
    </div>
    <div [class]="ancho + ' flex flex-col items-center gap-6 md:gap-10'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" [texto]="t('texto')" [textoMovil]="false" />
      <div class="grid w-full grid-cols-2 gap-1 rounded-md border border-line-subtle p-1 md:hidden" role="tablist" aria-label="Sexo">
        @for (g of generos; track g.k) {
          <button type="button" role="tab" [attr.aria-selected]="sel() === g.k" (click)="sel.set(g.k)" class="h-11 rounded-sm text-label-m" [class]="sel() === g.k ? 'bg-accent-grain text-text-primary' : 'text-text-secondary'">{{ g.l }}</button>
        }
      </div>
      <div class="flex w-full flex-col justify-center gap-6 md:flex-row">
        @for (g of generos; track g.k) {
          <div class="w-full flex-col gap-4 rounded-xl border border-line-subtle bg-[#221d1f]/85 px-4 py-5 md:flex md:w-auto md:flex-1 md:p-6 lg:w-[400px] lg:flex-none lg:p-7" [class.flex]="sel() === g.k" [class.hidden]="sel() !== g.k">
            <div class="hidden items-center justify-between md:flex"><span class="text-display-xs">{{ g.l }}</span><span class="text-label-xs text-text-muted">{{ cats[g.k].length }} categorías</span></div>
            <ul class="grid grid-cols-2 gap-2 lg:grid-cols-3">
              @for (c of cats[g.k]; track c; let last = $last) { <li class="flex h-[53px] items-center justify-center rounded-sm border border-line-subtle bg-bg-card text-display-body" [class]="last && cats[g.k].length % 2 ? 'col-span-2 mx-auto w-[calc(50%-4px)] lg:col-span-1 lg:mx-0 lg:w-auto' : ''">{{ kg(c) }}</li> }
            </ul>
          </div>
        }
      </div>
      <div class="flex w-full max-w-[824px] flex-col items-center gap-3 rounded-lg border border-accent/60 bg-accent/6 p-5 text-center md:flex-row md:gap-6 md:px-7 md:text-left">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/14 text-accent-text"><gr-icon name="trophy" [size]="20" /></span>
        <span class="flex flex-1 flex-col gap-1"><span class="text-label-m">{{ t('ctaTitulo') || 'Consulta las marcas mínimas' }}</span><span class="text-body-s text-text-tertiary">{{ t('ctaTexto') || 'Para clasificar para otras competiciones AEP (PDF oficial).' }}</span></span>
        <a grButton variant="glass" href="/marcas-minimas" iconRight="arrow-right">Ver marcas mínimas</a>
      </div>
    </div>
  `,
})
export class SecCategorias {
  readonly s = input<Seccion | undefined>();
  protected readonly ancho = ANCHO;
  protected readonly cats = CATEGORIAS_IPF;
  protected readonly generos = [{ k: 'M' as const, l: 'Hombres' }, { k: 'F' as const, l: 'Mujeres' }];
  protected readonly sel = signal<'M' | 'F'>('M');
  protected t = (k: string) => str(this.s(), k);
  protected kg = (c: string) => c.replace('-', '−') + 'kg';
}

interface Bloque { sexo: 'M' | 'F'; pesos: string[]; inicio: string; fin: string }

/**
 * «Section / Horarios»: the published schedule by day — consecutive flights of the same sex merge into one block
 * (categories + time range), as in the Figma table (cards on mobile).
 */
@Component({
  selector: 'gr-sec-horarios',
  imports: [GrButton, GrCabecera, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    <div class="pointer-events-none absolute top-15 left-1/2 aspect-[2/3] w-full max-w-[560px] -translate-x-1/2 opacity-22">
      <img [src]="t('imagen') || '/img/home/horarios.webp'" alt="" class="size-full object-cover" loading="lazy" />
      <div class="absolute inset-0 bg-[radial-gradient(closest-side,transparent_20%,#141112)]"></div>
    </div>
    <div [class]="ancho + ' flex flex-col items-center gap-6 md:gap-10'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
      <div class="flex w-full max-w-[880px] flex-col gap-4">
        <div class="flex gap-1.5" role="tablist" aria-label="Días">
          @for (d of dias(); track d.fecha; let i = $index) {
            <button type="button" role="tab" [attr.aria-selected]="i === diaSel()" (click)="diaSel.set(i)" class="flex flex-col items-center gap-2 px-4 pt-3">
              <span class="text-display-body" [class.text-text-tertiary]="i !== diaSel()">{{ d.etiqueta }}</span>
              <span class="h-[3px] w-full rounded-[2px]" [class.bg-accent]="i === diaSel()"></span>
            </button>
          }
        </div>
        @if (dias()[diaSel()]; as d) {
          <!-- desktop table -->
          <div class="hidden overflow-hidden rounded-lg border border-line-subtle bg-[#221d1f]/90 md:block">
            <div class="grid grid-cols-[140px_1fr_auto] gap-4 px-5 py-4 text-label-xs text-text-muted"><span>Categoría</span><span>Pesos</span><span>Horario</span></div>
            @for (b of d.bloques; track $index) {
              <div class="grid grid-cols-[140px_1fr_auto] items-center gap-4 border-t border-line-subtle bg-white/2 px-4 py-4">
                <span class="text-display-label text-accent-text">{{ b.sexo === 'F' ? 'Femenino' : 'Masculino' }}</span>
                <span class="text-display-body">{{ b.pesos.join(' KG, ') }} KG</span>
                <span class="text-display-body tabular-nums">{{ b.inicio }} – {{ b.fin }}</span>
              </div>
            }
          </div>
          <!-- mobile cards -->
          <ul class="flex flex-col gap-4 md:hidden">
            @for (b of d.bloques; track $index) {
              <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-[#221d1f]/90 p-4">
                <span class="flex items-center justify-between">
                  <span class="inline-flex h-[22px] items-center rounded-pill px-2.5 text-label-xs" [class]="b.sexo === 'F' ? 'bg-warning/14 text-warning' : 'bg-accent/14 text-accent-text'">{{ b.sexo === 'F' ? 'Femenino' : 'Masculino' }}</span>
                  <span class="flex items-center gap-1.5 text-mono-s tabular-nums"><gr-icon name="clock" [size]="14" class="text-text-tertiary" />{{ b.inicio }} – {{ b.fin }}</span>
                </span>
                <span class="text-display-body">{{ b.pesos.join(' · ') }} KG</span>
              </li>
            }
          </ul>
        }
        <a grButton variant="glass" href="/horarios" iconRight="arrow-right" class="self-center">Ver horario completo</a>
      </div>
    </div>
  `,
})
export class SecHorarios {
  readonly s = input<Seccion | undefined>();
  readonly horarios = input<Horarios | null>(null);
  protected readonly ancho = ANCHO;
  protected readonly diaSel = signal(0);
  protected t = (k: string) => str(this.s(), k);
  protected readonly dias = computed(() => (this.horarios()?.dias ?? []).map((d) => {
    const etiqueta = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d.fecha + 'T12:00:00Z')).replace(',', '').replace('.', '');
    const fl = [...d.flights].sort((a, b) => a.inicio.localeCompare(b.inicio));
    const bloques: (Bloque & { finMs: number })[] = [];
    for (const f of fl) {
      const sexo = (f.sexo === 'F' ? 'F' : 'M') as 'M' | 'F';
      const pesos = (f.titulo.match(/[−+-]\s?\d+/g) ?? []).map((p) => p.replace('-', '−').replace(/\s/g, ''));
      const ultimo = bloques[bloques.length - 1];
      const ini = new Date(f.inicio).getTime();
      if (ultimo && ultimo.sexo === sexo && ini - ultimo.finMs <= 60 * 60_000) {
        ultimo.pesos.push(...pesos.filter((p) => !ultimo.pesos.includes(p)));
        ultimo.fin = hora(f.fin);
        ultimo.finMs = new Date(f.fin).getTime();
      } else {
        bloques.push({ sexo, pesos, inicio: hora(f.inicio), fin: hora(f.fin), finMs: new Date(f.fin).getTime() });
      }
    }
    return { fecha: d.fecha, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1), bloques };
  }).filter((d) => d.bloques.length));
}

/** «Section / Localización»: exterior photo and three small ones, and the map card with the address and actions. */
@Component({
  selector: 'gr-sec-localizacion',
  imports: [GrButton, GrIcon, GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    @let c = comp();
    <div [class]="ancho + ' flex flex-col items-center gap-6 md:gap-12'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" [texto]="t('texto')" />
      <div class="flex w-full flex-col-reverse gap-6 lg:flex-row lg:gap-8">
        <div class="flex w-full flex-col gap-4 lg:w-[648px] lg:shrink-0">
          <ul class="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-3" (scroll)="alDesplazar($event)">
            @for (f of fotos(); track f.imagen; let i = $index) {
              <li class="relative aspect-[300/210] w-[300px] shrink-0 snap-center overflow-hidden rounded-lg md:w-auto md:aspect-[4/3]" [class]="(i === 0 ? 'lg:col-span-3 lg:aspect-[648/380] lg:rounded-xl ' : 'lg:aspect-[205/140] ') + foto">
                <img [src]="f.imagen" [attr.srcset]="srcset(f.imagen)" [attr.sizes]="i === 0 ? '(min-width: 768px) 648px, 300px' : '(min-width: 768px) 205px, 300px'" [alt]="f.alt" class="absolute inset-0 size-full object-cover" loading="lazy" />
              </li>
            }
          </ul>
          <div class="flex items-center justify-center gap-1.5 md:hidden" aria-hidden="true">
            @for (f of fotos(); track f.imagen; let i = $index) { <span class="h-1.5 rounded-pill transition-all" [class]="i === activa() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
          </div>
        </div>
        @if (c) {
          <div class="flex w-full flex-col self-start overflow-hidden rounded-lg border border-line-subtle bg-bg-card lg:w-[520px]">
            <div class="relative aspect-[348/200] md:aspect-[518/300]">
              <img [src]="t('mapa') || '/img/home/mapa.webp'" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
              <span class="absolute right-2 bottom-2 rounded-[4px] bg-black/50 px-1.5 py-0.5 text-body-xs text-text-tertiary">© OpenStreetMap</span>
            </div>
            <div class="flex flex-col gap-3 p-5 md:p-7">
              <p class="text-display-xs">{{ c.sede.nombre }}</p>
              <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="map-pin" [size]="16" class="shrink-0 text-accent-text" />{{ direccion() }}</p>
              <div class="flex flex-col gap-2 sm:flex-row">
                <a grButton variant="display-gradient" [href]="c.sede.mapsUrl" target="_blank" rel="noopener" icon="map-pin">Abrir en Google Maps</a>
                <button grButton variant="outline" type="button" (click)="copiar()">{{ copiado() ? 'Dirección copiada' : 'Copiar dirección' }}</button>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class SecLocalizacion {
  readonly s = input<Seccion | undefined>();
  readonly comp = input<CompeticionPublica | null>(null);
  protected readonly ancho = ANCHO;
  protected readonly foto = FOTO;
  protected readonly srcset = srcset;
  protected readonly activa = signal(0);
  protected readonly copiado = signal(false);
  protected t = (k: string) => str(this.s(), k);
  protected readonly fotos = computed(() => list<{ imagen: string; alt: string }>(this.s(), 'imagenes'));
  protected readonly direccion = computed(() => {
    const s = this.comp()?.sede;
    return s ? [s.direccion, [s.cp, s.ciudad].filter(Boolean).join(' ') + (s.provincia ? ` (${s.provincia})` : '')].filter(Boolean).join(' · ') : '';
  });
  protected alDesplazar(e: Event): void { this.activa.set(Math.round((e.target as HTMLElement).scrollLeft / 312)); }
  protected copiar(): void {
    void navigator.clipboard?.writeText(`${this.comp()?.sede.nombre}, ${this.direccion().replace(' · ', ', ')}`).then(() => {
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2500);
    });
  }
}

/** «Section / FAQ»: the featured questions as an accordion (the first one open) and the contact link. */
@Component({
  selector: 'gr-sec-faq',
  imports: [GrButton, GrIcon, GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    <div [class]="ancho + ' flex flex-col items-center gap-6 md:gap-10'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
      <ul class="flex w-full max-w-[760px] flex-col gap-3">
        @for (f of items(); track f.pregunta; let i = $index) {
          <li class="rounded-lg border px-5 py-4 transition-colors md:px-6 md:py-5" [class]="abierta() === i ? 'border-accent bg-bg-surface' : 'border-line-subtle bg-bg-card'">
            <button type="button" class="flex w-full items-center gap-4 text-left" [attr.aria-expanded]="abierta() === i" [attr.aria-controls]="'faq-' + i" (click)="abierta.set(abierta() === i ? -1 : i)">
              <span class="flex-1 text-ui-h5 md:text-ui-h4">{{ f.pregunta }}</span>
              <span class="flex size-8 shrink-0 items-center justify-center rounded-full" [class]="abierta() === i ? 'bg-accent/15 text-accent-text' : 'bg-white/5 text-text-secondary'"><gr-icon [name]="abierta() === i ? 'minus' : 'plus'" [size]="16" /></span>
            </button>
            @if (abierta() === i) { <div [id]="'faq-' + i" class="prose-gr mt-3 text-body-m text-text-tertiary" [innerHTML]="md(f.respuesta)"></div> }
          </li>
        }
      </ul>
      <div class="flex flex-col items-center gap-3 md:flex-row">
        <span class="text-body-m text-text-tertiary">¿No encuentras tu respuesta?</span>
        <a grButton variant="outline" [href]="contacto() ? 'mailto:' + contacto() : '/preguntas-frecuentes'">Escríbenos</a>
      </div>
    </div>
  `,
})
export class SecFaq {
  readonly s = input<Seccion | undefined>();
  readonly items = input<Faq[]>([]);
  readonly contacto = input('');
  protected readonly ancho = ANCHO;
  protected readonly abierta = signal(0);
  protected t = (k: string) => str(this.s(), k);
  protected md = (s: string) => renderMarkdown(s).html;
}
