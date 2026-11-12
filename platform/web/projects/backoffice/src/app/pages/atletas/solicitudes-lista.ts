import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { GrBadge, GrButton, GrIcon, GrPopover, fmtAgo } from '@grcup/ui';
import { estadoDe, matchTone, matchTxt, nombreCompleto } from './solicitudes-model';
import type { SolicitudItem } from './solicitudes-api';

/** Request list of «Atletas › Solicitudes»: desktop table, tablet table, mobile cards and pager. */
@Component({
  selector: 'bo-solicitudes-lista',
  imports: [GrBadge, GrButton, GrIcon, GrPopover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
      <!-- Desktop -->
      <table class="hidden w-full table-fixed text-left lg:table">
        <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
          <tr>
            <th class="px-4 py-3 font-normal">Atleta</th>
            <th class="w-40 px-3 py-3 font-normal">Coincidencia</th>
            <th class="w-48 px-3 py-3 font-normal">Club</th>
            <th class="w-20 px-3 py-3 font-normal">Edad</th>
            <th class="w-28 px-3 py-3 font-normal">Recibida</th>
            <th class="w-56 px-3 py-3 font-normal">Estado</th>
            <th class="w-12"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (s of items(); track s.id) {
            <tr [class]="claseFila(s)" (click)="revisar.emit(s)">
              <td class="relative px-4 py-3">
                @if (resaltado(s.id)) { <span class="absolute inset-y-0 left-0 w-[3px] bg-success" aria-hidden="true"></span> }
                <span class="flex items-center gap-3">
                  @if (miniatura(s.id); as url) { <img [src]="url" alt="" class="h-12 w-10 shrink-0 rounded-xs bg-bg-raised object-cover" loading="lazy" /> }
                  @else { <span class="flex h-12 w-10 shrink-0 items-center justify-center rounded-xs bg-bg-raised text-text-tertiary"><gr-icon name="user" [size]="18" /></span> }
                  <span class="min-w-0"><button type="button" class="block max-w-full truncate rounded-2xs text-left text-label-s focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [attr.aria-label]="'Revisar solicitud de ' + nombreCompleto(s)" (click)="$event.stopPropagation(); revisar.emit(s)">{{ nombreCompleto(s) }}</button><span class="block truncate text-body-xs text-text-tertiary">{{ s.email }}</span></span>
                </span>
              </td>
              <td class="px-3 py-3"><gr-badge [tone]="matchTone(s.match)">{{ match(s.match) }}</gr-badge></td>
              <td class="truncate px-3 py-3 text-body-s">{{ s.club || 'Independiente' }}</td>
              <td class="px-3 py-3 text-body-s">{{ s.edad }}</td>
              <td class="px-3 py-3 text-body-s">{{ hace(s.createdAt) }}</td>
              <td class="px-3 py-3"><gr-badge [tone]="estado(s).tone">{{ estado(s).l }}</gr-badge></td>
              <td class="relative px-2 py-3" (click)="$event.stopPropagation()">
                <button type="button" class="flex size-8 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [attr.aria-label]="'Acciones de ' + nombreCompleto(s)" aria-haspopup="menu" [attr.aria-expanded]="menu() === s.id" (click)="menu.set(menu() === s.id ? null : s.id)">…</button>
                @if (menu() === s.id) {
                  <gr-popover [etiqueta]="'Acciones de ' + nombreCompleto(s)" (cerrar)="menu.set(null)">
                    <div class="flex flex-col md:-m-2" role="menu">
                      <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card" (click)="menu.set(null); revisar.emit(s)"><gr-icon name="eye" [size]="16" />Revisar</button>
                      @if (s.estado !== 'aprobada' && s.estado !== 'rechazada') {
                        <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card" (click)="elegir(s, 'aprobar')"><gr-icon name="check" [size]="16" />Aprobar…</button>
                        <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card" (click)="elegir(s, 'rechazar')"><gr-icon name="x" [size]="16" />Rechazar…</button>
                      }
                      @if (s.estado !== 'aprobada') {
                        <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card text-error" (click)="elegir(s, 'borrar')"><gr-icon name="trash" [size]="16" />Borrar…</button>
                      }
                    </div>
                  </gr-popover>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>

      <!-- Tablet -->
      <table class="hidden w-full table-fixed text-left md:table lg:hidden">
        <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
          <tr>
            <th class="px-4 py-3 font-normal">Atleta</th>
            <th class="w-40 px-3 py-3 font-normal">Coincidencia</th>
            <th class="w-28 px-3 py-3 font-normal">Recibida</th>
            <th class="w-48 px-3 py-3 font-normal">Estado</th>
            <th class="w-10"><span class="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          @for (s of items(); track s.id) {
            <tr [class]="claseFila(s)" (click)="revisar.emit(s)">
              <td class="relative px-4 py-3">
                @if (resaltado(s.id)) { <span class="absolute inset-y-0 left-0 w-[3px] bg-success" aria-hidden="true"></span> }
                <span class="flex items-center gap-3">
                  @if (miniatura(s.id); as url) { <img [src]="url" alt="" class="h-12 w-10 shrink-0 rounded-xs bg-bg-raised object-cover" loading="lazy" /> }
                  @else { <span class="flex h-12 w-10 shrink-0 items-center justify-center rounded-xs bg-bg-raised text-text-tertiary"><gr-icon name="user" [size]="18" /></span> }
                  <span class="min-w-0"><button type="button" class="block max-w-full truncate rounded-2xs text-left text-label-s focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [attr.aria-label]="'Revisar solicitud de ' + nombreCompleto(s)" (click)="$event.stopPropagation(); revisar.emit(s)">{{ nombreCompleto(s) }}</button>
                    <span class="block truncate text-body-xs text-text-tertiary">{{ s.club || 'Independiente' }} · {{ s.edad }} años</span></span>
                </span>
              </td>
              <td class="px-3 py-3"><gr-badge [tone]="matchTone(s.match)">{{ match(s.match) }}</gr-badge></td>
              <td class="px-3 py-3 text-body-s">{{ hace(s.createdAt) }}</td>
              <td class="px-3 py-3"><gr-badge [tone]="estado(s).tone">{{ estado(s).l }}</gr-badge></td>
              <td class="relative px-2 py-3" (click)="$event.stopPropagation()">
                <button type="button" class="flex size-8 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [attr.aria-label]="'Acciones de ' + nombreCompleto(s)" aria-haspopup="menu" [attr.aria-expanded]="menu() === s.id" (click)="menu.set(menu() === s.id ? null : s.id)">…</button>
                @if (menu() === s.id) {
                  <gr-popover [etiqueta]="'Acciones de ' + nombreCompleto(s)" (cerrar)="menu.set(null)">
                    <div class="flex flex-col md:-m-2" role="menu">
                      <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card" (click)="menu.set(null); revisar.emit(s)"><gr-icon name="eye" [size]="16" />Revisar</button>
                      @if (s.estado !== 'aprobada' && s.estado !== 'rechazada') {
                        <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card" (click)="elegir(s, 'aprobar')"><gr-icon name="check" [size]="16" />Aprobar…</button>
                        <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card" (click)="elegir(s, 'rechazar')"><gr-icon name="x" [size]="16" />Rechazar…</button>
                      }
                      @if (s.estado !== 'aprobada') {
                        <button type="button" role="menuitem" class="flex h-11 items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card text-error" (click)="elegir(s, 'borrar')"><gr-icon name="trash" [size]="16" />Borrar…</button>
                      }
                    </div>
                  </gr-popover>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>

      <!-- Mobile -->
      <ul class="flex flex-col md:hidden">
        @for (s of items(); track s.id) {
          <li class="border-b border-line-subtle p-4 last:border-0" [class.bg-success/10]="resaltado(s.id)">
            <button type="button" class="flex w-full items-start gap-3 text-left" (click)="revisar.emit(s)">
              @if (miniatura(s.id); as url) { <img [src]="url" alt="" class="h-12 w-10 shrink-0 rounded-xs bg-bg-raised object-cover" loading="lazy" /> }
              @else { <span class="flex h-12 w-10 shrink-0 items-center justify-center rounded-xs bg-bg-raised text-text-tertiary"><gr-icon name="user" [size]="18" /></span> }
              <span class="min-w-0 flex-1">
                <span class="block truncate text-label-m">{{ nombreCompleto(s) }}</span>
                <span class="block truncate text-body-xs text-text-tertiary">{{ s.email }}</span>
                <span class="block truncate text-body-xs text-text-tertiary">{{ s.club || 'Independiente' }} · {{ s.edad }} años · {{ hace(s.createdAt) }}</span>
              </span>
            </button>
            <div class="mt-3 flex flex-wrap gap-1">
              <gr-badge [tone]="matchTone(s.match)">{{ match(s.match) }}</gr-badge>
              <gr-badge [tone]="estado(s).tone">{{ estado(s).l }}</gr-badge>
            </div>
            <button grButton class="mt-3" [block]="true" (click)="revisar.emit(s)">Revisar solicitud</button>
          </li>
        }
      </ul>

      <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">
        <span>Mostrando {{ desde() }}–{{ hasta() }} de {{ total() }}</span>
        @if (paginas() > 1) {
          <nav class="flex items-center gap-1" aria-label="Páginas">
            <button type="button" class="flex size-9 items-center justify-center rounded-sm border border-line-strong disabled:opacity-40" [disabled]="pagina() === 1" (click)="irPagina.emit(pagina() - 1)" aria-label="Anterior"><gr-icon name="chevron-left" [size]="14" /></button>
            <span class="px-1">{{ pagina() }} / {{ paginas() }}</span>
            <button type="button" class="flex size-9 items-center justify-center rounded-sm border border-line-strong disabled:opacity-40" [disabled]="pagina() >= paginas()" (click)="irPagina.emit(pagina() + 1)" aria-label="Siguiente"><gr-icon name="chevron-right" [size]="14" /></button>
          </nav>
        }
      </footer>
    </section>
  `,
})
export class SolicitudesLista {
  readonly items = input.required<SolicitudItem[]>();
  readonly total = input(0);
  readonly desde = input(0);
  readonly hasta = input(0);
  readonly pagina = input(1);
  readonly paginas = input(1);
  readonly nuevas = input<Set<string>>(new Set());
  readonly miniaturas = input<Record<string, string>>({});
  readonly revisar = output<SolicitudItem>();
  readonly irPagina = output<number>();
  /** Row «…» menu: approve / reject / delete open the same confirmation dialogs as the review. */
  readonly accion = output<{ s: SolicitudItem; tipo: 'aprobar' | 'rechazar' | 'borrar' }>();
  protected readonly menu = signal<string | null>(null);
  protected elegir(s: SolicitudItem, tipo: 'aprobar' | 'rechazar' | 'borrar'): void {
    this.menu.set(null);
    this.accion.emit({ s, tipo });
  }

  protected readonly hace = fmtAgo;
  protected readonly match = matchTxt;
  protected readonly matchTone = matchTone;
  protected readonly estado = estadoDe;
  protected readonly nombreCompleto = nombreCompleto;
  protected resaltado(id: string): boolean { return this.nuevas().has(id); }
  protected miniatura(id: string): string | undefined { return this.miniaturas()[id]; }
  protected claseFila(s: { id: string }): string {
    const base = 'cursor-pointer border-b border-line-subtle last:border-0';
    return this.resaltado(s.id) ? `${base} bg-success/10` : `${base} hover:bg-bg-raised/60`;
  }
}
