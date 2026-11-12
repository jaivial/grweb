import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrSelect } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { webPublica } from '../core/web';

interface SeoRow { id: string; ruta: string; title: string; description: string; indexable: boolean }

/** Figma 54 «Web · SEO»: summary («28 URLs · 1 title demasiado largo»), «Vista previa en Google» and «Ver sitemap.xml». */
@Component({
  selector: 'bo-web-seo-extra',
  imports: [GrButton, GrSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block rounded-lg border border-line-subtle bg-bg-card p-5' },
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-ui-h5">Vista previa en Google</h2>
        <p class="mt-0.5 text-body-xs text-text-tertiary">{{ rows().length }} URLs{{ largos() ? ' · ' + largos() + (largos() === 1 ? ' title demasiado largo' : ' titles demasiado largos') : '' }}{{ cortas() ? ' · ' + cortas() + ' sin description' : '' }}</p>
      </div>
      <a grButton icon="external-link" [href]="web + '/sitemap.xml'" target="_blank" rel="noopener">Ver sitemap.xml</a>
    </div>
    @if (rows().length) {
      <gr-select id="seo-preview" class="mt-4 block max-w-sm" aria-label="Ruta" [value]="sel()?.id ?? ''" (valorChange)="id.set($event)">
        @for (r of rows(); track r.id) { <option [value]="r.id">{{ r.ruta }}</option> }
      </gr-select>
      @if (sel(); as r) {
        <div class="mt-4 max-w-[600px] rounded-md bg-white p-4 font-sans">
          <p class="truncate text-[14px] text-[#202124]">{{ host }}<span class="text-[#4d5156]">{{ r.ruta === '/' ? '' : ' › ' + r.ruta.slice(1).split('/').join(' › ') }}</span></p>
          <p class="mt-1 truncate text-[20px] leading-[26px] text-[#1a0dab]">{{ corta(r.title || comps.current()?.nombre || '', 60) }}</p>
          <p class="mt-1 line-clamp-2 text-[14px] leading-[22px] text-[#4d5156]">{{ corta(r.description, 160) }}</p>
        </div>
      }
    }
  `,
})
export class WebSeoExtra {
  private readonly http = inject(HttpClient);
  protected readonly comps = inject(Competitions);
  protected readonly web = webPublica();
  protected readonly host = new URL(webPublica()).host;
  protected readonly rows = signal<SeoRow[]>([]);
  protected readonly id = signal('');
  protected readonly sel = computed((): SeoRow | undefined => this.rows().find((r) => r.id === this.id()) ?? this.rows()[0]);
  protected readonly largos = computed(() => this.rows().filter((r) => r.title.length > 60).length);
  protected readonly cortas = computed(() => this.rows().filter((r) => !r.description).length);

  constructor() {
    effect(() => {
      const cid = this.comps.current()?.id;
      if (cid) void firstValueFrom(this.http.get<SeoRow[]>(`/api/admin/competiciones/${cid}/web/seo`)).then((l) => this.rows.set(l), () => this.rows.set([]));
    });
  }

  /** Google truncates around 60 / 160 characters. */
  protected corta(t: string, n: number): string { return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; }
}

