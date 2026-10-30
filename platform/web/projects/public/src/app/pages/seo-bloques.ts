import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrIcon, type GrIconName } from '@grcup/ui';

/**
 * Shared blocks of the SEO pages (Figma 20–35): callouts («Dato», «Consejo», «Aviso»), the «En resumen» key facts card
 * and the sticky anchor chips of mobile.
 */

/** Figma «Callout»: 3 px bar, icon and a coloured label over the text. */
@Component({
  selector: 'gr-callout',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'relative flex gap-3 overflow-hidden rounded-2xl p-4 ' + estilo[tono()].caja" },
  template: `
    <span class="absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-full" [class]="estilo[tono()].barra" aria-hidden="true"></span>
    <gr-icon [name]="estilo[tono()].icono" [size]="20" class="ml-2 shrink-0" [class]="estilo[tono()].texto" />
    <div class="flex flex-col gap-1">
      <p class="text-label-s" [class]="estilo[tono()].texto">{{ titulo() || estilo[tono()].titulo }}</p>
      <div class="text-body-m text-text-secondary"><ng-content /></div>
    </div>
  `,
})
export class GrCallout {
  readonly tono = input<'dato' | 'consejo' | 'aviso' | 'importante'>('dato');
  readonly titulo = input('');
  protected readonly estilo: Record<string, { caja: string; barra: string; texto: string; icono: GrIconName; titulo: string }> = {
    dato: { caja: 'bg-info/8', barra: 'bg-info', texto: 'text-info', icono: 'zap', titulo: 'Dato' },
    consejo: { caja: 'bg-success/8', barra: 'bg-success', texto: 'text-success', icono: 'circle-check', titulo: 'Consejo' },
    aviso: { caja: 'bg-warning/8', barra: 'bg-warning', texto: 'text-warning', icono: 'triangle-alert', titulo: 'Aviso' },
    importante: { caja: 'bg-accent/8', barra: 'bg-accent', texto: 'text-accent-text', icono: 'circle-alert', titulo: 'Importante' },
  };
}

/** Figma «Key facts»: «En resumen» in red and a list with checks, in a card with a red border. */
@Component({
  selector: 'gr-hechos',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3 rounded-2xl border border-accent bg-bg-card/40 p-6' },
  template: `
    <p class="text-label-xs text-accent-text uppercase">{{ titulo() }}</p>
    <ul class="flex flex-col gap-3">
      @for (h of items(); track h) { <li class="flex gap-2.5 text-body-m text-text-secondary"><gr-icon name="check" [size]="18" class="mt-[3px] shrink-0 text-accent-text" />{{ h }}</li> }
    </ul>
  `,
})
export class GrHechos {
  readonly titulo = input('En resumen');
  readonly items = input<string[]>([]);
}

/** Figma «Anchor chips» (mobile): sticky under the navbar; the chip of the section on screen is highlighted. */
@Component({
  selector: 'gr-chips-ancla',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sticky top-[76px] z-20 -mx-5 -mt-4 mb-6 block border-b border-line-subtle bg-bg-base/95 backdrop-blur md:hidden' },
  template: `
    <nav class="flex gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none]" aria-label="Secciones">
      @for (s of anclas(); track s.id) {
        <a routerLink="." [fragment]="s.id" class="flex h-9 shrink-0 items-center rounded-full border px-4 text-label-s" [class]="activa() === s.id ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary'">{{ s.t }}</a>
      }
    </nav>
  `,
})
export class GrChipsAncla {
  readonly anclas = input<{ id: string; t: string }[]>([]);
  protected readonly activa = signal('');
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) this.activa.set(e.target.id); }, { rootMargin: '-40% 0px -55% 0px' });
    const t = setTimeout(() => {
      this.activa.set(this.anclas()[0]?.id ?? '');
      for (const a of this.anclas()) { const el = document.getElementById(a.id); if (el) io.observe(el); }
    }, 500);
    inject(DestroyRef).onDestroy(() => { clearTimeout(t); io.disconnect(); });
  }
}
