import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton, type GrIconName, GrSelect } from '@grcup/ui';
import { Cms, type Club, type Landing, type Seccion } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { FanSession } from '../core/fan';
import { HOME_ALTERNATES, Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Footer, Navbar, instagramOf, type Lang } from '../layout/layout';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { GrChipsAncla } from './seo-bloques';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);
const ICONS: Record<string, GrIconName> = { ticket: 'ticket', clock: 'clock', 'map-pin': 'map-pin', users: 'users', plane: 'plane', train: 'train', car: 'car' };
const icon = (n: string): GrIconName => ICONS[n] ?? 'info';

export interface RelatedLink {
  titulo: string;
  texto: string;
  ruta: string;
}

/** «Te puede interesar»: three numbered links (Figma pages 29, 32). */
@Component({
  selector: 'gr-related',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (nivel() === 'h3') { <h3 class="text-display-2xs md:text-display-xs">{{ titulo() }}</h3> }
    @else { <h2 class="text-display-2xs md:text-display-xs">{{ titulo() }}</h2> }
    <!-- every card the same size: equal columns, one fixed height, one line per text -->
    <ul class="mt-5 grid auto-rows-fr gap-3 lg:grid-cols-3 lg:gap-4">
      @for (l of items(); track l.ruta; let i = $index) {
        <li class="min-w-0">
          <a [href]="l.ruta" [attr.title]="l.titulo + ' · ' + l.texto" class="flex h-[84px] items-center gap-4 rounded-lg border border-line-subtle bg-bg-card px-4 transition-colors hover:border-line-strong">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent/12 text-display-2xs text-accent-text">{{ (i + 1).toString().padStart(2, '0') }}</span>
            <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ l.titulo }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ l.texto }}</span></span>
            <gr-icon name="arrow-right" [size]="16" class="text-text-tertiary" />
          </a>
        </li>
      }
    </ul>
  `,
})
export class Related {
  readonly titulo = input('Te puede interesar');
  readonly items = input<RelatedLink[]>([]);
  /** Nivel del título: «h3» en las páginas cuyo contenido ya tiene sus dos H2 (Figma 75). */
  readonly nivel = input<'h2' | 'h3'>('h2');
}

/** «Sigue la GRStrength Cup»: Instagram band before the footer. */
@Component({
  selector: 'gr-community',
  imports: [GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="relative overflow-hidden rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-6 shadow-glow-deep md:flex md:items-center md:justify-between md:gap-8 md:p-10">
      <div>
        <p class="flex items-center gap-3 text-mono-xs text-text-tertiary">{{ en() ? 'Community' : 'Comunidad' }}</p>
        @if (nivel() === 'h3') { <h3 class="mt-3 text-display-xs md:text-display-m">{{ en() ? 'Follow the GRStrength Cup' : 'Sigue la GRStrength Cup' }}</h3> }
        @else { <h2 class="mt-3 text-display-xs md:text-display-m">{{ en() ? 'Follow the GRStrength Cup' : 'Sigue la GRStrength Cup' }}</h2> }
        <p class="mt-2 text-body-s text-text-secondary md:text-body-m">{{ en() ? 'Dates, schedule, raffle and results first on Instagram.' : 'Fechas, horarios, sorteo y resultados primero en Instagram.' }}</p>
      </div>
      <a grButton icon="camera" class="mt-5 w-full md:mt-0 md:w-auto" [href]="instagram()" target="_blank" rel="noopener">{{ en() ? 'Follow on Instagram' : 'Seguir en Instagram' }}</a>
    </section>
  `,
})
export class Community {
  readonly lang = input<Lang>('es');
  /** Nivel del título: «h3» en las páginas cuyo contenido ya tiene sus dos H2 (Figma 75). */
  readonly nivel = input<'h2' | 'h3'>('h2');
  protected readonly en = computed(() => this.lang() === 'en');
  private readonly comp = inject(Competition);
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
}

// ============================================================ /publico ===

/** /publico (Figma page 29): what spectators will see, how an attempt is judged and the stand rules. All sections come from the CMS. */
@Component({
  selector: 'gr-publico-page',
  imports: [Page, GrIcon, GrSkeleton, GrCabecera, GrChipsAncla, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = land();
    <gr-page separacion="mt-[132px] block md:mt-[180px]" [title]="t('intro', 'titulo') || 'Ven a ver'" [accent]="t('intro', 'tituloAcento') || 'la competición'" [eyebrow]="t('intro', 'eyebrow')" [subtitle]="t('intro', 'texto')" section="Visita" crumb="Público">
      <gr-chips-ancla [anclas]="anchors" />
      @if (l === undefined) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-24 rounded-md" /> }</div>
      }
      <div class="flex flex-col gap-12 md:gap-20">
        @for (k of l?.orden ?? []; track k) {
          @let s = l!.secciones[k];
          @switch (k) {
            @case ('datos') {
              <ul id="info" class="grid scroll-mt-32 grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
                @for (d of items(s, 'items'); track d['etiqueta']) {
                  <li class="flex flex-col gap-1.5 rounded-lg border border-line-subtle bg-bg-card p-4 md:p-5">
                    <gr-icon [name]="ic(d['icono'])" [size]="18" class="mb-1.5 self-start text-accent-text" />
                    <p class="text-label-xs text-text-muted uppercase">{{ d['etiqueta'] }}</p>
                    <p class="text-label-m">{{ d['valor'] }}</p>
                  </li>
                }
              </ul>
            }
            @case ('movimientos') {
              <section id="que-veras" class="flex scroll-mt-32 flex-col gap-5 md:gap-7">
                <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="str(s, 'texto')" [centro]="false" tam="m" />
                <!-- Figma 29: three 300 × 420 cards on desktop; a swipe row with dots on mobile -->
                <ul #fila class="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:max-w-[932px] md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0" (scroll)="alDeslizar(fila)">
                  @for (m of items(s, 'items'); track m['titulo']; let i = $index) {
                    <li class="relative w-[258px] shrink-0 snap-start overflow-hidden rounded-lg border border-line-subtle shadow-card md:w-auto">
                      <img [src]="m['imagen']" [alt]="m['alt'] || m['titulo']" class="aspect-[300/420] w-full object-cover" loading="lazy" />
                      <div class="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 bg-[linear-gradient(transparent,rgb(14_12_13/0.95))] p-5">
                        <span class="inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-label-xs text-white uppercase">Movimiento · {{ (i + 1).toString().padStart(2, '0') }}</span>
                        <p class="text-display-xs">{{ m['titulo'] }}</p>
                      </div>
                    </li>
                  }
                </ul>
                @if (items(s, 'items').length > 1) {
                  <p class="flex gap-1.5 md:hidden" aria-hidden="true">
                    @for (m of items(s, 'items'); track m['titulo']; let i = $index) { <span class="h-1.5 rounded-full transition-all" [class]="i === tarjeta() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
                  </p>
                }
              </section>
            }
            @case ('juicio') {
              <section id="como-se-juzga" class="flex scroll-mt-32 flex-col gap-5 md:gap-7">
                <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [centro]="false" tam="m" />
                <ol class="grid gap-3 md:grid-cols-4 md:gap-4">
                  @for (p of items(s, 'pasos'); track p['titulo']; let i = $index, last = $last) {
                    <li class="rounded-lg border border-line-subtle bg-bg-card p-[25px]">
                      <span class="flex size-8 items-center justify-center rounded-full bg-accent text-label-s text-white">{{ i + 1 }}</span>
                      <p class="mt-2 text-label-m">{{ p['titulo'] }}</p>
                      <p class="mt-2 text-body-s text-text-tertiary">{{ p['texto'] }}</p>
                      @if (last) {
                        <p class="mt-2 flex gap-2" aria-label="Ejemplo: dos luces blancas y una roja, intento válido">
                          <span class="size-5 rounded-full bg-white"></span><span class="size-5 rounded-full bg-white"></span><span class="size-5 rounded-full bg-accent"></span>
                        </p>
                      }
                    </li>
                  }
                </ol>
              </section>
            }
            @case ('normas') {
              <section id="normas" class="flex scroll-mt-32 flex-col gap-5 md:gap-7">
                <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [centro]="false" tam="m" />
                <ul class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
                  @for (n of items(s, 'items'); track n['texto']) {
                    <li class="flex gap-3 text-body-m text-text-secondary"><span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ n['texto'] }}</li>
                  }
                </ul>
              </section>
            }
            @case ('interesar') {
              <gr-related [titulo]="str(s, 'titulo') || 'Te puede interesar'" [items]="related(s)" />
            }
          }
        }
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class PublicoPage {
  protected readonly land = signal<Landing | null | undefined>(undefined);
  protected readonly anchors = [{ id: 'info', t: 'Info' }, { id: 'que-veras', t: 'Qué verás' }, { id: 'como-se-juzga', t: 'Cómo se juzga' }, { id: 'normas', t: 'Normas' }];
  /** Card in view in the mobile swipe row (dots). */
  protected readonly tarjeta = signal(0);
  protected alDeslizar(el: HTMLElement) {
    const li = el.firstElementChild as HTMLElement | null;
    if (li) this.tarjeta.set(Math.round(el.scrollLeft / (li.offsetWidth + 16)));
  }
  /** «Título *acento*» markup of gr-cabecera from the CMS fields. */
  protected tit = (s: Seccion | undefined) => [str(s, 'titulo'), str(s, 'tituloAcento') && '*' + str(s, 'tituloAcento') + '*'].filter(Boolean).join(' ');
  protected str = str;
  protected ic = icon;
  protected items = (s: Seccion | undefined, k: string) => list<Record<string, string>>(s, k);
  protected related = (s: Seccion | undefined) => list<RelatedLink>(s, 'items');
  protected t = (sec: string, k: string) => str(this.land()?.secciones[sec], k);

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [l, c] = await Promise.all([cms.landing('publico'), competition.load()]);
      this.land.set(l);
      if (!l) cms.notFound();
      await applySeo(cms, seo, '/publico', 'Ver la competición · GR Strength Cup', 'Entrada gratuita con reserva: qué verás, cómo se juzga un intento y normas de la grada.', undefined,
        { jsonLd: c ? eventLd(c, 'es') : undefined });
    });
  }
}

/** SportsEvent structured data (free entry). */
function eventLd(c: CompeticionPublica, lang: Lang): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nombre, sport: 'Powerlifting', inLanguage: lang,
    startDate: c.fechaInicio, endDate: c.fechaFin, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
    location: { '@type': 'Place', name: c.sede.nombre, address: { '@type': 'PostalAddress', streetAddress: c.sede.direccion, postalCode: c.sede.cp, addressLocality: c.sede.ciudad, addressRegion: c.sede.provincia, addressCountry: 'ES' } },
    organizer: { '@type': 'Organization', name: c.evento.organizador || 'GR Strength' },
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://grcup-qa.menustudioai.com/entradas' },
  };
}

// ============================================================== /clubs ===

const PROVINCIAS = ['Valencia', 'Alicante', 'Castellón', 'Murcia', 'Baleares'];
const ROL: Record<Club['rol'], string> = { organizador: 'Club organizador', colaborador: 'Club colaborador', club: 'Club' };
const BORRADOR_CLUB = 'grcup_borrador_club';

/** /clubs (Figma page 32): searchable club directory by province and a moderated «Añadir mi club» form. */
@Component({
  selector: 'gr-clubs-page',
  imports: [GrSelect, Page, FormsModule, GrIcon, GrSkeleton, GrButton, GrField, GrInput, GrAlert, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clubs de powerlifting" accent="en Valencia" eyebrow="Comunidad" section="Comunidad" crumb="Clubs"
      subtitle="Clubs y gimnasios de la Comunitat Valenciana, Murcia y Baleares donde entrenar powerlifting y prepararte para competir.">
      <span pageStamps class="inline-flex h-7 items-center rounded-full border border-info/40 bg-info/10 px-3 text-label-xs text-info uppercase">Directorio en construcción</span>
      <div class="flex flex-col gap-4">
        <label class="relative block max-w-[420px]">
          <span class="sr-only">Buscar un club</span>
          <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
          <input type="search" placeholder="Busca un club o una ciudad…" [value]="q()" (input)="q.set($any($event.target).value)"
            class="h-11 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
        </label>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Provincia">
          @for (p of provincias; track p) {
            <button type="button" (click)="prov.set(p)" [attr.aria-pressed]="prov() === p" class="inline-flex h-11 items-center gap-2 rounded-full border px-4 text-label-s transition-colors"
              [class]="prov() === p ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:border-text-tertiary hover:text-text-primary'">
              <gr-icon [name]="prov() === p ? 'check' : 'plus'" [size]="14" />{{ p }}
            </button>
          }
        </div>
      </div>

      @if (clubs() === null) {
        <div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-40 rounded-lg" /> }</div>
      } @else {
        <ul class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          @for (c of visibles(); track c.nombre) {
            <!-- Figma 32 «Club card»: 44 px logo tile, name and place, pill tags, role and «Ver club» -->
            <li class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-4 md:p-5">
              <div class="flex items-center gap-3">
                <span class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/8 p-1.5">
                  @if (c.logoUrl) { <img [src]="c.logoUrl" alt="" class="max-h-full max-w-full object-contain" loading="lazy" /> } @else { <span class="text-label-s text-text-tertiary">{{ initials(c.nombre) }}</span> }
                </span>
                <div class="min-w-0">
                  <h2 class="truncate text-label-m">{{ c.nombre }}</h2>
                  <p class="flex items-center gap-1 text-body-xs text-text-tertiary"><gr-icon name="map-pin" [size]="12" />{{ c.ciudad || 'Por confirmar' }}@if (c.provincia && c.ciudad && !c.ciudad.includes(c.provincia)) { ({{ c.provincia }}) }</p>
                </div>
              </div>
              @if (tags(c).length) {
                <p class="flex flex-wrap gap-1.5">@for (t of tags(c); track t) { <span class="inline-flex h-6 items-center rounded-full bg-white/6 px-2.5 text-label-xs text-text-secondary uppercase">{{ t }}</span> }</p>
              }
              <div class="mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-line-subtle pt-2">
                <span class="text-body-xs text-text-tertiary">{{ rol[c.rol] }}</span>
                <a [href]="enlace(c)" target="_blank" rel="noopener" class="inline-flex h-11 items-center gap-1 text-label-s text-accent-text">Ver club <gr-icon name="external-link" [size]="14" /></a>
              </div>
            </li>
          } @empty {
            <li class="rounded-lg border border-line-subtle bg-bg-card p-6 text-body-m text-text-tertiary md:col-span-2 lg:col-span-3">No hay clubs que coincidan con la búsqueda.</li>
          }
          <li class="flex flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-4 md:p-5">
            <div class="flex items-center gap-3">
              <span class="flex size-14 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="plus" [size]="20" /></span>
              <div><p class="text-label-m">Tu club aquí</p><p class="flex items-center gap-1 text-body-xs text-text-tertiary"><gr-icon name="map-pin" [size]="12" />Comunitat Valenciana</p></div>
            </div>
            <p class="flex"><span class="inline-flex h-6 items-center rounded-full bg-white/6 px-2.5 text-label-xs text-text-secondary uppercase">Añade tu club</span></p>
            <div class="mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-line-subtle pt-2">
              <span class="text-body-xs text-text-tertiary">Directorio abierto</span>
              <button type="button" (click)="openForm()" aria-label="Ver club: añadir mi club" class="inline-flex h-11 items-center gap-1 text-label-s text-accent-text">Ver club <gr-icon name="external-link" [size]="14" /></button>
            </div>
          </li>
        </ul>
      }

      <!-- Figma 32 «Solicitud de club»: always visible; the backoffice reviews it (Clubs › Solicitudes) -->
      <section id="anadir" class="mt-12 scroll-mt-32 rounded-2xl border border-line-subtle bg-bg-card p-5 md:p-8 xl:-mx-10" aria-labelledby="anadir-titulo">
        @if (sent()) {
          <div class="mx-auto flex max-w-[520px] flex-col items-center gap-3 rounded-xl border border-success/50 bg-success/6 px-6 py-8 text-center" role="status">
            <span class="flex size-11 items-center justify-center rounded-full bg-success/14 text-success"><gr-icon name="circle-check" [size]="22" /></span>
            <h2 id="anadir-titulo" class="text-display-xs md:text-display-s">¡Solicitud enviada!</h2>
            <p class="text-body-s text-text-secondary">Hemos recibido «{{ enviado.nombre }}». La revisamos en 2–3 días y te escribimos a {{ enviado.email }} cuando esté publicada.</p>
          </div>
        } @else {
          <div class="grid gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-12">
            <div class="flex flex-col gap-4">
              <p class="text-label-xs text-text-tertiary uppercase">Añade tu club</p>
              <h2 id="anadir-titulo" class="text-display-s md:text-display-m">¿Entrenas en un <span class="text-accent-text">club</span>?</h2>
              <p class="text-body-m text-text-secondary">Envía la solicitud y lo añadimos al directorio de clubs de powerlifting de la Comunitat Valenciana, Murcia y Baleares.</p>
              <ul class="flex flex-col gap-2.5">
                @for (t of ventajas; track t) { <li class="flex items-start gap-2.5 text-body-s text-text-secondary"><gr-icon name="check" [size]="16" class="mt-0.5 shrink-0 text-accent-text" />{{ t }}</li> }
              </ul>
            </div>
            <form class="grid gap-x-4 gap-y-5 md:grid-cols-2" (ngSubmit)="send()" novalidate>
              <gr-field label="Nombre del club *" for="c-nombre" [error]="err('nombre')"><input grInput id="c-nombre" name="nombre" required maxlength="120" placeholder="p. ej. Fuerza Isabel" [(ngModel)]="f.nombre" [invalid]="!!err('nombre')" /></gr-field>
              <gr-field label="Ciudad *" for="c-ciudad" [error]="err('ciudad')"><input grInput id="c-ciudad" name="ciudad" autocomplete="address-level2" required maxlength="80" placeholder="p. ej. Chiva" [(ngModel)]="f.ciudad" [invalid]="!!err('ciudad')" /></gr-field>
              <gr-field label="Provincia *" for="c-prov" [error]="err('provincia')">
                <gr-select id="c-prov" name="provincia" [(ngModel)]="f.provincia" [invalido]="!!err('provincia')"><option value="" hidden>Elige la provincia</option>@for (p of provincias.slice(1); track p) { <option [value]="p">{{ p }}</option> }<option value="Otra">Otra</option></gr-select>
              </gr-field>
              <gr-field label="¿Afiliado a la AEP?" for="c-aep">
                <gr-select id="c-aep" name="aep" [(ngModel)]="f.aep"><option value="" hidden>Elige una opción</option><option value="si">Sí</option><option value="no">No</option></gr-select>
              </gr-field>
              <gr-field label="Web" for="c-web" [error]="err('web')"><input grInput id="c-web" name="web" type="url" inputmode="url" maxlength="300" placeholder="https://…" [(ngModel)]="f.web" [invalid]="!!err('web')" /></gr-field>
              <gr-field label="Instagram" for="c-ig" [error]="err('instagram')"><input grInput id="c-ig" name="instagram" maxlength="300" placeholder="@tuclub" [(ngModel)]="f.instagram" [invalid]="!!err('instagram')" /></gr-field>
              <gr-field label="Persona de contacto *" for="c-contacto" [error]="err('contacto')"><input grInput id="c-contacto" name="contacto" autocomplete="name" required maxlength="120" placeholder="Nombre y apellidos" [(ngModel)]="f.contacto" [invalid]="!!err('contacto')" /></gr-field>
              <gr-field label="Email de contacto *" for="c-email" [error]="err('email')"><input grInput id="c-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="email@club.com" [(ngModel)]="f.email" [invalid]="!!err('email')" /></gr-field>
              <gr-field label="Mensaje" for="c-mensaje" [optional]="true" class="md:col-span-2"><textarea grInput id="c-mensaje" name="mensaje" rows="4" maxlength="1000" placeholder="Horarios, especialidad, si buscáis atletas…" [(ngModel)]="f.mensaje"></textarea></gr-field>
              <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary md:col-span-2">
                <input type="checkbox" name="priv" [(ngModel)]="f.acepta" class="mt-1 size-5 shrink-0 accent-[#C42B3E]" [attr.aria-invalid]="!!err('acepta') || null" />
                <span>He leído y acepto la <a href="/privacidad" target="_blank" class="text-accent-text underline">política de privacidad</a> *</span>
              </label>
              @if (err('acepta')) { <span class="-mt-3 flex items-center gap-1.5 text-body-xs text-accent-text md:col-span-2" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ err('acepta') }}</span> }
              @if (error()) { <gr-alert class="md:col-span-2" tone="danger" title="No se pudo enviar">{{ error() }}</gr-alert> }
              <div class="flex flex-col gap-3 md:col-span-2 md:flex-row md:items-center md:gap-4">
                <button grButton variant="primary" size="l" type="submit" [loading]="busy()" class="w-full md:w-auto">Enviar solicitud</button>
                <p class="text-body-xs text-text-tertiary">Solo usamos tu email para responderte sobre la solicitud.</p>
              </div>
            </form>
          </div>
        }
      </section>

      <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class ClubsPage {
  private readonly cms = inject(Cms);
  private readonly fan = inject(FanSession);
  protected readonly clubs = signal<Club[] | null>(null);
  protected readonly q = signal('');
  protected readonly prov = signal('Todas');
  protected readonly provincias = ['Todas', ...PROVINCIAS];
  protected readonly rol = ROL;
  protected readonly relacionados: RelatedLink[] = [
    // Figma 32 texts; its «Tu primera competición» / «Calendario 2026» pages do not exist: closest real pages
    { titulo: 'Tu primera competición', texto: 'Guía paso a paso', ruta: '/preguntas-frecuentes' },
    { titulo: 'Calendario 2026', texto: 'Competiciones de la zona', ruta: '/horarios' },
    { titulo: 'Patrocinadores', texto: 'Marcas colaboradoras', ruta: '/patrocinadores' },
  ];
  protected readonly visibles = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.clubs() ?? []).filter((c) => (this.prov() === 'Todas' || c.provincia === this.prov()) && (!q || `${c.nombre} ${c.ciudad} ${c.provincia}`.toLowerCase().includes(q)));
  });
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');
  protected f = { nombre: '', ciudad: '', provincia: '', aep: '', web: '', instagram: '', contacto: '', email: '', mensaje: '', acepta: false };
  protected enviado = { nombre: '', email: '' };
  protected readonly errores = signal<Record<string, string>>({});
  protected err = (k: string) => this.errores()[k] ?? '';
  protected readonly ventajas = ['La revisamos en 2–3 días', 'Te avisamos por email cuando esté publicada', 'Gratis: nombre, ciudad, web, redes y si está afiliado a la AEP'];
  protected tags = (c: Club) => {
    const t = c.etiquetas.split(',').map((x) => x.trim()).filter(Boolean);
    return c.afiliadoAep && !t.some((x) => x.toUpperCase() === 'AEP') ? [...t, 'AEP'] : t;
  };
  // «Ver club» on every card (Figma 32): web, else Instagram, else a search for the club
  protected enlace = (c: Club) => c.web || (c.instagram.startsWith('http') ? c.instagram : c.instagram ? 'https://www.instagram.com/' + c.instagram.replace(/^@/, '') : 'https://www.google.com/search?q=' + encodeURIComponent(c.nombre + ' ' + c.ciudad));
  protected initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  constructor() {
    const seo = inject(Seo);
    // back from the access email: restore what was typed (D-MIEMBROS)
    const borrador = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(BORRADOR_CLUB);
    if (borrador) { sessionStorage.removeItem(BORRADOR_CLUB); this.f = { ...this.f, ...JSON.parse(borrador) }; }
    void inject(PendingTasks).run(async () => {
      const list = await this.cms.clubs();
      this.clubs.set(list ?? []);
      const jsonLd = list?.length ? { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Clubs de powerlifting en Valencia',
        itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'SportsClub', name: c.nombre, sport: 'Powerlifting', url: c.web || c.instagram || undefined,
          address: { '@type': 'PostalAddress', addressLocality: c.ciudad, addressRegion: c.provincia, addressCountry: 'ES' } } })) } : undefined;
      await applySeo(this.cms, seo, '/clubs', 'Clubs de powerlifting en Valencia · GR Strength Cup', 'Clubs y gimnasios de la Comunitat Valenciana, Murcia y Baleares donde entrenar powerlifting.', undefined, { jsonLd });
    });
  }

  protected openForm(): void {
    document.getElementById('anadir')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.getElementById('c-nombre')?.focus({ preventScroll: true }), 400);
  }

  protected async send(): Promise<void> {
    this.error.set('');
    const f = this.f;
    const e: Record<string, string> = {};
    if (f.nombre.trim().length < 2) e['nombre'] = 'Escribe el nombre del club';
    if (f.ciudad.trim().length < 2) e['ciudad'] = 'Escribe la ciudad';
    if (!f.provincia) e['provincia'] = 'Elige la provincia';
    if (f.web.trim() && !/^https:\/\/\S+\.\S+/.test(f.web.trim())) e['web'] = 'Debe empezar por https://';
    if (f.instagram.trim() && !/^(@?[A-Za-z0-9._]{1,30}|https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?)$/.test(f.instagram.trim())) e['instagram'] = 'Escribe @usuario o el enlace de Instagram';
    if (f.contacto.trim().length < 2) e['contacto'] = 'Escribe tu nombre';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e['email'] = 'Introduce un email válido';
    if (!f.acepta) e['acepta'] = 'Acepta la política de privacidad';
    this.errores.set(e);
    if (Object.keys(e).length) {
      this.error.set(e['acepta'] && Object.keys(e).length === 1 ? 'Tienes que aceptar la política de privacidad para enviar la solicitud.' : 'Revisa los campos marcados.');
      document.getElementById(({ nombre: 'c-nombre', ciudad: 'c-ciudad', provincia: 'c-prov', web: 'c-web', instagram: 'c-ig', contacto: 'c-contacto', email: 'c-email' } as Record<string, string>)[Object.keys(e)[0]] ?? '')?.focus();
      return;
    }
    // D-MIEMBROS: proposing a club needs a fan session; the access email brings the person back here.
    if (!(await this.fan.cargar())) {
      sessionStorage.setItem(BORRADOR_CLUB, JSON.stringify(f));
      return this.fan.abrirAcceso('formulario', '/clubs', f.email.trim());
    }
    this.busy.set(true);
    try {
      await this.cms.proponerClub({ nombre: f.nombre.trim(), ciudad: f.ciudad.trim(), provincia: f.provincia, web: f.web.trim(), instagram: f.instagram.trim(), email: f.email.trim(),
        contactoNombre: f.contacto.trim(), mensaje: f.mensaje.trim(), afiliadoAep: f.aep ? f.aep === 'si' : null, aceptaPrivacidad: f.acepta });
      this.enviado = { nombre: f.nombre.trim(), email: f.email.trim() };
      this.sent.set(true);
      document.getElementById('anadir')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'Inténtalo de nuevo en unos minutos.');
    } finally {
      this.busy.set(false);
    }
  }
}

// ================================================================= /en ===

/** /en (Figma page 35): English landing for international lifters and visitors (hreflang es/en + x-default). */
@Component({
  selector: 'gr-en-page',
  imports: [RouterLink, Navbar, Footer, GrButton, GrIcon, GrSkeleton, GrCabecera, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = land();
    @let c = comp();
    <gr-navbar lang="en" />
    <main class="relative" lang="en">
      <div class="pointer-events-none absolute inset-x-0 top-0 h-[640px]" style="background: radial-gradient(50% 60% at 75% 10%, rgb(110 20 32 / 0.45), transparent 70%)"></div>
      <div class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px] xl:pb-24">
        @let h = l?.secciones?.['hero'];
        <section class="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <!-- Figma «Language switch»: 111 × 46 pill, the active language in red -->
            <p class="inline-flex rounded-full border border-line-strong p-1 text-label-xs" aria-label="Language">
              <a routerLink="/" hreflang="es" class="inline-flex h-9 items-center rounded-full px-3.5 text-text-tertiary hover:text-text-primary">ES</a>
              <span class="inline-flex h-9 items-center rounded-full bg-accent/20 px-3.5 text-text-primary" aria-current="page">EN</span>
            </p>
            @if (l === undefined) {
              <gr-skeleton class="mt-6 h-40 rounded-lg" />
            } @else {
              @if (str(h, 'eyebrow')) { <p class="mt-6 flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase">{{ str(h, 'eyebrow') }}</p> }
              <h1 class="mt-3 text-display-m md:text-display-xl">{{ str(h, 'titulo') || 'GRStrength Cup' }} <span class="text-accent-text">{{ str(h, 'tituloAcento') }}</span></h1>
              <p class="mt-4 max-w-xl text-body-m text-text-secondary md:text-body-l">{{ str(h, 'texto') }}</p>
              <ul class="mt-6 grid gap-3 sm:grid-cols-3">
                <li class="flex items-center gap-3"><span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="calendar" [size]="18" /></span>
                  <span><span class="block text-label-xs text-text-muted uppercase">Date</span><span class="block text-label-m">{{ fecha() }}</span></span></li>
                <li class="flex items-center gap-3"><span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="map-pin" [size]="18" /></span>
                  <span><span class="block text-label-xs text-text-muted uppercase">Venue</span><span class="block text-label-m">{{ c ? c.sede.ciudad + ' · Valencia' : 'Almussafes · Valencia' }}</span></span></li>
                @if (h?.['plazas']) {
                  <li class="flex items-center gap-3"><span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="user" [size]="18" /></span>
                    <span><span class="block text-label-xs text-text-muted uppercase">Lifters</span><span class="block text-label-m">{{ h?.['plazas'] }} places</span></span></li>
                }
              </ul>
              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <a grButton variant="primary" size="l" routerLink="/alta-atleta" hreflang="es" iconRight="arrow-right">{{ str(h, 'cta') || 'Athlete sign-up (Spanish)' }}</a>
                <a grButton size="l" routerLink="/sorteo" hreflang="es" iconRight="arrow-right">{{ str(h, 'ctaSorteo') || 'See the raffle' }}</a>
              </div>
            }
          </div>
          <img src="https://jaimedigitalstudio.b-cdn.net/grcup/frames/trophy_frames_webp/frame_0150.webp" alt="GRStrength Cup trophy" width="420" height="560"
            class="mx-auto aspect-[3/4] w-full max-w-[320px] object-cover [mask-image:radial-gradient(closest-side,#000_70%,transparent)] lg:max-w-none" fetchpriority="high" />
        </section>

        <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
          @for (k of l?.orden ?? []; track k) {
            @let s = l!.secciones[k];
            @switch (k) {
              @case ('compete') {
                <section id="compete" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="str(s, 'texto')" [centro]="false" tam="m" />
                  <ul class="grid gap-3 md:grid-cols-3 md:gap-4">
                    @for (i of items(s, 'items'); track i['titulo']) {
                      <li class="flex flex-col gap-1.5 rounded-lg border border-line-subtle bg-bg-card p-5"><p class="text-label-m">{{ i['titulo'] }}</p><p class="text-body-s text-text-tertiary">{{ i['texto'] }}</p></li>
                    }
                  </ul>
                  @if (str(s, 'cta')) {
                    <a grButton variant="primary" size="l" routerLink="/alta-atleta" hreflang="es" class="self-start">{{ str(s, 'cta') }}</a>
                  }
                </section>
              }
              @case ('raffle') {
                <section id="raffle" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [centro]="false" tam="m" />
                  <!-- Figma «Panel» (24 px): the 360 × 230 belt photo, the title in Display, the display-style button -->
                  <div class="grid items-center gap-6 rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-4 shadow-glow-deep md:grid-cols-[360px_minmax(0,1fr)] md:gap-8 md:p-5">
                    @if (str(s, 'imagen')) { <img [src]="str(s, 'imagen')" alt="SBD belt" class="aspect-[360/230] w-full rounded-lg object-cover" loading="lazy" /> }
                    <div class="flex flex-col gap-3">
                      <p class="text-display-xs md:text-display-s">{{ str(s, 'subtitulo') }}</p>
                      <p class="text-body-m text-text-secondary">{{ str(s, 'texto') }}</p>
                      <div class="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <a grButton variant="display-gradient" size="l" routerLink="/sorteo" hreflang="es">{{ str(s, 'cta') || 'See the prizes' }}</a>
                        <a grButton variant="ghost" routerLink="/politica-concurso" hreflang="es">Raffle terms (Spanish)</a>
                      </div>
                    </div>
                  </div>
                </section>
              }
              @case ('travel') {
                <section id="travel" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="str(s, 'texto')" [centro]="false" tam="m" />
                  <ul class="grid gap-3 md:grid-cols-3 md:gap-4">
                    @for (i of items(s, 'items'); track i['titulo']) {
                      <li class="rounded-lg border border-line-subtle bg-bg-card p-5">
                        <span class="flex size-11 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="ic(i['icono'])" [size]="20" /></span>
                        <p class="mt-4 text-label-m">{{ i['titulo'] }}</p>
                        <p class="mt-1 text-body-s text-text-secondary">{{ i['texto'] }}</p>
                        @if (i['nota']) { <p class="mt-3 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />{{ i['nota'] }}</p> }
                      </li>
                    }
                  </ul>
                </section>
              }
              @case ('faq') {
                <section id="faq" class="flex scroll-mt-28 flex-col gap-5 md:gap-7">
                  <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [texto]="str(s, 'texto')" [centro]="false" tam="m" />
                  <div class="flex flex-col gap-3">
                    @for (q of items(s, 'items'); track q['pregunta']; let first = $first) {
                      <details class="group rounded-lg border border-line-subtle bg-bg-card open:border-accent/60" [open]="first">
                        <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-label-m md:text-ui-h4">{{ q['pregunta'] }}
                          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-text-secondary group-open:bg-accent/20 group-open:text-accent-text"><gr-icon name="plus" [size]="14" class="transition-transform group-open:rotate-45" /></span>
                        </summary>
                        <p class="px-5 pb-5 text-body-m text-text-secondary">{{ q['respuesta'] }}</p>
                      </details>
                    }
                  </div>
                </section>
              }
            }
          }
          <gr-community lang="en" />
        </div>
      </div>
    </main>
    <gr-footer lang="en" />
  `,
})
export class EnPage {
  /** «Título *acento*» markup of gr-cabecera from the CMS fields. */
  protected tit = (s: Seccion | undefined) => [str(s, 'titulo'), str(s, 'tituloAcento') && '*' + str(s, 'tituloAcento') + '*'].filter(Boolean).join(' ');
  protected readonly land = signal<Landing | null | undefined>(undefined);
  protected readonly comp = signal<CompeticionPublica | null>(null);
  protected str = str;
  protected ic = icon;
  protected items = (s: Seccion | undefined, k: string) => list<Record<string, string>>(s, k);
  protected readonly fecha = computed(() => {
    const d = this.comp()?.fechaInicio;
    return d ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(d)) : 'To be confirmed';
  });

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [l, c, map] = await Promise.all([cms.landing('en'), competition.load(), cms.seoMap()]);
      this.land.set(l);
      this.comp.set(c);
      if (!l) cms.notFound();
      const o = map?.paginas.find((p) => p.ruta === '/en');
      seo.set({
        title: o?.title || 'GRStrength Cup 2026 · Powerlifting competition in Valencia, Spain',
        description: o?.description || 'AEP powerlifting championship in Almussafes, 20 km south of Valencia. Free spectator entry, raffle and travel tips.',
        path: '/en', lang: 'en', alternates: HOME_ALTERNATES, image: o?.imagenUrl || undefined,
        jsonLd: c ? eventLd(c, 'en') : undefined,
      });
    });
  }
}
