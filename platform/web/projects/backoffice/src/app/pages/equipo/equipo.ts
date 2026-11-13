import { A11yModule } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  GrAlert,
  GrBadge,
  GrButton,
  GrEmpty,
  GrField,
  GrIcon,
  GrInput,
  GrPopover,
  GrSelect,
  GrSkeleton,
  GrToasts,
} from '@grcup/ui';
import { problemOf } from '../../core/api';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, Confirm, errText } from '../../shared/ui';
import {
  PERMISOS,
  PERMISOS_DIA,
  iniciales,
  rel,
  tonoRol,
  type Invitacion,
  type Miembro,
  type Rol,
  type RolesResp,
} from './comun';

type Tab = 'miembros' | 'roles' | 'invitaciones';
/** One row of «Miembros»: a member or a pending/expired invitation (Figma shows both in the same table). */
type Fila =
  { tipo: 'miembro'; id: string; m: Miembro } | { tipo: 'invitacion'; id: string; i: Invitacion };

const th =
  'px-4 py-3 text-left text-[12px] leading-4 font-medium tracking-[0.04em] uppercase text-text-tertiary';
const menuItem =
  'flex h-11 w-full items-center gap-2 rounded-sm px-3 text-left text-label-s hover:bg-bg-card focus-visible:outline-none focus-visible:bg-bg-card';

/** «Equipo y permisos» (Figma 63): members with role, competitions, 2FA and last access; the permissions matrix; invitations. */
@Component({
  selector: 'bo-equipo',
  imports: [
    A11yModule,
    NgTemplateOutlet,
    FormsModule,
    BoPageHeader,
    GrAlert,
    GrBadge,
    GrButton,
    GrEmpty,
    GrField,
    GrIcon,
    GrInput,
    GrPopover,
    GrSelect,
    GrSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header
        title="Equipo y permisos"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Equipo y sistema', 'Equipo y permisos']"
      >
        <ng-container actions>
          @if (tab() === 'roles') {
            <button grButton (click)="duplicarOpen.set(true)">Duplicar rol</button>
            <button
              grButton
              variant="primary"
              [disabled]="!rolCambiado()"
              [loading]="guardando()"
              (click)="guardarRoles()"
            >
              Guardar
            </button>
          } @else {
            <button grButton variant="primary" (click)="abrirInvitar()">Invitar persona</button>
          }
        </ng-container>
      </bo-page-header>

      <nav
        class="-mt-1 flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]"
        aria-label="Equipo"
      >
        @for (t of tabs; track t.v) {
          <button
            type="button"
            class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s whitespace-nowrap focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]"
            [class]="
              tab() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'
            "
            [attr.aria-current]="tab() === t.v ? 'page' : null"
            (click)="ir(t.v)"
          >
            {{ t.l
            }}<span
              class="flex h-5 items-center rounded-xs px-1.5 text-mono-xs"
              [class]="
                tab() === t.v ? 'bg-accent/20 text-accent-text' : 'bg-bg-raised text-text-tertiary'
              "
              >{{ cuenta(t.v) }}</span
            >
            @if (tab() === t.v) {
              <span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span>
            }
          </button>
        }
      </nav>

      @if (error()) {
        <gr-empty icon="circle-alert" title="No se pudo cargar el equipo" [text]="error()"
          ><button grButton icon="refresh" (click)="cargar()">Reintentar</button></gr-empty
        >
      } @else if (miembros() === null) {
        <section
          class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"
          aria-busy="true"
          aria-label="Cargando"
        >
          @for (r of [1, 2, 3, 4, 5, 6]; track r) {
            <div
              class="flex h-[52px] items-center gap-4 border-b border-line-subtle px-5 last:border-0"
            >
              <gr-skeleton class="size-4 rounded-2xs" /><gr-skeleton
                class="size-8 rounded-full"
              /><gr-skeleton class="h-3 w-44" /><gr-skeleton
                class="hidden h-3 w-20 md:block"
              /><gr-skeleton class="hidden h-5 w-16 rounded-xs md:block" /><span
                class="flex-1"
              ></span
              ><gr-skeleton class="h-3 w-16" />
            </div>
          }
        </section>
      } @else {
        @switch (tab()) {
          @case ('miembros') {
            @if (!filas().length) {
              <gr-empty
                icon="users"
                title="Aún no hay nadie en el equipo"
                text="Invita a quien vaya a ayudarte: Comunicación para la web y campañas, Staff para la competición, Taquilla para la puerta."
                ><button grButton variant="primary" (click)="abrirInvitar()">
                  Invitar persona
                </button></gr-empty
              >
            } @else {
              <section
                class="hidden overflow-hidden rounded-lg border border-line-subtle bg-bg-card md:block"
              >
                <table class="w-full text-body-s">
                  <thead class="border-b border-line-subtle bg-bg-card">
                    <tr>
                      <th class="${th} pl-4">Persona</th>
                      <th class="${th}">Rol</th>
                      <th class="${th} hidden xl:table-cell">Competiciones</th>
                      <th class="${th}">2FA</th>
                      <th class="${th}">Último acceso</th>
                      <th class="${th}">Estado</th>
                      <th class="w-14"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (f of filas(); track f.id) {
                      <tr
                        class="h-14 border-b border-line-subtle last:border-0"
                        [class]="
                          f.tipo === 'invitacion' && f.i.caducada
                            ? 'bg-accent-deep/25'
                            : 'hover:bg-bg-raised/50'
                        "
                        [class.cursor-pointer]="f.tipo === 'miembro'"
                        (click)="f.tipo === 'miembro' && ficha(f.m)"
                      >
                        <td class="px-4">
                          <div class="flex items-center gap-3">
                            <span
                              class="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-deep/40 text-[12px] font-medium"
                              >{{
                                f.tipo === 'miembro' ? ini(f.m.nombre || f.m.email) : ini(f.i.email)
                              }}</span
                            >
                            <div class="min-w-0">
                              @if (f.tipo === 'miembro') {
                                <p class="truncate text-label-s">{{ f.m.nombre || f.m.email }}</p>
                                <p class="truncate text-body-xs text-text-tertiary">
                                  {{ f.m.email }}
                                </p>
                              } @else {
                                <p class="truncate text-label-s">{{ f.i.email }}</p>
                                <p class="truncate text-body-xs text-text-tertiary">
                                  invitada por {{ f.i.invitadoPor || 'Sistema' }}
                                </p>
                              }
                            </div>
                          </div>
                        </td>
                        <td class="px-4">
                          <gr-badge [tone]="tonoRol(rolDe(f))">{{ nombreRolDe(f) }}</gr-badge>
                        </td>
                        <td class="hidden px-4 text-text-secondary xl:table-cell">
                          {{ f.tipo === 'miembro' ? compsDe(f.m) : comps.current()?.nombreCorto }}
                        </td>
                        <td class="px-4">
                          @if (f.tipo === 'miembro') {
                            <gr-badge [tone]="f.m.dosFactores ? 'success' : 'warning'">{{
                              f.m.dosFactores ? 'Sí' : 'No'
                            }}</gr-badge>
                          } @else {
                            <span
                              class="inline-flex h-6 w-7 items-center justify-center rounded-xs bg-text-tertiary/14 text-text-tertiary"
                              >—</span
                            >
                          }
                        </td>
                        <td class="px-4 font-mono text-mono-s text-text-secondary">
                          {{ f.tipo === 'miembro' ? rel(f.m.ultimoAcceso) : '–' }}
                        </td>
                        <td class="px-4">
                          <gr-badge [tone]="estadoDe(f).tone">{{ estadoDe(f).l }}</gr-badge>
                        </td>
                        <td class="relative px-2 text-right" (click)="$event.stopPropagation()">
                          <button
                            type="button"
                            class="inline-flex size-9 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-raised hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]"
                            [attr.aria-label]="'Acciones de ' + etiqueta(f)"
                            aria-haspopup="menu"
                            [attr.aria-expanded]="menu() === f.id"
                            (click)="menu.set(menu() === f.id ? null : f.id)"
                          >
                            <gr-icon name="more" [size]="18" />
                          </button>
                          @if (menu() === f.id) {
                            <gr-popover
                              [etiqueta]="'Acciones de ' + etiqueta(f)"
                              (cerrar)="menu.set(null)"
                              ><ng-container
                                *ngTemplateOutlet="acciones; context: { $implicit: f }"
                            /></gr-popover>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
              <!-- 390/768: cards -->
              <ul class="flex flex-col gap-3 md:hidden">
                @for (f of filas(); track f.id) {
                  <li
                    class="relative flex flex-col gap-3 rounded-lg border p-4"
                    [class]="
                      f.tipo === 'invitacion' && f.i.caducada
                        ? 'border-accent/40 bg-accent-deep/25'
                        : 'border-line-subtle bg-bg-card'
                    "
                  >
                    <div class="flex items-start gap-3">
                      <span
                        class="flex size-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-deep/40 text-[13px] font-medium"
                        >{{
                          f.tipo === 'miembro' ? ini(f.m.nombre || f.m.email) : ini(f.i.email)
                        }}</span
                      >
                      <button
                        type="button"
                        class="min-w-0 flex-1 text-left"
                        [disabled]="f.tipo !== 'miembro'"
                        (click)="f.tipo === 'miembro' && ficha(f.m)"
                      >
                        <p class="truncate text-label-m">{{ etiqueta(f) }}</p>
                        <p class="truncate text-body-xs text-text-tertiary">
                          {{
                            f.tipo === 'miembro'
                              ? f.m.email
                              : 'invitada por ' + (f.i.invitadoPor || 'Sistema')
                          }}
                        </p>
                      </button>
                      <button
                        type="button"
                        class="-mt-1 -mr-1 inline-flex size-11 items-center justify-center rounded-sm text-text-secondary"
                        [attr.aria-label]="'Acciones de ' + etiqueta(f)"
                        aria-haspopup="menu"
                        (click)="menu.set(menu() === 'm' + f.id ? null : 'm' + f.id)"
                      >
                        <gr-icon name="more" [size]="18" />
                      </button>
                      @if (menu() === 'm' + f.id) {
                        <gr-popover
                          [etiqueta]="'Acciones de ' + etiqueta(f)"
                          (cerrar)="menu.set(null)"
                          ><ng-container *ngTemplateOutlet="acciones; context: { $implicit: f }"
                        /></gr-popover>
                      }
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <gr-badge [tone]="tonoRol(rolDe(f))">{{ nombreRolDe(f) }}</gr-badge>
                      <gr-badge [tone]="estadoDe(f).tone">{{ estadoDe(f).l }}</gr-badge>
                      @if (f.tipo === 'miembro') {
                        <gr-badge [tone]="f.m.dosFactores ? 'success' : 'warning'"
                          >2FA {{ f.m.dosFactores ? 'sí' : 'no' }}</gr-badge
                        >
                        <span class="ml-auto font-mono text-mono-xs text-text-tertiary">{{
                          rel(f.m.ultimoAcceso)
                        }}</span>
                      }
                    </div>
                  </li>
                }
              </ul>
            }
            @if (sin2fa().length) {
              <gr-alert
                tone="warning"
                [title]="
                  sin2fa().length === 1
                    ? '1 persona con permisos de mesa o taquilla sin 2FA'
                    : sin2fa().length + ' personas con permisos de mesa o taquilla sin 2FA'
                "
              >
                Recomendado para el día del evento; se puede exigir por rol en Roles y permisos.
                <button
                  alertAction
                  type="button"
                  class="mt-2 inline-flex items-center gap-1 text-label-s text-warning hover:underline"
                  (click)="ir('roles')"
                >
                  Exigir 2FA <gr-icon name="arrow-right" [size]="14" />
                </button>
              </gr-alert>
            }
          }

          @case ('roles') {
            <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[860px] text-body-s">
                <thead class="border-b border-line-subtle bg-bg-raised/40">
                  <tr class="h-12">
                    <th class="${th} w-[38%] pl-4">Permiso</th>
                    <th class="px-2 text-center text-label-s">Root</th>
                    @for (r of roles(); track r.slug) {
                      <th class="px-2 text-center text-label-s whitespace-nowrap">
                        <span class="inline-flex items-center gap-1"
                          >{{ r.nombre }}
                          @if (!r.sistema) {
                            <button
                              type="button"
                              class="inline-flex size-6 items-center justify-center rounded-xs text-text-tertiary hover:text-error"
                              [attr.aria-label]="'Borrar el rol ' + r.nombre"
                              (click)="borrarRol(r)"
                            >
                              <gr-icon name="trash" [size]="13" />
                            </button>
                          }
                        </span>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (g of permisos; track g.g) {
                    <tr class="h-8">
                      <td
                        [attr.colspan]="roles().length + 2"
                        class="px-4 pt-3 pb-1 text-mono-xs tracking-[0.06em] text-text-tertiary uppercase"
                      >
                        {{ g.g }}
                      </td>
                    </tr>
                    @for (p of g.items; track p.k) {
                      <tr class="h-11 border-t border-line-subtle">
                        <td class="px-4 py-1">
                          <p class="font-mono text-mono-s text-text-primary">{{ p.k }}</p>
                          <p class="text-body-xs text-text-tertiary">{{ p.d }}</p>
                        </td>
                        <td class="text-center">
                          <gr-icon
                            name="lock"
                            [size]="16"
                            class="inline-block text-text-tertiary"
                            label="Root: todos los permisos"
                          />
                        </td>
                        @for (r of roles(); track r.slug) {
                          <td class="text-center">
                            @if (tiene(r, p.k)) {
                              <button
                                type="button"
                                class="inline-flex h-8 w-11 items-center justify-center rounded-sm border border-success/30 bg-success/15 text-success disabled:cursor-default"
                                [disabled]="r.bloqueado"
                                [attr.aria-pressed]="true"
                                [attr.aria-label]="p.k + ' · ' + r.nombre + ': concedido'"
                                (click)="alternar(r, p.k)"
                              >
                                <gr-icon name="check" [size]="16" />
                              </button>
                            } @else if (heredado(r, p.k)) {
                              <button
                                type="button"
                                class="inline-flex h-8 w-11 items-center justify-center rounded-sm border border-dashed border-line-strong text-text-secondary"
                                [attr.aria-pressed]="false"
                                [attr.aria-label]="
                                  p.k + ' · ' + r.nombre + ': heredado de ' + heredadoDe(r, p.k)
                                "
                                [title]="'Heredado de ' + heredadoDe(r, p.k)"
                                (click)="alternar(r, p.k)"
                              >
                                <gr-icon name="check" [size]="16" />
                              </button>
                            } @else {
                              <button
                                type="button"
                                class="inline-flex h-8 w-11 items-center justify-center rounded-sm text-text-muted hover:bg-bg-raised"
                                [attr.aria-pressed]="false"
                                [attr.aria-label]="p.k + ' · ' + r.nombre + ': no concedido'"
                                (click)="alternar(r, p.k)"
                              >
                                —
                              </button>
                            }
                          </td>
                        }
                      </tr>
                    }
                  }
                  <tr class="h-12 border-t border-line-strong bg-bg-raised/30">
                    <td class="px-4 py-1">
                      <p class="text-label-s">Exigir 2FA</p>
                      <p class="text-body-xs text-text-tertiary">
                        Sin verificación en dos pasos no tienen acceso
                      </p>
                    </td>
                    <td class="text-center">
                      <gr-icon name="lock" [size]="16" class="inline-block text-text-tertiary" />
                    </td>
                    @for (r of roles(); track r.slug) {
                      <td class="text-center">
                        <label class="inline-flex h-11 items-center justify-center"
                          ><input
                            type="checkbox"
                            class="size-5 rounded-2xs accent-[#C42B3E]"
                            [checked]="r.exige2fa"
                            (change)="exigir(r, $any($event.target))"
                            [attr.aria-label]="'Exigir 2FA a ' + r.nombre"
                        /></label>
                      </td>
                    }
                  </tr>
                </tbody>
              </table>
            </section>
            <p class="text-body-xs text-text-tertiary">
              Root siempre tiene todo. Borde discontinuo = heredado (concedido por otro permiso):
              entradas.gestionar → checkin.escanear · contactos.exportar → contactos.ver ·
              web.publicar → web.editar. Los permisos de Admin no se editan.
            </p>
          }

          @case ('invitaciones') {
            @if (!invitaciones().length) {
              <gr-empty
                icon="mail"
                title="No hay invitaciones pendientes"
                text="Las invitaciones caducan a los 7 días; las caducadas se pueden reenviar desde aquí."
                ><button grButton variant="primary" (click)="abrirInvitar()">
                  Invitar persona
                </button></gr-empty
              >
            } @else {
              <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
                <table class="w-full min-w-[680px] text-body-s">
                  <thead class="border-b border-line-subtle">
                    <tr>
                      <th class="${th}">Email</th>
                      <th class="${th}">Rol</th>
                      <th class="${th}">Invitada por</th>
                      <th class="${th}">Caduca</th>
                      <th class="${th}">Estado</th>
                      <th class="${th}"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (i of invitaciones(); track i.id) {
                      <tr
                        class="h-14 border-b border-line-subtle last:border-0"
                        [class.bg-accent-deep/25]="i.caducada"
                      >
                        <td class="px-4">{{ i.email }}</td>
                        <td class="px-4">
                          <gr-badge [tone]="tonoRol(i.rolSlug)">{{ i.rolNombre }}</gr-badge>
                        </td>
                        <td class="px-4 text-text-secondary">{{ i.invitadoPor || 'Sistema' }}</td>
                        <td class="px-4 font-mono text-mono-s text-text-secondary">
                          {{ i.caducada ? 'caducó ' + rel(i.expiresAt) : caduca(i.expiresAt) }}
                        </td>
                        <td class="px-4">
                          <gr-badge [tone]="i.caducada ? 'danger' : 'info'">{{
                            i.caducada ? 'Invitación caducada' : 'Invitado'
                          }}</gr-badge>
                        </td>
                        <td class="px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            class="h-11 px-2 text-label-s text-accent-text hover:underline"
                            (click)="reenviar(i)"
                          >
                            Reenviar</button
                          ><button
                            type="button"
                            class="h-11 px-2 text-label-s text-text-secondary hover:text-error"
                            (click)="revocar(i)"
                          >
                            Revocar
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            }
          }
        }
      }
    </div>

    <ng-template #acciones let-f>
      <div class="flex flex-col md:-m-2" role="menu">
        @if (f.tipo === 'miembro') {
          <button
            type="button"
            role="menuitem"
            class="${menuItem}"
            (click)="menu.set(null); ficha(f.m)"
          >
            <gr-icon name="user" [size]="16" />Ver ficha
          </button>
          @if (f.m.usuarioId !== yo()) {
            <button
              type="button"
              role="menuitem"
              class="${menuItem}"
              (click)="menu.set(null); suspender(f.m)"
            >
              <gr-icon [name]="f.m.estado === 'suspendido' ? 'play' : 'pause'" [size]="16" />{{
                f.m.estado === 'suspendido' ? 'Reactivar' : 'Suspender'
              }}…
            </button>
          }
          <button
            type="button"
            role="menuitem"
            class="${menuItem} text-error"
            (click)="menu.set(null); quitar(f.m)"
          >
            <gr-icon name="trash" [size]="16" />Quitar del equipo…
          </button>
        } @else {
          <button
            type="button"
            role="menuitem"
            class="${menuItem}"
            (click)="menu.set(null); reenviar(f.i)"
          >
            <gr-icon name="send" [size]="16" />Reenviar invitación
          </button>
          <button
            type="button"
            role="menuitem"
            class="${menuItem} text-error"
            (click)="menu.set(null); revocar(f.i)"
          >
            <gr-icon name="x" [size]="16" />Revocar
          </button>
        }
      </div>
    </ng-template>

    @if (invitarOpen()) {
      <div
        class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4"
        (click)="invitarOpen.set(false)"
        (keydown.escape)="invitarOpen.set(false)"
      >
        <form
          class="flex w-full max-w-[520px] flex-col gap-4 rounded-t-2xl border border-line-strong bg-bg-card p-6 shadow-card sm:rounded-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inv-t"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
          (ngSubmit)="invitar()"
        >
          <div class="flex items-start gap-3">
            <h2 id="inv-t" class="min-w-0 flex-1 text-[20px] leading-[26px] font-semibold">
              Invitar persona
            </h2>
            <button
              type="button"
              class="-m-1 rounded-xs p-1 text-text-tertiary hover:text-text-primary"
              aria-label="Cerrar"
              (click)="invitarOpen.set(false)"
            >
              <gr-icon name="x" [size]="18" />
            </button>
          </div>
          <p class="text-body-s text-text-secondary">
            Si ya tiene cuenta entra directamente; si no, recibe un email de invitación que caduca
            en 7 días.
          </p>
          <gr-field label="Email" for="inv-email" [error]="invError()"
            ><input
              grInput
              id="inv-email"
              type="email"
              name="email"
              autocomplete="off"
              [(ngModel)]="inv.email"
              [invalid]="!!invError()"
          /></gr-field>
          <gr-field label="Rol" for="inv-rol"
            ><gr-select id="inv-rol" name="rol" [(ngModel)]="inv.rol">
              @for (r of roles(); track r.slug) {
                <option [value]="r.slug">{{ r.nombre }}</option>
              }
            </gr-select></gr-field
          >
          @if (rolInv(); as r) {
            <p class="-mt-2 text-body-xs text-text-tertiary">
              {{
                r.slug === 'admin'
                  ? 'Todos los permisos.'
                  : r.permisos.length
                    ? 'Puede: ' + r.permisos.join(', ')
                    : 'Sin permisos todavía.'
              }}
              @if (r.exige2fa) {
                · exige 2FA
              }
            </p>
          }
          <div class="mt-2 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="invitarOpen.set(false)">
              Cancelar</button
            ><button
              type="submit"
              grButton
              variant="primary"
              [loading]="enviando()"
              [disabled]="!inv.rol"
            >
              Invitar
            </button>
          </div>
        </form>
      </div>
    }

    @if (duplicarOpen()) {
      <div
        class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4"
        (click)="duplicarOpen.set(false)"
        (keydown.escape)="duplicarOpen.set(false)"
      >
        <form
          class="flex w-full max-w-[520px] flex-col gap-4 rounded-t-2xl border border-line-strong bg-bg-card p-6 shadow-card sm:rounded-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dup-t"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
          (ngSubmit)="duplicar()"
        >
          <div class="flex items-start gap-3">
            <h2 id="dup-t" class="min-w-0 flex-1 text-[20px] leading-[26px] font-semibold">
              Duplicar rol
            </h2>
            <button
              type="button"
              class="-m-1 rounded-xs p-1 text-text-tertiary hover:text-text-primary"
              aria-label="Cerrar"
              (click)="duplicarOpen.set(false)"
            >
              <gr-icon name="x" [size]="18" />
            </button>
          </div>
          <p class="text-body-s text-text-secondary">
            Crea un rol a medida con los permisos de otro y ajústalo después en la matriz.
          </p>
          <gr-field label="Copiar de" for="dup-de"
            ><gr-select id="dup-de" name="de" [(ngModel)]="dup.de">
              @for (r of roles(); track r.slug) {
                <option [value]="r.slug">{{ r.nombre }}</option>
              }
            </gr-select></gr-field
          >
          <gr-field label="Nombre del rol nuevo" for="dup-nombre"
            ><input
              grInput
              id="dup-nombre"
              name="nombre"
              maxlength="60"
              placeholder="Juez / Mesa"
              [(ngModel)]="dup.nombre"
          /></gr-field>
          <div class="mt-2 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="duplicarOpen.set(false)">
              Cancelar</button
            ><button
              type="submit"
              grButton
              variant="primary"
              [loading]="enviando()"
              [disabled]="dup.nombre.trim().length < 2 || !slugDe(dup.nombre)"
            >
              Crear rol
            </button>
          </div>
        </form>
      </div>
    }

    @if (ultimoAdmin(); as u) {
      <div
        class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4"
        (click)="ultimoAdmin.set(null)"
        (keydown.escape)="ultimoAdmin.set(null)"
      >
        <div
          class="flex w-full max-w-[520px] flex-col gap-5 rounded-t-2xl border border-line-strong bg-bg-card p-6 shadow-card sm:rounded-xl"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ua-t"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start gap-3">
            <h2 id="ua-t" class="min-w-0 flex-1 text-[20px] leading-[26px] font-semibold">
              {{ u.yo ? 'Eres el último Admin de ' : u.nombre + ' es el último Admin de '
              }}{{ comps.current()?.nombreCorto }}
            </h2>
            <button
              type="button"
              class="-m-1 rounded-xs p-1 text-text-tertiary hover:text-text-primary"
              aria-label="Cerrar"
              (click)="ultimoAdmin.set(null)"
            >
              <gr-icon name="x" [size]="18" />
            </button>
          </div>
          <gr-alert tone="danger" icon="circle-x" title="Conflicto de versión (409)"
            >Asigna el rol de Admin a otra persona antes de
            {{ u.yo ? 'cambiar el tuyo' : 'cambiar el suyo' }} (evita competiciones sin
            responsable).</gr-alert
          >
          <div class="flex justify-end gap-2">
            <button grButton (click)="ultimoAdmin.set(null)">Cancelar</button
            ><button grButton variant="danger" (click)="ultimoAdmin.set(null)">Entendido</button>
          </div>
        </div>
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
  protected readonly ini = iniciales;
  protected readonly tonoRol = tonoRol;
  protected readonly tabs = [
    { v: 'miembros' as const, l: 'Miembros' },
    { v: 'roles' as const, l: 'Roles y permisos' },
    { v: 'invitaciones' as const, l: 'Invitaciones' },
  ];
  protected readonly tab = signal<Tab>(this.tabInicial());
  protected readonly miembros = signal<Miembro[] | null>(null);
  protected readonly roles = signal<Rol[]>([]);
  private readonly heredados = signal<Record<string, string[]>>({});
  private readonly rolesBase = signal('');
  protected readonly invitaciones = signal<Invitacion[]>([]);
  protected readonly error = signal('');
  protected readonly menu = signal<string | null>(null);
  protected readonly invitarOpen = signal(false);
  protected readonly duplicarOpen = signal(false);
  protected readonly guardando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly invError = signal<string | null>(null);
  protected readonly ultimoAdmin = signal<{ yo: boolean; nombre: string } | null>(null);
  protected inv = { email: '', rol: 'staff' };
  protected dup = { de: 'staff', nombre: '' };
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly yo = computed(() => this.auth.user()?.id ?? '');
  protected readonly rolCambiado = computed(
    () =>
      JSON.stringify(this.roles().map((r) => [r.slug, [...r.permisos].sort()])) !==
      this.rolesBase(),
  );
  protected readonly filas = computed<Fila[]>(() => [
    ...(this.miembros() ?? []).map((m) => ({ tipo: 'miembro' as const, id: m.usuarioId, m })),
    ...this.invitaciones().map((i) => ({ tipo: 'invitacion' as const, id: i.id, i })),
  ]);
  /** Active members whose role holds a desk or door permission and have no 2FA (Figma alert). */
  protected readonly sin2fa = computed(() =>
    (this.miembros() ?? []).filter((m) => {
      const r = this.roles().find((x) => x.slug === m.rolSlug);
      return (
        m.estado === 'activo' &&
        !m.dosFactores &&
        !!r &&
        !r.bloqueado &&
        PERMISOS_DIA.some((p) => this.tiene(r, p) || this.heredado(r, p))
      );
    }),
  );
  protected readonly rolInv = computed(
    () => this.roles().find((r) => r.slug === this.inv.rol) ?? null,
  );

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
    // live: someone else changes the team, a role or accepts an invitation
    const live = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('identity.') && !this.guardando() && !this.rolCambiado())
        void this.cargar(true);
    });
    inject(DestroyRef).onDestroy(() => live.unsubscribe());
  }

  private tabInicial(): Tab {
    const t = this.route.snapshot.queryParamMap.get('tab');
    return t === 'roles' || t === 'invitaciones' ? t : 'miembros';
  }
  private u(): string {
    return `/api/competition/${this.cid()}`;
  }
  private inv_(): string {
    return `/api/admin/competiciones/${this.cid()}/equipo/invitaciones`;
  }

  async cargar(silencioso = false): Promise<void> {
    if (!silencioso) this.error.set('');
    try {
      const [m, r, i] = await Promise.all([
        firstValueFrom(this.http.get<Miembro[]>(`${this.u()}/users`)),
        firstValueFrom(this.http.get<RolesResp>(`${this.u()}/roles`)),
        firstValueFrom(this.http.get<Invitacion[]>(this.inv_())),
      ]);
      this.miembros.set(m);
      this.roles.set(r.roles);
      this.heredados.set(r.heredados ?? {});
      this.rolesBase.set(JSON.stringify(r.roles.map((x) => [x.slug, [...x.permisos].sort()])));
      this.invitaciones.set(i);
    } catch (e) {
      if (!silencioso) this.error.set(errText(e, 'Comprueba la conexión y vuelve a intentarlo.'));
    }
  }

  protected ir(t: Tab): void {
    this.tab.set(t);
    void this.router.navigate([], {
      queryParams: { tab: t === 'miembros' ? null : t },
      replaceUrl: true,
    });
  }
  protected cuenta(t: Tab): number {
    return t === 'miembros'
      ? this.filas().length
      : t === 'roles'
        ? this.roles().length + 1
        : this.invitaciones().length;
  }
  protected etiqueta(f: Fila): string {
    return f.tipo === 'miembro' ? f.m.nombre || f.m.email : f.i.email;
  }
  protected rolDe(f: Fila): string {
    return f.tipo === 'miembro' ? f.m.rolSlug : f.i.rolSlug;
  }
  protected nombreRolDe(f: Fila): string {
    return f.tipo === 'miembro' ? f.m.rolNombre : f.i.rolNombre;
  }
  protected estadoDe(f: Fila): { l: string; tone: 'success' | 'danger' | 'info' | 'warning' } {
    if (f.tipo === 'invitacion')
      return f.i.caducada
        ? { l: 'Invitación caducada', tone: 'danger' }
        : { l: 'Invitado', tone: 'info' };
    return f.m.estado === 'activo'
      ? { l: 'Activo', tone: 'success' }
      : { l: 'Suspendido', tone: 'warning' };
  }
  /** Competitions of the member that I can see, by short name («GR Cup · FER»). */
  protected compsDe(m: Miembro): string {
    const names = m.competiciones
      .map((id) => this.comps.list().find((c) => c.id === id)?.nombreCorto)
      .filter(Boolean);
    return names.length ? names.join(' · ') : (this.comps.current()?.nombreCorto ?? '');
  }
  protected caduca(iso: string): string {
    const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
    return d <= 1 ? 'mañana' : `en ${d} días`;
  }

  // ---- matrix ----
  protected tiene(r: Rol, k: string): boolean {
    return r.permisos.includes(k);
  }
  protected heredadoDe(r: Rol, k: string): string {
    return (
      Object.entries(this.heredados()).find(
        ([p, imp]) => imp.includes(k) && r.permisos.includes(p),
      )?.[0] ?? ''
    );
  }
  protected heredado(r: Rol, k: string): boolean {
    return !!this.heredadoDe(r, k);
  }
  protected alternar(r: Rol, k: string): void {
    if (r.bloqueado) return;
    this.roles.update((l) =>
      l.map((x) =>
        x.slug === r.slug
          ? {
              ...x,
              permisos: x.permisos.includes(k)
                ? x.permisos.filter((p) => p !== k)
                : [...x.permisos, k],
            }
          : x,
      ),
    );
  }
  private put(r: Rol, body: object): Promise<Rol> {
    return firstValueFrom(
      this.http.put<Rol>(`${this.u()}/roles/${r.slug}`, body, {
        headers: new HttpHeaders({ 'If-Match': `W/"${r.version}"` }),
      }),
    );
  }
  protected async guardarRoles(): Promise<void> {
    const base = new Map(
      (JSON.parse(this.rolesBase()) as [string, string[]][]).map(([s, p]) => [
        s,
        JSON.stringify(p),
      ]),
    );
    this.guardando.set(true);
    try {
      let n = 0;
      for (const r of this.roles()) {
        if (r.bloqueado || base.get(r.slug) === JSON.stringify([...r.permisos].sort())) continue;
        await this.put(r, { permisos: r.permisos });
        n++;
      }
      this.toasts.success(
        n === 1 ? 'Permisos guardados' : `Permisos de ${n} roles guardados`,
        'Se aplican en su próximo acceso (máx. 15 min) · queda en auditoría',
      );
      await this.cargar();
    } catch (e) {
      const p = problemOf(e);
      this.toasts.error(
        p.code === 'CONFLICTO_EDICION' ? 'Otra persona cambió un rol' : 'No se pudo guardar',
        p.code === 'CONFLICTO_EDICION'
          ? 'Hemos recargado la matriz: revisa y guarda otra vez.'
          : errText(e),
      );
      if (p.code === 'CONFLICTO_EDICION') await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }
  protected async exigir(r: Rol, el: HTMLInputElement): Promise<void> {
    const on = el.checked;
    if (
      on &&
      !(await this.confirm.ask({
        title: `¿Exigir 2FA a ${r.nombre}?`,
        text: `Quien tenga este rol y no haya activado la verificación en dos pasos pierde el acceso a ${this.comps.current()?.nombreCorto} hasta activarla.`,
        confirm: 'Exigir 2FA',
      }))
    ) {
      el.checked = r.exige2fa;
      return;
    }
    try {
      const nuevo = await this.put(r, { exige2fa: on });
      this.roles.update((l) =>
        l.map((x) =>
          x.slug === r.slug ? { ...x, exige2fa: nuevo.exige2fa, version: nuevo.version } : x,
        ),
      );
      this.toasts.success(on ? `2FA obligatorio para ${r.nombre}` : `${r.nombre} ya no exige 2FA`);
    } catch (e) {
      el.checked = r.exige2fa;
      this.toasts.error('No se pudo cambiar', errText(e));
      await this.cargar();
    }
  }
  protected slugDe(n: string): string {
    return n
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }
  protected async duplicar(): Promise<void> {
    const nombre = this.dup.nombre.trim();
    this.enviando.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.u()}/roles`, {
          slug: this.slugDe(nombre),
          nombre,
          duplicarDe: this.dup.de,
        }),
      );
      this.toasts.success(`Rol «${nombre}» creado`, 'Ajusta sus permisos en la matriz y guarda.');
      this.duplicarOpen.set(false);
      this.dup = { de: 'staff', nombre: '' };
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo crear el rol', errText(e));
    } finally {
      this.enviando.set(false);
    }
  }
  protected async borrarRol(r: Rol): Promise<void> {
    if (
      !(await this.confirm.ask({
        title: `¿Borrar el rol ${r.nombre}?`,
        text: 'Solo se pueden borrar roles a medida sin miembros.',
        confirm: 'Borrar',
        danger: true,
      }))
    )
      return;
    try {
      await firstValueFrom(this.http.delete(`${this.u()}/roles/${r.slug}`));
      this.toasts.success(`Rol «${r.nombre}» borrado`);
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo borrar', errText(e));
    }
  }

  // ---- members ----
  protected ficha(m: Miembro): void {
    void this.router.navigate([m.usuarioId], { relativeTo: this.route });
  }
  private async patch(m: Miembro, b: Record<string, string>, ok: string): Promise<void> {
    try {
      await firstValueFrom(this.http.patch<Miembro>(`${this.u()}/users/${m.usuarioId}`, b));
      this.toasts.success(ok);
      await this.cargar();
    } catch (e) {
      this.fallo(e, m);
    }
  }
  private fallo(e: unknown, m: Miembro): void {
    if (problemOf(e).code === 'ULTIMO_ADMIN')
      this.ultimoAdmin.set({ yo: m.usuarioId === this.yo(), nombre: m.nombre || m.email });
    else this.toasts.error('No se pudo cambiar', errText(e));
  }
  protected async suspender(m: Miembro): Promise<void> {
    const sus = m.estado !== 'suspendido';
    if (
      sus &&
      !(await this.confirm.ask({
        title: `¿Suspender a ${m.nombre || m.email}?`,
        text: 'Pierde el acceso al momento y se cierran sus sesiones. Puedes reactivarlo después.',
        confirm: 'Suspender',
        danger: true,
      }))
    )
      return;
    await this.patch(
      m,
      { estado: sus ? 'suspendido' : 'activo' },
      sus ? `${m.nombre || m.email} suspendido` : `${m.nombre || m.email} reactivado`,
    );
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
      await firstValueFrom(this.http.delete(`${this.u()}/users/${m.usuarioId}`));
      this.toasts.success(`${m.nombre || m.email} ya no está en el equipo`);
      await this.cargar();
    } catch (e) {
      this.fallo(e, m);
    }
  }

  // ---- invitations ----
  protected abrirInvitar(): void {
    this.inv = {
      email: '',
      rol: this.roles().some((r) => r.slug === 'staff') ? 'staff' : (this.roles()[0]?.slug ?? ''),
    };
    this.invError.set(null);
    this.invitarOpen.set(true);
  }
  protected async invitar(): Promise<void> {
    const email = this.inv.email.trim().toLowerCase();
    this.invError.set(
      !email
        ? 'Escribe el email'
        : !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)
          ? 'Falta el dominio (.com, .es…)'
          : null,
    );
    if (this.invError()) return;
    this.enviando.set(true);
    try {
      const r = await firstValueFrom(
        this.http.post<{ resultado: string }>(`${this.u()}/users`, {
          email,
          rolSlug: this.inv.rol,
        }),
      );
      const rol = this.rolInv()?.nombre ?? this.inv.rol;
      if (r.resultado === 'miembro')
        this.toasts.success(
          `${email} ya tenía cuenta: añadido al equipo`,
          `Rol ${rol} · no hace falta invitación`,
        );
      else this.toasts.info(`Invitación enviada a ${email}`, `Caduca en 7 días · rol ${rol}`);
      this.invitarOpen.set(false);
      await this.cargar();
    } catch (e) {
      this.invError.set(errText(e, 'No se pudo invitar.'));
    } finally {
      this.enviando.set(false);
    }
  }
  protected async reenviar(i: Invitacion): Promise<void> {
    try {
      await firstValueFrom(this.http.post(this.inv_(), { email: i.email, rolSlug: i.rolSlug }));
      this.toasts.info(
        `Invitación reenviada a ${i.email}`,
        `Caduca en 7 días · rol ${i.rolNombre}`,
      );
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo reenviar', errText(e));
    }
  }
  protected async revocar(i: Invitacion): Promise<void> {
    if (
      !(await this.confirm.ask({
        title: `¿Revocar la invitación a ${i.email}?`,
        text: 'El enlace del email deja de funcionar.',
        confirm: 'Revocar',
        danger: true,
      }))
    )
      return;
    try {
      await firstValueFrom(this.http.delete(`${this.inv_()}/${i.id}`));
      this.toasts.success('Invitación revocada');
      await this.cargar();
    } catch (e) {
      this.toasts.error('No se pudo revocar', errText(e));
    }
  }
}
