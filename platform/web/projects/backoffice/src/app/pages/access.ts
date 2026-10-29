import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrField, GrIconTile, GrInput, GrSpinner, fmtAgo } from '@grcup/ui';
import { Auth } from '../core/auth';
import { problemOf, type DispositivoInfo, type InvitacionInfo, type Sesion } from '../core/api';
import { AccessLayout } from './login';

/** «Autorizar dispositivo»: approves the code shown by `grcup login` (OAuth device grant). */
@Component({
  selector: 'bo-device',
  imports: [FormsModule, AccessLayout, GrButton, GrField, GrInput, GrIconTile, GrAlert, GrBadge, GrSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bo-access-layout>
      <div class="w-full max-w-[420px] rounded-xl border border-line-subtle bg-bg-card p-6 shadow-card sm:p-8">
        <div class="flex items-center gap-3">
          <gr-icon-tile icon="smartphone" tone="info" />
          <div><h1 class="text-ui-h4">Autorizar dispositivo</h1><p class="text-body-xs text-text-tertiary">CLI grcup o agente que pide acceso a tu cuenta</p></div>
        </div>
        @if (done()) {
          <gr-alert class="mt-6" [tone]="done() === 'aprobado' ? 'success' : 'warning'" [title]="done() === 'aprobado' ? 'Acceso concedido' : 'Acceso denegado'">
            {{ done() === 'aprobado' ? 'Vuelve a la terminal: la sesión se abrirá en unos segundos.' : 'El dispositivo no podrá entrar con este código.' }}
          </gr-alert>
        } @else {
          <form class="mt-6 flex flex-col gap-4" (ngSubmit)="lookup()">
            <gr-field label="Código" for="code" hint="El que muestra la terminal, p. ej. WXYZ-1234">
              <input grInput id="code" name="code" class="font-mono uppercase tracking-[0.2em]" autocomplete="one-time-code" [(ngModel)]="code" maxlength="9" required />
            </gr-field>
            @if (!info()) { <button grButton variant="primary" type="submit" [loading]="busy()">Buscar</button> }
          </form>
          @if (error()) { <gr-alert class="mt-4" tone="danger" title="No se pudo continuar">{{ error() }}</gr-alert> }
          @if (info(); as i) {
            <div class="mt-5 rounded-md border border-line-strong bg-bg-raised p-4">
              <div class="flex items-center justify-between gap-3"><p class="text-label-s">{{ i.cliente || 'Cliente sin nombre' }}</p><gr-badge [tone]="i.estado === 'pendiente' ? 'warning' : 'neutral'">{{ i.estado }}</gr-badge></div>
              <p class="mt-1 text-body-xs text-text-tertiary">Pedido {{ ago(i.createdAt) }} · entrará como {{ auth.user()?.email }}</p>
            </div>
            @if (i.estado === 'pendiente') {
              <div class="mt-5 grid grid-cols-2 gap-3">
                <button grButton type="button" (click)="decide(false)" [disabled]="busy()">Denegar</button>
                <button grButton variant="primary" type="button" (click)="decide(true)" [loading]="busy()">Autorizar</button>
              </div>
            }
          }
          @if (busy() && !info()) { <div class="mt-4 flex justify-center"><gr-spinner /></div> }
        }
      </div>
    </bo-access-layout>
  `,
})
export class DevicePage implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(Auth);
  readonly codigo = input('');
  protected code = '';
  protected readonly info = signal<DispositivoInfo | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal<'' | 'aprobado' | 'denegado'>('');
  protected readonly ago = fmtAgo;

  ngOnInit(): void {
    if (this.codigo()) {
      this.code = this.codigo();
      void this.lookup();
    }
  }

  protected async lookup(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.info.set(await firstValueFrom(this.http.get<DispositivoInfo>(`/api/auth/device/${encodeURIComponent(this.code.trim().toUpperCase())}`)));
    } catch (e) {
      this.error.set(problemOf(e).detail ?? 'Código no encontrado.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async decide(ok: boolean): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post(`/api/auth/device/${encodeURIComponent(this.code.trim().toUpperCase())}/${ok ? 'aprobar' : 'denegar'}`, {}));
      this.done.set(ok ? 'aprobado' : 'denegado');
    } catch (e) {
      this.error.set(problemOf(e).detail ?? 'No se pudo completar.');
    } finally {
      this.busy.set(false);
    }
  }
}

/** Accept a team invitation (creates the account if needed). */
@Component({
  selector: 'bo-invitation',
  imports: [FormsModule, AccessLayout, GrButton, GrField, GrInput, GrIconTile, GrAlert, GrSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bo-access-layout>
      <div class="w-full max-w-[420px] rounded-xl border border-line-subtle bg-bg-card p-6 shadow-card sm:p-8">
        <div class="flex items-center gap-3">
          <gr-icon-tile icon="user-plus" tone="accent" />
          <div><h1 class="text-ui-h4">Únete al equipo</h1><p class="text-body-xs text-text-tertiary">Invitación al backoffice de la GR Cup</p></div>
        </div>
        @if (loading()) { <div class="mt-8 flex justify-center"><gr-spinner /></div> }
        @else if (!info()) { <gr-alert class="mt-6" tone="danger" title="Invitación no válida">{{ error() || 'La invitación no existe, ya se usó o ha caducado. Pide una nueva a quien te invitó.' }}</gr-alert> }
        @else {
          <p class="mt-5 text-body-s text-text-secondary">Entrarás como <strong class="text-text-primary">{{ info()!.email }}</strong> con el rol <strong class="text-text-primary">{{ info()!.rol }}</strong>.</p>
          <form class="mt-5 flex flex-col gap-4" (ngSubmit)="accept()">
            @if (!info()!.cuentaExistente) {
              <gr-field label="Nombre" for="nombre"><input grInput id="nombre" name="nombre" autocomplete="name" [(ngModel)]="nombre" required /></gr-field>
              <gr-field label="Contraseña" for="pw" hint="Mínimo 10 caracteres"><input grInput id="pw" name="pw" type="password" autocomplete="new-password" [(ngModel)]="password" minlength="10" required /></gr-field>
            }
            @if (error()) { <gr-alert tone="danger" title="No se pudo aceptar">{{ error() }}</gr-alert> }
            <button grButton variant="primary" type="submit" [loading]="busy()">Aceptar invitación</button>
          </form>
        }
      </div>
    </bo-access-layout>
  `,
})
export class InvitationPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  readonly token = input.required<string>();
  protected nombre = '';
  protected password = '';
  protected readonly info = signal<InvitacionInfo | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      this.info.set(await firstValueFrom(this.http.get<InvitacionInfo>(`/api/auth/invitaciones/${encodeURIComponent(this.token())}`)));
    } catch (e) {
      this.error.set(problemOf(e).detail ?? '');
    } finally {
      this.loading.set(false);
    }
  }

  protected async accept(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.post<Sesion>('/api/auth/invitaciones/aceptar', { token: this.token(), nombre: this.nombre, password: this.password }));
      await this.auth.refresh();
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(problemOf(e).detail ?? 'Inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }
}
