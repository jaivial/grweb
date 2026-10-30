import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { BoDrawer, BoPageHeader, Confirm, errText } from '../shared/ui';

interface Miembro { usuarioId: string; email: string; nombre: string; rolSlug: string; rolNombre: string; estado: 'activo' | 'suspendido' | 'invitado'; ultimoAcceso?: string; desde: string }
interface Rol { id: string; slug: string; nombre: string; sistema: boolean; bloqueado: boolean; permisos: string[]; miembros: number; version: number }
interface Invitacion { id: string; email: string; rolSlug: string; expiresAt: string; createdAt: string }
interface Sesion { id: string; origen: string; userAgent: string; ip: string; createdAt: string; lastUsedAt: string }
interface Entrada { id: string; tipo: string; servicio: string; entidad: string; actorId?: string; actor: string; origen: string; datos: Record<string, unknown>; diff?: unknown; requestId: string; fecha: string; resumen?: string }

/** The 17 permission keys (Figma 63 · «Roles y permisos»), grouped as in the sidebar. */
const PERMISOS: { g: string; items: { k: string; d: string }[] }[] = [
  { g: 'Evento', items: [{ k: 'evento.editar', d: 'Datos, estado y módulos' }, { k: 'web.editar', d: 'Textos, FAQ, patrocinadores' }, { k: 'web.publicar', d: 'Publicar cambios de la web' }] },
  { g: 'Competición', items: [{ k: 'atletas.editar', d: 'Fichas, importar acta' }, { k: 'horarios.publicar', d: 'Publicar flights' }, { k: 'directo.operar', d: 'Mesa de control' }, { k: 'resultados.publicar', d: 'Publicar resultados' }] },
  { g: 'Público', items: [{ k: 'entradas.gestionar', d: 'Sesiones, reservas, anular' }, { k: 'checkin.escanear', d: 'Escanear en puerta' }, { k: 'sorteo.gestionar', d: 'Precio, boletos, reembolsos' }, { k: 'sorteo.sortear', d: 'Realizar el sorteo' },
    { k: 'contactos.ver', d: 'Ver contactos' }, { k: 'contactos.exportar', d: 'Exportar / RGPD' }, { k: 'campanas.enviar', d: 'Campañas y emails' }] },
  { g: 'Equipo y sistema', items: [{ k: 'equipo.gestionar', d: 'Invitar y asignar roles' }, { k: 'auditoria.ver', d: 'Ver auditoría' }, { k: 'integraciones.config', d: 'Email, Stripe, WhatsApp, CDN' }] },
];
const rel = (iso?: string) => {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'ahora';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '');
};

/** «Equipo y permisos» (Figma page 63): members, the permissions matrix by role, invitations and the member card with active sessions. */
@Component({
  selector: 'bo-equipo',
  imports: [FormsModule, BoPageHeader, BoDrawer, GrBadge, GrButton, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Equipo y permisos" [crumbs]="[comps.current()?.nombreCorto || '', 'Equipo y sistema', 'Equipo y permisos']">
        @if (puede()) { <ng-container actions>
          @if (tab() === 'roles') { <button grButton (click)="duplicar()">Duplicar rol</button><button grButton variant="primary" [disabled]="!rolCambiado()" [loading]="guardando()" (click)="guardarRoles()">Guardar</button> }
          @else { <button grButton variant="primary" icon="user-plus" (click)="invitarOpen.set(true)">Invitar persona</button> }
        </ng-container> }
      </bo-page-header>
      <nav class="flex gap-1 border-b border-line-subtle" aria-label="Equipo">
        @for (t of tabs; track t.v) {
          <button type="button" class="relative flex h-11 items-center gap-2 px-3 text-label-s" [class]="tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="ir(t.v)">{{ t.l }}<span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ cuenta(t.v) }}</span>
            @if (tab() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }</button>
        }
      </nav>
      @if (miembros() === null) { <gr-skeleton class="h-72 rounded-lg" /> }
      @else {
        @switch (tab()) {
          @case ('miembros') {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[720px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Persona</th><th class="px-3 py-3">Rol</th><th class="px-3 py-3">Último acceso</th><th class="px-3 py-3">Estado</th><th class="px-4 py-3"></th></tr></thead>
                <tbody>
                  @for (m of miembros(); track m.usuarioId) {
                    <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" (click)="ficha(m)">
                      <td class="px-4 py-2.5"><div class="flex items-center gap-2.5"><span class="flex size-8 items-center justify-center rounded-pill border border-line-strong bg-bg-raised text-mono-xs">{{ ini(m.nombre || m.email) }}</span><div><p class="text-label-s">{{ m.nombre || '—' }}</p><p class="text-body-xs text-text-tertiary">{{ m.email }}</p></div></div></td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="m.rolSlug === 'admin' || m.rolSlug === 'root' ? 'accent' : 'info'">{{ m.rolNombre }}</gr-badge></td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ rel(m.ultimoAcceso) }}</td>
                      <td class="px-3 py-2.5"><gr-badge [tone]="m.estado === 'activo' ? 'success' : m.estado === 'suspendido' ? 'danger' : 'warning'">{{ m.estado }}</gr-badge></td>
                      <td class="px-4 py-2.5 text-right"><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></td>
                    </tr>
                  } @empty { <tr><td colspan="5" class="px-4 py-10 text-center text-text-tertiary">Aún no hay nadie en el equipo.</td></tr> }
                </tbody>
              </table>
            </section>
          }
          @case ('roles') {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[820px] text-left text-body-s">
                <thead class="sticky top-0 border-b border-line-subtle bg-bg-card text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Permiso</th>@for (r of roles(); track r.slug) { <th class="px-2 py-3 text-center">{{ r.nombre }}<span class="block text-[10px] text-text-muted">{{ r.miembros }} personas</span></th> }</tr></thead>
                <tbody>
                  @for (g of permisos; track g.g) {
                    <tr><td [attr.colspan]="roles().length + 1" class="px-4 pt-4 pb-1 text-mono-xs text-text-muted uppercase">{{ g.g }}</td></tr>
                    @for (p of g.items; track p.k) {
                      <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-2"><p class="font-mono text-mono-s">{{ p.k }}</p><p class="text-body-xs text-text-tertiary">{{ p.d }}</p></td>
                        @for (r of roles(); track r.slug) {
                          <td class="px-2 py-2 text-center">
                            @if (r.bloqueado) { <gr-icon name="lock" [size]="14" class="text-text-muted" [label]="'Todos los permisos (' + r.nombre + ')'" /> }
                            @else { <button type="button" class="inline-flex size-7 items-center justify-center rounded-sm border" [class]="tiene(r, p.k) ? 'border-success/50 bg-success/15 text-success' : 'border-line-subtle text-text-muted'" [disabled]="!puede()" (click)="alternar(r, p.k)" [attr.aria-pressed]="tiene(r, p.k)" [attr.aria-label]="p.k + ' · ' + r.nombre">@if (tiene(r, p.k)) { <gr-icon name="check" [size]="14" /> } @else { – }</button> }
                          </td>
                        }
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </section>
            <p class="text-body-xs text-text-tertiary">Algunos permisos incluyen otros: entradas.gestionar → checkin.escanear · contactos.exportar → contactos.ver · web.publicar → web.editar. Root y Admin tienen todos.</p>
          }
          @case ('invitaciones') {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[640px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Email</th><th class="px-3 py-3">Rol</th><th class="px-3 py-3">Enviada</th><th class="px-3 py-3">Caduca</th><th class="px-4 py-3"></th></tr></thead>
                <tbody>
                  @for (i of invitaciones(); track i.id) {
                    <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-2.5">{{ i.email }}</td><td class="px-3 py-2.5">{{ nombreRol(i.rolSlug) }}</td><td class="px-3 py-2.5 font-mono text-mono-xs">{{ rel(i.createdAt) }}</td>
                      <td class="px-3 py-2.5 font-mono text-mono-xs" [class.text-accent-text]="caducada(i)">{{ caducada(i) ? 'caducada' : rel(i.expiresAt) }}</td>
                      <td class="px-4 py-2.5 text-right">@if (puede()) { <button type="button" class="text-label-s text-accent-text" (click)="revocar(i)">Revocar</button> }</td></tr>
                  } @empty { <tr><td colspan="5" class="px-4 py-10 text-center text-text-tertiary">No hay invitaciones pendientes.</td></tr> }
                </tbody>
              </table>
            </section>
          }
        }
      }
    </div>

    <bo-drawer [(open)]="fichaOpen" [title]="sel()?.nombre || sel()?.email || ''" [badge]="sel()?.rolNombre ?? ''">
      @if (sel(); as m) {
        <div class="flex flex-col gap-5">
          <p class="text-body-s text-text-secondary">{{ m.email }} · en el equipo desde {{ rel(m.desde) }}</p>
          <section><h3 class="text-label-m">Rol en {{ comps.current()?.nombreCorto }}</h3>
            <select grInput class="mt-2" [ngModel]="m.rolSlug" (ngModelChange)="cambiarRol(m, $event)" [disabled]="!puede() || m.usuarioId === yo()">@for (r of roles(); track r.slug) { <option [value]="r.slug">{{ r.nombre }}</option> }</select></section>
          <section><h3 class="text-label-m">Sesiones activas</h3><p class="text-body-xs text-text-tertiary">Cookie por dispositivo · caducan a las 12 h sin uso</p>
            <ul class="mt-2 flex flex-col gap-2">@for (x of sesiones(); track x.id) {
              <li class="flex items-center gap-3 rounded-md bg-bg-raised px-3 py-2 text-body-s"><gr-icon [name]="x.origen === 'cli' ? 'key' : 'smartphone'" [size]="16" /><div class="min-w-0 flex-1"><p class="truncate text-label-s">{{ dispositivo(x.userAgent) }}</p><p class="text-body-xs text-text-tertiary">{{ x.origen }} · {{ rel(x.lastUsedAt) }}</p></div>
                @if (puede()) { <button type="button" class="text-label-s text-accent-text" (click)="cerrarSesion(m, x)">Cerrar sesión</button> }</li>
            } @empty { <li class="text-body-s text-text-tertiary">Sin sesiones activas.</li> }</ul></section>
          @if (puede() && m.usuarioId !== yo()) {
            <section class="flex flex-wrap gap-2 border-t border-line-subtle pt-4">
              <button grButton size="s" [variant]="m.estado === 'suspendido' ? 'primary' : 'danger'" (click)="suspender(m)">{{ m.estado === 'suspendido' ? 'Reactivar' : 'Suspender' }}</button>
              <button grButton size="s" variant="ghost" (click)="quitar(m)">Quitar del equipo</button>
            </section>
          }
        </div>
      }
    </bo-drawer>

    @if (invitarOpen()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="invitarOpen.set(false)" (keydown.escape)="invitarOpen.set(false)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Invitar persona" (click)="$event.stopPropagation()" (ngSubmit)="invitar()">
          <h2 class="text-ui-h5">Invitar persona</h2><p class="mt-1 text-body-s text-text-secondary">Si ya tiene cuenta entra directamente; si no, recibe un email de invitación (caduca en 7 días).</p>
          <gr-field label="Email" class="mt-4"><input grInput type="email" name="email" [(ngModel)]="inv.email" autofocus /></gr-field>
          <gr-field label="Rol" class="mt-3"><select grInput name="rol" [(ngModel)]="inv.rol">@for (r of roles(); track r.slug) { <option [value]="r.slug">{{ r.nombre }}</option> }</select></gr-field>
          <div class="mt-6 flex justify-end gap-2"><button type="button" grButton variant="ghost" (click)="invitarOpen.set(false)">Cancelar</button><button type="submit" grButton variant="primary" [disabled]="!inv.email.includes('@') || !inv.rol">Invitar</button></div>
        </form>
      </div>
    }
  `,
})
export class EquipoPage {
  private readonly http = inject(HttpClient);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly permisos = PERMISOS;
  protected readonly rel = rel;
  protected readonly tabs = [{ v: 'miembros' as const, l: 'Miembros' }, { v: 'roles' as const, l: 'Roles y permisos' }, { v: 'invitaciones' as const, l: 'Invitaciones' }];
  protected readonly tab = signal<'miembros' | 'roles' | 'invitaciones'>((this.route.snapshot.queryParamMap.get('tab') as 'roles') || 'miembros');
  protected readonly miembros = signal<Miembro[] | null>(null);
  protected readonly roles = signal<Rol[]>([]);
  private readonly rolesBase = signal('');
  protected readonly invitaciones = signal<Invitacion[]>([]);
  protected readonly sel = signal<Miembro | null>(null);
  protected readonly sesiones = signal<Sesion[]>([]);
  protected readonly fichaOpen = signal(false);
  protected readonly invitarOpen = signal(false);
  protected readonly guardando = signal(false);
  protected inv = { email: '', rol: 'staff' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'equipo.gestionar'));
  protected readonly yo = computed(() => this.auth.user()?.id ?? '');
  protected readonly rolCambiado = computed(() => JSON.stringify(this.roles()) !== this.rolesBase());
  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
  }
  private u(): string { return `/api/competition/${this.cid()}`; }
  async cargar(): Promise<void> {
    const [m, r, i] = await Promise.all([
      firstValueFrom(this.http.get<Miembro[]>(`${this.u()}/users`)), firstValueFrom(this.http.get<{ roles: Rol[] }>(`${this.u()}/roles`)).then((x) => x.roles),
      firstValueFrom(this.http.get<Invitacion[]>(`/api/admin/competiciones/${this.cid()}/equipo/invitaciones`)).catch(() => [] as Invitacion[]),
    ]);
    this.miembros.set(m);
    this.roles.set(r);
    this.rolesBase.set(JSON.stringify(r));
    this.invitaciones.set(i);
  }
  protected ir(t: 'miembros' | 'roles' | 'invitaciones'): void { this.tab.set(t); void this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true }); }
  protected cuenta(t: string): number { return t === 'miembros' ? (this.miembros()?.length ?? 0) : t === 'roles' ? this.roles().length : this.invitaciones().length; }
  protected ini(s: string): string { return s.split(/[\s@.]/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(); }
  protected nombreRol(slug: string): string { return this.roles().find((r) => r.slug === slug)?.nombre ?? slug; }
  protected caducada(i: Invitacion): boolean { return new Date(i.expiresAt).getTime() < Date.now(); }
  protected tiene(r: Rol, k: string): boolean { return r.permisos.includes(k); }
  protected dispositivo(ua: string): string {
    const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
    const br = /Firefox/.test(ua) ? 'Firefox' : /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : ua.split('/')[0] || '—';
    return `${os} · ${br}`;
  }
  protected alternar(r: Rol, k: string): void {
    this.roles.update((l) => l.map((x) => (x.slug === r.slug ? { ...x, permisos: x.permisos.includes(k) ? x.permisos.filter((p) => p !== k) : [...x.permisos, k] } : x)));
  }
  protected async guardarRoles(): Promise<void> {
    const base = JSON.parse(this.rolesBase()) as Rol[];
    this.guardando.set(true);
    try {
      for (const r of this.roles()) {
        const b = base.find((x) => x.slug === r.slug);
        if (!b || JSON.stringify(b.permisos) === JSON.stringify(r.permisos)) continue;
        await firstValueFrom(this.http.put(`${this.u()}/roles/${r.slug}`, { permisos: r.permisos }, { headers: new HttpHeaders({ 'If-Match': `W/"${r.version}"` }) }));
      }
      this.toasts.success('Permisos guardados');
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar.'));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async duplicar(): Promise<void> {
    const base = this.roles().find((r) => r.slug === 'staff') ?? this.roles()[0];
    const nombre = `${base.nombre} (copia)`;
    try {
      await firstValueFrom(this.http.post(`${this.u()}/roles`, { slug: `${base.slug}-copia-${Date.now() % 1000}`, nombre, duplicarDe: base.slug }));
      this.toasts.success(`Rol «${nombre}» creado`);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo duplicar.'));
    }
  }
  protected async ficha(m: Miembro): Promise<void> {
    this.sel.set(m);
    this.fichaOpen.set(true);
    this.sesiones.set([]);
    try { this.sesiones.set(await firstValueFrom(this.http.get<Sesion[]>(`/api/admin/competiciones/${this.cid()}/equipo/${m.usuarioId}/sesiones`))); } catch { /* without permission */ }
  }
  private async patch(m: Miembro, b: Record<string, string>, ok: string): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.patch<Miembro>(`${this.u()}/users/${m.usuarioId}`, b));
      this.sel.set(r);
      this.toasts.success(ok);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar.'));
    }
  }
  protected cambiarRol(m: Miembro, rol: string): Promise<void> { return this.patch(m, { rolSlug: rol }, 'Rol cambiado a ' + this.nombreRol(rol)); }
  protected async suspender(m: Miembro): Promise<void> {
    const sus = m.estado !== 'suspendido';
    if (sus && !(await this.confirm.ask({ title: `¿Suspender a ${m.nombre || m.email}?`, text: 'Pierde el acceso al momento y se cierran sus sesiones. Puedes reactivarlo después.', confirm: 'Suspender', danger: true }))) return;
    await this.patch(m, { estado: sus ? 'suspendido' : 'activo' }, sus ? 'Suspendido' : 'Reactivado');
  }
  protected async quitar(m: Miembro): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Quitar a ${m.nombre || m.email} del equipo?`, text: 'Deja de tener acceso a esta competición.', confirm: 'Quitar', danger: true }))) return;
    try { await firstValueFrom(this.http.delete(`${this.u()}/users/${m.usuarioId}`)); this.fichaOpen.set(false); await this.cargar(); } catch (e) { this.toasts.error(errText(e, 'No se pudo quitar.')); }
  }
  protected async cerrarSesion(m: Miembro, x: Sesion): Promise<void> {
    try { await firstValueFrom(this.http.delete(`/api/admin/competiciones/${this.cid()}/equipo/${m.usuarioId}/sesiones/${x.id}`)); this.sesiones.update((l) => l.filter((s) => s.id !== x.id)); } catch (e) { this.toasts.error(errText(e, 'No se pudo cerrar.')); }
  }
  protected async invitar(): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.post<{ resultado: string }>(`${this.u()}/users`, { email: this.inv.email.trim(), rolSlug: this.inv.rol }));
      this.toasts.success(r.resultado === 'miembro' ? 'Añadido al equipo' : 'Invitación enviada a ' + this.inv.email);
      this.invitarOpen.set(false);
      this.inv = { email: '', rol: 'staff' };
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo invitar.'));
    }
  }
  protected async revocar(i: Invitacion): Promise<void> {
    try { await firstValueFrom(this.http.delete(`/api/admin/competiciones/${this.cid()}/equipo/invitaciones/${i.id}`)); this.invitaciones.update((l) => l.filter((x) => x.id !== i.id)); } catch (e) { this.toasts.error(errText(e, 'No se pudo revocar.')); }
  }
}

/** «Auditoría» (Figma page 63): who changed what and when, with filters and the before → after of each change. */
@Component({
  selector: 'bo-auditoria',
  imports: [FormsModule, BoPageHeader, BoDrawer, GrButton, GrEmpty, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Auditoría" subtitle="Quién hizo qué y cuándo · sin datos personales en los cambios de contactos suprimidos" [crumbs]="[comps.current()?.nombreCorto || '', 'Equipo y sistema', 'Auditoría']" />
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1 text-label-s">Desde<input grInput type="date" [(ngModel)]="f.desde" (change)="buscar()" /></label>
        <label class="flex flex-col gap-1 text-label-s">Hasta<input grInput type="date" [(ngModel)]="f.hasta" (change)="buscar()" /></label>
        <label class="flex flex-col gap-1 text-label-s">Acción<select class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s" [(ngModel)]="f.tipo" (change)="buscar()"><option value="">Todas</option>@for (t of tipos; track t.v) { <option [value]="t.v">{{ t.l }}</option> }</select></label>
        <label class="flex flex-col gap-1 text-label-s">Origen<select class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s" [(ngModel)]="f.origen" (change)="buscar()"><option value="">Todos</option><option value="web">Backoffice</option><option value="cli">CLI</option><option value="token">Token</option><option value="mcp">MCP</option></select></label>
      </div>
      @if (items() === null) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (!items()!.length) { <gr-empty icon="history" title="Nada en este periodo">Prueba con otras fechas o filtros.</gr-empty> }
      @else {
        <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
          <table class="w-full min-w-[760px] text-left text-body-s">
            <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Fecha</th><th class="px-3 py-3">Persona</th><th class="px-3 py-3">Acción</th><th class="px-4 py-3">Entidad</th></tr></thead>
            <tbody>
              @for (e of items(); track e.id) {
                <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" (click)="ver(e)"><td class="px-4 py-2.5 font-mono text-mono-xs whitespace-nowrap">{{ fecha(e.fecha) }}</td>
                  <td class="px-3 py-2.5">{{ e.actor || 'Sistema' }}<span class="block text-body-xs text-text-tertiary">{{ e.origen || e.servicio }}</span></td>
                  <td class="px-3 py-2.5"><span class="font-mono text-mono-xs">{{ e.tipo }}</span></td><td class="max-w-[280px] truncate px-4 py-2.5 text-body-xs text-text-tertiary">{{ e.entidad }}</td></tr>
              }
            </tbody>
          </table>
        </section>
        @if (siguiente()) { <button grButton class="self-center" (click)="mas()">Cargar más</button> }
      }
    </div>
    <bo-drawer [(open)]="detOpen" [title]="det()?.tipo ?? ''">
      @if (det(); as e) {
        <dl class="flex flex-col gap-2 text-body-s">
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Persona</dt><dd>{{ e.actor || 'Sistema' }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Fecha</dt><dd class="font-mono text-mono-xs">{{ fecha(e.fecha) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Servicio</dt><dd>{{ e.servicio }} · {{ e.origen }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Entidad</dt><dd class="truncate font-mono text-mono-xs">{{ e.entidad }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Petición</dt><dd class="truncate font-mono text-mono-xs">{{ e.requestId }}</dd></div>
        </dl>
        <p class="mt-4 text-mono-xs text-text-tertiary uppercase">{{ e.diff ? 'Cambio (antes → después)' : 'Datos' }}</p>
        <pre class="mt-2 max-h-[60vh] overflow-auto rounded-md bg-[#141011] p-3 text-[11px] leading-4 whitespace-pre-wrap text-[#d8cfd1]">{{ json(e.diff ?? e.datos) }}</pre>
      }
    </bo-drawer>
  `,
})
export class AuditoriaPage {
  private readonly http = inject(HttpClient);
  protected readonly comps = inject(Competitions);
  protected readonly items = signal<Entrada[] | null>(null);
  protected readonly siguiente = signal('');
  protected readonly det = signal<Entrada | null>(null);
  protected readonly detOpen = signal(false);
  protected f = { desde: '', hasta: '', tipo: '', origen: '' };
  protected readonly tipos = [
    { v: 'competition.', l: 'Evento' }, { v: 'cms.', l: 'Web y contenidos' }, { v: 'athletes.', l: 'Atletas' }, { v: 'horarios.', l: 'Horarios' }, { v: 'directo.', l: 'Directo' },
    { v: 'resultados.', l: 'Resultados' }, { v: 'entrada', l: 'Entradas' }, { v: 'sorteo.', l: 'Sorteo' }, { v: 'crm.', l: 'Contactos' }, { v: 'campana.', l: 'Campañas' }, { v: 'identity.', l: 'Equipo y accesos' },
  ];
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.buscar());
    });
  }
  private params(cursor = ''): HttpParams {
    let p = new HttpParams().set('limite', 50);
    if (this.f.desde) p = p.set('desde', new Date(this.f.desde + 'T00:00:00').toISOString());
    if (this.f.hasta) p = p.set('hasta', new Date(this.f.hasta + 'T23:59:59').toISOString());
    if (this.f.tipo) p = p.set('tipo', this.f.tipo);
    if (this.f.origen) p = p.set('origen', this.f.origen);
    if (cursor) p = p.set('cursor', cursor);
    return p;
  }
  async buscar(): Promise<void> {
    this.items.set(null);
    const r = await firstValueFrom(this.http.get<{ items: Entrada[]; siguiente?: string }>(`/api/admin/competiciones/${this.cid()}/auditoria`, { params: this.params() })).catch(() => ({ items: [] as Entrada[], siguiente: '' }));
    this.items.set(r.items);
    this.siguiente.set(r.siguiente ?? '');
  }
  protected async mas(): Promise<void> {
    const r = await firstValueFrom(this.http.get<{ items: Entrada[]; siguiente?: string }>(`/api/admin/competiciones/${this.cid()}/auditoria`, { params: this.params(this.siguiente()) }));
    this.items.update((l) => [...(l ?? []), ...r.items]);
    this.siguiente.set(r.siguiente ?? '');
  }
  protected ver(e: Entrada): void { this.det.set(e); this.detOpen.set(true); }
  protected fecha(iso: string): string { return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace(',', ''); }
  protected json(v: unknown): string { return JSON.stringify(v, null, 2); }
}
