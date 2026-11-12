import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrButton, GrSkeleton } from '@grcup/ui';
import { Cms, type Patrocinador } from '../core/cms';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Related } from './landings';

const LOGO_GR = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo-2026.png';
const NIVEL: Record<string, string> = { principal: 'Principal', oro: 'Oro', plata: 'Plata', colaborador: 'Colaborador', institucional: 'Federación', federacion: 'Federación', organizador: 'Organizador' };
/** Levels shown with the organiser and the federation (backoffice «Organizadores y afiliaciones»). */
const AFILIACION = ['institucional', 'federacion', 'organizador'];
const ORDEN = ['principal', 'oro', 'plata', 'colaborador'];

interface Tarjeta { nombre: string; insignia: string; logo: string; url: string; texto: string; nivel?: string }
/** «Marcas y clubs» card by tier: principal full row with the organiser's accent card, oro half row, rest as Figma 31. */
const TIER: Record<string, { li: string; a: string; logo: string }> = {
  principal: { li: 'col-span-2 md:col-span-6', a: 'border-accent/30 bg-[linear-gradient(160deg,rgb(110_20_32/0.16),transparent_60%)]', logo: 'h-[120px]' },
  oro: { li: 'col-span-2 md:col-span-3', a: 'border-accent/30', logo: 'h-24' },
};
const BASE = { li: 'md:col-span-2', a: 'border-line-subtle', logo: 'h-24' };
const mismo = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * /patrocinadores (Figma page 31): «Federación y organización» (the institutions and the organiser), «Marcas y clubs»
 * (every other sponsor, by level), «Hazte patrocinador» with what we offer and the dossier request, related links and
 * the volunteering band.
 */
@Component({
  selector: 'gr-patrocinadores-page',
  imports: [RouterLink, Page, GrButton, GrSkeleton, GrCabecera, Related],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page separacion="mt-[152px] block md:mt-[180px]" title="Patrocinadores" accent="y colaboradores" eyebrow="Comunidad" section="Comunidad" crumb="Patrocinadores" subtitle="Las marcas, clubs y entidades que hacen posible la GRStrength Cup.">
      <div class="flex flex-col gap-12 md:gap-20">
        @if (items() === null) {
          <div class="grid gap-4 md:grid-cols-2">@for (i of [1, 2]; track i) { <gr-skeleton class="h-56 rounded-lg" /> }</div>
        } @else {
          <section class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="Avala y organiza" titulo="Federación *y organización*" [centro]="false" tam="m" />
            <ul class="grid gap-4 md:grid-cols-2">
              @for (t of federacion(); track t.nombre) {
                <li>
                  <a [attr.href]="t.url || null" [attr.target]="t.url ? '_blank' : null" rel="noopener" class="flex h-full flex-col gap-3 rounded-lg border border-accent/30 bg-[linear-gradient(160deg,rgb(110_20_32/0.16),transparent_60%)] bg-bg-card p-6 transition-colors" [class.hover:border-accent]="!!t.url">
                    <span class="flex h-[120px] items-center justify-center rounded-md bg-white/4 p-4"><img [src]="t.logo" [alt]="t.nombre" class="max-h-full max-w-[70%] object-contain" loading="lazy" /></span>
                    <span class="flex items-center justify-between gap-3"><span class="text-label-m">{{ t.nombre }}</span><span class="text-label-xs text-accent-text uppercase">{{ t.insignia }}</span></span>
                    @if (t.texto) { <span class="text-body-s text-text-tertiary">{{ t.texto }}</span> }
                  </a>
                </li>
              }
            </ul>
          </section>

          @if (marcas().length) {
            <section class="flex flex-col gap-5 md:gap-7">
              <gr-cabecera eyebrow="Colaboradores" titulo="Marcas *y clubs*" [centro]="false" tam="m" />
              <ul class="grid grid-cols-2 gap-2 md:grid-cols-6 md:gap-4">
                @for (t of marcas(); track t.nombre) {
                  <li [class]="tier(t.nivel).li">
                    <a [attr.href]="t.url || null" target="_blank" rel="noopener sponsored" [class]="'flex h-full flex-col gap-3 rounded-lg border bg-bg-card p-6 transition-colors ' + tier(t.nivel).a" [class.hover:border-line-strong]="!!t.url">
                      <span [class]="'flex items-center justify-center rounded-md bg-white/4 p-3 md:p-4 ' + tier(t.nivel).logo"><img [src]="t.logo" [alt]="t.nombre" class="max-h-full max-w-[80%] object-contain" loading="lazy" /></span>
                      <span class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span class="text-label-m">{{ t.nombre }}</span>
                        <span class="hidden h-6 items-center rounded-full bg-white/6 px-2.5 text-label-xs text-text-tertiary uppercase md:inline-flex">{{ t.insignia }}</span>
                      </span>
                      @if (t.texto) { <span class="text-body-s text-text-tertiary">{{ t.texto }}</span> }
                    </a>
                  </li>
                }
              </ul>
            </section>
          }
        }

        <section class="flex flex-col gap-5 md:gap-7">
          <gr-cabecera eyebrow="Patrocina" titulo="Hazte *patrocinador*" texto="Llega a atletas, entrenadores y aficionados a la fuerza de toda la Comunitat Valenciana." [centro]="false" tam="m" />
          <div class="grid gap-6 md:grid-cols-2">
            <div class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h3 class="text-label-l">Qué ofrecemos</h3>
              <ul class="mt-3 flex flex-col gap-2">
                @for (o of ofrecemos; track o) { <li class="flex gap-3 text-body-m text-text-secondary"><span class="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ o }}</li> }
              </ul>
            </div>
            <div class="flex flex-col gap-3 rounded-lg border border-accent/40 bg-[linear-gradient(135deg,#3a0f17,#1b1112_70%)] p-6">
              <h3 class="text-display-xs">Hablemos</h3>
              <p class="text-body-m text-text-secondary">Te enviamos el dossier con las opciones de patrocinio.</p>
              <div class="mt-auto flex flex-col gap-3">
                <a grButton variant="primary" size="l" class="w-full" [href]="'mailto:' + email() + '?subject=' + asunto">Pedir dossier</a>
                <a grButton variant="outline" size="l" class="w-full" [href]="'mailto:' + email()" iconRight="arrow-right">{{ email() }}</a>
              </div>
            </div>
          </div>
        </section>

        <gr-related [items]="rel" />

        <section class="overflow-hidden rounded-2xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-6 shadow-glow-deep md:flex md:items-center md:justify-between md:gap-8 md:p-10">
          <div>
            <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase">Voluntariado</p>
            <h2 class="mt-3 text-display-xs md:text-display-m">Haz posible la competición</h2>
            <p class="mt-2 text-body-s text-text-secondary md:text-body-m">Jueces, cargadores, mesa técnica y foto: apúntate como voluntario.</p>
          </div>
          <a grButton variant="primary" size="l" routerLink="/voluntarios" class="mt-5 w-full md:mt-0 md:w-auto">Quiero ayudar</a>
        </section>
      </div>
    </gr-page>
  `,
})
export class PatrocinadoresPage {
  protected readonly items = signal<Patrocinador[] | null>(null);
  private readonly comp = inject(Competition);
  protected readonly email = computed(() => this.comp.data()?.evento.emailContacto || 'admin@grstrength.com');
  protected readonly asunto = encodeURIComponent('Dossier de patrocinio · GR Strength Cup');
  protected readonly ofrecemos = ['Logo en la tarima, el photocall y el cartel', 'Presencia en la web y en redes', 'Stand o espacio de producto en el pabellón', 'Menciones durante la retransmisión'];
  protected readonly rel = [
    { titulo: 'Clubs', texto: 'Clubs de la región', ruta: '/clubs' },
    { titulo: 'Voluntarios', texto: 'Ayuda en la competición', ruta: '/voluntarios' },
    { titulo: 'Edición 2025', texto: 'Quién estuvo', ruta: '/ediciones/2025' },
  ];
  /** The institutions (AEP) and the organiser, built from the event. */
  protected readonly federacion = computed<Tarjeta[]>(() => {
    const inst = (this.items() ?? []).filter((p) => AFILIACION.includes(p.nivel) && !mismo(p.nombre, this.organizador())).map((p) => this.tarjeta(p));
    const org = this.organizador();
    return [...inst, { nombre: org, insignia: 'Organizador', logo: LOGO_GR, url: '', texto: `Club organizador de la ${this.comp.data()?.nombre ?? 'GR Strength Cup'}.` }];
  });
  protected readonly marcas = computed<Tarjeta[]>(() =>
    (this.items() ?? []).filter((p) => !AFILIACION.includes(p.nivel) && !mismo(p.nombre, this.organizador()))
      .sort((a, b) => ORDEN.indexOf(a.nivel) - ORDEN.indexOf(b.nivel)).map((p) => this.tarjeta(p)),
  );
  private readonly organizador = computed(() => this.comp.data()?.evento.organizador || 'GR Strength');
  protected tier(n?: string) { return TIER[n ?? ''] ?? BASE; }

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const [items] = await Promise.all([cms.patrocinadores(), this.comp.load()]);
      this.items.set(items ?? []);
      await applySeo(cms, seo, '/patrocinadores', 'Patrocinadores · GR Strength Cup', 'Las marcas, clubs y entidades que hacen posible la GR Strength Cup.');
    });
  }

  private tarjeta(p: Patrocinador): Tarjeta {
    return { nombre: p.nombre, insignia: NIVEL[p.nivel] ?? p.nivel, logo: p.logoUrl, url: p.url, texto: p.descripcion ?? '', nivel: p.nivel };
  }
}
