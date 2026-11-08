import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, Confirm, errText } from '../../../shared/ui';
import { descargarCsv, diaCorto, iniciales, num } from '../ui';
import { FansApi, type Fan, type ListaFans } from './api';

type Tipo = 'atleta' | 'publico';

/** «Fans» (Figma 73 · «BO · Fans»): cuentas de directo, búsqueda, filtros y baneos. */
@Component({
  selector: 'bo-fans',
  imports: [FormsModule, BoPageHeader, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
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

      <div class="flex flex-wrap items-center gap-2">
        <label class="relative min-w-0 flex-1 basis-64 md:max-w-xs">
          <span class="sr-only">Buscar</span>
          <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
          <input grInput class="pl-9" placeholder="Buscar por alias o email…" [ngModel]="filtro().q" (ngModelChange)="buscar($event)" />
        </label>
        <gr-select tipo="filtro" etiqueta="Estado" [ngModel]="filtro().estado" (ngModelChange)="filtrar({ estado: $event })">
          <option value="">Todos</option>
          <option value="activos">Activos</option>
          <option value="baneados">Baneados</option>
        </gr-select>
        <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-sm border px-3 text-label-s md:h-10"
          [class]="tipo() === 'atleta' ? 'border-accent bg-accent/10 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted hover:text-text-primary'"
          (click)="alternarTipo('atleta')"><gr-icon name="plus" [size]="16" />Atletas</button>
        <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-sm border px-3 text-label-s md:h-10"
          [class]="tipo() === 'publico' ? 'border-accent bg-accent/10 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted hover:text-text-primary'"
          (click)="alternarTipo('publico')"><gr-icon name="plus" [size]="16" />Público</button>
        <span class="inline-flex h-7 items-center gap-1.5 rounded-pill border border-accent/50 bg-accent/10 px-2.5 text-label-xs text-accent-text">
          <gr-icon name="circle-alert" [size]="12" />Baneados {{ baneados() }}
        </span>
      </div>

      @if (cargando() && !lista()) {
        <gr-skeleton class="h-72 rounded-lg" />
      } @else if (error()) {
        <gr-empty icon="wifi-off" title="No hemos podido cargar las cuentas" [text]="error()">
          <button grButton (click)="cargar()">Reintentar</button>
        </gr-empty>
      } @else if (lista(); as l) {
        <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
          <table class="w-full min-w-[760px] text-left text-body-s">
            <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
              <tr><th class="px-4 py-3">Alias</th><th class="px-3 py-3">Tipo</th><th class="px-3 py-3">Email</th><th class="px-3 py-3">Estado</th><th class="px-4 py-3 text-right">Acciones</th></tr>
            </thead>
            <tbody>
              @for (f of visibles(); track f.id) {
                <tr class="border-b border-line-subtle last:border-0">
                  <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2.5">
                      <span class="flex size-8 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-bg-raised text-mono-xs">{{ iniciales(f.alias) }}</span>
                      <span class="truncate text-label-s">{{ f.alias }}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2.5">
                    @if (f.tipo === 'atleta') { <span class="text-info">Atleta</span> } @else { <span class="text-text-tertiary">Público</span> }
                  </td>
                  <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ enmascarar(f.email) }}</td>
                  <td class="px-3 py-2.5">
                    @if (baneado(f)) {
                      <gr-badge tone="danger">Baneado hasta {{ diaCorto(f.baneadoHasta) }}</gr-badge>
                    } @else {
                      <gr-badge tone="success">Activo</gr-badge>
                    }
                  </td>
                  <td class="px-4 py-2.5 text-right">
                    @if (baneado(f)) {
                      <button grIconButton icon="undo" [label]="'Desbanear a ' + f.alias" [disabled]="!puede()" (click)="desbanear(f)"></button>
                    } @else {
                      <button grIconButton icon="circle-x" [label]="'Banear a ' + f.alias" [disabled]="!puede()" (click)="abrirBanear(f)"></button>
                    }
                  </td>
                </tr>
              } @empty { <tr><td colspan="5" class="px-4 py-10 text-center text-text-tertiary">No hay cuentas con estos filtros.</td></tr> }
            </tbody>
          </table>
        </section>
        <p class="flex items-center justify-between text-body-xs text-text-tertiary">
          <span>Mostrando {{ visibles().length ? (l.pagina - 1) * l.por + 1 : 0 }}–{{ (l.pagina - 1) * l.por + visibles().length }} de {{ num(l.total) }} cuentas</span>
          <span class="flex gap-1">
            <button grButton size="s" variant="ghost" icon="chevron-left" [disabled]="l.pagina <= 1" (click)="filtrar({ pagina: l.pagina - 1 }, false)" aria-label="Anterior"></button>
            <button grButton size="s" variant="ghost" icon="chevron-right" [disabled]="l.pagina * l.por >= l.total" (click)="filtrar({ pagina: l.pagina + 1 }, false)" aria-label="Siguiente"></button>
          </span>
        </p>
      }
    </div>

    <!-- ===== Baneo ===== -->
    @if (banear(); as f) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="banear.set(null)" (keydown.escape)="banear.set(null)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="alertdialog" aria-modal="true" [attr.aria-label]="'Banear a ' + f.alias"
          (click)="$event.stopPropagation()" (ngSubmit)="confirmarBaneo()">
          <h2 class="text-ui-h5">Banear a {{ f.alias }}</h2>
          <p class="mt-3 text-body-s text-text-secondary">Se cierra su sesión de directo, no puede volver a entrar hasta el fin del baneo y el chat borra sus últimos mensajes.</p>
          <gr-field class="mt-4" label="Duración del baneo">
            <gr-select name="horas" [ngModel]="horas()" (ngModelChange)="horas.set(+$event)" aria-label="Duración del baneo">
              <option [value]="1">1 hora</option>
              <option [value]="24">24 horas</option>
              <option [value]="168">7 días</option>
              <option [value]="720">30 días</option>
            </gr-select>
          </gr-field>
          <gr-field class="mt-4" label="Motivo" [optional]="true">
            <input grInput name="motivo" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)" maxlength="300" placeholder="Spam en el chat" />
          </gr-field>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="banear.set(null)">Cancelar</button>
            <button type="submit" grButton variant="danger" [loading]="ocupado()">Banear</button>
          </div>
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
