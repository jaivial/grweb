import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { GrIcon, type GrIconName, type GrTone } from '@grcup/ui';

/** Figma 50 «Mapa de estados»: one table so each domain state gets the same badge tone everywhere (BO and public web). */
export const BO_ESTADOS: Record<string, [string, GrTone][]> = {
  'Atleta (inscripción AEP)': [['Confirmado', 'success'], ['Reserva', 'info'], ['Baja', 'neutral'], ['Sin categoría', 'warning'], ['Descalificado', 'danger']],
  Entrada: [['Reservada', 'info'], ['Usada', 'success'], ['Lista de espera', 'warning'], ['Anulada', 'neutral'], ['Sobreventa', 'danger']],
  'Email (outbox)': [['Enviado', 'success'], ['En cola', 'info'], ['Reintentando', 'warning'], ['Rebotado', 'danger'], ['Cancelado', 'neutral']],
  Consentimiento: [['Confirmado', 'success'], ['Pendiente DOI', 'warning'], ['Revocado', 'danger'], ['Caducado', 'neutral']],
  Publicación: [['Borrador', 'neutral'], ['Programado', 'info'], ['Publicado', 'success'], ['Cambios sin publicar', 'warning'], ['Error', 'danger']],
  Directo: [['En directo', 'live'], ['Pausa técnica', 'warning'], ['Finalizado', 'neutral']],
};

export type BoDevice = 'desktop' | 'tablet' | 'mobile';
const DEV: [BoDevice, GrIconName, string][] = [['desktop', 'monitor', 'Escritorio'], ['tablet', 'tablet', 'Tablet'], ['mobile', 'smartphone', 'Móvil']];

/** Figma 50 «BO / Device switch»: canvas width (Escritorio 600 · Tablet 768 · Móvil 390); only the active one shows its label. */
@Component({
  selector: 'bo-device-switch',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex h-[42px] items-center gap-1 rounded-sm border border-line-subtle bg-bg-field p-1', role: 'radiogroup', 'aria-label': 'Dispositivo' },
  template: `
    @for (d of devs; track d[0]) {
      <button type="button" role="radio" [attr.aria-checked]="value() === d[0]" [attr.aria-label]="d[2]" (click)="value.set(d[0])" class="flex h-8 items-center gap-1.5 rounded-xs px-2 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#7c5cff] motion-reduce:transition-none"
        [class]="value() === d[0] ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary hover:text-text-primary'"><gr-icon [name]="d[1]" [size]="16" />@if (value() === d[0]) { {{ d[2] }} }</button>
    }
  `,
})
export class BoDeviceSwitch {
  readonly value = model<BoDevice>('desktop');
  protected readonly devs = DEV;
}

export type BoEditorMode = 'design' | 'preview' | 'html';
const MODES: [BoEditorMode, GrIconName, string][] = [['design', 'pen-tool', 'Diseño'], ['preview', 'eye', 'Vista previa'], ['html', 'code', 'HTML']];

/** Figma 50 «BO / Editor toolbar»: panel · mode · device · undo/redo (Ctrl+Z / Ctrl+Shift+Z) · zoom · AI assistant. */
@Component({
  selector: 'bo-editor-toolbar',
  imports: [GrIcon, BoDeviceSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-center gap-2 border-b border-line-subtle bg-bg-base px-3 py-2', role: 'toolbar', 'aria-label': 'Editor' },
  template: `
    <button type="button" class="flex size-8 items-center justify-center rounded-sm bg-[#7c5cff]/20 text-[#b9a8ff]" [attr.aria-pressed]="panel()" aria-label="Panel izquierdo" (click)="panel.set(!panel())"><gr-icon name="panel-left" [size]="16" /></button>
    <div class="inline-flex h-[42px] items-center gap-1 rounded-sm border border-line-subtle bg-bg-field p-1" role="radiogroup" aria-label="Modo">
      @for (m of modes; track m[0]) {
        <button type="button" role="radio" [attr.aria-checked]="mode() === m[0]" (click)="mode.set(m[0])" class="flex h-8 items-center gap-1.5 rounded-xs px-2 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#7c5cff] motion-reduce:transition-none"
          [class]="mode() === m[0] ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary hover:text-text-primary'"><gr-icon [name]="m[1]" [size]="14" />{{ m[2] }}</button>
      }
    </div>
    <bo-device-switch [(value)]="device" />
    <span class="flex-1"></span>
    <button type="button" class="flex size-8 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-hover disabled:text-text-disabled" aria-label="Deshacer" [disabled]="!puedeDeshacer()" (click)="deshacer.emit()"><gr-icon name="undo" [size]="16" /></button>
    <button type="button" class="flex size-8 items-center justify-center rounded-sm text-text-secondary hover:bg-bg-hover disabled:text-text-disabled" aria-label="Rehacer" [disabled]="!puedeRehacer()" (click)="rehacer.emit()"><gr-icon name="redo" [size]="16" /></button>
    <label class="relative"><span class="sr-only">Zoom</span>
      <select class="h-9 appearance-none rounded-sm border border-line-strong bg-transparent pr-8 pl-3 text-[14px] font-semibold text-text-secondary" [value]="zoom()" (change)="zoom.set($any($event.target).value)">
        @for (z of zooms; track z) { <option [value]="z" class="bg-bg-card">{{ z === 'fit' ? 'Ajustar' : z + ' %' }}</option> }
      </select><gr-icon name="chevron-down" [size]="14" class="pointer-events-none absolute top-2.5 right-2.5 text-text-tertiary" /></label>
    <button type="button" class="flex h-9 items-center gap-1.5 rounded-sm px-2 text-[14px] font-semibold text-text-secondary hover:bg-bg-hover" (click)="ia.emit()"><gr-icon name="wand" [size]="16" class="text-[#b9a8ff]" />IA</button>
  `,
})
export class BoEditorToolbar {
  readonly panel = model(true);
  readonly mode = model<BoEditorMode>('design');
  readonly device = model<BoDevice>('desktop');
  readonly zoom = model('fit');
  readonly puedeDeshacer = input(true);
  readonly puedeRehacer = input(false);
  readonly deshacer = output<void>();
  readonly rehacer = output<void>();
  readonly ia = output<void>();
  protected readonly modes = MODES;
  protected readonly zooms = ['fit', '50', '75', '100'];
}

export type BoCanal = 'email' | 'whatsapp';

/** Figma 50 «BO / Channel chip»: campaign channel on/off (Email blue · WhatsApp green). */
@Component({
  selector: 'bo-channel-chip',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [attr.aria-pressed]="on()" (click)="on.set(!on())" class="flex h-7 items-center gap-1.5 rounded-pill border px-3 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent-text motion-reduce:transition-none"
      [class]="cls()"><gr-icon [name]="canal() === 'email' ? 'mail' : 'message'" [size]="14" />{{ canal() === 'email' ? 'Email' : 'WhatsApp' }}</button>
  `,
})
export class BoChannelChip {
  readonly canal = input<BoCanal>('email');
  readonly on = model(true);
  protected readonly cls = computed(() => !this.on() ? 'border-line-strong text-text-muted hover:text-text-secondary'
    : this.canal() === 'email' ? 'border-[#60a5fa]/50 bg-[#60a5fa]/14 text-text-primary' : 'border-[#25d366]/50 bg-[#25d366]/14 text-text-primary');
}

export type BoSave = 'new' | 'saving' | 'dirty' | 'saved';
const SAVE: Record<BoSave, [GrIconName, string, string]> = {
  new: ['pencil', 'Borrador sin guardar', 'text-text-muted'], saving: ['loader', 'Guardando…', 'text-text-tertiary'],
  dirty: ['circle-alert', 'Cambios sin guardar', 'text-warning'], saved: ['circle-check', 'Todo guardado', 'text-success'],
};

/** Figma 50 «BO / Save state»: save indicator of the campaign editor header. */
@Component({
  selector: 'bo-save-state',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex h-8 items-center gap-1.5 text-[14px] font-semibold " + s()[2]', role: 'status' },
  template: `<gr-icon [name]="s()[0]" [size]="16" [spin]="status() === 'saving'" />{{ s()[1] }}`,
})
export class BoEditorSave {
  readonly status = input<BoSave>('saved');
  protected readonly s = computed(() => SAVE[this.status()]);
}

export type BoMeta = 'approved' | 'review' | 'rejected' | 'paused';
const META: Record<BoMeta, [GrIconName, string, string]> = {
  approved: ['circle-check', 'Aprobada por Meta', 'bg-success/12 text-success'], review: ['clock', 'En revisión (≤ 24 h)', 'bg-info/12 text-info'],
  rejected: ['circle-x', 'Rechazada · ver motivo', 'bg-error/12 text-error'], paused: ['pause', 'Pausada por calidad', 'bg-warning/12 text-warning'],
};

/** Figma 50 «BO / Meta template status»: WhatsApp marketing template state in Meta. */
@Component({
  selector: 'bo-meta-status',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"inline-flex h-7 items-center gap-1.5 rounded-pill px-3 text-[14px] font-semibold " + m()[2]', role: 'status' },
  template: `<gr-icon [name]="m()[0]" [size]="14" />{{ m()[1] }}`,
})
export class BoMetaStatus {
  readonly status = input<BoMeta>('approved');
  protected readonly m = computed(() => META[this.status()]);
}
