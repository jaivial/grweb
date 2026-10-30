import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cms } from '../core/cms';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GrCallout, GrChipsAncla, GrHechos } from './seo-bloques';

const NIVELES = [
  { t: 'AEP-1', tipo: 'Nacional', d: 'Máximo nivel. Requiere marca mínima en los 12 meses previos. Se homologan récords.' },
  { t: 'AEP-2', tipo: 'Regional', d: 'Tu total es clasificatorio para un AEP-1 o el Clasificatorio Nacional. Sin récords.', nuestro: true },
  { t: 'AEP-3', tipo: 'Iniciación', d: 'Para levantadores noveles. Sin récords.' },
  { t: 'Clasificatorio', tipo: 'Nacional', d: 'Plaza para Copa o Absoluto si vienes de AEP-2 o AEP-3. Sin récords.' },
];
const LUCES = [{ l: ['b', 'b', 'b'], t: 'Válido' }, { l: ['b', 'b', 'r'], t: 'Válido (2 de 3)' }, { l: ['b', 'r', 'r'], t: 'Nulo' }];
const MOVIMIENTOS = [
  { t: 'Sentadilla', foto: '/img/home/premio-sentadilla.webp', voces: ['«Squat»', '«Rack»'], reglas: [
    'Desciende hasta que la parte superior de la pierna, en la articulación de la cadera, quede por debajo de la parte superior de la rodilla.',
    'Sube hasta bloquear las rodillas sin doble rebote ni movimiento descendente de la barra.',
    'Espera la orden «Rack» para devolver la barra.'] },
  { t: 'Press de banca', foto: '/img/home/premio-banca.webp', voces: ['«Start»', '«Press»', '«Rack»'], reglas: [
    'Baja la barra al pecho y mantenla inmóvil hasta la orden «Press».',
    'Cabeza, hombros y glúteos en contacto con el banco; pies en el suelo.',
    'Extiende los brazos por completo y espera «Rack».'] },
  { t: 'Peso muerto', foto: '/img/home/premio-muerto.webp', voces: ['«Down»'], reglas: [
    'Termina erguido con las rodillas bloqueadas y los hombros hacia atrás.',
    'No apoyes la barra en los muslos para ayudarte a subirla.',
    'Baja la barra controlada tras la orden «Down», sin soltarla.'] },
];

/** /reglamento (Figma page 23): summary, AEP levels, attempts and judges, the three lifts and the raw equipment. */
@Component({
  selector: 'gr-reglamento-page',
  imports: [Page, RouterLink, GrCabecera, GrCallout, GrChipsAncla, GrHechos, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Reglamento de" accent="powerlifting" eyebrow="Competición" section="Competición" crumb="Reglamento"
      subtitle="Cómo funciona una competición AEP: niveles, intentos, jueces, ejecución de cada movimiento, equipamiento y pesaje. Resumen orientativo del reglamento técnico IPF."
      stamp="Fuente: Reglamento técnico IPF y calendario AEP">
      <gr-chips-ancla [anclas]="anclas" />
      <div class="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[260px_minmax(0,860px)] lg:gap-12">
        <!-- Figma «Legal TOC» -->
        <nav class="hidden h-fit flex-col gap-1 rounded-lg border border-line-subtle bg-bg-card p-4 lg:sticky lg:top-28 lg:flex" aria-label="Contenido">
          <p class="pb-2 text-label-xs text-text-muted uppercase">Contenido</p>
          <ol class="flex flex-col gap-1 text-body-s">
            @for (a of anclas; track a.id; let i = $index) {
              <li><a routerLink="." [fragment]="a.id" (click)="activo.set(a.id)" class="relative flex rounded-sm py-2 pr-2 pl-[18px]" [class]="activo() === a.id ? 'bg-accent/12 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="activo() === a.id ? 'location' : null">
                <span class="absolute top-1/2 left-2 h-4 w-0.5 -translate-y-1/2 rounded-full" [class.bg-accent]="activo() === a.id"></span>{{ i + 1 }}. {{ a.toc }}</a></li>
            }
          </ol>
        </nav>
        <article class="flex min-w-0 flex-col gap-12 md:gap-14">
          <gr-hechos id="resumen" class="scroll-mt-36 md:scroll-mt-28" [items]="resumen" />

          <section id="niveles" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera eyebrow="01 · Niveles AEP" titulo="AEP-1, AEP-2 *y AEP-3*" [centro]="false" tam="m" />
            <div class="grid gap-3 sm:grid-cols-2">
              @for (n of niveles; track n.t) {
                <div class="flex flex-col gap-2 rounded-lg border bg-bg-card px-4 py-5" [class]="n.nuestro ? 'border-accent' : 'border-line-subtle'">
                  <p class="flex items-baseline gap-2"><span class="text-display-2xs" [class.text-accent-text]="n.nuestro">{{ n.t }}</span><span class="text-label-xs text-text-muted uppercase">{{ n.tipo }}</span>@if (n.nuestro) { <span class="ml-auto text-label-xs text-accent-text">GR Strength Cup</span> }</p>
                  <p class="text-body-s text-text-tertiary">{{ n.d }}</p>
                </div>
              }
            </div>
          </section>

          <section id="intentos" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera eyebrow="02 · Intentos y jueces" titulo="Tres intentos, *tres jueces*" [centro]="false" tam="m" />
            <p class="text-body-m text-text-secondary md:text-body-l">Cada atleta hace 3 intentos por movimiento. Cada nuevo intento debe ser de al menos 2,5 kg más que el anterior y no se puede bajar el peso. Cuenta el mejor intento válido de cada movimiento.</p>
            <ul class="grid gap-3 sm:grid-cols-3">
              @for (x of luces; track x.t) {
                <li class="flex items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-3 py-4">
                  <span class="flex gap-1.5" aria-hidden="true">@for (c of x.l; track $index) { <span class="size-5 rounded-full" [class]="c === 'b' ? 'bg-white' : 'bg-accent'"></span> }</span>
                  <span class="text-label-s">{{ x.t }}</span>
                </li>
              }
            </ul>
          </section>

          <section id="movimientos" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera eyebrow="03 · Los tres movimientos" titulo="Ejecución y *voces del juez*" [centro]="false" tam="m" />
            @for (m of movimientos; track m.t) {
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
            <gr-cabecera eyebrow="04 · Equipamiento" titulo="Modalidad *raw (clásica)*" texto="Sin equipamiento soportivo. Todo el material debe estar homologado por la IPF." [centro]="false" tam="m" />
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                <p class="text-label-s text-success">Permitido</p>
                <ul class="flex flex-col gap-2">@for (x of permitido; track x) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-success"></span>{{ x }}</li> }</ul>
              </div>
              <div class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
                <p class="text-label-s text-accent-text">No permitido en raw</p>
                <ul class="flex flex-col gap-2">@for (x of prohibido; track x) { <li class="flex gap-3 text-body-s text-text-secondary"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-accent"></span>{{ x }}</li> }</ul>
              </div>
            </div>
            <gr-callout tono="importante">Resumen orientativo. Prevalecen el Reglamento Técnico de la IPF y las normas de la AEP vigentes; consulta siempre el documento oficial antes de competir.</gr-callout>
          </section>
        </article>
      </div>
      <div class="mt-12 flex flex-col gap-12 md:mt-20 md:gap-20">
        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class ReglamentoPage {
  protected readonly niveles = NIVELES;
  protected readonly luces = LUCES;
  protected readonly movimientos = MOVIMIENTOS;
  protected readonly anclas = [
    { id: 'resumen', t: 'Resumen', toc: 'En resumen' }, { id: 'niveles', t: 'Niveles', toc: 'Niveles AEP' }, { id: 'intentos', t: 'Intentos', toc: 'Intentos y jueces' },
    { id: 'movimientos', t: 'Movimientos', toc: 'Los tres movimientos' }, { id: 'equipamiento', t: 'Equipamiento', toc: 'Equipamiento' },
  ];
  protected readonly activo = signal('resumen');
  protected readonly resumen = [
    '3 movimientos en orden: sentadilla, press de banca y peso muerto.',
    '3 intentos por movimiento; cuenta el mejor válido de cada uno.',
    'Total = suma de los tres mejores intentos válidos.',
    'Un intento es válido con al menos 2 de las 3 luces blancas.',
  ];
  protected readonly permitido = ['Maillot de competición y camiseta', 'Cinturón', 'Muñequeras', 'Rodilleras de neopreno', 'Calcetines altos en peso muerto', 'Calzado deportivo'];
  protected readonly prohibido = ['Vendas de rodilla', 'Camisetas de press y monos equipados', 'Material no homologado por la IPF'];
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Categorías de peso', texto: 'Pesos y divisiones por edad', ruta: '/categorias-de-peso' },
    { titulo: 'Marcas mínimas', texto: 'Totales AEP-1 por categoría', ruta: '/marcas-minimas' },
    { titulo: 'Preguntas frecuentes', texto: 'Inscripción, pesaje y más', ruta: '/preguntas-frecuentes' },
  ];

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(() => applySeo(cms, seo, '/reglamento', 'Reglamento de powerlifting · GR Strength Cup',
      'Cómo funciona una competición AEP: niveles AEP-1, AEP-2 y AEP-3, intentos y jueces, ejecución de sentadilla, press de banca y peso muerto, y equipamiento raw.'));
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // the contents card follows the section on screen (the first one in the band below the navbar)
      const vistos = new Set<string>();
      const io = new IntersectionObserver((es) => {
        for (const e of es) e.isIntersecting ? vistos.add(e.target.id) : vistos.delete(e.target.id);
        const primero = this.anclas.find((a) => vistos.has(a.id));
        if (primero) this.activo.set(primero.id);
      }, { rootMargin: '-10% 0px -60% 0px' });
      const t = setTimeout(() => this.anclas.forEach((a) => { const el = document.getElementById(a.id); if (el) io.observe(el); }), 300);
      inject(DestroyRef).onDestroy(() => { clearTimeout(t); io.disconnect(); });
    }
  }
}
