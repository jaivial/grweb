import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrPopover, GrSkeleton, GrToasts, fmtNumber, fmtShortDate } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { BoPageHeader, Confirm, errText } from '../../shared/ui';
import { FormulariosApi, type FormularioResumen } from './api';
import { ESTADOS_FORMULARIO } from './catalogo';

/** «Formularios · lista»: forms of the edition (fields, answers and sending live in the editor). */
@Component({
  selector: 'bo-formularios',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, BoPageHeader, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrPopover, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-44 md:pb-24">
      <ng-template #acciones>
        @if (puedeEditar()) { <span class="hidden md:block"><button grButton variant="primary" icon="plus" (click)="nueva.set(true)">Nuevo formulario</button></span> }
      </ng-template>
      <bo-page-header title="Formularios" subtitle="Preguntas para atletas y tutores por email o WhatsApp, con enlace a la web para rellenarlos" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Formularios']">
        <ng-container actions><ng-container *ngTemplateOutlet="acciones" /></ng-container>
      </bo-page-header>

      @if (lista(); as l) {
        @if (l.length) { <p class="text-body-xs text-text-tertiary">{{ l.length }} {{ l.length === 1 ? 'formulario' : 'formularios' }}</p> }
      }
      @if (lista() === null) { <gr-alert tone="danger" title="No hemos podido cargar los formularios"><button grButton size="s" (click)="cargar()">Reintentar</button></gr-alert> }
      @else if (lista() === undefined) { <gr-skeleton class="h-72 rounded-lg" /> }
      @else if (!lista()!.length) {
        <gr-empty icon="file-text" title="Aún no hay formularios"><span class="block">Crea uno para recoger datos de atletas o tutores: tallas, autorizaciones, preferencias o documentos.</span>
          @if (puedeEditar()) { <span class="mt-4 flex"><button grButton variant="primary" (click)="nueva.set(true)">Nuevo formulario</button></span> }</gr-empty>
      } @else {
        <ul class="divide-y divide-line-subtle rounded-lg border border-line-subtle bg-bg-card">
          @for (f of lista()!; track f.id) {
            <li class="relative flex items-start md:items-center">
              <a [routerLink]="['/', comps.current()?.slug, 'formularios', f.id]" class="flex min-w-0 flex-1 flex-col gap-3 py-4 pl-4 pr-1 hover:bg-bg-raised/60 md:flex-row md:items-center md:gap-5">
                <span class="hidden size-9 shrink-0 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text md:flex"><gr-icon name="file-text" [size]="16" /></span>
                <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ f.nombre }}</span>@if (f.titulo && f.titulo !== f.nombre) { <span class="block truncate text-body-xs text-text-tertiary">{{ f.titulo }}</span> }</span>
                <span class="flex flex-wrap items-center gap-1.5">
                  <gr-badge [tone]="est[f.estado].tone">{{ est[f.estado].l }}</gr-badge>
                  @if (f.soloWeb) { <gr-badge tone="info">Solo web</gr-badge> }
                </span>
                <span class="w-full md:w-48">
                  <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-raised"><span class="block h-full rounded-pill bg-accent" [style.width.%]="porcentaje(f)"></span></span>
                  <span class="mt-1 block font-mono text-mono-xs text-text-tertiary">{{ n(f.completas) }} / {{ n(f.destinatarios) }} completas · {{ porcentaje(f) }} %</span>
                </span>
                <span class="hidden w-28 shrink-0 font-mono text-mono-xs text-text-muted lg:block">{{ fecha(f.actualizadoAt) }}</span>
              </a>
              @if (puedeEditar()) {
                <span class="relative shrink-0 px-2 pt-3 md:pt-0">
                  <button type="button" class="flex size-9 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary" [attr.aria-label]="'Acciones de ' + f.nombre" [attr.aria-expanded]="menu() === f.id" (click)="menu.set(menu() === f.id ? null : f.id)"><gr-icon name="more" [size]="16" /></button>
                  @if (menu() === f.id) {
                    <gr-popover etiqueta="Acciones del formulario" (cerrar)="menu.set(null)">
                      <a grButton variant="ghost" icon="pencil" [routerLink]="['/', comps.current()?.slug, 'formularios', f.id]">Abrir el editor</a>
                      <button grButton variant="ghost" icon="copy" (click)="duplicar(f)">Duplicar</button>
                      <button grButton variant="danger" icon="trash" (click)="borrar(f)">Eliminar</button>
                    </gr-popover>
                  }
                </span>
              }
            </li>
          }
        </ul>
      }
    </div>
    @if (puedeEditar()) {
      <div class="fixed inset-x-0 bottom-[calc(61px+max(env(safe-area-inset-bottom),20px))] z-30 border-t border-line-subtle bg-bg-deep/95 px-4 py-3 md:hidden"><button grButton variant="primary" icon="plus" class="w-full" (click)="nueva.set(true)">Nuevo formulario</button></div>
    }
    @if (nueva()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="nueva.set(false)" (keydown.escape)="nueva.set(false)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Nuevo formulario" (click)="$event.stopPropagation()" (ngSubmit)="crear()">
          <h2 class="text-ui-h5">Nuevo formulario</h2>
          <gr-field label="Nombre interno" class="mt-4" hint="Solo lo ve el equipo"><input grInput name="nombre" [(ngModel)]="nombre" maxlength="160" placeholder="Autorización y tallas 2026" autofocus /></gr-field>
          <div class="mt-6 flex justify-end gap-2"><button type="button" grButton variant="ghost" (click)="nueva.set(false)">Cancelar</button><button type="submit" grButton variant="primary" [loading]="creando()" [disabled]="!nombre.trim()">Crear y diseñar</button></div>
        </form>
      </div>
    }
  `,
})
export class FormulariosPage {
  private readonly api = inject(FormulariosApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly router = inject(Router);
  private readonly confirm = inject(Confirm);
  protected readonly lista = signal<FormularioResumen[] | null | undefined>(undefined);
  protected readonly nueva = signal(false);
  protected readonly creando = signal(false);
  protected readonly menu = signal<string | null>(null);
  protected nombre = '';
  protected readonly est = ESTADOS_FORMULARIO;
  protected readonly n = fmtNumber;
  protected readonly fecha = fmtShortDate;
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puedeEditar = computed(() => this.auth.can(this.cid(), 'atletas.editar'));

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
    inject(DestroyRef).onDestroy(() => this.menu.set(null));
  }

  async cargar(): Promise<void> {
    try {
      this.lista.set(await this.api.lista(this.cid()));
    } catch {
      this.lista.set(null);
    }
  }

  protected porcentaje(f: FormularioResumen): number {
    return f.destinatarios ? Math.round((f.completas * 100) / f.destinatarios) : 0;
  }

  protected async crear(): Promise<void> {
    this.creando.set(true);
    try {
      const f = await this.api.crear(this.cid(), this.nombre.trim());
      void this.router.navigate(['/', this.comps.current()?.slug, 'formularios', f.id]);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo crear.'));
    } finally {
      this.creando.set(false);
    }
  }

  protected async duplicar(f: FormularioResumen): Promise<void> {
    this.menu.set(null);
    try {
      const d = await this.api.duplicar(this.cid(), f.id);
      this.toasts.success('Formulario duplicado');
      void this.router.navigate(['/', this.comps.current()?.slug, 'formularios', d.id]);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo duplicar.'));
    }
  }

  protected async borrar(f: FormularioResumen): Promise<void> {
    this.menu.set(null);
    const ok = await this.confirm.ask({
      title: `¿Eliminar «${f.nombre}»?`,
      text: 'Se borran el diseño y sus respuestas. Los formularios con envíos no se pueden eliminar: ciérralos.',
      confirm: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.borrar(this.cid(), f.id);
      this.toasts.success('Formulario eliminado');
      await this.cargar();
    } catch (e) {
      // 409: the form already has sends. The server's message says so; errText never shows raw English.
      this.toasts.error(errText(e, 'No se pudo eliminar.'));
    }
  }
}
