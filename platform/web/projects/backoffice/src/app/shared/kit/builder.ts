import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { GrIcon, type GrIconName } from '@grcup/ui';
import type { BoCanal } from './editor';

/** Figma 50 «BO / Builder icon»: swappable icon of the palette blocks (Figma name → platform icon). */
export const BO_BUILDER_ICONS: Record<string, GrIconName> = {
  heading: 'heading', image: 'image', type: 'type', pointer: 'pointer', columns: 'columns', list: 'list', timer: 'timer', clock: 'clock', user: 'user', ticketCheck: 'ticket-check',
  minus: 'minus', square: 'square', mail: 'mail', link: 'link', fileText: 'file-text', users: 'users', palette: 'palette', messageCircle: 'message', send: 'send', penTool: 'pen-tool',
};

/** Figma 50 «BO / Block tile»: palette block (click adds after the selection, or drag to the canvas). */
@Component({
  selector: 'bo-block-tile',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" draggable="true" (click)="add.emit()" class="flex h-[83px] w-28 flex-col items-center justify-center gap-2 rounded-md border text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#7c5cff] motion-reduce:transition-none"
      [class]="dragging() ? '-rotate-3 border-[#7c5cff]/60 bg-bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.45)] motion-reduce:rotate-0' : 'border-line-subtle bg-bg-surface hover:border-[#7c5cff]/60 hover:bg-bg-raised'">
      <span class="flex size-8 items-center justify-center rounded-sm bg-bg-raised text-text-secondary"><gr-icon [name]="icon()" [size]="16" /></span>{{ label() }}
    </button>
  `,
})
export class BoBlockTile {
  readonly icon = input<GrIconName>('pointer');
  readonly label = input('');
  readonly dragging = input(false);
  readonly add = output<void>();
}

const CANAL_TAG: Record<BoCanal, [string, string]> = { email: ['Email', 'bg-[#60a5fa]/14 text-[#93c5fd]'], whatsapp: ['WA', 'bg-[#25d366]/14 text-[#4ade80]'] };

/** Figma 50 «BO / Layer row»: layer tree row (fold, select, drag to reorder with green guide, channel chip for single-channel blocks). */
@Component({
  selector: 'bo-layer-row',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="select.emit()" [attr.aria-selected]="selected()" class="group flex h-7 w-full items-center gap-1.5 rounded-xs border px-2 text-left transition-colors motion-reduce:transition-none"
      [class]="drop() ? 'border-success' : selected() ? 'border-transparent bg-[#7c5cff]/20' : 'border-transparent hover:bg-bg-raised'">
      <gr-icon name="chevron-right" [size]="12" class="text-text-tertiary" />
      <gr-icon [name]="icon()" [size]="14" [class]="selected() ? 'text-[#b9a8ff]' : 'text-text-tertiary'" />
      <span class="shrink-0 text-[14px] font-semibold" [class]="selected() ? 'text-text-primary' : 'text-text-secondary'">{{ nombre() }}</span>
      <span class="min-w-0 flex-1 truncate text-[12px] text-text-muted">{{ detalle() }}</span>
      @if (tag(); as t) { <span class="rounded-2xs px-1.5 font-mono text-[11px] font-medium uppercase" [class]="t[1]">{{ t[0] }}</span> }
    </button>
  `,
})
export class BoLayerRow {
  readonly nombre = input('');
  readonly detalle = input('');
  readonly icon = input<GrIconName>('pointer');
  readonly canal = input<BoCanal | null>(null);
  readonly selected = input(false);
  readonly drop = input(false);
  readonly select = output<void>();
  protected readonly tag = computed(() => { const c = this.canal(); return c ? CANAL_TAG[c] : null; });
}

export type BoFlowNode = 'ready' | 'pending' | 'off';
const FLOW: Record<BoFlowNode, [string, string, string]> = {
  ready: ['border-success/50', 'bg-success', 'bg-success/14 text-success'],
  pending: ['border-warning/50', 'bg-warning', 'bg-warning/14 text-warning'],
  off: ['border-text-muted/50', 'bg-text-muted', 'bg-bg-raised text-text-muted'],
};

/** Figma 50 «BO / Flow node»: node of the campaign graph (Listo · Pendiente · Desactivado); click opens its section. */
@Component({
  selector: 'bo-flow-node',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="open.emit()" class="relative flex w-full items-center gap-3 overflow-hidden rounded-md border bg-bg-card py-3 pr-3 pl-4 text-left transition-colors hover:bg-bg-raised focus-visible:outline-2 focus-visible:outline-accent-text motion-reduce:transition-none" [class]="f()[0]">
      <span class="absolute inset-y-0 left-0 w-1" [class]="f()[1]"></span>
      <span class="flex size-8 shrink-0 items-center justify-center rounded-sm" [class]="f()[2]"><gr-icon [name]="icon()" [size]="16" /></span>
      <span class="min-w-0 flex-1" [class.opacity-60]="estado() === 'off'">
        <span class="block text-[14px] font-semibold">{{ titulo() }}</span>
        <span class="block text-[12px] leading-[17px] text-text-tertiary">{{ detalle() }}</span>
        <span class="block font-mono text-[11px] font-medium tracking-[0.04em] text-text-muted uppercase">{{ meta() }}</span>
      </span>
      <gr-icon name="chevron-right" [size]="14" class="text-text-tertiary" />
    </button>
  `,
})
export class BoFlowNodeCard {
  readonly titulo = input('');
  readonly detalle = input('');
  readonly meta = input('');
  readonly icon = input<GrIconName>('users');
  readonly estado = input<BoFlowNode>('ready');
  readonly open = output<void>();
  protected readonly f = computed(() => FLOW[this.estado()]);
}

/** Figma 50 «BO / WhatsApp bubble»: message as the customer receives it (image, *bold* text, up to 3 URL buttons + «Darme de baja»). */
@Component({
  selector: 'bo-whatsapp-bubble',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-[280px] overflow-hidden rounded-md bg-white font-sans text-[#111b21]' },
  template: `
    @if (imagen()) { <img [src]="imagen()" alt="" class="h-40 w-full object-cover" /> }
    <div class="px-2 pt-2 pb-1.5">
      <p class="text-[14px] leading-[20px] whitespace-pre-line" [innerHTML]="html()"></p>
      <p class="mt-0.5 flex items-center justify-end gap-1 text-[12px] text-[#8696a0]">{{ hora() }}<gr-icon name="check-check" [size]="14" class="text-[#53bdeb]" /></p>
    </div>
    @for (b of botones(); track b) {
      <a class="flex h-10 items-center justify-center gap-2 border-t border-[#e9edef] text-[14px] font-semibold text-[#027eb5]"><gr-icon name="external-link" [size]="14" />{{ b }}</a>
    }
    @if (botones().length) { <a class="flex h-10 items-center justify-center gap-2 border-t border-[#e9edef] text-[14px] font-semibold text-[#027eb5]"><gr-icon name="undo" [size]="14" />Darme de baja</a> }
  `,
})
export class BoWhatsappBubble {
  readonly texto = input('');
  readonly hora = input('');
  readonly imagen = input('');
  readonly botones = input<string[]>([]);
  /** WhatsApp *bold* → <b>, HTML escaped first. */
  protected readonly html = computed(() => this.texto().replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/\*([^*\n]+)\*/g, '<b>$1</b>'));
}

export type BoAiRole = 'user' | 'assistant' | 'receipt' | 'thinking';

/** Figma 50 «BO / AI turn»: AI assistant turn (user · assistant · «Cambios aplicados» receipt with Deshacer · thinking). */
@Component({
  selector: 'bo-ai-turn',
  imports: [GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'role() === "user" ? "flex justify-end" : "flex"' },
  template: `
    @switch (role()) {
      @case ('user') { <p class="max-w-[260px] rounded-md bg-[#7c5cff] px-3 py-2 text-[14px] leading-[20px] text-white">{{ texto() }}</p> }
      @case ('assistant') { <p class="max-w-[320px] rounded-md bg-bg-raised px-3 py-2 text-[14px] leading-[20px]">{{ texto() }}</p> }
      @case ('receipt') {
        <div class="flex w-[320px] items-center gap-2 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
          <gr-icon name="circle-check" [size]="16" class="text-success" />
          <span class="min-w-0 flex-1"><span class="block text-[14px] font-semibold">Cambios aplicados</span><span class="block font-mono text-[11px] font-medium tracking-[0.04em] text-text-muted uppercase">{{ texto() }}</span></span>
          <button type="button" class="h-8 rounded-xs border border-line-strong px-2 text-[14px] font-semibold text-[#b9a8ff] hover:bg-bg-hover" (click)="deshacer.emit()">Deshacer</button>
        </div>
      }
      @default { <p class="flex items-center gap-2 text-[14px] text-text-tertiary" role="status"><gr-icon name="loader" [size]="14" [spin]="true" class="text-[#b9a8ff]" />{{ texto() }}</p> }
    }
  `,
})
export class BoAiTurn {
  readonly role = input<BoAiRole>('assistant');
  readonly texto = input('');
  readonly deshacer = output<void>();
}
