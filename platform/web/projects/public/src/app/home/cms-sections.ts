import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { renderMarkdown, type Faq, type Patrocinador, type Seccion } from '../core/cms';
import type { CompeticionPublica } from '../core/competition';

const str = (s: Seccion | undefined, k: string) => (s?.[k] as string | undefined) ?? '';
const list = <T,>(s: Seccion | undefined, k: string) => ((s?.[k] as T[] | undefined) ?? []);

/** Section heading with eyebrow and a red accent part (Figma «Section header»). */
@Component({
  selector: 'gr-section-title',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (eyebrow()) { <p class="flex items-center gap-3 text-mono-xs text-text-tertiary" [class.justify-center]="center()"><span class="h-px w-8 bg-accent"></span>{{ eyebrow() }}</p> }
    <h2 class="mt-3 text-display-s md:text-display-l" [class.text-center]="center()">{{ titulo() }} @if (acento()) { <span class="text-accent-text">{{ acento() }}</span> }</h2>
  `,
})
export class SectionTitle {
  readonly eyebrow = input('');
  readonly titulo = input('');
  readonly acento = input('');
  readonly center = input(false);
}

const shell = 'mx-auto max-w-[1440px] px-5 md:px-8 xl:px-[120px]';

/** «Section / Inscripciones»: AEP registration state. */
@Component({
  selector: 'gr-sec-inscripciones',
  imports: [GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block py-18 md:py-24' },
  template: `
    @let c = comp();
    <div [class]="shell">
      <div class="mx-auto max-w-xl rounded-xl border border-line-subtle bg-bg-card/80 p-8 text-center shadow-card">
        <span class="inline-flex h-7 items-center rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary">{{ estado() }}</span>
        <h2 class="mt-4 text-display-m text-accent-text [text-shadow:0_0_24px_rgb(196_43_62/0.5)]">{{ s()?.['titulo'] || 'Inscripciones' }}</h2>
        @if (s()?.['plazas']) { <p class="mt-2 text-display-l">{{ s()?.['plazas'] }} <span class="text-display-2xs text-text-tertiary">plazas de atleta</span></p> }
        <div class="mx-auto mt-4 h-1 w-48 rounded-pill bg-accent"></div>
        <p class="mt-5 text-body-m text-text-secondary">{{ s()?.['texto'] }}</p>
        <div class="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          @if (c?.modulos?.['atletas']) { <a grButton variant="primary" href="/atletas">Ver atletas inscritos</a> }
          @if (propia()) { <a grButton variant="primary" href="/inscripcion" iconRight="arrow-right">Inscríbete</a> }
          @else if (c?.inscripcion?.url) { <a grButton [href]="c!.inscripcion.url" target="_blank" rel="noopener" iconRight="external-link">Inscripción en la AEP</a> }
        </div>
      </div>
    </div>
  `,
})
export class SecInscripciones {
  readonly s = input<Seccion | undefined>();
  readonly comp = input<CompeticionPublica | null>(null);
  /** Own registration with payment (athletes service): links to /inscripcion instead of the AEP. */
  readonly propia = input(false);
  protected readonly shell = shell;
  protected readonly estado = computed(() => ({ abierta: 'Inscripciones abiertas', completa: 'Inscripciones completas', cerrada: 'Inscripciones cerradas', proximamente: 'Próximamente' })[this.comp()?.inscripcion?.estado ?? 'proximamente'] ?? 'Próximamente');
}

/** «Section / Entradas»: free ticket promo with a ticket mock-up. */
@Component({
  selector: 'gr-sec-entradas',
  imports: [GrButton, GrIcon, SectionTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block overflow-hidden py-18 md:py-24' },
  template: `
    <div [class]="shell" class="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <gr-section-title [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
        <p class="mt-5 max-w-xl text-body-m text-text-secondary">{{ t('texto') }}</p>
        <ul class="mt-6 flex flex-col gap-4">
          @for (p of puntos(); track p.titulo; let i = $index) {
            <li class="flex gap-3"><span class="flex size-9 shrink-0 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon [name]="icons[i % 3]" [size]="16" /></span>
              <span><span class="block text-label-s">{{ p.titulo }}</span><span class="block text-body-s text-text-tertiary">{{ p.texto }}</span></span></li>
          }
        </ul>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" href="/entradas">Reserva tu entrada gratis</a>
          <a grButton size="l" href="/horarios" iconRight="arrow-right">Ver horarios</a>
        </div>
      </div>
      <div class="relative mx-auto w-full max-w-[320px] rotate-[3deg] rounded-xl border border-accent/50 bg-[linear-gradient(160deg,#5a1520,#2a0d12)] p-6 shadow-glow-deep" aria-hidden="true">
        <p class="text-display-xs">GR Strength Cup</p>
        <p class="mt-1 text-mono-xs text-success">Entrada gratuita</p>
        <div class="my-5 border-t border-dashed border-white/20"></div>
        <div class="mx-auto grid size-32 grid-cols-6 gap-1 rounded-md bg-white p-2">@for (i of qr; track $index) { <span class="rounded-[1px]" [class.bg-black]="i"></span> }</div>
        <p class="mt-3 text-center text-mono-xs text-white/70">Enséñalo en la puerta desde el móvil</p>
      </div>
    </div>
  `,
})
export class SecEntradas {
  readonly s = input<Seccion | undefined>();
  protected readonly shell = shell;
  protected readonly icons: GrIconName[] = ['ticket', 'users', 'gift'];
  protected readonly qr = Array.from({ length: 36 }, (_, i) => (i * 7 + (i % 5)) % 3 !== 0);
  protected t = (k: string) => str(this.s(), k);
  protected readonly puntos = computed(() => list<{ titulo: string; texto: string }>(this.s(), 'puntos'));
}

/** Editorial block with a photo (Figma «Section / Atletas», «El día de la competición»). */
@Component({
  selector: 'gr-sec-editorial',
  imports: [SectionTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block py-18 md:py-24' },
  template: `
    <div [class]="shell + ' grid items-center gap-10 md:grid-cols-2 ' + (reverse() ? 'md:[direction:rtl]' : '')">
      <div [class]="'[direction:ltr] ' + (reverse() ? 'md:text-right' : '')"><gr-section-title [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" /></div>
      @if (t('imagen')) { <img [src]="t('imagen')" alt="" class="aspect-[4/5] w-full max-w-md rounded-lg object-cover shadow-card [direction:ltr] md:justify-self-center" loading="lazy" /> }
    </div>
  `,
})
export class SecEditorial {
  readonly s = input<Seccion | undefined>();
  readonly reverse = input(false);
  protected readonly shell = shell;
  protected t = (k: string) => str(this.s(), k);
}

/** «Section / Premios»: one prize per lift. */
@Component({
  selector: 'gr-sec-premios',
  imports: [SectionTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block py-18 md:py-24' },
  template: `
    <div [class]="shell" class="text-center">
      <img src="https://openpencil.menustudioai.com/grscup/logos--trofeo-acento.png" alt="" class="mx-auto h-20 w-auto" loading="lazy" />
      <gr-section-title class="mt-4" [center]="true" [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
      <ul class="mt-12 grid gap-6 md:grid-cols-3">
        @for (p of items(); track p.titulo; let i = $index) {
          <li class="relative overflow-hidden rounded-lg border shadow-card" [class]="i === 1 ? 'border-accent/60 shadow-glow' : 'border-line-subtle'" [style.transform]="'rotate(' + (i - 1) * 2 + 'deg)'">
            <img [src]="p.imagen" alt="" class="aspect-[3/4] w-full object-cover" loading="lazy" />
            <div class="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgb(14_12_13/0.95))] p-5 text-left">
              <span class="inline-flex h-6 items-center rounded-pill bg-accent px-2 text-mono-xs">Premio · {{ (i + 1).toString().padStart(2, '0') }}</span>
              <p class="mt-2 text-display-xs">{{ p.titulo }}</p>
            </div>
          </li>
        }
      </ul>
      @if (t('lema')) { <p class="mt-12 text-display-2xs text-text-secondary">{{ t('lema') }}</p> }
    </div>
  `,
})
export class SecPremios {
  readonly s = input<Seccion | undefined>();
  protected readonly shell = shell;
  protected t = (k: string) => str(this.s(), k);
  protected readonly items = computed(() => list<{ titulo: string; imagen: string }>(this.s(), 'items'));
}

/** «Section / Organización»: text and photos. */
@Component({
  selector: 'gr-sec-organizacion',
  imports: [SectionTitle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block py-18 md:py-24' },
  template: `
    <div [class]="shell" class="text-center">
      <gr-section-title [center]="true" [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" [acento]="t('tituloAcento')" />
      <p class="mx-auto mt-5 max-w-2xl text-body-m text-text-secondary">{{ t('texto') }}</p>
      <ul class="mt-10 grid gap-4 md:grid-cols-2">
        @for (f of fotos(); track f.imagen) { <li><img [src]="f.imagen" [alt]="f.alt" class="aspect-[16/10] w-full rounded-lg object-cover" loading="lazy" /></li> }
      </ul>
    </div>
  `,
})
export class SecOrganizacion {
  readonly s = input<Seccion | undefined>();
  protected readonly shell = shell;
  protected t = (k: string) => str(this.s(), k);
  protected readonly fotos = computed(() => list<{ imagen: string; alt: string }>(this.s(), 'imagenes'));
}

/** «Stats band». */
@Component({
  selector: 'gr-sec-cifras',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block border-y border-line-subtle bg-bg-deep/50' },
  template: `
    <dl class="mx-auto grid max-w-[1440px] grid-cols-2 gap-y-10 px-5 py-14 md:grid-cols-4 md:px-8 xl:px-[120px]">
      @for (c of items(); track c.etiqueta; let i = $index) {
        <div class="flex flex-col items-center gap-2 text-center md:border-l md:border-line-subtle md:first:border-0">
          <dd class="text-display-l" [class.text-accent-text]="i === 0">{{ c.valor }}</dd>
          <dt class="text-mono-xs text-text-tertiary">{{ c.etiqueta }}</dt>
        </div>
      }
    </dl>
  `,
})
export class SecCifras {
  readonly s = input<Seccion | undefined>();
  protected readonly items = computed(() => list<{ valor: string; etiqueta: string }>(this.s(), 'items'));
}

/** «Patrocinadores y colaboradores» strip (from the CMS sponsors). */
@Component({
  selector: 'gr-sec-patrocinadores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[1440px] px-5 py-12 md:px-8 xl:px-[120px]">
      <p class="text-center text-mono-xs text-text-tertiary">{{ titulo() || 'Patrocinadores y colaboradores' }}</p>
      <ul class="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
        @for (p of items(); track p.nombre) {
          <li><a [attr.href]="p.url || null" target="_blank" rel="noopener sponsored"><img [src]="p.logoUrl" [alt]="p.nombre" class="h-10 w-auto opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0 md:h-12" loading="lazy" /></a></li>
        }
      </ul>
    </div>
  `,
})
export class SecPatrocinadores {
  readonly titulo = input('');
  readonly items = input<Patrocinador[]>([]);
}

/** «Section / FAQ»: featured questions. */
@Component({
  selector: 'gr-sec-faq',
  imports: [SectionTitle, GrIcon, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block py-18 md:py-24' },
  template: `
    <div [class]="shell" class="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <gr-section-title [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" />
        <p class="mt-4 text-body-m text-text-secondary">{{ t('texto') }}</p>
        <a grButton class="mt-6" href="/preguntas-frecuentes" iconRight="arrow-right">Ver todas</a>
      </div>
      <div class="flex flex-col gap-2">
        @for (f of items(); track f.pregunta) {
          <details class="group rounded-md border border-line-subtle bg-bg-card open:border-line-strong">
            <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-label-m">{{ f.pregunta }}<gr-icon name="plus" [size]="16" class="shrink-0 transition-transform group-open:rotate-45" /></summary>
            <div class="prose-gr px-5 pb-5 text-body-s" [innerHTML]="md(f.respuesta)"></div>
          </details>
        }
      </div>
    </div>
  `,
})
export class SecFaq {
  readonly s = input<Seccion | undefined>();
  readonly items = input<Faq[]>([]);
  protected readonly shell = shell;
  protected t = (k: string) => str(this.s(), k);
  protected md = (s: string) => renderMarkdown(s).html;
}

/** «Section / Localización»: venue card linking to /como-llegar. */
@Component({
  selector: 'gr-sec-localizacion',
  imports: [SectionTitle, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block py-18 md:py-24' },
  template: `
    @let c = comp();
    <div [class]="shell" class="grid items-center gap-10 md:grid-cols-2">
      <div>
        <gr-section-title [eyebrow]="t('eyebrow')" [titulo]="t('titulo')" />
        <p class="mt-4 text-body-m text-text-secondary">{{ t('texto') }}</p>
        @if (c) {
          <p class="mt-6 flex items-start gap-3 text-body-m"><gr-icon name="map-pin" [size]="20" class="mt-0.5 text-accent-text" /><span><strong>{{ c.sede.nombre }}</strong><br /><span class="text-text-secondary">{{ c.sede.direccion }}, {{ c.sede.cp }} {{ c.sede.ciudad }}</span></span></p>
          <div class="mt-6 flex flex-col gap-3 sm:flex-row">
            <a grButton variant="primary" href="/como-llegar">Cómo llegar</a>
            <a grButton [href]="c.sede.mapsUrl" target="_blank" rel="noopener" iconRight="external-link">Google Maps</a>
          </div>
        }
      </div>
      <img src="https://openpencil.menustudioai.com/grscup/30--central-pavello-almussafes-2.jpg" alt="Pabellón de Almussafes" class="aspect-[16/10] w-full rounded-lg object-cover shadow-card" loading="lazy" />
    </div>
  `,
})
export class SecLocalizacion {
  readonly s = input<Seccion | undefined>();
  readonly comp = input<CompeticionPublica | null>(null);
  protected readonly shell = shell;
  protected t = (k: string) => str(this.s(), k);
}
