import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { renderMarkdown, type Faq, type Seccion } from '../core/cms';
import type { CompeticionPublica } from '../core/competition';
import { CATEGORIAS_IPF, Favoritos } from '../core/atletas';
import { hora, qrDataURL, type Entradas, type SesionPub } from '../core/entradas';
import { HorariosPublic, ICS_URL, type Horarios, type PubAtleta, type PubFlight } from '../core/horarios';
import { Lightbox } from '../layout/lightbox';
import { ANCHO, GLOW, GrCabecera, GrEyebrow, GrTitulo, SECCION, sinNumero, textoTitulo } from './bloques';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);
/** «1.248» (Spanish grouping also for four digits, as in Figma). */
const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const euros = (c: number) => (c % 100 ? (c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) : String(c / 100)) + ' €';
/** Responsive image of the home assets: «/img/home/x-l.webp» → srcset with the «-s» variant (640 px). */
const srcset = (src: string) => (/-l\.webp$/.test(src) ? `${src.replace(/-l\.webp$/, '-s.webp')} 640w, ${src} 1200w` : null);
/** Hairline photo border of Figma (white 8 %). */
const FOTO = 'border border-white/8';

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

/**
 * «Section / Alta de atleta» (Figma home R2 393:143503 · 387:105287): title, the iPhone with the athlete's story, the six
 * reasons (2 columns; icon and title stacked and centred) and the CTA. The intro text stays for SEO only (sr-only).
 */
@Component({
  selector: 'gr-sec-alta',
  imports: [RouterLink, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block bg-bg-base px-5 pt-10 pb-18 md:px-8 md:pt-16 md:pb-24 xl:px-20 xl:pb-32' },
  template: `
    <div class="mx-auto flex max-w-[1200px] flex-col items-center gap-8 md:gap-12">
      <h2 class="text-center font-display text-[36px] leading-[1.25] tracking-[0.06em] uppercase [text-shadow:0_0_24px_rgb(196_43_62/0.6)] md:text-[56px]">{{ s()?.['titulo'] || 'Crea tu perfil de atleta' }}</h2>
      <p class="sr-only">{{ s()?.['texto'] || 'Si compites en la GR Cup 2026, crea tu perfil de atleta: foto, club y mejores marcas. Lo revisamos a mano y queda privado hasta que actives su publicación desde el área de atleta.' }}</p>
      <div class="flex w-full flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <!-- Figma «Carrusel iPhone»: one slide (the athlete's story) and the 4-dot indicator -->
        <div class="flex shrink-0 flex-col items-center gap-4" aria-hidden="true">
          <div class="relative h-[650px] w-[300px] rounded-[48px] border border-white/20 bg-[#0b0a0a] p-[11px] shadow-[0_30px_80px_rgb(0_0_0/0.6)]">
            <div class="relative flex size-full flex-col overflow-hidden rounded-[38px] bg-black">
              <div class="flex h-[50px] shrink-0 items-center justify-between px-7 text-[13px] font-semibold text-white"><span>9:41</span><span class="h-[9px] w-[19px] rounded-[3px] bg-white"></span></div>
              <span class="absolute top-3 left-1/2 h-6 w-[83px] -translate-x-1/2 rounded-pill bg-black ring-1 ring-white/10"></span>
              <img src="/img/home/alta-story.webp" alt="" width="278" height="514" class="w-full flex-1 object-cover" loading="lazy" decoding="async" />
              <span class="absolute bottom-2 left-1/2 h-1 w-[95px] -translate-x-1/2 rounded-pill bg-white/80"></span>
            </div>
          </div>
          <span class="flex items-center gap-2"><span class="h-2 w-6 rounded-pill bg-accent"></span><span class="size-2 rounded-full bg-white/25"></span><span class="size-2 rounded-full bg-white/25"></span><span class="size-2 rounded-full bg-white/25"></span></span>
        </div>
        <a grButton variant="primary" size="l" routerLink="/alta-atleta" class="w-full lg:hidden">{{ s()?.['cta'] || 'Dar de alta mi atleta' }}</a>
        <div class="flex w-full flex-col items-center gap-6 lg:w-[760px] lg:gap-10">
          <h3 class="text-center font-display text-[28px] leading-[1.25] tracking-[0.02em] md:text-[32px]">Por qué darte de alta como atleta</h3>
          <ul class="grid w-full grid-cols-2 gap-3 md:gap-5">
            @for (b of beneficios; track b.t) {
              <li class="flex min-h-[124px] flex-col items-center justify-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-5 text-center md:min-h-[150px]">
                <span class="flex size-11 items-center justify-center rounded-md bg-accent/16 text-accent-text"><gr-icon [name]="b.i" [size]="20" /></span>
                <span class="text-[15px] leading-[19px] font-semibold md:text-[14px]">{{ b.t }}</span>
              </li>
            }
          </ul>
          <a grButton variant="primary" size="l" routerLink="/alta-atleta" class="hidden lg:inline-flex">{{ s()?.['cta'] || 'Dar de alta mi atleta' }}</a>
        </div>
      </div>
    </div>
  `,
})
export class SecAlta {
  readonly s = input<Seccion | undefined>();
  protected readonly beneficios: { i: GrIconName; t: string }[] = [
    { i: 'user', t: 'Área de atleta personalizada' },
    { i: 'image', t: 'Tu póster de competición' },
    { i: 'activity', t: 'Tus datos en tiempo real' },
    { i: 'award', t: 'Perfil público verificado' },
    { i: 'trophy', t: 'GRS Fantasy y porra general' },
    { i: 'bell', t: 'Mejor atención del club' },
  ];
}

/**
 * «Section / Entradas»: why to book (icons), the CTAs and live social proof, next to an example ticket (rotated −3°,
 * real QR) and the capacity meter of the fullest open session.
 */
@Component({
  selector: 'gr-sec-entradas',
  imports: [RouterLink, GrButton, GrIcon, GrEyebrow, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    <div [class]="glow + ' -top-40 right-[-80px] size-[480px] md:right-[-220px] md:size-[760px] bg-[radial-gradient(closest-side,rgb(110_20_32/0.22),transparent)]!'"></div>
    <!-- Figma home R2: mobile = header · ticket · points · CTAs · social proof; desktop = text column | ticket -->
    <div [class]="ancho + ' grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-x-[72px] lg:gap-y-10'">
      <div class="flex flex-col gap-3 md:gap-4 lg:col-start-1 lg:row-start-1 lg:self-end">
        <gr-eyebrow [texto]="t('eyebrow')" />
        <h2 class="text-display-s md:text-display-l"><gr-titulo [titulo]="t('titulo')" [acento]="t('tituloAcento')" /></h2>
      </div>
      <div class="flex w-full flex-col gap-7 lg:col-start-1 lg:row-start-2 lg:self-start">
        <ul class="flex flex-col gap-3">
          @for (p of puntos(); track p.titulo; let i = $index) {
            <li class="flex items-center gap-3">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="icons[i % 3]" [size]="18" /></span>
              <span class="text-label-m">{{ p.titulo }}</span>
            </li>
          }
        </ul>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" routerLink="/entradas" data-cta-entrada>Reserva tu entrada gratis</a>
          <a grButton variant="glass" size="l" routerLink="/horarios" iconRight="arrow-right">Ver horarios</a>
        </div>
        @if (entradas()?.personas) {
          <div class="flex items-center gap-3">
            <span class="flex items-center" aria-hidden="true">
              @for (a of avatares; track a) { <span class="-ml-2.5 flex size-8 items-center justify-center rounded-full border-2 border-bg-base bg-[linear-gradient(135deg,#58202b,#1b1718)] text-label-xs first:ml-0">{{ a }}</span> }
            </span>
            <span class="text-body-s">{{ num(entradas()!.personas) }} personas ya tienen entrada</span>
          </div>
        }
      </div>
      <div class="row-start-2 flex w-full flex-col items-center gap-4 justify-self-center lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-[400px]">
        <!-- Example ticket (Figma «Ticket») -->
        <div class="w-full max-w-[400px] overflow-hidden rounded-xl border border-accent/55 bg-[linear-gradient(135deg,#4c111b,#280d12_55%,#170c0e)] shadow-card" aria-hidden="true">
          <div class="flex flex-col gap-3 px-5 pt-6 pb-4">
            <div class="flex items-center justify-between">
              <img [src]="logo" alt="" class="h-8 w-auto" />
              <span class="inline-flex h-6 items-center rounded-pill border border-white/25 bg-white/6 px-2.5 text-label-xs text-text-secondary">Entrada gratuita</span>
            </div>
            <p class="text-display-xs">{{ nombreTicket() }}</p>
            <ul class="flex flex-col gap-2 text-body-s text-text-secondary">
              @for (m of metaTicket(); track m.t) { <li class="flex items-center gap-2.5"><gr-icon [name]="m.i" [size]="15" class="text-accent-text" />{{ m.t }}</li> }
            </ul>
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
          <div class="flex w-full max-w-[400px] flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card px-4 py-5">
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
  protected readonly glow = GLOW;
  protected readonly ancho = ANCHO;
  protected readonly logo = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo-2026.png';
  protected readonly icons: GrIconName[] = ['ticket', 'users', 'trophy'];
  protected readonly avatares = ['LG', 'CS', 'MR', 'JT'];
  protected readonly num = num;
  protected readonly qr = signal('');
  protected t = (k: string) => str(this.s(), k);
  /** Figma home R2: only icon + title per point (the CMS text is not shown). */
  protected readonly puntos = computed(() => list<{ titulo: string }>(this.s(), 'puntos'));
  /** «GRS CUP 2 · 2026» (Figma ticket). */
  protected readonly nombreTicket = computed(() => {
    const c = this.comp();
    return c?.fechaInicio ? `GRS Cup 2 · ${c.fechaInicio.slice(0, 4)}` : (c?.nombre || 'GRS Cup 2');
  });
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

/** «Section / Organización»: header and the 2 × 2 bento of captioned photos (a swipeable track on mobile). */
@Component({
  selector: 'gr-sec-organizacion',
  imports: [GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    <div [class]="ancho + ' flex flex-col items-center gap-7 md:gap-12'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" [texto]="t('texto')" />
      <ul #pista class="-mx-5 flex w-[calc(100%+40px)] snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:w-full md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0" (scroll)="alDesplazar($event)">
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
      <div class="flex items-center md:hidden" role="group" aria-label="Fotos">
        @for (f of fotos(); track f.imagen; let i = $index) { <button type="button" class="relative flex size-6 items-center justify-center before:absolute before:-inset-2.5 before:content-['']" [attr.aria-label]="'Ir a foto ' + (i + 1)" [attr.aria-current]="i === activa() || null" (click)="irA(pista, i)"><span class="h-1.5 rounded-pill transition-all motion-reduce:transition-none" [class]="i === activa() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span></button> }
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
  protected readonly irA = irA;
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
      @if (t('eyebrow')) { <p class="sr-only">{{ sinNumero(t('eyebrow')) }}</p> }
      <gr-cabecera [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
      <!-- Figma home R2: the three organisers with their real logos in black and white -->
      <ul class="grid w-full grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        @for (c of tarjetas; track c.titulo) {
          <li class="relative flex w-full flex-col gap-4 overflow-hidden rounded-lg border border-line-subtle bg-bg-card p-5 md:items-center md:p-7 md:text-center">
            <span class="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.25),transparent)]"></span>
            <span class="flex aspect-[326/180] w-full items-center justify-center px-6"><img [src]="c.logo" [alt]="c.alt" class="max-h-20 w-full max-w-[260px] object-contain grayscale" loading="lazy" decoding="async" /></span>
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
  protected readonly sinNumero = sinNumero;
  protected readonly tarjetas = [
    { logo: '/img/home/afil-aep-bn.webp', alt: 'AEP · Asociación Española de Powerlifting', titulo: 'AEP', texto: 'Afiliada a la Asociación Española de Powerlifting, con jueces oficiales.' },
    { logo: '/img/home/afil-grs-strength-bn.webp', alt: 'GRS Strength', titulo: 'GRS Strength', texto: 'Club organizador: reúne a la comunidad de powerlifting.' },
    { logo: '/img/home/afil-almussafes-bn.webp', alt: "Ajuntament d'Almussafes", titulo: "Ajuntament d'Almussafes", texto: "Colabora el Ajuntament d'Almussafes, municipio anfitrión." },
  ];
  protected readonly marcas = computed(() => list<{ nombre: string; logo: string }>(this.s(), 'marcas'));
}

/** «Section / Categorías»: men's and women's weight classes (a segmented switch on mobile) and the minimum totals. */
@Component({
  selector: 'gr-sec-categorias',
  imports: [RouterLink, GrButton, GrIcon, GrCabecera],
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
              @for (c of cats[g.k]; track c; let last = $last) { <li [class]="last && cats[g.k].length % 2 ? 'col-span-2 mx-auto w-[calc(50%-4px)] lg:col-span-1 lg:mx-0 lg:w-auto' : ''"><a routerLink="/categorias-de-peso" class="flex h-[53px] items-center justify-center rounded-sm border border-line-subtle bg-bg-card text-display-body transition-transform duration-[120ms] hover:border-line-strong active:scale-[.97] motion-reduce:transition-none" [attr.aria-label]="kg(c) + ' · ver categorías de peso'">{{ kg(c) }}</a></li> }
            </ul>
          </div>
        }
      </div>
      <div class="flex w-full max-w-[824px] flex-col items-center gap-3 rounded-lg border border-accent/60 bg-accent/6 p-5 text-center md:flex-row md:gap-6 md:px-7 md:text-left">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/14 text-accent-text"><gr-icon name="trophy" [size]="20" /></span>
        <span class="flex flex-1 flex-col gap-1"><span class="text-label-m">{{ t('ctaTitulo') || 'Consulta las marcas mínimas' }}</span><span class="text-body-s text-text-tertiary">{{ t('ctaTexto') || 'Para clasificar para otras competiciones AEP (PDF oficial).' }}</span></span>
        <a grButton variant="glass" routerLink="/marcas-minimas" iconRight="arrow-right">Ver marcas mínimas</a>
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

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const ICONOS: Record<string, GrIconName> = { door: 'door', trophy: 'trophy', gift: 'gift', clock: 'clock', ticket: 'ticket', users: 'users', info: 'info', camera: 'camera' };
const ESTADO: Record<string, string> = { finalizado: 'Finalizado', en_curso: 'En curso', programado: 'Programado' };
type Vista = 'todos' | 'detallado' | 'mio';
interface FilaHorario { t: string; flight?: PubFlight; item?: { titulo: string; icono: GrIconName } }

/**
 * «Section / Horarios v2» (Figma home R2 393:144990 · 211:126138, tabs 393:145943/146508 · 393:143915/144146): day tabs,
 * sex filter, the three views (Todos · Detallado · ★ Mi horario), search, and the published groups of the day (sex, weight
 * classes, athletes and weigh-in, state and start time) between the agenda items. The server renders the summary; the
 * athletes (Detallado, Mi horario, search) load in the browser. Stars are the same favourites as /horarios.
 */
@Component({
  selector: 'gr-sec-horarios',
  imports: [RouterLink, GrButton, GrIcon, GrTitulo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-base' },
  template: `
    <div [class]="glow + ' -top-20 right-[-120px] size-[560px]'"></div>
    <div [class]="ancho + ' flex flex-col gap-8 md:gap-10'">
      <div class="flex flex-col gap-3 md:gap-4">
        <h2 class="text-display-s md:text-display-l"><gr-titulo [titulo]="t('titulo') || 'Horarios *en directo*'" [acento]="t('tituloAcento')" /></h2>
        <p class="text-body-m text-text-tertiary md:text-body-l">{{ t('texto') || 'Cuándo compite cada atleta y si va con retraso. Se actualiza solo: no hace falta recargar.' }}</p>
      </div>
      <div class="flex flex-col gap-3 md:gap-4">
        <div class="grid grid-cols-3 gap-1 rounded-md border border-line-subtle p-1 md:w-[420px]" role="tablist" aria-label="Vista">
          @for (v of vistas; track v.k) {
            <button type="button" role="tab" [attr.aria-selected]="vista() === v.k" (click)="elegir(v.k)" class="h-10 rounded-sm px-1 text-label-s whitespace-nowrap" [class]="vista() === v.k ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'">{{ v.k === 'mio' ? '★ Mi horario (' + misAtletas().length + ')' : v.l }}</button>
          }
        </div>
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
          <div class="order-first flex gap-1.5 md:order-none" role="tablist" aria-label="Días">
            @for (d of dias(); track d.fecha; let i = $index) {
              <button type="button" role="tab" [attr.aria-selected]="i === diaSel()" (click)="diaSel.set(i)" class="relative h-11 shrink-0 px-4 font-display text-[18px] uppercase italic" [class]="i === diaSel() ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'">
                {{ d.etiqueta }}<span class="absolute inset-x-4 bottom-0 h-[3px] rounded-[2px]" [class]="i === diaSel() ? 'bg-accent' : 'bg-transparent'"></span>
              </button>
            }
          </div>
          <div class="grid grid-cols-3 gap-1 rounded-md border border-line-subtle p-1 md:w-[300px]" role="radiogroup" aria-label="Sexo">
            @for (g of sexos; track g.k) {
              <button type="button" role="radio" [attr.aria-checked]="sexo() === g.k" (click)="sexo.set(g.k)" class="h-9 rounded-sm text-label-s" [class]="sexo() === g.k ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'">{{ g.l }}</button>
            }
          </div>
          <label class="flex h-12 flex-1 items-center gap-2 rounded-md border border-line-subtle bg-bg-deep px-4 focus-within:border-line-strong">
            <gr-icon name="search" [size]="18" class="text-text-tertiary" />
            <input type="search" class="min-w-0 flex-1 bg-transparent text-body-m outline-none placeholder:text-text-muted" placeholder="¿Cuándo compite…?" aria-label="Buscar atleta o club" [value]="q()" (input)="buscar($any($event.target).value)" />
          </label>
        </div>
      </div>

      @if (vista() === 'mio') {
        <!-- Figma «Horarios · pestaña Mi horario» -->
        @if (misAtletas().length) {
          <section class="flex flex-col gap-4 rounded-xl border border-line-subtle bg-bg-card p-5 md:p-6">
            <h3 class="flex items-center gap-2 text-ui-h5"><gr-icon name="star" [size]="18" class="fill-current text-accent-text" />Mi horario<span class="ml-auto text-body-xs text-text-muted">{{ misAtletas().length }} {{ misAtletas().length === 1 ? 'atleta' : 'atletas' }}</span></h3>
            <ul class="flex flex-col">
              @for (m of misAtletas(); track m.a.slug) {
                <li class="flex items-center gap-3 border-b border-line-subtle py-3">
                  <span class="flex size-11 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-[linear-gradient(135deg,#58202b,#1b1718)] text-label-s">{{ iniciales(m.a.nombre) }}</span>
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <a [routerLink]="['/atletas', m.a.slug]" class="truncate text-label-m hover:underline">{{ m.a.nombre }}</a>
                    <span class="text-body-xs text-text-tertiary">{{ m.a.sexo }} {{ kg(m.a.categoria) }} kg</span>
                    @if (m.f.estado === 'en_curso') { <span class="mt-1 inline-flex w-fit items-center gap-1.5 rounded-pill border border-accent/60 bg-accent/12 px-2.5 py-0.5 text-label-xs text-accent-text"><gr-icon name="radio" [size]="12" />En tarima</span> }
                  </span>
                  @if (m.f.estado !== 'en_curso') { <span class="text-mono-s tabular-nums">{{ hora(m.f.inicioEstimado || m.f.inicio) }}</span> }
                  <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-white" [attr.aria-label]="'Dejar de seguir a ' + m.a.nombre" (click)="fav.toggle(m.a.slug)"><gr-icon name="star" [size]="18" class="fill-current" /></button>
                </li>
              }
            </ul>
            <a grButton variant="primary" [href]="icsUrl()" download>Añadir mi horario al calendario</a>
            <p class="text-body-xs text-text-muted">Archivo .ics con las horas de tus atletas; se actualiza si hay retrasos.</p>
          </section>
        } @else {
          <div class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
            <gr-icon name="clock" [size]="24" />
            <p class="text-label-m">Aún no sigues a ningún atleta</p>
            <p class="text-body-s text-text-tertiary">Marca con ★ a tus atletas en «Todos» o «Detallado» y aquí verás solo sus horas.</p>
            <button grButton variant="primary" type="button" (click)="elegir('detallado')">Buscar atletas en Detallado</button>
          </div>
        }
      } @else {
        <ul class="flex flex-col gap-3">
          @for (r of filas(); track r.t + (r.flight?.id ?? r.item?.titulo)) {
            @if (r.item; as it) {
              <li class="flex items-center gap-4 rounded-lg border border-line-subtle px-4 py-3">
                <span class="text-mono-s text-accent-text tabular-nums">{{ r.t }}</span>
                <gr-icon [name]="it.icono" [size]="16" class="shrink-0 text-text-tertiary" />
                <span class="text-body-s text-text-secondary">{{ it.titulo }}</span>
              </li>
            } @else if (r.flight; as f) {
              @let abierto = vista() === 'detallado' || abiertos().includes(f.id);
              <li class="overflow-hidden rounded-xl border bg-bg-card" [class]="f.estado === 'en_curso' ? 'border-accent/70' : 'border-line-subtle'" [class.opacity-60]="f.estado === 'finalizado'">
                <button type="button" class="flex w-full items-center gap-4 p-4 text-left md:px-5" [attr.aria-expanded]="abierto" (click)="alternar(f.id)">
                  <span class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="text-label-xs tracking-[0.08em] uppercase">{{ f.sexo === 'F' ? 'Femenino' : 'Masculino' }}</span>
                    <span class="text-ui-h5">{{ pesos(f) }}</span>
                    <span class="text-body-xs text-text-tertiary">{{ f.total }} atletas · Pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}</span>
                    @if (f.estado !== 'programado' || vista() === 'todos') {
                      <span class="mt-1 inline-flex w-fit items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-label-xs uppercase" [class]="f.estado === 'en_curso' ? 'border-accent/60 bg-accent/12 text-accent-text' : 'border-line-strong text-text-tertiary'">
                        @if (f.estado === 'en_curso') { <gr-icon name="radio" [size]="12" /> } @else if (f.estado === 'finalizado') { <gr-icon name="check" [size]="12" /> }{{ estado[f.estado] }}
                      </span>
                    }
                  </span>
                  <span class="flex items-center gap-2 font-mono text-[26px] font-semibold tabular-nums md:text-[30px]"><gr-icon name="clock" [size]="22" />{{ hora(f.inicioEstimado || f.inicio) }}</span>
                  <gr-icon [name]="abierto ? 'chevron-up' : 'chevron-down'" [size]="18" class="shrink-0 text-text-tertiary" />
                </button>
                @if (abierto) {
                  @if (f.atletas.length) {
                    <ul class="border-t border-line-subtle">
                      @for (a of atletasDe(f); track a.slug) {
                        <li class="flex items-center gap-3 border-b border-line-subtle px-4 py-2.5 md:px-5">
                          <span class="w-6 text-mono-s text-text-muted tabular-nums">{{ pad(a.lote) }}</span>
                          <span class="flex min-w-0 flex-1 flex-col">
                            <a [routerLink]="['/atletas', a.slug]" class="truncate text-label-s hover:underline" [class.text-accent-text]="fav.has(a.slug)">{{ a.nombre }}</a>
                            <span class="truncate text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }}{{ a.divisionNombre ? ' · ' + a.divisionNombre : '' }}</span>
                          </span>
                          <span class="text-mono-s text-text-secondary">{{ a.sexo }} {{ kg(a.categoria) }} kg</span>
                          <button type="button" class="flex size-9 items-center justify-center rounded-full" [class]="fav.has(a.slug) ? 'text-accent-text' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="fav.has(a.slug)" [attr.aria-label]="(fav.has(a.slug) ? 'Dejar de seguir a ' : 'Seguir a ') + a.nombre" (click)="fav.toggle(a.slug)"><gr-icon name="star" [size]="16" [class.fill-current]="fav.has(a.slug)" /></button>
                        </li>
                      }
                    </ul>
                    <a routerLink="/horarios" class="flex items-center gap-1.5 px-4 py-3 text-label-s text-accent-text hover:underline md:px-5">Ver los {{ f.total }} atletas<gr-icon name="arrow-right" [size]="14" /></a>
                  } @else {
                    <p class="border-t border-line-subtle px-4 py-3 text-body-s text-text-tertiary md:px-5">{{ completos() ? 'Aún no hay atletas asignados.' : 'Cargando atletas…' }}</p>
                  }
                }
              </li>
            }
          } @empty {
            <li class="rounded-lg border border-line-subtle px-4 py-6 text-center text-body-s text-text-tertiary">No hay coincidencias para «{{ q() }}».</li>
          }
        </ul>
      }
      <a grButton variant="glass" routerLink="/horarios" iconRight="arrow-right" class="self-center">Ver horario completo</a>
    </div>
  `,
})
export class SecHorarios {
  readonly s = input<Seccion | undefined>();
  readonly horarios = input<Horarios | null>(null);
  protected readonly ancho = ANCHO;
  protected readonly glow = GLOW;
  protected readonly fav = inject(Favoritos);
  private readonly api = inject(HorariosPublic);
  protected readonly hora = hora;
  protected readonly estado = ESTADO;
  protected readonly vistas: { k: Vista; l: string }[] = [{ k: 'todos', l: 'Todos' }, { k: 'detallado', l: 'Detallado' }, { k: 'mio', l: 'Mi horario' }];
  protected readonly sexos = [{ k: 'F' as const, l: 'Femenino' }, { k: 'M' as const, l: 'Masculino' }, { k: '' as const, l: 'Todos' }];
  protected readonly vista = signal<Vista>('todos');
  protected readonly sexo = signal<'F' | 'M' | ''>('');
  protected readonly diaSel = signal(0);
  protected readonly q = signal('');
  protected readonly abiertos = signal<string[]>([]);
  /** Full schedule with the athletes (browser only, loaded once when a view needs it). */
  private readonly completo = signal<Horarios | null>(null);
  protected readonly completos = computed(() => !!this.completo());
  private cargando = false;
  protected t = (k: string) => str(this.s(), k);
  private readonly datos = computed(() => this.completo() ?? this.horarios());
  protected readonly dias = computed(() => (this.datos()?.dias ?? []).filter((d) => d.flights.length).map((d) => {
    const e = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d.fecha + 'T12:00:00Z')).replace(',', '').replace('.', '');
    return { fecha: d.fecha, etiqueta: e, dia: d };
  }));
  protected readonly misAtletas = computed(() => {
    const favs = new Set(this.fav.slugs());
    const out: { a: PubAtleta; f: PubFlight }[] = [];
    for (const d of this.datos()?.dias ?? []) for (const f of d.flights) for (const a of f.atletas) if (favs.has(a.slug)) out.push({ a, f });
    return out;
  });
  protected readonly icsUrl = computed(() => `${ICS_URL}?atletas=${encodeURIComponent(this.misAtletas().map((m) => m.a.slug).join(','))}`);
  protected readonly filas = computed<FilaHorario[]>(() => {
    const d = this.dias()[this.diaSel()]?.dia;
    if (!d) return [];
    const q = norm(this.q());
    let fl = d.flights.filter((f) => !this.sexo() || f.sexo === this.sexo());
    if (q.length > 1) fl = fl.filter((f) => f.atletas.some((a) => norm(a.nombre + ' ' + a.club).includes(q)));
    const rows: FilaHorario[] = fl.map((f) => ({ t: hora(f.inicio), flight: f }));
    if (q.length < 2) rows.push(...d.agenda.map((a) => ({ t: a.hora, item: { titulo: a.titulo, icono: ICONOS[a.icono ?? ''] ?? ('clock' as GrIconName) } })));
    return rows.sort((a, b) => a.t.localeCompare(b.t));
  });

  constructor() {
    // Stars from an earlier visit: the «Mi horario (n)» count needs the athletes
    afterNextRender(() => { if (this.fav.slugs().length) this.cargar(); });
  }

  private cargar(): void {
    if (this.cargando || this.completo()) return;
    this.cargando = true;
    void this.api.get().then((h) => { if (h?.publicado) this.completo.set(h); });
  }
  protected elegir(v: Vista): void {
    this.vista.set(v);
    if (v !== 'todos') this.cargar();
  }
  protected alternar(id: string): void {
    if (this.vista() === 'detallado') return;
    this.cargar();
    this.abiertos.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }
  protected buscar(v: string): void {
    this.q.set(v);
    if (v.trim().length > 1) this.cargar();
  }
  /** The athletes of the group in the open card (Figma: five, then «Ver los N atletas»), the searched ones first. */
  protected atletasDe(f: PubFlight): PubAtleta[] {
    const q = norm(this.q());
    const l = q.length > 1 ? f.atletas.filter((a) => norm(a.nombre + ' ' + a.club).includes(q)) : f.atletas;
    return l.slice(0, 5);
  }
  /** «Femenino −47 / −52 kg» → «−47 / −52 kg». */
  protected pesos(f: PubFlight): string {
    const p = (f.titulo.match(/[−+-]\s?\d+/g) ?? []).map((x) => x.replace('-', '−').replace(/\s/g, ''));
    return p.length ? p.join(' / ') + ' kg' : f.titulo;
  }
  protected kg = (c: string) => (c || '').replace('-', '−');
  protected pad = (n: number) => String(n).padStart(2, '0');
  protected iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
}

/** «Section / Localización»: exterior photo and three small ones, and the map card with the address and actions. */
@Component({
  selector: 'gr-sec-localizacion',
  imports: [GrButton, GrIcon, GrCabecera, Lightbox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: SECCION + ' bg-bg-deep' },
  template: `
    @let c = comp();
    <div [class]="ancho + ' flex flex-col items-center gap-6 md:gap-12'">
      <gr-cabecera [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" [texto]="t('texto')" />
      <div class="flex w-full flex-col-reverse gap-6 lg:flex-row lg:gap-8">
        <div class="flex w-full flex-col gap-4 lg:w-[648px] lg:shrink-0">
          <ul #pista class="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 lg:grid-cols-3" (scroll)="alDesplazar($event)">
            @for (f of fotos(); track f.imagen; let i = $index) {
              <li class="relative aspect-[300/210] w-[300px] shrink-0 snap-center overflow-hidden rounded-lg md:w-auto md:aspect-[4/3]" [class]="(i === 0 ? 'lg:col-span-3 lg:aspect-[648/380] lg:rounded-xl ' : 'lg:aspect-[205/140] ') + foto">
                <button type="button" class="group absolute inset-0 cursor-zoom-in" [attr.aria-label]="'Ampliar: ' + f.alt" (click)="ver.set(i)">
                  <img [src]="f.imagen" [attr.srcset]="srcset(f.imagen)" [attr.sizes]="i === 0 ? '(min-width: 768px) 648px, 300px' : '(min-width: 768px) 205px, 300px'" [alt]="f.alt" class="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                </button>
              </li>
            }
          </ul>
          <div class="flex items-center justify-center md:hidden" role="group" aria-label="Fotos">
            @for (f of fotos(); track f.imagen; let i = $index) { <button type="button" class="relative flex size-6 items-center justify-center before:absolute before:-inset-2.5 before:content-['']" [attr.aria-label]="'Ir a foto ' + (i + 1)" [attr.aria-current]="i === activa() || null" (click)="irA(pista, i)"><span class="h-1.5 rounded-pill transition-all motion-reduce:transition-none" [class]="i === activa() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span></button> }
          </div>
          <gr-lightbox [fotos]="fotos()" [(indice)]="ver" />
        </div>
        @if (c) {
          <!-- desktop: the card is as tall as the photos and the map takes the spare height (Figma «Map card», map grows) -->
          <div class="flex w-full flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card lg:w-[520px] lg:self-stretch">
            <div class="relative aspect-[348/200] md:aspect-[518/300] lg:aspect-auto lg:min-h-[300px] lg:flex-1">
              <img [src]="t('mapa') || '/img/home/mapa.webp'" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
              <span class="absolute right-2 bottom-2 rounded-[4px] bg-black/50 px-1.5 py-0.5 text-body-xs text-text-tertiary">© OpenStreetMap</span>
            </div>
            <div class="flex flex-col gap-3 p-5 md:p-7">
              <p class="text-center text-display-xs">{{ t('nombreSede') || "Pabellón Municipal d'Almussafes" }}</p>
              <!-- Figma home R2: the town hall logo centred under the venue -->
              <img src="/img/home/logo-almussafes-bn.webp" alt="Ajuntament d'Almussafes" width="114" height="40" class="mx-auto h-10 w-auto" loading="lazy" decoding="async" />
              <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="map-pin" [size]="16" class="shrink-0 text-accent-text" />{{ direccion() }}</p>
              <div class="flex flex-col gap-2">
                <a grButton variant="primary" [href]="c.sede.mapsUrl" target="_blank" rel="noopener" icon="map-pin">Abrir en Google Maps</a>
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
  /** Photo open in the lightbox (−1: closed). */
  protected readonly ver = signal(-1);
  protected readonly direccion = computed(() => {
    const s = this.comp()?.sede;
    return s ? [s.direccion, [s.cp, s.ciudad].filter(Boolean).join(' ') + (s.provincia ? ` (${s.provincia})` : '')].filter(Boolean).join(' · ') : '';
  });
  protected readonly irA = irA;
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
  imports: [RouterLink, GrButton, GrIcon, GrCabecera],
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
        @if (contacto()) { <a grButton variant="outline" [href]="'mailto:' + contacto()">Escríbenos</a> } @else { <a grButton variant="outline" routerLink="/preguntas-frecuentes">Escríbenos</a> }
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

/** UX1-R1-10: pagination dots are buttons that scroll the carousel to that card. */
export function irA(pista: HTMLElement, i: number): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  (pista.children[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
}
