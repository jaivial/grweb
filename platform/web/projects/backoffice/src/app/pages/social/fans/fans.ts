import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrToasts } from '@grcup/ui';
import { BoSheet } from '../../../shared/kit';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, Confirm, errText } from '../../../shared/ui';
import { SoIcon, SoSegmented, SoSkelFilas, descargarCsv, diaCorto, iniciales, num, type SoOpcion } from '../ui';
import { FansApi, type CuentaFan, type Fan, type ListaFans } from './api';

type Tipo = 'atleta' | 'publico';

/**
 * «Fans» (Figma 73 · «BO · Fans», UI v2; «BO · Fans · Editar cuenta (sheet)» y «BO · Fans · Móvil»): cuentas de directo,
 * búsqueda, filtros, baneos y la gestión completa de cada cuenta (crear, editar con contraseña, borrar y enviar el enlace
 * para cambiar la contraseña) en el sheet lateral (bottom sheet en móvil).
 */
@Component({
  selector: 'bo-fans',
  imports: [RouterLink, A11yModule, FormsModule, BoPageHeader, BoSheet, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, SoIcon, SoSegmented, SoSkelFilas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'banear.set(null)' },
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Fans" [badge]="num(lista()?.total ?? 0) + ' cuentas'" [badgeTone]="'accent'"
        subtitle="Cuentas de directo con enlace mágico · cookie grcup_fan · alias 3–20 caracteres, único por competición (§3)"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Fans']">
        <ng-container actions>
          <button grButton icon="download" [disabled]="!lista()" (click)="exportar()">Exportar</button>
          <button grButton variant="primary" icon="plus" [disabled]="!puede()" (click)="abrirNuevo()">Nuevo fan</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar los fans">Hace falta el permiso «directo.operar». Las cuentas de directo tienen datos personales: sin el permiso no se muestran y los botones de banear quedan desactivados.
          <a alertAction [routerLink]="['/', comps.current()?.slug, 'equipo']" class="mt-2 inline-flex items-center gap-1 text-label-s hover:underline">Pedir acceso a un admin <gr-icon name="arrow-right" [size]="14" /></a>
        </gr-alert>
      }

      <div class="flex flex-wrap items-center gap-3">
        <label class="relative min-w-0 flex-1 basis-64 md:max-w-xs">
          <span class="sr-only">Buscar</span>
          <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
          <input grInput class="pl-9" placeholder="Buscar por alias o email…" [ngModel]="filtro().q" (ngModelChange)="buscar($event)" />
        </label>
        <!-- las pestañas miden lo que su texto: si no caben, se desplazan en horizontal (nunca se recortan) -->
        <so-segmented class="shrink-0" label="Estado" [opciones]="estados()" [value]="filtro().estado" (valueChange)="filtrar({ estado: $event })" />
        <so-segmented class="shrink-0" label="Tipo" [opciones]="tipos" [value]="tipo()" (valueChange)="tipo.set($any($event))" />
      </div>

      <section class="min-w-0 overflow-hidden rounded-lg border border-line-subtle bg-bg-card" aria-label="Cuentas">
        @if (cargando() && !lista()) {
          <so-skel-filas [n]="7" />
        } @else if (!puede()) {
          <gr-empty icon="lock" title="Sin acceso a las cuentas de directo" text="Pide el permiso a un admin del equipo para verlos." />
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
              <table class="w-full table-fixed text-left text-body-s">
                <colgroup><col /><col class="w-[96px]" /><col /><col class="w-[200px]" /><col class="w-[232px]" /></colgroup>
                <thead class="border-b border-line-subtle bg-bg-surface font-mono text-mono-xs text-text-tertiary">
                  <tr><th class="px-5 py-3 font-medium">Alias</th><th class="px-3 py-3 font-medium">Tipo</th><th class="px-3 py-3 font-medium">Email</th><th class="px-3 py-3 font-medium">Estado</th><th class="px-5 py-3 text-right font-medium">Acción</th></tr>
                </thead>
                <tbody>
                  @for (f of visibles(); track f.id) {
                    @let ban = baneado(f);
                    <tr class="border-b border-line-subtle transition-colors last:border-0" [class]="ban ? 'bg-accent-deep/15' : 'hover:bg-bg-raised/40'">
                      <td class="px-5 py-2.5">
                        <div class="flex min-w-0 items-center gap-2.5">
                          <span class="flex size-8 shrink-0 items-center justify-center rounded-pill border bg-bg-raised font-mono text-mono-xs text-text-secondary" [class]="ban ? 'border-accent/60' : 'border-line-strong'">{{ iniciales(f.alias) }}</span>
                          <button type="button" class="truncate text-left text-label-s hover:underline disabled:no-underline" [title]="f.alias" [disabled]="!puede()" (click)="abrirEditar(f)">{{ f.alias }}</button>
                        </div>
                      </td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="f.tipo === 'atleta' ? 'info' : 'neutral'">{{ f.tipo === 'atleta' ? 'Atleta' : 'Público' }}</gr-badge></td>
                      <td class="truncate px-3 py-2.5 font-mono text-mono-s text-text-tertiary">{{ enmascarar(f.email) }}</td>
                      <td class="px-3 py-2.5">
                        @if (ban) {
                          <gr-badge tone="danger">Baneado hasta {{ diaCorto(f.baneadoHasta) }}</gr-badge>
                          @if (f.baneadoMotivo) { <p class="mt-1 truncate text-body-xs text-text-tertiary">{{ f.baneadoMotivo }}</p> }
                        } @else {
                          <gr-badge tone="success">Activo</gr-badge>
                        }
                      </td>
                      <td class="px-5 py-2.5 text-right">
                        <span class="inline-flex items-center justify-end gap-1">
                        <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-label-s text-text-secondary transition-colors hover:bg-bg-raised hover:text-text-primary disabled:opacity-40"
                          [disabled]="!puede()" [attr.aria-label]="'Editar a ' + f.alias" (click)="abrirEditar(f)"><gr-icon name="pencil" [size]="16" />Editar</button>
                        @if (ban) {
                          <button grButton size="s" icon="undo" [disabled]="!puede()" [attr.aria-label]="'Levantar el baneo de ' + f.alias" (click)="desbanear(f)">Levantar baneo</button>
                        } @else {
                          <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-label-s text-text-secondary transition-colors hover:bg-bg-raised hover:text-accent-text disabled:opacity-40"
                            [disabled]="!puede()" [attr.aria-label]="'Banear a ' + f.alias" (click)="abrirBanear(f)"><so-icon name="ban" [size]="16" />Banear</button>
                        }
                        </span>
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
                  <button grIconButton icon="pencil" class="border border-line-strong" [label]="'Editar a ' + f.alias" [disabled]="!puede()" (click)="abrirEditar(f)"></button>
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

    <!-- ===== Crear / editar cuenta (sheet lateral; bottom sheet en móvil) ===== -->
    <bo-sheet [title]="editando() ? 'Editar a ' + editando()!.alias : 'Nuevo fan'" [open]="sheet()" (openChange)="sheet.set($event)">
      <form class="flex flex-col gap-4" (ngSubmit)="guardar()" autocomplete="off">
        @if (editando(); as f) {
          <p class="-mt-2 flex flex-wrap items-center gap-2 text-body-xs text-text-tertiary">
            <gr-badge [tone]="baneado(f) ? 'danger' : 'success'">{{ baneado(f) ? 'Baneado' : 'Activo' }}</gr-badge>
            Cuenta de {{ f.tipo === 'atleta' ? 'atleta' : 'público' }} · creada el {{ diaCorto(f.createdAt) }} · {{ f.contrasena ? 'con contraseña' : 'sin contraseña' }}
          </p>
        }
        <gr-field label="Alias" for="fan-alias" hint="3–20 letras, números, espacios o _ . - · único en la competición">
          <input grInput id="fan-alias" name="alias" [(ngModel)]="form.alias" minlength="3" maxlength="20" required />
        </gr-field>
        <gr-field label="Tipo" for="fan-tipo" hint="Atleta solo si el email es el de una inscripción (si lo es, la cuenta será de atleta)">
          <gr-select id="fan-tipo" name="tipo" [(ngModel)]="form.tipo">
            <option value="publico">Público</option>
            <option value="atleta">Atleta</option>
          </gr-select>
        </gr-field>
        <gr-field label="Email" for="fan-email" hint="Con este email entra al directo">
          <input grInput id="fan-email" name="email" type="email" [(ngModel)]="form.email" maxlength="254" required />
        </gr-field>
        <gr-field label="Teléfono" for="fan-tel" [optional]="true" hint="Con prefijo, p. ej. +34 600 123 456 · avisos por WhatsApp">
          <input grInput id="fan-tel" name="telefono" type="tel" [(ngModel)]="form.telefono" maxlength="30" />
        </gr-field>
        <gr-field [label]="editando() ? 'Nueva contraseña' : 'Contraseña'" for="fan-pass" [optional]="true"
          [error]="form.password && form.password.length < 10 ? 'Mínimo 10 caracteres.' : null"
          [hint]="editando() ? 'Mínimo 10 caracteres · vacío = no se cambia · cierra sus sesiones' : 'Mínimo 10 caracteres · vacía = la crea él con «¿Has olvidado tu contraseña?»'">
          <input grInput id="fan-pass" name="password" type="password" autocomplete="new-password" [(ngModel)]="form.password" maxlength="128" />
        </gr-field>
        @if (editando(); as f) {
          <div class="flex flex-col items-start gap-2.5 border-t border-line-subtle pt-4">
            <p class="text-label-s text-text-primary">Acceso y cuenta</p>
            <button type="button" grButton icon="mail" [loading]="enviandoReset()" (click)="enviarReset(f)">Enviar enlace para cambiar la contraseña</button>
            <button type="button" grButton variant="danger" icon="trash" (click)="borrar(f)">Borrar cuenta</button>
          </div>
        }
        <div class="mt-2 flex justify-end gap-2 border-t border-line-subtle pt-4">
          <button type="button" grButton variant="ghost" (click)="sheet.set(false)">Cancelar</button>
          <button type="submit" grButton variant="primary" [loading]="guardando()" [disabled]="!formValido()">{{ editando() ? 'Guardar cambios' : 'Crear cuenta' }}</button>
        </div>
      </form>
    </bo-sheet>

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
            <gr-field label="Motivo" [optional]="true" hint="Elige uno o escríbelo · queda en el registro y se ve en esta lista">
              <div class="mb-2 flex flex-wrap gap-2" role="group" aria-label="Motivos habituales">
                @for (m of motivos; track m) {
                  <button type="button" class="inline-flex h-11 items-center rounded-sm border px-3 text-label-s transition-colors md:h-9" [attr.aria-pressed]="motivo() === m"
                    [class]="motivo() === m ? 'border-accent bg-accent/10 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted hover:text-text-primary'"
                    (click)="motivo.set(motivo() === m ? '' : m)">{{ m }}</button>
                }
              </div>
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
  protected readonly motivos = ['Spam en el chat', 'Insultos o acoso', 'Suplantación', 'Contenido inapropiado'];
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
    { v: '', l: 'Atletas y público' },
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
    if (!this.puede()) {
      // read-only without the permission: personal data is not requested (the API would answer 403)
      this.cargando.set(false);
      return;
    }
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

  // ---- crear / editar ----
  protected readonly sheet = signal(false);
  protected readonly editando = signal<Fan | null>(null);
  protected readonly guardando = signal(false);
  protected readonly enviandoReset = signal(false);
  protected form: Required<CuentaFan> = { email: '', alias: '', tipo: 'publico', telefono: '', password: '' };

  protected formValido(): boolean {
    const f = this.form;
    return f.alias.trim().length >= 3 && f.email.includes('@') && (!f.password || f.password.length >= 10);
  }

  protected abrirNuevo(): void {
    this.editando.set(null);
    this.form = { email: '', alias: '', tipo: 'publico', telefono: '', password: '' };
    this.sheet.set(true);
  }

  protected abrirEditar(f: Fan): void {
    this.editando.set(f);
    this.form = { email: f.email, alias: f.alias, tipo: f.tipo, telefono: f.telefono ?? '', password: '' };
    this.sheet.set(true);
  }

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    if (!cid || !this.formValido()) return;
    const f = this.form;
    const body: CuentaFan = { email: f.email.trim(), alias: f.alias.trim(), tipo: f.tipo, telefono: f.telefono.trim() };
    if (f.password) body.password = f.password;
    const ed = this.editando();
    this.guardando.set(true);
    try {
      const r = ed ? await this.api.editar(cid, ed.id, body) : await this.api.crear(cid, body);
      this.sheet.set(false);
      this.toasts.success(ed ? `${r.alias} guardado` : `Cuenta ${r.alias} creada`, r.tipo === 'atleta' && f.tipo === 'publico' ? 'El email es de un atleta inscrito: la cuenta es de atleta.' : undefined);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar la cuenta.'));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async enviarReset(f: Fan): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.enviandoReset.set(true);
    try {
      await this.api.resetContrasena(cid, f.id);
      this.toasts.success('Enlace enviado', `${f.alias} recibe un email para cambiar su contraseña (caduca en 30 minutos).`);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo enviar el enlace.'));
    } finally {
      this.enviandoReset.set(false);
    }
  }

  protected async borrar(f: Fan): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const ok = await this.confirm.ask({
      title: '¿Borrar la cuenta de ' + f.alias + '?',
      text: 'Se cierran sus sesiones y se borra la cuenta del directo. Sus mensajes del chat y sus jugadas no se recuperan con otra cuenta.',
      confirm: 'Borrar cuenta',
      danger: true,
      word: 'BORRAR',
    });
    if (!ok) return;
    try {
      await this.api.borrar(cid, f.id);
      this.sheet.set(false);
      this.toasts.success(`Cuenta ${f.alias} borrada`);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo borrar la cuenta.'));
    }
  }

  protected exportar(): void {
    const l = this.lista();
    if (!l) return;
    descargarCsv('fans.csv', ['Alias', 'Tipo', 'Email', 'Estado', 'Baneo hasta', 'Motivo'], this.visibles().map((f) => [f.alias, f.tipo, f.email, this.baneado(f) ? 'baneado' : 'activo', f.baneadoHasta ?? '', f.baneadoMotivo ?? '']));
  }
}
