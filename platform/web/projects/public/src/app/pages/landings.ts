import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Cms, type Club, type Landing, type Seccion } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { HOME_ALTERNATES, Seo } from '../core/seo';
import { SectionTitle } from '../home/cms-sections';
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
    <h2 class="text-display-2xs md:text-display-xs">{{ titulo() }}</h2>
    <ul class="mt-5 grid gap-3 md:grid-cols-3">
      @for (l of items(); track l.ruta; let i = $index) {
        <li>
          <a [href]="l.ruta" class="flex min-h-16 items-center gap-4 rounded-md border border-line-subtle bg-bg-card px-4 py-3 transition-colors hover:border-line-strong">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-deep/40 text-display-2xs text-accent-text">{{ (i + 1).toString().padStart(2, '0') }}</span>
            <span class="min-w-0 flex-1"><span class="block text-label-m">{{ l.titulo }}</span><span class="block text-body-xs text-text-tertiary">{{ l.texto }}</span></span>
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
}

/** «Sigue la GRStrength Cup»: Instagram band before the footer. */
@Component({
  selector: 'gr-community',
  imports: [GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="relative overflow-hidden rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-6 shadow-glow-deep md:flex md:items-center md:justify-between md:gap-8 md:p-10">
      <div>
        <p class="flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>{{ en() ? 'Community' : 'Comunidad' }}</p>
        <h2 class="mt-3 text-display-xs md:text-display-m">{{ en() ? 'Follow the GRStrength Cup' : 'Sigue la GRStrength Cup' }}</h2>
        <p class="mt-2 text-body-s text-text-secondary md:text-body-m">{{ en() ? 'Dates, registration, raffle and results first on Instagram.' : 'Fechas, inscripciones, sorteo y resultados primero en Instagram.' }}</p>
      </div>
      <a grButton icon="camera" class="mt-5 w-full md:mt-0 md:w-auto" [href]="instagram()" target="_blank" rel="noopener">{{ en() ? 'Follow on Instagram' : 'Seguir en Instagram' }}</a>
    </section>
  `,
})
export class Community {
  readonly lang = input<Lang>('es');
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
    <gr-page [title]="t('intro', 'titulo') || 'Ven a ver'" [accent]="t('intro', 'tituloAcento') || 'la competición'" [eyebrow]="t('intro', 'eyebrow')" [subtitle]="t('intro', 'texto')" section="Visita" crumb="Público">
      <gr-chips-ancla [anclas]="anchors" />
      @if (l === undefined) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-24 rounded-md" /> }</div>
      }
      <div class="flex flex-col gap-18 md:gap-24">
        @for (k of l?.orden ?? []; track k) {
          @let s = l!.secciones[k];
          @switch (k) {
            @case ('datos') {
              <ul id="info" class="grid scroll-mt-32 grid-cols-2 gap-3 md:grid-cols-4">
                @for (d of items(s, 'items'); track d['etiqueta']) {
                  <li class="flex flex-col gap-1.5 rounded-2xl border border-line-subtle bg-bg-card p-4 md:p-5">
                    <gr-icon [name]="ic(d['icono'])" [size]="18" class="mb-1.5 text-accent-text" />
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
                <ul #fila class="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:max-w-[940px] md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0" (scroll)="alDeslizar(fila)">
                  @for (m of items(s, 'items'); track m['titulo']; let i = $index) {
                    <li class="relative w-[66%] shrink-0 snap-start overflow-hidden rounded-2xl border border-line-subtle shadow-card md:w-auto">
                      <img [src]="m['imagen']" [alt]="m['alt'] || m['titulo']" class="aspect-[300/420] w-full object-cover" loading="lazy" />
                      <div class="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 bg-[linear-gradient(transparent,rgb(14_12_13/0.95))] p-5">
                        <span class="inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-label-xs text-white uppercase">Movimiento · {{ (i + 1).toString().padStart(2, '0') }}</span>
                        <p class="text-display-xs">{{ m['titulo'] }}</p>
                      </div>
                    </li>
                  }
                </ul>
                <p class="flex gap-1.5 md:hidden" aria-hidden="true">
                  @for (m of items(s, 'items'); track m['titulo']; let i = $index) { <span class="h-1.5 rounded-full transition-all" [class]="i === tarjeta() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
                </p>
              </section>
            }
            @case ('juicio') {
              <section id="como-se-juzga" class="flex scroll-mt-32 flex-col gap-5 md:gap-7">
                <gr-cabecera [eyebrow]="str(s, 'eyebrow')" [titulo]="tit(s)" [centro]="false" tam="m" />
                <ol class="grid gap-3 md:grid-cols-4 md:gap-4">
                  @for (p of items(s, 'pasos'); track p['titulo']; let i = $index, last = $last) {
                    <li class="rounded-2xl border border-line-subtle bg-bg-card p-5 md:p-6">
                      <span class="flex size-7 items-center justify-center rounded-full bg-accent text-label-s text-white">{{ i + 1 }}</span>
                      <p class="mt-4 text-label-m">{{ p['titulo'] }}</p>
                      <p class="mt-1.5 text-body-s text-text-tertiary">{{ p['texto'] }}</p>
                      @if (last) {
                        <p class="mt-4 flex gap-2" aria-label="Ejemplo: dos luces blancas y una roja, intento válido">
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
                <ul class="flex flex-col gap-3 rounded-2xl border border-line-subtle bg-bg-card p-5 md:p-6">
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
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${c.nombre} ${c.edicion}`, sport: 'Powerlifting', inLanguage: lang,
    startDate: c.fechaInicio, endDate: c.fechaFin, eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
    location: { '@type': 'Place', name: c.sede.nombre, address: { '@type': 'PostalAddress', streetAddress: c.sede.direccion, postalCode: c.sede.cp, addressLocality: c.sede.ciudad, addressRegion: c.sede.provincia, addressCountry: 'ES' } },
    organizer: { '@type': 'Organization', name: c.evento.organizador || 'GR Strength' },
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://grcup-qa.menustudioai.com/entradas' },
  };
}

// ============================================================== /clubs ===

const PROVINCIAS = ['Valencia', 'Alicante', 'Castellón', 'Murcia', 'Baleares'];
const ROL: Record<Club['rol'], string> = { organizador: 'Club organizador', colaborador: 'Club colaborador', club: 'Club' };

/** /clubs (Figma page 32): searchable club directory by province and a moderated «Añadir mi club» form. */
@Component({
  selector: 'gr-clubs-page',
  imports: [Page, FormsModule, GrIcon, GrSkeleton, GrButton, GrField, GrInput, GrAlert, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Clubs de powerlifting" accent="en Valencia" eyebrow="Comunidad" section="Comunidad" crumb="Clubs"
      subtitle="Clubs y gimnasios de la Comunitat Valenciana, Murcia y Baleares donde entrenar powerlifting y prepararte para competir.">
      <span class="-mt-6 mb-8 inline-flex h-7 items-center rounded-2xs border border-info/30 bg-info/10 px-2.5 text-mono-xs text-info md:-mt-8">Directorio en construcción</span>
      <div class="flex flex-col gap-4">
        <label class="relative block max-w-sm">
          <span class="sr-only">Buscar un club</span>
          <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
          <input type="search" placeholder="Busca un club o una ciudad…" [value]="q()" (input)="q.set($any($event.target).value)"
            class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
        </label>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Provincia">
          @for (p of provincias; track p) {
            <button type="button" (click)="prov.set(p)" [attr.aria-pressed]="prov() === p" class="inline-flex h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label-s"
              [class]="prov() === p ? 'border-accent-text bg-accent-deep/40 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">
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
            <li class="flex flex-col rounded-lg border border-line-subtle bg-bg-card p-5">
              <div class="flex items-center gap-3">
                <span class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line-subtle bg-bg-deep">
                  @if (c.logoUrl) { <img [src]="c.logoUrl" alt="" class="max-h-10 max-w-10 object-contain" loading="lazy" /> } @else { <span class="text-label-s text-text-tertiary">{{ initials(c.nombre) }}</span> }
                </span>
                <div class="min-w-0">
                  <h2 class="truncate text-label-l">{{ c.nombre }}</h2>
                  <p class="flex items-center gap-1 text-body-xs text-text-tertiary"><gr-icon name="map-pin" [size]="12" />{{ c.ciudad || 'Por confirmar' }}@if (c.provincia && c.ciudad && !c.ciudad.includes(c.provincia)) { ({{ c.provincia }}) }</p>
                </div>
              </div>
              @if (tags(c).length) {
                <p class="mt-4 flex flex-wrap gap-1.5">@for (t of tags(c); track t) { <span class="inline-flex h-6 items-center rounded-2xs border border-line-strong px-2 text-mono-xs text-text-secondary">{{ t }}</span> }</p>
              }
              <div class="mt-auto flex items-center justify-between gap-3 border-t border-line-subtle pt-4" [class.mt-5]="true">
                <span class="text-body-xs text-text-tertiary">{{ rol[c.rol] }}{{ c.afiliadoAep ? ' · AEP' : '' }}</span>
                @if (c.web || c.instagram) {
                  <a [href]="c.web || c.instagram" target="_blank" rel="noopener" class="inline-flex h-11 items-center gap-1 text-label-s text-accent-text">Ver club <gr-icon name="external-link" [size]="14" /></a>
                }
              </div>
            </li>
          } @empty {
            <li class="rounded-lg border border-line-subtle bg-bg-card p-6 text-body-m text-text-tertiary md:col-span-2 lg:col-span-3">No hay clubs que coincidan con la búsqueda.</li>
          }
          <li class="flex flex-col rounded-lg border border-dashed border-line-strong p-5">
            <div class="flex items-center gap-3">
              <span class="flex size-12 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon name="plus" [size]="18" /></span>
              <div><p class="text-label-l">Tu club aquí</p><p class="text-body-xs text-text-tertiary">Comunitat Valenciana</p></div>
            </div>
            <div class="mt-auto flex items-center justify-between gap-3 border-t border-line-subtle pt-4 mt-5">
              <span class="text-body-xs text-text-tertiary">Directorio abierto</span>
              <button type="button" (click)="openForm()" class="inline-flex h-11 items-center gap-1 text-label-s text-accent-text">Añadir mi club <gr-icon name="arrow-right" [size]="14" /></button>
            </div>
          </li>
        </ul>
      }

      <section id="anadir" class="mt-12 scroll-mt-32 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
        <div class="md:flex md:items-center md:justify-between md:gap-6">
          <div>
            <h2 class="text-ui-h4">¿Entrenas powerlifting en un club?</h2>
            <p class="mt-1 text-body-s text-text-tertiary">Añádelo gratis al directorio: nombre, ciudad, web y si está afiliado a la AEP. Lo revisamos antes de publicarlo.</p>
          </div>
          @if (!form()) { <button grButton variant="primary" class="mt-4 w-full md:mt-0 md:w-auto" (click)="openForm()">Añadir mi club</button> }
        </div>
        @if (form()) {
          @if (sent()) {
            <gr-alert class="mt-6" tone="success" title="¡Gracias!">Hemos recibido «{{ f.nombre }}». Lo revisaremos y te escribiremos a {{ f.email }} si necesitamos algo más.</gr-alert>
          } @else {
            <form class="mt-6 grid gap-5 md:grid-cols-2" (ngSubmit)="send()" novalidate>
              <gr-field label="Nombre del club" for="c-nombre"><input grInput id="c-nombre" name="nombre" required [(ngModel)]="f.nombre" /></gr-field>
              <gr-field label="Ciudad" for="c-ciudad"><input grInput id="c-ciudad" name="ciudad" autocomplete="address-level2" required [(ngModel)]="f.ciudad" /></gr-field>
              <gr-field label="Provincia" for="c-prov">
                <select grInput id="c-prov" name="provincia" [(ngModel)]="f.provincia">@for (p of provincias.slice(1); track p) { <option [value]="p">{{ p }}</option> }<option value="Otra">Otra</option></select>
              </gr-field>
              <gr-field label="Web" for="c-web" [optional]="true" hint="https://…"><input grInput id="c-web" name="web" type="url" inputmode="url" [(ngModel)]="f.web" /></gr-field>
              <gr-field label="Instagram" for="c-ig" [optional]="true" hint="https://instagram.com/…"><input grInput id="c-ig" name="instagram" type="url" inputmode="url" [(ngModel)]="f.instagram" /></gr-field>
              <gr-field label="Email de contacto" for="c-email" hint="Solo para verificar el club; no se publica"><input grInput id="c-email" name="email" type="email" autocomplete="email" required [(ngModel)]="f.email" /></gr-field>
              <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary md:col-span-2"><input type="checkbox" name="aep" [(ngModel)]="f.afiliadoAep" class="mt-1 size-5 accent-[#C42B3E]" />El club está afiliado a la AEP</label>
              <label class="flex min-h-11 items-start gap-3 text-body-s text-text-secondary md:col-span-2"><input type="checkbox" name="priv" [(ngModel)]="f.acepta" class="mt-1 size-5 accent-[#C42B3E]" />He leído y acepto la <a href="/privacidad" target="_blank" class="text-accent-text underline">política de privacidad</a></label>
              @if (error()) { <gr-alert class="md:col-span-2" tone="danger" title="No se pudo enviar">{{ error() }}</gr-alert> }
              <div class="md:col-span-2"><button grButton variant="primary" size="l" type="submit" [loading]="busy()">Enviar club</button></div>
            </form>
          }
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
  protected readonly clubs = signal<Club[] | null>(null);
  protected readonly q = signal('');
  protected readonly prov = signal('Todas');
  protected readonly provincias = ['Todas', ...PROVINCIAS];
  protected readonly rol = ROL;
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Tu primera competición', texto: 'Guía paso a paso', ruta: '/blog' },
    { titulo: 'Calendario 2026', texto: 'Competiciones de la zona', ruta: '/blog' },
    { titulo: 'Patrocinadores', texto: 'Marcas colaboradoras', ruta: '/patrocinadores' },
  ];
  protected readonly visibles = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.clubs() ?? []).filter((c) => (this.prov() === 'Todas' || c.provincia === this.prov()) && (!q || `${c.nombre} ${c.ciudad} ${c.provincia}`.toLowerCase().includes(q)));
  });
  protected readonly form = signal(false);
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');
  protected f = { nombre: '', ciudad: '', provincia: 'Valencia', web: '', instagram: '', email: '', afiliadoAep: false, acepta: false };
  protected tags = (c: Club) => c.etiquetas.split(',').map((t) => t.trim()).filter(Boolean);
  protected initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();

  constructor() {
    const seo = inject(Seo);
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
    this.form.set(true);
    queueMicrotask(() => document.getElementById('anadir')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected async send(): Promise<void> {
    this.error.set('');
    const f = this.f;
    if (f.nombre.trim().length < 2 || f.ciudad.trim().length < 2 || !f.email.includes('@')) return this.error.set('Escribe el nombre del club, la ciudad y un email válido.');
    if ((f.web && !f.web.startsWith('https://')) || (f.instagram && !f.instagram.startsWith('https://'))) return this.error.set('La web y el Instagram deben empezar por https://');
    if (!f.acepta) return this.error.set('Tienes que aceptar la política de privacidad para enviar el club.');
    this.busy.set(true);
    try {
      await this.cms.proponerClub({ nombre: f.nombre, ciudad: f.ciudad, provincia: f.provincia, web: f.web, instagram: f.instagram, email: f.email, afiliadoAep: f.afiliadoAep, aceptaPrivacidad: f.acepta });
      this.sent.set(true);
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
  imports: [Navbar, Footer, GrButton, GrIcon, GrSkeleton, SectionTitle, Community],
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
            <p class="inline-flex rounded-pill border border-line-strong p-1 text-mono-xs" aria-label="Language">
              <a href="/" hreflang="es" class="inline-flex h-8 items-center rounded-pill px-3 text-text-tertiary hover:text-text-primary">ES</a>
              <span class="inline-flex h-8 items-center rounded-pill bg-accent-deep px-3 text-text-primary" aria-current="page">EN</span>
            </p>
            @if (l === undefined) {
              <gr-skeleton class="mt-6 h-40 rounded-lg" />
            } @else {
              @if (str(h, 'eyebrow')) { <p class="mt-6 flex items-center gap-3 text-mono-xs text-text-tertiary"><span class="h-px w-8 bg-accent"></span>{{ str(h, 'eyebrow') }}</p> }
              <h1 class="mt-3 text-display-l md:text-display-xl">{{ str(h, 'titulo') || 'GRStrength Cup' }} <span class="text-accent-text">{{ str(h, 'tituloAcento') }}</span></h1>
              <p class="mt-4 max-w-xl text-body-m text-text-secondary md:text-body-l">{{ str(h, 'texto') }}</p>
              <ul class="mt-6 grid gap-3 sm:grid-cols-3">
                <li class="flex items-center gap-3"><span class="flex size-10 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon name="calendar" [size]="16" /></span>
                  <span><span class="block text-mono-xs text-text-tertiary">Date</span><span class="block text-label-s">{{ fecha() }}</span></span></li>
                <li class="flex items-center gap-3"><span class="flex size-10 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon name="map-pin" [size]="16" /></span>
                  <span><span class="block text-mono-xs text-text-tertiary">Venue</span><span class="block text-label-s">{{ c ? c.sede.ciudad + ' · Valencia' : 'Almussafes · Valencia' }}</span></span></li>
                @if (h?.['plazas']) {
                  <li class="flex items-center gap-3"><span class="flex size-10 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon name="users" [size]="16" /></span>
                    <span><span class="block text-mono-xs text-text-tertiary">Lifters</span><span class="block text-label-s">{{ h?.['plazas'] }} places</span></span></li>
                }
              </ul>
              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                @if (c?.inscripcion?.url) { <a grButton variant="primary" size="l" [href]="c!.inscripcion.url" target="_blank" rel="noopener" iconRight="external-link">{{ str(h, 'cta') || 'Register' }}</a> }
                <a grButton size="l" href="/sorteo" iconRight="arrow-right">{{ str(h, 'ctaSorteo') || 'Enter the raffle' }}</a>
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
                <section id="compete" class="scroll-mt-28">
                  <gr-section-title [eyebrow]="str(s, 'eyebrow')" [titulo]="str(s, 'titulo')" [acento]="str(s, 'tituloAcento')" />
                  <p class="mt-4 max-w-2xl text-body-m text-text-secondary">{{ str(s, 'texto') }}</p>
                  <ul class="mt-8 grid gap-3 md:grid-cols-3">
                    @for (i of items(s, 'items'); track i['titulo']) {
                      <li class="rounded-md border border-line-subtle bg-bg-card p-5"><p class="text-label-l">{{ i['titulo'] }}</p><p class="mt-1 text-body-s text-text-tertiary">{{ i['texto'] }}</p></li>
                    }
                  </ul>
                </section>
              }
              @case ('raffle') {
                <section id="raffle" class="scroll-mt-28">
                  <gr-section-title [eyebrow]="str(s, 'eyebrow')" [titulo]="str(s, 'titulo')" [acento]="str(s, 'tituloAcento')" />
                  <div class="mt-8 grid items-center gap-6 rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-5 shadow-glow-deep md:grid-cols-[300px_minmax(0,1fr)] md:p-6">
                    @if (str(s, 'imagen')) { <img [src]="str(s, 'imagen')" alt="SBD belt" class="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" /> }
                    <div>
                      <p class="text-display-xs">{{ str(s, 'subtitulo') }}</p>
                      <p class="mt-2 text-body-m text-text-secondary">{{ str(s, 'texto') }}</p>
                      <div class="mt-5 flex flex-col gap-3 sm:flex-row">
                        <a grButton variant="primary" href="/sorteo">{{ str(s, 'cta') || 'Buy tickets' }}</a>
                        <a grButton variant="ghost" href="/politica-concurso" hreflang="es">Raffle terms (Spanish)</a>
                      </div>
                    </div>
                  </div>
                </section>
              }
              @case ('travel') {
                <section id="travel" class="scroll-mt-28">
                  <gr-section-title [eyebrow]="str(s, 'eyebrow')" [titulo]="str(s, 'titulo')" [acento]="str(s, 'tituloAcento')" />
                  <ul class="mt-8 grid gap-3 md:grid-cols-3">
                    @for (i of items(s, 'items'); track i['titulo']) {
                      <li class="rounded-md border border-line-subtle bg-bg-card p-5">
                        <span class="flex size-10 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon [name]="ic(i['icono'])" [size]="18" /></span>
                        <p class="mt-4 text-label-l">{{ i['titulo'] }}</p>
                        <p class="mt-1 text-body-s text-text-secondary">{{ i['texto'] }}</p>
                        @if (i['nota']) { <p class="mt-3 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />{{ i['nota'] }}</p> }
                      </li>
                    }
                  </ul>
                </section>
              }
              @case ('faq') {
                <section id="faq" class="scroll-mt-28">
                  <gr-section-title [eyebrow]="str(s, 'eyebrow')" [titulo]="str(s, 'titulo')" [acento]="str(s, 'tituloAcento')" />
                  <div class="mt-8 flex flex-col gap-2">
                    @for (q of items(s, 'items'); track q['pregunta']; let first = $first) {
                      <details class="group rounded-md border border-line-subtle bg-bg-card open:border-line-strong" [open]="first">
                        <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-label-m">{{ q['pregunta'] }}
                          <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-raised text-text-secondary group-open:bg-accent-deep group-open:text-accent-text"><gr-icon name="plus" [size]="14" class="transition-transform group-open:rotate-45" /></span>
                        </summary>
                        <p class="px-5 pb-5 text-body-s text-text-secondary">{{ q['respuesta'] }}</p>
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
