import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSelect, GrSkeleton, GrToasts, type GrTone, fmtAgo } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { webPublica } from '../core/web';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, Media, errText } from '../shared/ui';

/** A row of the «clubs» collection (cms): directory entries and the requests from /clubs. */
interface Club {
  id: string; nombre: string; ciudad: string; provincia: string; logoUrl: string; web: string; instagram: string; etiquetas: string;
  rol: 'organizador' | 'colaborador' | 'club'; afiliadoAep: boolean | null; estado: 'publicado' | 'pendiente' | 'oculto' | 'rechazado';
  contactoEmail: string; contactoNombre: string; mensaje: string; motivoRechazo: string; revisadoAt?: string; revisadoPor: string;
  consentimientoAt?: string; orden: number; createdAt: string;
}
type Tab = 'solicitudes' | 'asociados' | 'rechazadas';
const ROL: Record<Club['rol'], { l: string; tone: GrTone }> = { organizador: { l: 'Organizador', tone: 'accent' }, colaborador: { l: 'Colaborador', tone: 'info' }, club: { l: 'Club', tone: 'neutral' } };
const DIA = 86_400_000;

/** «Clubs» (Figma page 67): requests sent from /clubs (approve with role, logo and email · reject with a reason) and the clubs
 *  of the directory (order of /clubs, role, visibility). */
@Component({
  selector: 'bo-clubs',
  imports: [FormsModule, BoPageHeader, BoDrawer, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Clubs" subtitle="Directorio de /clubs y solicitudes de alta" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Clubs']">
        <ng-container actions>
          <a grButton icon="external-link" [href]="web + '/clubs'" target="_blank" rel="noopener">Ver /clubs</a>
        </ng-container>
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Clubs">
        @for (t of tabs; track t.k) {
          <button type="button" (click)="tab.set(t.k)" [attr.aria-current]="tab() === t.k ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="tab() === t.k ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
            {{ t.l }}<span class="rounded-2xs px-1.5 text-mono-xs" [class]="t.k === 'solicitudes' && pendientes().length ? 'bg-accent/20 text-accent-text' : 'bg-bg-raised'">{{ cuenta(t.k) }}</span>
            @if (tab() === t.k) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
          </button>
        }
      </nav>

      @if (l === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar los clubs"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (l === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else {
        @switch (tab()) {
          @case ('solicitudes') {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <gr-kpi label="Solicitudes pendientes" [value]="pendientes().length + ''" [caption]="masAntigua()" />
              <gr-kpi label="Clubs asociados" [value]="asociados().length + ''" [caption]="publicados() + ' publicados en /clubs'" />
              <gr-kpi label="Aprobadas este mes" [value]="aprobadasMes() + ''" caption="desde el día 1" />
              <gr-kpi label="Tiempo de respuesta" [value]="respuesta()" caption="media de las revisadas" />
            </div>
            @if (!pendientes().length) { <gr-empty icon="building" title="Sin solicitudes pendientes" text="Las solicitudes llegan del formulario «Añade tu club» de /clubs." /> }
            @else {
              <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                <table class="hidden w-full table-fixed text-left md:table">
                  <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3 font-normal">Club</th><th class="w-32 px-3 py-3 font-normal">Provincia</th><th class="w-64 px-3 py-3 font-normal">Contacto</th><th class="w-20 px-3 py-3 font-normal">AEP</th><th class="w-28 px-3 py-3 font-normal">Recibida</th><th class="w-12"></th></tr></thead>
                  <tbody>
                    @for (c of pendientes(); track c.id) {
                      <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" [class.bg-accent/6]="sel()?.id === c.id" (click)="revisar(c)">
                        <td class="px-4 py-3"><span class="flex items-center gap-3"><span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/6 text-label-xs">{{ ini(c.nombre) }}</span><span class="min-w-0"><span class="block truncate text-label-s">{{ c.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.ciudad }}</span></span></span></td>
                        <td class="px-3 py-3 text-body-s">{{ c.provincia || '—' }}</td>
                        <td class="px-3 py-3"><span class="block truncate text-body-s">{{ c.contactoNombre || '—' }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.contactoEmail }}</span></td>
                        <td class="px-3 py-3"><gr-badge [tone]="c.afiliadoAep ? 'success' : 'neutral'">{{ c.afiliadoAep ? 'Sí' : c.afiliadoAep === false ? 'No' : 'Sin respuesta' }}</gr-badge></td>
                        <td class="px-3 py-3 text-body-s">{{ hace(c.createdAt) }}</td>
                        <td class="px-2"><gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
                <ul class="divide-y divide-line-subtle md:hidden">
                  @for (c of pendientes(); track c.id) {
                    <li class="flex flex-col gap-3 p-4">
                      <button type="button" class="flex flex-col items-start gap-1 text-left" (click)="revisar(c)"><span class="text-label-m">{{ c.nombre }}</span><span class="text-body-xs text-text-tertiary">{{ c.ciudad }}{{ c.provincia ? ' · ' + c.provincia : '' }}{{ c.afiliadoAep ? ' · AEP' : '' }} · {{ hace(c.createdAt) }}</span></button>
                      <div class="grid grid-cols-2 gap-2"><button grButton (click)="revisar(c, 'rechazar')">Rechazar</button><button grButton variant="primary" (click)="revisar(c)">Aprobar</button></div>
                    </li>
                  }
                </ul>
              </section>
            }
          }
          @case ('asociados') {
            @if (!asociados().length) { <gr-empty icon="building" title="Todavía no hay clubs en el directorio" text="Aprueba una solicitud o añade clubs en Web y contenidos › Clubs." /> }
            @else {
              <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                <ul class="divide-y divide-line-subtle">
                  @for (c of asociados(); track c.id; let i = $index; let ultimo = $last) {
                    <li class="flex flex-wrap items-center gap-3 px-4 py-3" [class.opacity-60]="c.estado === 'oculto'">
                      <span class="flex flex-col">
                        <button type="button" class="flex size-7 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary disabled:opacity-30" [disabled]="!i || ocupado()" (click)="mover(i, -1)" [attr.aria-label]="'Subir ' + c.nombre"><gr-icon name="arrow-up" [size]="14" /></button>
                        <button type="button" class="flex size-7 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary disabled:opacity-30" [disabled]="ultimo || ocupado()" (click)="mover(i, 1)" [attr.aria-label]="'Bajar ' + c.nombre"><gr-icon name="arrow-down" [size]="14" /></button>
                      </span>
                      <span class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/6 p-1">@if (c.logoUrl) { <img [src]="logo(c.logoUrl)" alt="" class="max-h-full max-w-full object-contain" /> } @else { <span class="text-label-xs">{{ ini(c.nombre) }}</span> }</span>
                      <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ c.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ c.ciudad || 'Por confirmar' }}{{ c.provincia && c.ciudad && !c.ciudad.includes(c.provincia) ? ' (' + c.provincia + ')' : '' }}</span></span>
                      <gr-select class="w-40" [ngModel]="c.rol" (ngModelChange)="guardar(c, { rol: $event })" [aria-label]="'Papel de ' + c.nombre" [disabled]="ocupado()"><option value="organizador">Organizador</option><option value="colaborador">Colaborador</option><option value="club">Club</option></gr-select>
                      <gr-badge [tone]="c.afiliadoAep ? 'success' : 'neutral'">{{ c.afiliadoAep ? 'AEP' : c.afiliadoAep === false ? 'Sin AEP' : 'AEP sin respuesta' }}</gr-badge>
                      <span class="flex items-center gap-2"><span class="text-body-xs text-text-tertiary">En la web</span><bo-toggle [value]="c.estado === 'publicado'" [label]="'Mostrar ' + c.nombre + ' en /clubs'" [disabled]="ocupado()" (changed)="guardar(c, { estado: $event ? 'publicado' : 'oculto' })" /></span>
                    </li>
                  }
                </ul>
                <p class="border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">{{ asociados().length }} clubs · el orden es el de /clubs. Los datos (web, Instagram, etiquetas) se editan en Web y contenidos › Clubs.</p>
              </section>
            }
          }
          @case ('rechazadas') {
            @if (!rechazadas().length) { <gr-empty icon="building" title="Sin solicitudes rechazadas" /> }
            @else {
              <p class="text-body-xs text-text-tertiary">Guardan el nombre, el email y el mensaje de quien las envió: bórralas cuando ya no hagan falta.</p>
              <ul class="flex flex-col gap-3">
                @for (c of rechazadas(); track c.id) {
                  <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-4 md:flex-row md:items-center md:gap-4">
                    <span class="min-w-0 flex-1"><span class="block text-label-s">{{ c.nombre }} <span class="text-body-xs font-normal text-text-tertiary">· {{ c.ciudad }}</span></span>
                      <span class="block text-body-s text-text-secondary">«{{ c.motivoRechazo }}»</span>
                      <span class="block text-body-xs text-text-tertiary">{{ c.revisadoPor || 'Equipo' }} · {{ c.revisadoAt ? hace(c.revisadoAt) : '' }}</span></span>
                    <span class="flex gap-2"><button grButton size="s" (click)="revisar(c)">Revisar de nuevo</button><button grButton size="s" variant="danger" icon="trash" [disabled]="ocupado()" (click)="borrar(c)">Borrar</button></span>
                  </li>
                }
              </ul>
            }
          }
        }
      }
    </div>

    <!-- Review a request (Figma 67 «Clubs · revisar solicitud») -->
    <bo-drawer [(open)]="abierto" [title]="sel()?.nombre || 'Solicitud'" [badge]="sel()?.estado === 'rechazado' ? 'Rechazada' : ''">
      @if (sel(); as c) {
        <div class="flex flex-col gap-5">
          <p class="text-body-xs text-text-tertiary">Solicitud recibida {{ hace(c.createdAt) }} desde /clubs{{ c.consentimientoAt ? ' · aceptó la política de privacidad' : '' }}</p>
          <section><h3 class="text-label-xs text-text-muted uppercase">Club</h3>
            <dl class="mt-2 text-body-s">
              @for (r of filasClub(c); track r[0]) { <div class="flex justify-between gap-4 border-b border-line-subtle py-2 last:border-0"><dt class="text-text-tertiary">{{ r[0] }}</dt><dd class="min-w-0 truncate text-right">@if (r[2]) { <a [href]="r[1]" target="_blank" rel="noopener" class="text-accent-text hover:underline">{{ r[1] }}</a> } @else { {{ r[1] }} }</dd></div> }
            </dl>
          </section>
          <section><h3 class="text-label-xs text-text-muted uppercase">Contacto (no se publica)</h3>
            <dl class="mt-2 text-body-s">
              <div class="flex justify-between gap-4 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Persona</dt><dd>{{ c.contactoNombre || '—' }}</dd></div>
              <div class="flex justify-between gap-4 py-2"><dt class="text-text-tertiary">Email</dt><dd class="truncate">@if (c.contactoEmail) { <a [href]="'mailto:' + c.contactoEmail" class="text-accent-text hover:underline">{{ c.contactoEmail }}</a> } @else { — }</dd></div>
            </dl>
          </section>
          @if (c.mensaje) { <section><h3 class="text-label-xs text-text-muted uppercase">Mensaje</h3><p class="mt-2 text-body-s whitespace-pre-line text-text-secondary">«{{ c.mensaje }}»</p></section> }
          @if (modo() === 'aprobar') {
            <section class="flex flex-col gap-4"><h3 class="text-label-xs text-text-muted uppercase">Al aprobar</h3>
              <div class="grid gap-4 sm:grid-cols-2">
                <gr-field label="Papel en el directorio" for="ap-rol"><gr-select id="ap-rol" [(ngModel)]="ap.rol"><option value="club">Club</option><option value="colaborador">Colaborador</option><option value="organizador">Organizador</option></gr-select></gr-field>
                <gr-field label="Logo" [optional]="true">
                  <label class="flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line-strong px-3 text-body-s text-text-secondary hover:border-text-muted md:h-10">
                    @if (ap.logoUrl) { <img [src]="logo(ap.logoUrl)" alt="" class="size-7 rounded-xs object-contain" /> } @else { <gr-icon name="camera" [size]="16" /> }
                    <span class="truncate">{{ subiendo() ? 'Subiendo…' : ap.logoUrl ? 'Cambiar imagen' : 'Subir imagen…' }}</span>
                    <input type="file" accept="image/png,image/webp,image/jpeg,image/svg+xml" class="sr-only" (change)="subirLogo($event)" />
                  </label>
                </gr-field>
              </div>
              <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Avisar por email</p><p class="text-body-xs text-text-tertiary">«{{ c.nombre }} ya está en el directorio» a {{ c.contactoEmail || 'nadie (sin email)' }}</p></div><bo-toggle [(value)]="ap.avisar" label="Avisar por email" [disabled]="!c.contactoEmail" /></div>
            </section>
          } @else {
            <section class="flex flex-col gap-4"><h3 class="text-label-xs text-text-muted uppercase">Rechazar</h3>
              <gr-field label="Motivo" for="re-motivo" hint="Se guarda; si avisas, va en el email" [error]="motivoError()"><textarea grInput id="re-motivo" rows="3" maxlength="400" [(ngModel)]="re.motivo" placeholder="p. ej. No hemos podido verificar el club con la web ni las redes."></textarea></gr-field>
              <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Avisar por email</p><p class="text-body-xs text-text-tertiary">Con el motivo, a {{ c.contactoEmail || 'nadie (sin email)' }}</p></div><bo-toggle [(value)]="re.avisar" label="Avisar del rechazo por email" [disabled]="!c.contactoEmail" /></div>
            </section>
          }
          @if (error()) { <gr-alert tone="danger" title="No se pudo guardar">{{ error() }}</gr-alert> }
        </div>
      }
      <ng-container drawerActions>
        @if (modo() === 'aprobar') {
          @if (sel()?.estado === 'pendiente') { <button grButton variant="danger" (click)="modo.set('rechazar')">Rechazar…</button> }
          <button grButton variant="primary" [loading]="ocupado()" (click)="aprobar()">Aprobar y publicar</button>
        } @else {
          <button grButton variant="ghost" (click)="modo.set('aprobar')">Volver</button>
          <button grButton variant="danger" [loading]="ocupado()" (click)="rechazar()">Rechazar solicitud</button>
        }
      </ng-container>
    </bo-drawer>
  `,
})
export class ClubsPage {
  protected readonly comps = inject(Competitions);
  private readonly http = inject(HttpClient);
  private readonly toasts = inject(GrToasts);
  private readonly media = inject(Media);
  private readonly confirm = inject(Confirm);
  protected readonly web = webPublica();
  protected readonly lista = signal<Club[] | null | undefined>(undefined);
  protected readonly tab = signal<Tab>('solicitudes');
  protected readonly sel = signal<Club | null>(null);
  protected readonly abierto = signal(false);
  protected readonly modo = signal<'aprobar' | 'rechazar'>('aprobar');
  protected readonly ocupado = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly error = signal('');
  protected readonly motivoError = signal('');
  protected ap = { rol: 'club' as Club['rol'], logoUrl: '', avisar: true };
  protected re = { motivo: '', avisar: false };
  protected readonly tabs: { k: Tab; l: string }[] = [{ k: 'solicitudes', l: 'Solicitudes' }, { k: 'asociados', l: 'Clubs asociados' }, { k: 'rechazadas', l: 'Rechazadas' }];
  protected readonly rol = ROL;
  protected readonly hace = (iso: string) => fmtAgo(iso);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly pendientes = computed(() => (this.lista() ?? []).filter((c) => c.estado === 'pendiente').sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  protected readonly asociados = computed(() => (this.lista() ?? []).filter((c) => c.estado === 'publicado' || c.estado === 'oculto').sort((a, b) => a.orden - b.orden));
  protected readonly rechazadas = computed(() => (this.lista() ?? []).filter((c) => c.estado === 'rechazado').sort((a, b) => (b.revisadoAt ?? '').localeCompare(a.revisadoAt ?? '')));
  protected readonly publicados = computed(() => this.asociados().filter((c) => c.estado === 'publicado').length);
  protected readonly masAntigua = computed(() => {
    const p = this.pendientes();
    return p.length ? 'la más antigua, ' + fmtAgo(p[p.length - 1].createdAt) : 'ninguna esperando';
  });
  protected readonly aprobadasMes = computed(() => {
    const d = new Date(), desde = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return this.asociados().filter((c) => c.revisadoAt && new Date(c.revisadoAt).getTime() >= desde).length;
  });
  /** Mean time from a request to its review (requests sent from the form only). */
  protected readonly respuesta = computed(() => {
    const r = (this.lista() ?? []).filter((c) => c.revisadoAt && c.consentimientoAt).map((c) => new Date(c.revisadoAt!).getTime() - new Date(c.createdAt).getTime());
    if (!r.length) return '—';
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    return m < DIA ? `${Math.max(1, Math.round(m / 3_600_000))} h` : `${(m / DIA).toLocaleString('es-ES', { maximumFractionDigits: 1 })} días`;
  });

  constructor() {
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
  }

  private get base(): string { return `/api/admin/competiciones/${this.cid()}`; }
  protected cuenta(t: Tab): number { return t === 'solicitudes' ? this.pendientes().length : t === 'asociados' ? this.asociados().length : this.rechazadas().length; }
  protected ini(n: string): string { return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
  protected logo(u: string): string { return u.startsWith('/api/') ? this.web + u : u; }
  protected filasClub(c: Club): [string, string, boolean][] {
    return [['Ciudad', `${c.ciudad}${c.provincia ? ' (' + c.provincia + ')' : ''}`, false], ['Web', c.web || '—', !!c.web], ['Instagram', c.instagram || '—', !!c.instagram], ['Afiliado a la AEP', c.afiliadoAep ? 'Sí' : c.afiliadoAep === false ? 'No' : 'Sin respuesta', false]];
  }

  async cargar(): Promise<void> {
    try {
      this.lista.set(await firstValueFrom(this.http.get<Club[]>(`${this.base}/web/clubs`)));
    } catch {
      this.lista.set(null);
    }
  }

  protected revisar(c: Club, modo: 'aprobar' | 'rechazar' = 'aprobar'): void {
    this.sel.set(c);
    this.modo.set(modo);
    this.error.set('');
    this.motivoError.set('');
    this.ap = { rol: c.rol || 'club', logoUrl: c.logoUrl, avisar: !!c.contactoEmail };
    this.re = { motivo: c.motivoRechazo, avisar: false };
    this.abierto.set(true);
  }

  protected async subirLogo(ev: Event): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.subiendo.set(true);
    try { this.ap.logoUrl = await this.media.upload(f, 'Logo de ' + (this.sel()?.nombre ?? 'club')); } catch (e) { this.toasts.error('No se pudo subir el logo', errText(e)); } finally { this.subiendo.set(false); }
  }

  protected async aprobar(): Promise<void> {
    const c = this.sel();
    if (!c) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.post(`${this.base}/clubs/${c.id}/aprobar`, this.ap));
      this.abierto.set(false);
      this.toasts.success(`${c.nombre} ya está en /clubs`, this.ap.avisar ? `Le hemos escrito a ${c.contactoEmail}.` : 'Sin aviso por email.');
      await this.cargar();
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async rechazar(): Promise<void> {
    const c = this.sel();
    if (!c) return;
    if (this.re.motivo.trim().length < 3) { this.motivoError.set('Escribe el motivo del rechazo'); return; }
    this.ocupado.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.post(`${this.base}/clubs/${c.id}/rechazar`, { motivo: this.re.motivo.trim(), avisar: this.re.avisar }));
      this.abierto.set(false);
      this.toasts.success('Solicitud rechazada', this.re.avisar ? `Le hemos escrito a ${c.contactoEmail}.` : 'Sin aviso por email.');
      await this.cargar();
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Inline changes of a directory club (role, visibility) through the «clubs» collection. */
  protected async guardar(c: Club, cambio: Partial<Pick<Club, 'rol' | 'estado'>>): Promise<void> {
    this.ocupado.set(true);
    try {
      const body = { nombre: c.nombre, ciudad: c.ciudad, provincia: c.provincia, logoUrl: c.logoUrl, web: c.web, instagram: c.instagram, etiquetas: c.etiquetas, rol: c.rol, afiliadoAep: c.afiliadoAep, estado: c.estado, ...cambio };
      await firstValueFrom(this.http.put(`${this.base}/web/clubs/${c.id}`, body));
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
      await this.cargar();
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Deletes a rejected request and the personal data it holds (contact, email, message). */
  protected async borrar(c: Club): Promise<void> {
    if (!(await this.confirm.ask({ title: `¿Borrar la solicitud de ${c.nombre}?`, text: 'Se borran el club, la persona de contacto, su email y el mensaje. No se puede deshacer.', confirm: 'Borrar', danger: true }))) return;
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.http.delete(`${this.base}/web/clubs/${c.id}`));
      this.toasts.success('Solicitud borrada');
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo borrar', errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Moves a club one place in the order of /clubs. */
  protected async mover(i: number, d: -1 | 1): Promise<void> {
    const ids = this.asociados().map((c) => c.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    this.ocupado.set(true);
    try {
      await firstValueFrom(this.http.put(`${this.base}/web/clubs/orden`, { ids }));
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo reordenar', errText(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
