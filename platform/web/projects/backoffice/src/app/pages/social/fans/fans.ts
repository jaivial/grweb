import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrToasts } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, Confirm, errText } from '../../../shared/ui';
import { SoIcon, SoSegmented, SoSkelFilas, descargarCsv, diaCorto, iniciales, num, type SoOpcion } from '../ui';
import { FansApi, type Fan, type ListaFans } from './api';

type Tipo = 'atleta' | 'publico';

/** «Fans» (Figma 73 · «BO · Fans», UI v2): cuentas de directo, búsqueda, filtros y baneos (tabla en escritorio, tarjetas en móvil). */
@Component({
  selector: 'bo-fans',
  imports: [A11yModule, FormsModule, BoPageHeader, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, SoIcon, SoSegmented, SoSkelFilas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'banear.set(null)' },
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Fans" [badge]="num(lista()?.total ?? 0) + ' cuentas'" [badgeTone]="'accent'"
        subtitle="Cuentas de directo con enlace mágico · cookie grcup_fan · alias 3–20 caracteres, único por competición (§3)"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Fans']">
        <ng-container actions>
          <button grButton icon="download" [disabled]="!lista()" (click)="exportar()">Exportar</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar los fans">Hace falta el permiso «directo.operar».</gr-alert>
      }

      <div class="flex flex-wrap items-center gap-3">
        <label class="relative min-w-0 flex-1 basis-64 md:max-w-xs">
          <span class="sr-only">Buscar</span>
          <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
          <input grInput class="pl-9" placeholder="Buscar por alias o email…" [ngModel]="filtro().q" (ngModelChange)="buscar($event)" />
        </label>
        <so-segmented label="Estado" [opciones]="estados()" [value]="filtro().estado" (valueChange)="filtrar({ estado: $event })" />
        <so-segmented label="Tipo" [opciones]="tipos" [value]="tipo()" (valueChange)="tipo.set($any($event))" />
      </div>

      <section class="min-w-0 overflow-hidden rounded-lg border border-line-subtle bg-bg-card" aria-label="Cuentas">
        @if (cargando() && !lista()) {
          <so-skel-filas [n]="7" />
        } @else if (error()) {
          <gr-empty icon="wifi-off" title="No hemos podido cargar las cuentas" [text]="error()">
            <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
          </gr-empty>
        } @else if (lista(); as l) {
          @if (!visibles().length) {
            @if (filtro().q || filtro().estado || tipo()) {
              <gr-empty icon="search" title="Ninguna cuenta coincide" text="Prueba con otro alias o email, o quita los filtros de estado y tipo.">
                <button grButton (click)="limpiar()">Quitar filtros</button>
              </gr-empty>
            } @else {
              <gr-empty icon="users" title="Todavía no hay fans" text="Las cuentas aparecen aquí cuando alguien entra al directo con su enlace mágico." />
            }
          } @else {
            <div class="hidden overflow-x-auto md:block">
              <table class="w-full min-w-[780px] text-left text-body-s">
                <thead class="border-b border-line-subtle bg-bg-surface font-mono text-mono-xs text-text-tertiary">
                  <tr><th class="px-5 py-3 font-medium">Alias</th><th class="px-3 py-3 font-medium">Tipo</th><th class="px-3 py-3 font-medium">Email</th><th class="px-3 py-3 font-medium">Estado</th><th class="px-5 py-3 text-right font-medium">Acción</th></tr>
                </thead>
                <tbody>
                  @for (f of visibles(); track f.id) {
                    @let ban = baneado(f);
                    <tr class="border-b border-line-subtle transition-colors last:border-0" [class]="ban ? 'bg-accent-deep/15' : 'hover:bg-bg-raised/40'">
                      <td class="px-5 py-2.5">
                        <div class="flex items-center gap-2.5">
                          <span class="flex size-8 shrink-0 items-center justify-center rounded-pill border bg-bg-raised font-mono text-mono-xs text-text-secondary" [class]="ban ? 'border-accent/60' : 'border-line-strong'">{{ iniciales(f.alias) }}</span>
                          <span class="truncate text-label-s">{{ f.alias }}</span>
                        </div>
                      </td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="f.tipo === 'atleta' ? 'info' : 'neutral'">{{ f.tipo === 'atleta' ? 'Atleta' : 'Público' }}</gr-badge></td>
                      <td class="px-3 py-2.5 font-mono text-mono-s text-text-tertiary">{{ enmascarar(f.email) }}</td>
                      <td class="px-3 py-2.5">
                        @if (ban) {
                          <gr-badge tone="danger">Baneado hasta {{ diaCorto(f.baneadoHasta) }}</gr-badge>
                          @if (f.baneadoMotivo) { <p class="mt-1 max-w-[260px] truncate text-body-xs text-text-tertiary">{{ f.baneadoMotivo }}</p> }
                        } @else {
                          <gr-badge tone="success">Activo</gr-badge>
                        }
                      </td>
                      <td class="px-5 py-2.5 text-right">
                        @if (ban) {
                          <button grButton size="s" icon="undo" [disabled]="!puede()" [attr.aria-label]="'Levantar el baneo de ' + f.alias" (click)="desbanear(f)">Levantar baneo</button>
                        } @else {
                          <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-label-s text-text-secondary transition-colors hover:bg-bg-raised hover:text-accent-text disabled:opacity-40"
                            [disabled]="!puede()" [attr.aria-label]="'Banear a ' + f.alias" (click)="abrirBanear(f)"><so-icon name="ban" [size]="16" />Banear</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <ul class="divide-y divide-line-subtle md:hidden">
              @for (f of visibles(); track f.id) {
                @let ban = baneado(f);
                <li class="flex items-center gap-3 p-4" [class.bg-accent-deep/15]="ban">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-bg-raised font-mono text-mono-xs text-text-secondary">{{ iniciales(f.alias) }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="flex items-center gap-2"><span class="truncate text-label-s">{{ f.alias }}</span><gr-badge [tone]="f.tipo === 'atleta' ? 'info' : 'neutral'">{{ f.tipo === 'atleta' ? 'Atleta' : 'Público' }}</gr-badge></p>
                    <p class="truncate font-mono text-mono-s text-text-tertiary">{{ enmascarar(f.email) }}</p>
                    @if (ban) { <p class="mt-1 text-body-xs text-accent-text">Baneado hasta {{ diaCorto(f.baneadoHasta) }}</p> }
                  </div>
                  @if (ban) {
                    <button grIconButton icon="undo" class="border border-line-strong" [label]="'Levantar el baneo de ' + f.alias" [disabled]="!puede()" (click)="desbanear(f)"></button>
                  } @else {
                    <button type="button" class="inline-flex size-11 items-center justify-center rounded-sm border border-line-subtle text-text-secondary hover:text-accent-text disabled:opacity-40"
                      [attr.aria-label]="'Banear a ' + f.alias" [disabled]="!puede()" (click)="abrirBanear(f)"><so-icon name="ban" [size]="20" /></button>
                  }
                </li>
              }
            </ul>
          }
          <footer class="flex items-center justify-between gap-3 border-t border-line-subtle px-5 py-3 text-body-xs text-text-tertiary">
            <span>Mostrando {{ visibles().length ? (l.pagina - 1) * l.por + 1 : 0 }}–{{ (l.pagina - 1) * l.por + visibles().length }} de {{ num(l.total) }} cuentas</span>
            <span class="flex items-center gap-1">
              <button grIconButton icon="chevron-left" label="Página anterior" [disabled]="l.pagina <= 1" (click)="filtrar({ pagina: l.pagina - 1 }, false)"></button>
              <span class="min-w-12 text-center font-mono text-mono-s text-text-secondary">{{ l.pagina }} / {{ paginas(l) }}</span>
              <button grIconButton icon="chevron-right" label="Página siguiente" [disabled]="l.pagina * l.por >= l.total" (click)="filtrar({ pagina: l.pagina + 1 }, false)"></button>
            </span>
          </footer>
        }
      </section>
    </div>

    <!-- ===== Baneo ===== -->
    @if (banear(); as f) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4" (click)="banear.set(null)">
        <form class="w-full max-w-md rounded-t-xl border border-line-strong bg-bg-card shadow-card sm:rounded-lg" role="alertdialog" aria-modal="true" aria-labelledby="ban-titulo"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()" (ngSubmit)="confirmarBaneo()">
          <header class="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-deep/50 text-accent-text"><so-icon name="ban" [size]="20" /></span>
            <div class="min-w-0 flex-1">
              <h2 id="ban-titulo" class="text-ui-h5">Banear a {{ f.alias }}</h2>
              <p class="truncate font-mono text-mono-s text-text-tertiary">{{ enmascarar(f.email) }}</p>
            </div>
            <button type="button" grIconButton icon="x" label="Cerrar" (click)="banear.set(null)"></button>
          </header>
          <div class="flex flex-col gap-4 px-5 py-5">
            <p class="text-body-s text-text-secondary">Se cierra su sesión de directo, no puede volver a entrar hasta el fin del baneo y el chat borra sus últimos mensajes.</p>
            <gr-field label="Duración del baneo">
              <gr-select name="horas" [ngModel]="horas()" (ngModelChange)="horas.set(+$event)" aria-label="Duración del baneo">
                <option [value]="1">1 hora</option>
                <option [value]="24">24 horas</option>
                <option [value]="168">7 días</option>
                <option [value]="720">30 días</option>
              </gr-select>
            </gr-field>
            <gr-field label="Motivo" [optional]="true" hint="Queda en el registro y se ve en esta lista">
              <input grInput name="motivo" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" maxlength="300" placeholder="Spam en el chat" />
            </gr-field>
          </div>
          <footer class="flex justify-end gap-2 border-t border-line-subtle px-5 py-4">
            <button type="button" grButton variant="ghost" (click)="banear.set(null)">Cancelar</button>
            <button type="submit" grButton variant="danger" [loading]="ocupado()">Banear</button>
          </footer>
        </form>
      </div>
    }
  `,
})
export class FansPage {
  private readonly api = inject(FansApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);

  protected readonly lista = signal<ListaFans | null>(null);
  protected readonly filtro = signal<{ estado: string; q: string; pagina: number }>({ estado: '', q: '', pagina: 1 });
  protected readonly tipo = signal<Tipo | ''>('');
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly error = signal('');
  protected readonly banear = signal<Fan | null>(null);
  protected readonly motivo = signal('');
  protected readonly horas = signal(24);

  protected readonly num = num;
  protected readonly diaCorto = diaCorto;
  protected readonly iniciales = iniciales;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly visibles = computed(() => {
    const l = this.lista();
    if (!l) return [];
    const t = this.tipo();
    return t ? l.items.filter((f) => f.tipo === t) : l.items;
  });
  protected readonly estados = computed<SoOpcion[]>(() => [
    { v: '', l: 'Todos' },
    { v: 'activos', l: 'Activos' },
    { v: 'baneados', l: 'Baneados', n: this.baneados(), tone: 'accent' },
  ]);
  protected readonly tipos: SoOpcion[] = [
    { v: '', l: 'Atletas y público', c: 'Todos' },
    { v: 'atleta', l: 'Atletas' },
    { v: 'publico', l: 'Público' },
  ];
  protected readonly baneados = computed(() => this.lista()?.items.filter((f) => this.baneado(f)).length ?? 0);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      this.lista.set(await this.api.lista(cid, this.filtro()));
    } catch (e) {
      this.error.set(errText(e, 'No se pudieron cargar las cuentas.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected filtrar(p: Partial<{ estado: string; q: string; pagina: number }>, reset = true): void {
    this.filtro.update((f) => ({ ...f, ...(reset ? { pagina: 1 } : {}), ...p }));
    void this.cargar();
  }

  /** Búsqueda con retardo: no se lanza una petición por cada tecla. */
  protected buscar(q: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.filtrar({ q }), 300);
  }

  protected paginas(l: ListaFans): number {
    return Math.max(1, Math.ceil(l.total / (l.por || 1)));
  }

  protected limpiar(): void {
    this.tipo.set('');
    this.filtrar({ q: '', estado: '' });
  }

  protected alternarTipo(t: Tipo): void {
    this.tipo.set(this.tipo() === t ? '' : t);
  }

  protected baneado(f: Fan): boolean {
    return !!f.baneadoHasta && new Date(f.baneadoHasta).getTime() > Date.now();
  }

  /** «f****@gmail.com»: el email no se enseña entero en la lista. */
  protected enmascarar(email: string): string {
    const [nombre, dominio] = email.split('@');
    if (!dominio) return email;
    return `${nombre.slice(0, 1)}****@${dominio}`;
  }

  protected abrirBanear(f: Fan): void {
    this.motivo.set('');
    this.horas.set(24);
    this.banear.set(f);
  }

  protected async confirmarBaneo(): Promise<void> {
    const cid = this.cid();
    const f = this.banear();
    if (!cid || !f) return;
    this.ocupado.set(true);
    try {
      const hasta = new Date(Date.now() + this.horas() * 3_600_000).toISOString();
      await this.api.banear(cid, f.id, hasta, this.motivo().trim());
      this.banear.set(null);
      this.toasts.success(`${f.alias} baneado`);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo banear.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async desbanear(f: Fan): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const ok = await this.confirm.ask({
      title: '¿Desbanear a ' + f.alias + '?',
      text: 'Volverá a poder pedir su enlace mágico y entrar en la sala.',
      confirm: 'Desbanear',
    });
    if (!ok) return;
    this.ocupado.set(true);
    try {
      await this.api.desbanear(cid, f.id);
      this.toasts.success(`${f.alias} puede volver a entrar`);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo desbanear.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected exportar(): void {
    const l = this.lista();
    if (!l) return;
    descargarCsv('fans.csv', ['Alias', 'Tipo', 'Email', 'Estado', 'Baneo hasta', 'Motivo'], this.visibles().map((f) => [f.alias, f.tipo, f.email, this.baneado(f) ? 'baneado' : 'activo', f.baneadoHasta ?? '', f.baneadoMotivo ?? '']));
  }
}
