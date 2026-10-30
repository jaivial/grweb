import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrIcon, GrSkeleton } from '@grcup/ui';
import { Cms, renderMarkdown, type Faq } from '../core/cms';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { GrEyebrow } from '../home/bloques';
import { instagramOf } from '../layout/layout';
import { Page } from '../layout/page';
import { Community, Related, type RelatedLink } from './landings';

/** /preguntas-frecuentes (Figma page 24): topics, search and accordions grouped by topic. */
@Component({
  selector: 'gr-faq-page',
  imports: [Page, GrIcon, GrSkeleton, GrEyebrow, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Preguntas" accent="frecuentes" eyebrow="Ayuda" subtitle="Todo lo que necesitas saber sobre la inscripción, la competición, el sorteo y cómo venir a Almussafes.">
      <!-- Figma 24: «Temas» card (260, sticky) next to the questions -->
      <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
        <nav class="h-fit min-w-0 rounded-2xl border border-line-subtle bg-bg-card p-3 lg:sticky lg:top-28 lg:p-4" aria-label="Temas">
          <p class="px-2 pb-2 text-label-xs text-text-muted uppercase">Temas</p>
          <ul class="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col">
            @for (t of temas(); track t.nombre) {
              <li><button type="button" (click)="tema.set(t.nombre)" class="flex h-11 w-full items-center justify-between gap-4 rounded-sm px-3 text-label-s whitespace-nowrap lg:h-10"
                [class]="tema() === t.nombre ? 'bg-accent/12 text-text-primary' : 'text-text-secondary hover:bg-bg-raised'">{{ t.nombre }}<span class="text-body-xs text-text-tertiary">{{ t.n }}</span></button></li>
            }
          </ul>
        </nav>
        <div class="flex min-w-0 flex-col gap-6">
          <label class="relative block">
            <span class="sr-only">Buscar una pregunta</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" placeholder="Busca una pregunta…" [value]="q()" (input)="q.set($any($event.target).value)"
              class="h-12 w-full rounded-xl border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
          </label>
          @if (faq() === null) { <div class="flex flex-col gap-3">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16 rounded-2xl" /> }</div> }
          @for (g of grupos(); track g.nombre; let gi = $index) {
            <section class="flex flex-col gap-3">
              <h2><gr-eyebrow [texto]="(gi + 1) + ' · ' + g.nombre" /></h2>
              @for (f of g.items; track f.pregunta; let fi = $index) {
                <!-- Figma «FAQ item»: 16 radius, Label/L question, ± in a disc; the first one open -->
                <details class="group rounded-2xl border border-line-subtle bg-bg-card open:border-accent/60" [attr.open]="gi === 0 && fi === 0 && !q() ? '' : null">
                  <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-label-l">{{ f.pregunta }}
                    <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-text-secondary group-open:bg-accent/20 group-open:text-accent-text"><gr-icon name="plus" [size]="14" class="transition-transform group-open:rotate-45" /></span>
                  </summary>
                  <div class="prose-gr px-5 pb-5 text-body-s text-text-tertiary" [innerHTML]="md(f.respuesta)"></div>
                </details>
              }
            </section>
          } @empty {
            @if (faq() !== null) {
              <div class="flex flex-col items-center gap-2 rounded-2xl border border-line-subtle bg-bg-card px-6 py-10 text-center">
                <gr-icon name="search" [size]="22" class="text-text-tertiary" />
                <p class="text-label-l">No hay preguntas con «{{ q() }}»</p>
                <p class="text-body-s text-text-tertiary">Prueba con otra palabra o escríbenos.</p>
              </div>
            }
          }
          <!-- «¿No encuentras tu respuesta?» -->
          <div class="flex flex-col gap-4 rounded-2xl border border-line-subtle bg-bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p class="text-label-l">¿No encuentras tu respuesta?</p><p class="text-body-s text-text-tertiary">Escríbenos y te contestamos en menos de 48 h.</p></div>
            <div class="flex gap-2">
              @if (contacto()) { <a [href]="'mailto:' + contacto()" class="flex h-11 flex-1 items-center justify-center rounded-sm border border-line-strong px-4 text-label-s hover:border-white sm:flex-none">Email</a> }
              <a [href]="instagram()" target="_blank" rel="noopener" class="flex h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-white/10 bg-white/5 px-4 text-label-s hover:bg-white/10 sm:flex-none"><gr-icon name="instagram" [size]="16" />Instagram</a>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-12 flex flex-col gap-12 md:mt-20 md:gap-20">
        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class FaqPage {
  private readonly cms = inject(Cms);
  protected readonly faq = signal<Faq[] | null>(null);
  protected readonly q = signal('');
  protected readonly tema = signal('Todas');
  protected readonly temas = computed(() => {
    const all = this.faq() ?? [];
    const m = new Map<string, number>();
    for (const f of all) m.set(f.categoria, (m.get(f.categoria) ?? 0) + 1);
    return [{ nombre: 'Todas', n: all.length }, ...[...m].map(([nombre, n]) => ({ nombre, n }))];
  });
  protected readonly grupos = computed(() => {
    const q = this.q().trim().toLowerCase();
    const items = (this.faq() ?? []).filter((f) => (this.tema() === 'Todas' || f.categoria === this.tema()) && (!q || (f.pregunta + ' ' + f.respuesta).toLowerCase().includes(q)));
    const m = new Map<string, Faq[]>();
    for (const f of items) m.set(f.categoria, [...(m.get(f.categoria) ?? []), f]);
    return [...m].map(([nombre, items]) => ({ nombre, items }));
  });
  protected md = (s: string) => renderMarkdown(s).html;
  private readonly comp = inject(Competition);
  protected readonly contacto = computed(() => this.comp.data()?.evento?.emailContacto ?? '');
  protected readonly instagram = computed(() => instagramOf(this.comp.data()));
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Reglamento', texto: 'Cómo funciona la competición', ruta: '/reglamento' },
    { titulo: 'Cómo llegar', texto: 'Pabellón de Almussafes', ruta: '/como-llegar' },
    { titulo: 'Sorteo', texto: 'Gana un cinturón SBD', ruta: '/sorteo' },
  ];
  constructor() {
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const [list, map] = await Promise.all([this.cms.faq(), this.cms.seoMap(), this.comp.load()]);
      this.faq.set(list ?? []);
      const o = map?.paginas.find((p) => p.ruta === '/preguntas-frecuentes');
      seo.set({
        title: o?.title || 'Preguntas frecuentes · GR Strength Cup',
        description: o?.description || 'Entradas gratuitas, inscripción AEP, sorteo y cómo llegar al pabellón de Almussafes.',
        path: '/preguntas-frecuentes',
        // FAQPage structured data (rich results), from the published questions.
        jsonLd: list?.length ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: list.map((f) => ({ '@type': 'Question', name: f.pregunta, acceptedAnswer: { '@type': 'Answer', text: f.respuesta } })) } : undefined,
      });
    });
  }
}
