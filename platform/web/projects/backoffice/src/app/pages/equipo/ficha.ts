import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  GrButton,
  GrEmpty,
  GrIcon,
  GrSelect,
  GrSkeleton,
  GrToasts,
  type GrIconName,
} from '@grcup/ui';
import { problemOf } from '../../core/api';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { DosFactoresUi } from '../../shared/dos-factores';
import { BoPageHeader, Confirm, errText } from '../../shared/ui';
import {
  dispositivo,
  ipCorta,
  rel,
  tonoRol,
  type Entrada,
  type Miembro,
  type Rol,
  type RolesResp,
  type Sesion,
} from './comun';

interface RolEnComp {
  cid: string;
  nombre: string;
  roles: Rol[];
  rol: string;
}

const th =
  'px-4 py-3 text-left text-[12px] leading-4 font-medium tracking-[0.04em] uppercase text-text-tertiary';

/** «Equipo · ficha» (Figma 63): role in each competition, open sessions by device (close remotely) and recent activity. */
@Component({
  selector: 'bo-equipo-ficha',
  imports: [FormsModule, BoPageHeader, GrButton, GrEmpty, GrIcon, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      @if (error()) {
        <bo-page-header title="Ficha de miembro" [crumbs]="crumbs('')" />
        <gr-empty icon="circle-alert" title="No se pudo abrir la ficha" [text]="error()"
          ><button grButton icon="arrow-left" (click)="volver()">Volver al equipo</button></gr-empty
        >
      } @else if (!m()) {
        <div class="flex flex-col gap-3">
          <gr-skeleton class="h-3 w-64" /><gr-skeleton class="h-8 w-56" /><gr-skeleton
            class="h-4 w-80"
          />
        </div>
        <div class="grid gap-6 lg:grid-cols-[1fr_420px]">
          <gr-skeleton class="h-56 rounded-lg" /><gr-skeleton class="h-56 rounded-lg" />
        </div>
      } @else {
        @let mm = m()!;
        <bo-page-header
          [title]="mm.nombre || mm.email"
          [badge]="mm.rolNombre"
          badgeTone="neutral"
          [subtitle]="sub()"
          [crumbs]="crumbs(mm.nombre || mm.email)"
        >
          <ng-container actions>
            @if (mm.usuarioId === yo()) {
              <button grButton icon="shield" (click)="dosFactores.open.set(true)">
                Verificación en dos pasos
              </button>
            } @else {
              <button grButton variant="ghost" (click)="quitar(mm)">Quitar del equipo</button>
              <button
                grButton
                [variant]="mm.estado === 'suspendido' ? 'primary' : 'danger'"
                (click)="suspender(mm)"
              >
                {{ mm.estado === 'suspendido' ? 'Reactivar' : 'Suspender' }}
              </button>
            }
          </ng-container>
        </bo-page-header>

        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div class="flex min-w-0 flex-col gap-6">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-[26px] font-semibold">Roles por competición</h2>
              <div class="mt-2 flex flex-col">
                @for (c of porComp(); track c.cid) {
                  <div class="flex flex-col gap-2 py-3 sm:flex-row sm:items-end sm:justify-between">
                    <p class="text-label-m sm:pb-3">{{ c.nombre }}</p>
                    <label class="flex w-full flex-col gap-2 sm:w-[220px]"
                      ><span class="text-label-s text-text-secondary">Rol</span>
                      <gr-select
                        [ngModel]="c.rol"
                        (ngModelChange)="cambiarRol(c, $event)"
                        [disabled]="cambiando() === c.cid"
                        [attr.aria-label]="'Rol en ' + c.nombre"
                      >
                        <option value="">Sin acceso</option>
                        @for (r of c.roles; track r.slug) {
                          <option [value]="r.slug">{{ r.nombre }}</option>
                        }
                      </gr-select>
                    </label>
                  </div>
                } @empty {
                  <p class="py-3 text-body-s text-text-tertiary">Cargando competiciones…</p>
                }
              </div>
            </section>

            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-[26px] font-semibold">Sesiones activas</h2>
              <p class="mt-1 text-body-xs text-text-tertiary">
                Una por dispositivo · caducan a los 30 días sin uso · ciérrala si se pierde un móvil
                de taquilla
              </p>
              @if (sesiones() === null) {
                <gr-skeleton class="mt-4 h-24 rounded-md" />
              } @else if (!sesiones()!.length) {
                <p
                  class="mt-4 rounded-md border border-line-subtle px-4 py-6 text-center text-body-s text-text-tertiary"
                >
                  Sin sesiones abiertas.
                </p>
              } @else {
                <div class="mt-4 overflow-x-auto rounded-md border border-line-subtle">
                  <table class="w-full min-w-[520px] text-body-s">
                    <thead class="border-b border-line-subtle">
                      <tr>
                        <th class="${th}">Dispositivo</th>
                        <th class="${th}">Lugar</th>
                        <th class="${th}">Último uso</th>
                        <th class="w-32"></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (x of sesiones(); track x.id) {
                        <tr class="h-12 border-b border-line-subtle last:border-0">
                          <td class="px-4 py-2">
                            {{ dispositivo(x.userAgent) }}
                            @if (x.origen === 'cli') {
                              <span class="ml-1 text-body-xs text-text-tertiary">(CLI)</span>
                            }
                          </td>
                          <td class="px-4 py-2 font-mono text-mono-s text-text-secondary">
                            {{ ipCorta(x.ip) }}
                          </td>
                          <td class="px-4 py-2 font-mono text-mono-s text-text-secondary">
                            {{ rel(x.lastUsedAt) }}
                          </td>
                          <td class="px-2 text-right">
                            <button
                              type="button"
                              class="h-11 px-2 text-label-s text-text-primary hover:text-error"
                              (click)="cerrarSesion(mm, x)"
                            >
                              Cerrar sesión
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </section>
          </div>

          @if (verAuditoria()) {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
              <h2 class="text-[20px] leading-[26px] font-semibold">Actividad reciente</h2>
              @if (actividad() === null) {
                <gr-skeleton class="mt-4 h-40 rounded-md" />
              } @else if (!actividad()!.length) {
                <p class="mt-4 text-body-s text-text-tertiary">
                  Aún no ha hecho cambios en {{ comps.current()?.nombreCorto }}.
                </p>
              } @else {
                <ul class="mt-4 flex flex-col gap-5">
                  @for (a of actividad(); track a.id) {
                    <li class="flex gap-3">
                      <span
                        class="flex size-8 shrink-0 items-center justify-center rounded-sm"
                        [class]="icono(a).cls"
                        ><gr-icon [name]="icono(a).i" [size]="16"
                      /></span>
                      <div class="min-w-0 flex-1">
                        <p class="text-label-s first-letter:uppercase">{{ a.resumen || a.tipo }}</p>
                        <p class="truncate text-body-xs text-text-tertiary">
                          {{ a.entidad || a.servicio }}
                        </p>
                      </div>
                      <span class="shrink-0 font-mono text-mono-xs text-text-tertiary uppercase">{{
                        cuando(a.fecha)
                      }}</span>
                    </li>
                  }
                </ul>
                <button
                  type="button"
                  class="mt-5 inline-flex h-11 items-center gap-1 text-label-s text-accent-text hover:underline"
                  (click)="verTodo(mm)"
                >
                  Ver todo en Auditoría <gr-icon name="arrow-right" [size]="14" />
                </button>
              }
            </section>
          }
        </div>
      }
    </div>
  `,
})
export class EquipoFichaPage {
  readonly uid = input.required<string>();
  private readonly http = inject(HttpClient);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  protected readonly dosFactores = inject(DosFactoresUi);
  protected readonly rel = rel;
  protected readonly dispositivo = dispositivo;
  protected readonly ipCorta = ipCorta;
  protected readonly m = signal<Miembro | null>(null);
  protected readonly porComp = signal<RolEnComp[]>([]);
  protected readonly sesiones = signal<Sesion[] | null>(null);
  protected readonly actividad = signal<Entrada[] | null>(null);
  protected readonly error = signal('');
  protected readonly cambiando = signal('');
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly yo = computed(() => this.auth.user()?.id ?? '');
  protected readonly verAuditoria = computed(() => this.auth.can(this.cid(), 'auditoria.ver'));
  protected readonly sub = computed(() => {
    const m = this.m();
    if (!m) return '';
    const desde = new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Europe/Madrid',
    }).format(new Date(m.desde));
    return [
      m.email,
      m.dosFactores ? '2FA activada' : 'sin 2FA',
      m.invitadoPor
        ? `invitada por ${m.invitadoPor} el ${desde}`
        : `en el equipo desde el ${desde}`,
    ].join(' · ');
  });

  constructor() {
    effect(() => {
      if (!this.cid() || !this.uid()) return;
      untracked(() => void this.cargar());
    });
    const live = inject(Realtime).events.subscribe((e) => {
      if (
        e.tipo.startsWith('identity.') &&
        (e.datos?.['usuarioId'] === this.uid() || e.entidad === 'usuario:' + this.uid())
      )
        void this.cargar(true);
    });
    inject(DestroyRef).onDestroy(() => live.unsubscribe());
  }

  protected crumbs(nombre: string): string[] {
    return [
      this.comps.current()?.nombreCorto || '',
      'Equipo y sistema',
      'Equipo y permisos',
      ...(nombre ? [nombre] : []),
    ];
  }

  async cargar(silencioso = false): Promise<void> {
    const cid = this.cid();
    const uid = this.uid();
    try {
      this.m.set(
        await firstValueFrom(this.http.get<Miembro>(`/api/competition/${cid}/users/${uid}`)),
      );
    } catch (e) {
      if (!silencioso)
        this.error.set(
          problemOf(e).status === 404
            ? 'Esta persona no está en el equipo de esta competición.'
            : errText(e, 'Vuelve a intentarlo.'),
        );
      return;
    }
    void this.cargarComps();
    firstValueFrom(
      this.http.get<Sesion[]>(`/api/admin/competiciones/${cid}/equipo/${uid}/sesiones`),
    ).then(
      (s) => this.sesiones.set(s),
      () => this.sesiones.set([]),
    );
    if (this.verAuditoria()) {
      firstValueFrom(
        this.http.get<{ items: Entrada[] }>(`/api/admin/competiciones/${cid}/auditoria`, {
          params: new HttpParams().set('usuario', uid).set('limite', 5),
        }),
      ).then(
        (r) => this.actividad.set(r.items),
        () => this.actividad.set([]),
      );
    }
  }

  /** Its role in every competition I manage («Sin acceso» where it is not a member). */
  private async cargarComps(): Promise<void> {
    const mias = this.comps.list().filter((c) => this.auth.can(c.id, 'equipo.gestionar'));
    const out = await Promise.all(
      mias.map(async (c) => {
        const [roles, m] = await Promise.all([
          firstValueFrom(this.http.get<RolesResp>(`/api/competition/${c.id}/roles`)).then(
            (r) => r.roles,
            () => [] as Rol[],
          ),
          firstValueFrom(
            this.http.get<Miembro>(`/api/competition/${c.id}/users/${this.uid()}`),
          ).catch(() => null),
        ]);
        return { cid: c.id, nombre: c.nombre, roles, rol: m?.rolSlug ?? '' };
      }),
    );
    // the current competition first
    this.porComp.set(
      out.sort((a, b) => Number(b.cid === this.cid()) - Number(a.cid === this.cid())),
    );
  }

  protected async cambiarRol(c: RolEnComp, rol: string): Promise<void> {
    const m = this.m()!;
    const antes = c.rol;
    if (rol === antes) return;
    if (
      !rol &&
      !(await this.confirm.ask({
        title: `¿Quitar el acceso a ${c.nombre}?`,
        text: `${m.nombre || m.email} deja de ver ${c.nombre}. Puedes volver a darle un rol cuando quieras.`,
        confirm: 'Quitar acceso',
        danger: true,
      }))
    ) {
      this.porComp.update((l) => [...l]);
      return;
    }
    this.cambiando.set(c.cid);
    const base = `/api/competition/${c.cid}/users`;
    try {
      if (!rol) await firstValueFrom(this.http.delete(`${base}/${m.usuarioId}`));
      else if (!antes) await firstValueFrom(this.http.post(base, { email: m.email, rolSlug: rol }));
      else await firstValueFrom(this.http.patch(`${base}/${m.usuarioId}`, { rolSlug: rol }));
      const nombre = c.roles.find((r) => r.slug === rol)?.nombre;
      this.toasts.success(rol ? `Rol en ${c.nombre}: ${nombre}` : `Sin acceso a ${c.nombre}`);
      if (c.cid === this.cid() && !rol) return this.volver();
      await this.cargar(true);
    } catch (e) {
      if (problemOf(e).code === 'ULTIMO_ADMIN')
        this.toasts.error(
          `${m.usuarioId === this.yo() ? 'Eres' : (m.nombre || m.email) + ' es'} el último Admin de ${c.nombre}`,
          'Asigna el rol de Admin a otra persona antes (evita competiciones sin responsable).',
        );
      else this.toasts.error('No se pudo cambiar el rol', errText(e));
      this.porComp.update((l) => l.map((x) => (x.cid === c.cid ? { ...x, rol: antes } : x)));
    } finally {
      this.cambiando.set('');
    }
  }

  protected async suspender(m: Miembro): Promise<void> {
    const sus = m.estado !== 'suspendido';
    if (
      sus &&
      !(await this.confirm.ask({
        title: `¿Suspender a ${m.nombre || m.email}?`,
        text: 'Pierde el acceso al momento y se cierran todas sus sesiones. Puedes reactivarlo después.',
        confirm: 'Suspender',
        danger: true,
      }))
    )
      return;
    try {
      this.m.set(
        await firstValueFrom(
          this.http.patch<Miembro>(`/api/competition/${this.cid()}/users/${m.usuarioId}`, {
            estado: sus ? 'suspendido' : 'activo',
          }),
        ),
      );
      this.toasts.success(
        sus ? `${m.nombre || m.email} suspendido` : `${m.nombre || m.email} reactivado`,
        sus ? 'Sus sesiones se han cerrado.' : undefined,
      );
      await this.cargar(true);
    } catch (e) {
      this.toasts.error(
        problemOf(e).code === 'ULTIMO_ADMIN'
          ? 'Es el último Admin de la competición'
          : 'No se pudo cambiar',
        errText(e),
      );
    }
  }

  protected async quitar(m: Miembro): Promise<void> {
    if (
      !(await this.confirm.ask({
        title: `¿Quitar a ${m.nombre || m.email} del equipo?`,
        text: `Deja de tener acceso a ${this.comps.current()?.nombreCorto}. Su cuenta y su historial en auditoría se conservan.`,
        confirm: 'Quitar',
        danger: true,
      }))
    )
      return;
    try {
      await firstValueFrom(this.http.delete(`/api/competition/${this.cid()}/users/${m.usuarioId}`));
      this.toasts.success(`${m.nombre || m.email} ya no está en el equipo`);
      this.volver();
    } catch (e) {
      this.toasts.error(
        problemOf(e).code === 'ULTIMO_ADMIN'
          ? 'Es el último Admin de la competición'
          : 'No se pudo quitar',
        errText(e),
      );
    }
  }

  protected async cerrarSesion(m: Miembro, x: Sesion): Promise<void> {
    if (
      !(await this.confirm.ask({
        title: `¿Cerrar la sesión de ${dispositivo(x.userAgent)}?`,
        text: `${m.nombre || m.email} tendrá que volver a entrar en ese dispositivo.`,
        confirm: 'Cerrar sesión',
        danger: true,
      }))
    )
      return;
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/admin/competiciones/${this.cid()}/equipo/${m.usuarioId}/sesiones/${x.id}`,
        ),
      );
      this.sesiones.update((l) => (l ?? []).filter((s) => s.id !== x.id));
      this.toasts.success('Sesión cerrada', `${dispositivo(x.userAgent)} · al momento`);
    } catch (e) {
      this.toasts.error('No se pudo cerrar', errText(e));
    }
  }

  protected icono(a: Entrada): { i: GrIconName; cls: string } {
    if (/error|duplicado|fallid|rechaz/.test(a.tipo))
      return { i: 'circle-alert', cls: 'bg-error/14 text-error' };
    if (a.tipo.startsWith('checkin') || a.tipo.startsWith('entrada'))
      return { i: 'ticket', cls: 'bg-accent-text/14 text-accent-text' };
    if (a.tipo.startsWith('identity')) return { i: 'shield', cls: 'bg-info/14 text-info' };
    return { i: 'settings', cls: 'bg-text-tertiary/14 text-text-secondary' };
  }
  protected cuando(iso: string): string {
    const d = new Date(iso);
    const hoy = new Date().toDateString() === d.toDateString();
    return new Intl.DateTimeFormat(
      'es-ES',
      hoy
        ? { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }
        : { day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' },
    ).format(d);
  }
  protected verTodo(m: Miembro): void {
    void this.router.navigate(['/', this.comps.current()?.slug, 'auditoria'], {
      queryParams: { usuario: m.usuarioId },
    });
  }
  protected volver(): void {
    void this.router.navigate(['/', this.comps.current()?.slug, 'equipo']);
  }
}
