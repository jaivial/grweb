import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type GrIconName, cdn } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GrCallout, GrChipsAncla, GrHechos } from './seo-bloques';
import { I18n } from '../core/i18n';

type Nivel = { t: string; tipo: string; d: string; nuestro?: boolean; badge?: string };
const LUCES = [['b', 'b', 'b'], ['b', 'b', 'r'], ['b', 'r', 'r'], ['r', 'r', 'r']];
const FOTOS = [cdn('/img/home/premio-sentadilla.webp'), cdn('/img/home/premio-banca.webp'), cdn('/img/home/premio-muerto.webp')];
const VOCES = [['«Squat»', '«Rack»'], ['«Start»', '«Press»', '«Rack»'], ['«Down»']];

const T = {
  es: {
    titulo: 'Reglamento de', acento: 'powerlifting', eyebrow: 'Competición', crumb: 'Reglamento',
    subtitulo: 'Cómo funciona una competición AEP: niveles, intentos, jueces, ejecución de cada movimiento, equipamiento y pesaje. Resumen orientativo del reglamento técnico IPF.',
    stamp: 'Fuente: Reglamento técnico IPF y calendario AEP', contenido: 'Contenido',
    anclas: [
      { id: 'resumen', t: 'Resumen', toc: 'En resumen' }, { id: 'niveles', t: 'Niveles', toc: 'Niveles AEP' }, { id: 'intentos', t: 'Intentos', toc: 'Intentos y jueces' },
      { id: 'movimientos', t: 'Movimientos', toc: 'Los tres movimientos' }, { id: 'equipamiento', t: 'Equipamiento', toc: 'Equipamiento' },
    ],
    resumen: [
      '3 movimientos en orden: sentadilla, press de banca y peso muerto.',
      '3 intentos por movimiento; cuenta el mejor válido de cada uno.',
      'Total = suma de los tres mejores intentos válidos.',
      'Un intento es válido con al menos 2 de las 3 luces blancas.',
    ],
    nivelesEyebrow: 'Niveles AEP', nivelesTitulo: 'AEP-1, AEP-2 *y AEP-3*',
    niveles: [
      { t: 'AEP-1', tipo: 'Nacional', d: 'Máximo nivel. Requiere marca mínima en los 12 meses previos. Se homologan récords.' },
      { t: 'AEP-2', tipo: 'Regional', d: 'Tu total es clasificatorio para un AEP-1 o el Clasificatorio Nacional. Sin récords.', nuestro: true },
      { t: 'AEP-3', tipo: 'Iniciación', d: 'Para levantadores noveles. Sin récords. La GRS Cup es una competición AEP-3.', nuestro: true, badge: 'GRS Cup' },
      { t: 'Clasificatorio', tipo: 'Nacional', d: 'Plaza para Copa o Absoluto si vienes de AEP-2 o AEP-3. Sin récords.' },
    ] as Nivel[],
    intentosEyebrow: 'Intentos y jueces', intentosTitulo: 'Tres intentos, *tres jueces*',
    intentosTexto: 'Cada atleta hace 3 intentos por movimiento. El siguiente puede repetir peso o subir (mínimo +2,5 kg), nunca bajar. Cuenta el mejor intento válido.',
    luces: ['Válido', 'Válido (2 de 3)', 'Nulo (2 de 3)', 'Nulo'],
    movEyebrow: 'Los tres movimientos', movTitulo: 'Ejecución y *voces del juez*',
    movimientos: [
      { t: 'Sentadilla', reglas: [
        'Baja hasta que la cadera quede por debajo de la rodilla.',
        'Sube hasta bloquear las rodillas, sin rebotes, y espera «Rack».'] },
      { t: 'Press de banca', reglas: [
        'Barra al pecho, inmóvil hasta la orden «Press».',
        'Glúteos en el banco y pies en el suelo; bloquea y espera «Rack».'] },
      { t: 'Peso muerto', reglas: [
        'Termina erguido: rodillas bloqueadas y hombros atrás.',
        'Sin apoyar la barra en los muslos; bájala controlada tras «Down».'] },
    ],
    equipoEyebrow: 'Equipamiento', equipoTitulo: 'Modalidad *raw (clásica)*', equipoTexto: 'Sin equipamiento soportivo. Todo el material debe estar homologado por la IPF.',
    permitidoT: 'Permitido', prohibidoT: 'No permitido en raw',
    permitido: ['Maillot de competición y camiseta', 'Cinturón', 'Muñequeras', 'Rodilleras de neopreno', 'Calcetines altos en peso muerto', 'Calzado deportivo'],
    prohibido: ['Vendas de rodilla', 'Camisetas de press y monos equipados', 'Material no homologado por la IPF'],
    aviso: 'Resumen orientativo. Prevalecen el Reglamento Técnico de la IPF y las normas de la AEP vigentes; consulta siempre el documento oficial antes de competir.',
    relacionados: [
      { titulo: 'Categorías de peso', texto: 'Pesos y divisiones por edad', ruta: '/categorias-de-peso' },
      { titulo: 'Marcas mínimas', texto: 'Totales AEP-1 por categoría', ruta: '/marcas-minimas' },
      { titulo: 'Preguntas frecuentes', texto: 'Inscripción, pesaje y más', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    seoTitulo: 'Reglamento de powerlifting · GRS Cup',
    seoDesc: 'Cómo funciona una competición AEP: niveles AEP-1, AEP-2 y AEP-3, intentos y jueces, ejecución de sentadilla, press de banca y peso muerto, y equipamiento raw.',
    ldTitulo: 'Reglamento de powerlifting 2026',
  },
  en: {
    titulo: 'Powerlifting', acento: 'rules', eyebrow: 'Competition', crumb: 'Rules',
    subtitulo: 'How an AEP competition works: levels, attempts, referees, how each lift is performed, equipment and the weigh-in. A guide summary of the IPF technical rules.',
    stamp: 'Source: IPF technical rules and AEP calendar', contenido: 'Contents',
    anclas: [
      { id: 'resumen', t: 'Summary', toc: 'In short' }, { id: 'niveles', t: 'Levels', toc: 'AEP levels' }, { id: 'intentos', t: 'Attempts', toc: 'Attempts and referees' },
      { id: 'movimientos', t: 'Lifts', toc: 'The three lifts' }, { id: 'equipamiento', t: 'Equipment', toc: 'Equipment' },
    ],
    resumen: [
      '3 lifts in order: squat, bench press and deadlift.',
      '3 attempts per lift; the best good lift of each one counts.',
      'Total = the sum of the three best good lifts.',
      'An attempt is good with at least 2 of the 3 white lights.',
    ],
    nivelesEyebrow: 'AEP levels', nivelesTitulo: 'AEP-1, AEP-2 *and AEP-3*',
    niveles: [
      { t: 'AEP-1', tipo: 'National', d: 'The top level. Requires a qualifying total in the previous 12 months. Records are ratified.' },
      { t: 'AEP-2', tipo: 'Regional', d: 'Your total qualifies you for an AEP-1 or the National Qualifier. No records.', nuestro: true },
      { t: 'AEP-3', tipo: 'Novice', d: 'For novice lifters. No records. GRS Cup is an AEP-3 competition.', nuestro: true, badge: 'GRS Cup' },
      { t: 'Qualifier', tipo: 'National', d: 'A place at the Cup or the Open Championship if you come from AEP-2 or AEP-3. No records.' },
    ] as Nivel[],
    intentosEyebrow: 'Attempts and referees', intentosTitulo: 'Three attempts, *three referees*',
    intentosTexto: 'Every athlete has 3 attempts per lift. The next one can repeat the weight or go up (at least +2.5 kg), never down. The best good attempt counts.',
    luces: ['Good lift', 'Good lift (2 of 3)', 'No lift (2 of 3)', 'No lift'],
    movEyebrow: 'The three lifts', movTitulo: "Performance and *referee's commands*",
    movimientos: [
      { t: 'Squat', reglas: [
        'Go down until your hip crease is below the top of the knee.',
        'Stand up until your knees lock, without bouncing, and wait for «Rack».'] },
      { t: 'Bench press', reglas: [
        'Bar to the chest, motionless until the «Press» command.',
        'Glutes on the bench and feet on the floor; lock out and wait for «Rack».'] },
      { t: 'Deadlift', reglas: [
        'Finish standing tall: knees locked and shoulders back.',
        'No resting the bar on your thighs; lower it under control after «Down».'] },
    ],
    equipoEyebrow: 'Equipment', equipoTitulo: '*Raw (classic)* division', equipoTexto: 'No supportive equipment. All gear must be IPF-approved.',
    permitidoT: 'Allowed', prohibidoT: 'Not allowed in raw',
    permitido: ['Competition singlet and T-shirt', 'Belt', 'Wrist wraps', 'Neoprene knee sleeves', 'Long socks for the deadlift', 'Sports shoes'],
    prohibido: ['Knee wraps', 'Bench shirts and equipped suits', 'Gear not approved by the IPF'],
    aviso: 'A guide summary. The IPF Technical Rules and the AEP rules in force prevail; always check the official document before competing.',
    relacionados: [
      { titulo: 'Weight classes', texto: 'Weights and age divisions', ruta: '/categorias-de-peso' },
      { titulo: 'Qualifying totals', texto: 'AEP-1 totals by class', ruta: '/marcas-minimas' },
      { titulo: 'FAQ', texto: 'Entry, weigh-in and more', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    seoTitulo: 'Powerlifting rules · GRS Cup',
    seoDesc: 'How an AEP competition works: AEP-1, AEP-2 and AEP-3 levels, attempts and referees, how to perform the squat, bench press and deadlift, and raw equipment.',
    ldTitulo: 'Powerlifting rules 2026',
  },
};

/** /reglamento (Figma page 23): summary, AEP levels, attempts and judges, the three lifts and the raw equipment. */
@Component({
  selector: 'gr-reglamento-page',
  imports: [Page, RouterLink, GrCabecera, GrCallout, GrChipsAncla, GrHechos, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [eyebrow]="t().eyebrow" [section]="t().eyebrow" [crumb]="t().crumb"
      [subtitle]="t().subtitulo"
      [stamp]="t().stamp">
      <gr-chips-ancla [anclas]="t().anclas" />
      <div class="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[260px_minmax(0,860px)] lg:gap-12">
        <!-- Figma «Legal TOC» -->
        <nav class="hidden h-fit flex-col gap-1 rounded-lg border border-line-subtle bg-bg-card p-4 lg:sticky lg:top-28 lg:flex" [attr.aria-label]="t().contenido">
          <p class="pb-2 text-label-xs text-text-muted uppercase">{{ t().contenido }}</p>
          <ol class="flex flex-col gap-1 text-body-s">
            @for (a of t().anclas; track a.id; let i = $index) {
              <li><a routerLink="." [fragment]="a.id" (click)="activo.set(a.id)" class="relative flex rounded-sm py-2 px-2.5" [class]="activo() === a.id ? 'bg-accent/12 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="activo() === a.id ? 'location' : null">{{ i + 1 }}. {{ a.toc }}</a></li>
            }
          </ol>
        </nav>
        <article class="flex min-w-0 flex-col gap-12 md:gap-14">
          <gr-hechos id="resumen" class="scroll-mt-36 md:scroll-mt-28" [items]="t().resumen" [iconos]="iconosResumen" />

          <section id="niveles" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera [eyebrow]="t().nivelesEyebrow" [titulo]="t().nivelesTitulo" [centro]="false" tam="m" />
            <div class="grid gap-3 sm:grid-cols-2">
              @for (n of t().niveles; track n.t) {
                <div class="flex flex-col gap-2 rounded-lg border bg-bg-card px-4 py-5" [class]="n.nuestro ? 'border-accent' : 'border-line-subtle'">
                  <p class="flex items-baseline gap-2"><span class="text-display-2xs" [class.text-accent-text]="n.nuestro">{{ n.t }}</span><span class="text-label-xs text-text-muted uppercase">{{ n.tipo }}</span>@if (n.badge) { <span class="ml-auto self-center rounded-full bg-[linear-gradient(90deg,#c42b3e,#6e2020)] px-2.5 py-0.5 text-[11px] font-semibold text-white">{{ n.badge }}</span> }</p>
                  <p class="text-body-s text-text-tertiary">{{ n.d }}</p>
                </div>
              }
            </div>
          </section>

          <section id="intentos" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera [eyebrow]="t().intentosEyebrow" [titulo]="t().intentosTitulo" [centro]="false" tam="m" />
            <p class="text-body-m text-text-secondary md:text-body-l">{{ t().intentosTexto }}</p>
            <ul class="grid gap-3 sm:grid-cols-2">
              @for (x of luces(); track x.t) {
                <li class="flex items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-3 py-4">
                  <span class="flex gap-1.5" aria-hidden="true">@for (c of x.l; track $index) { <span class="size-5 rounded-full" [class]="c === 'b' ? 'bg-white' : 'bg-accent'"></span> }</span>
                  <span class="text-label-s">{{ x.t }}</span>
                </li>
              }
            </ul>
          </section>

          <section id="movimientos" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera [eyebrow]="t().movEyebrow" [titulo]="t().movTitulo" [centro]="false" tam="m" />
            @for (m of movimientos(); track m.t) {
              <div class="flex flex-col gap-5 rounded-[20px] border border-line-subtle bg-bg-card p-5 sm:flex-row sm:gap-6">
                <img [src]="m.foto" [alt]="m.t" class="aspect-[350/200] w-full rounded-md border border-white/8 object-cover sm:aspect-[200/260] sm:w-[200px] sm:shrink-0" loading="lazy" />
                <div class="flex flex-col gap-3">
                  <h3 class="text-display-xs">{{ m.t }}</h3>
                  <p class="flex flex-wrap gap-2">@for (v of m.voces; track v) { <span class="rounded-sm border border-accent/50 bg-accent/10 px-2 py-0.5 text-mono-xs text-accent-text">{{ v }}</span> }</p>
                  <ul class="flex flex-col gap-2">@for (r of m.reglas; track r) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ r }}</li> }</ul>
                </div>
              </div>
            }
          </section>

          <section id="equipamiento" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera [eyebrow]="t().equipoEyebrow" [titulo]="t().equipoTitulo" [texto]="t().equipoTexto" [centro]="false" tam="m" />
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                <p class="text-label-s text-success">{{ t().permitidoT }}</p>
                <ul class="flex flex-col gap-2">@for (x of t().permitido; track x) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-success"></span>{{ x }}</li> }</ul>
              </div>
              <div class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                <p class="text-label-s text-accent-text">{{ t().prohibidoT }}</p>
                <ul class="flex flex-col gap-2">@for (x of t().prohibido; track x) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ x }}</li> }</ul>
              </div>
            </div>
            <gr-callout tono="importante">{{ t().aviso }}</gr-callout>
          </section>
        </article>
      </div>
      <div class="mt-12 flex flex-col gap-12 md:mt-20 md:gap-20">
        <gr-related [items]="t().relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class ReglamentoPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly luces = computed(() => LUCES.map((l, i) => ({ l, t: this.t().luces[i] })));
  protected readonly movimientos = computed(() => this.t().movimientos.map((m, i) => ({ ...m, foto: FOTOS[i], voces: VOCES[i] })));
  protected readonly activo = signal('resumen');
  protected readonly iconosResumen: GrIconName[] = ['dumbbell', 'refresh', 'trophy', 'eye'];

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    const t = this.t();
    void inject(PendingTasks).run(() => applySeo(cms, seo, '/reglamento', t.seoTitulo,
      t.seoDesc, undefined,
      // Figma 20: Article schema.
      { jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: t.ldTitulo, inLanguage: this.i18n.lang(),
        publisher: { '@type': 'Organization', name: 'GRS Cup' } } }));
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // the contents card follows the section on screen (the first one in the band below the navbar)
      const vistos = new Set<string>();
      const io = new IntersectionObserver((es) => {
        for (const e of es) e.isIntersecting ? vistos.add(e.target.id) : vistos.delete(e.target.id);
        const primero = this.t().anclas.find((a) => vistos.has(a.id));
        if (primero) this.activo.set(primero.id);
      }, { rootMargin: '-10% 0px -60% 0px' });
      const tm = setTimeout(() => this.t().anclas.forEach((a) => { const el = document.getElementById(a.id); if (el) io.observe(el); }), 300);
      inject(DestroyRef).onDestroy(() => { clearTimeout(tm); io.disconnect(); });
    }
  }
}
