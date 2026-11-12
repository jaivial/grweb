import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import {
  BO_BUILDER_ICONS, BoAiTurn, BoBlockTile, BoChannelChip, BoDeviceSwitch, BoEditorToolbar, BoFlowNodeCard, BoLayerRow, BoMetaStatus, BoEditorSave, BoWhatsappBubble,
  type BoCanal, type BoDevice, type BoEditorMode, type BoFlowNode, type BoMeta, type BoSave,
} from '../shared/kit';

/** Figma 50 (2.ª parte): editor de campañas · email + WhatsApp. Selección del editor en violeta (#7C5CFF). */
@Component({
  selector: 'bo-componentes-editor',
  imports: [GrIcon, BoAiTurn, BoBlockTile, BoChannelChip, BoDeviceSwitch, BoEditorToolbar, BoFlowNodeCard, BoLayerRow, BoMetaStatus, BoEditorSave, BoWhatsappBubble],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <h2 class="mt-12 text-ui-h4">Editor de campañas · email + WhatsApp</h2>
    <p class="mt-2 max-w-3xl text-body-s text-text-tertiary">Un diseño único del que salen el email y el WhatsApp; bloques marcados «Solo email» / «Solo WhatsApp»; paleta, capas, lienzo por dispositivo, asistente IA y deshacer/rehacer.</p>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="e-ic">
      <h2 id="e-ic" class="text-ui-h5">Builder icon · Device switch</h2>
      <div class="flex flex-wrap gap-4 text-text-secondary">@for (i of icons; track i[0]) { <gr-icon [name]="i[1]" [size]="16" [label]="i[0]" /> }</div>
      <div class="flex flex-wrap gap-4">@for (d of devices; track d) { <bo-device-switch [value]="d" /> }</div>
    </section>
    <section class="mt-8 flex flex-col gap-4 overflow-x-auto" aria-labelledby="e-tb">
      <h2 id="e-tb" class="text-ui-h5">Editor toolbar</h2>
      @for (m of modes; track m) { <bo-editor-toolbar [mode]="m" /> }
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="e-bt">
      <h2 id="e-bt" class="text-ui-h5">Block tile · Layer row</h2>
      <div class="flex flex-wrap gap-4"><bo-block-tile label="Botón" /><bo-block-tile label="Botón" class="[&_button]:border-[#7c5cff]/60 [&_button]:bg-bg-raised" /><bo-block-tile label="Botón" [dragging]="true" /></div>
      <div class="grid max-w-[1000px] gap-2 sm:grid-cols-2 lg:grid-cols-4">
        @for (c of canales; track $index) {
          <bo-layer-row nombre="Botón" detalle="Reserva tu entrada" [canal]="c" />
          <bo-layer-row nombre="Botón" detalle="Reserva tu entrada" [canal]="c" class="[&_button]:bg-bg-raised" />
          <bo-layer-row nombre="Botón" detalle="Reserva tu entrada" [canal]="c" [selected]="true" />
          <bo-layer-row nombre="Botón" detalle="Reserva tu entrada" [canal]="c" [drop]="true" />
        }
      </div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="e-fn">
      <h2 id="e-fn" class="text-ui-h5">Flow node · Save state · Channel chip</h2>
      <div class="grid max-w-[800px] gap-4 md:grid-cols-3">@for (f of flows; track f) { <bo-flow-node titulo="Audiencia" detalle="Novedades confirmadas" meta="1.402 · 1.388 email / 612 WA" [estado]="f" /> }</div>
      <div class="flex flex-wrap gap-6">@for (s of saves; track s) { <bo-save-state [status]="s" /> }</div>
      <div class="flex flex-wrap gap-4"><bo-channel-chip canal="email" /><bo-channel-chip canal="email" [on]="false" /><bo-channel-chip canal="whatsapp" /><bo-channel-chip canal="whatsapp" [on]="false" /></div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="e-wa">
      <h2 id="e-wa" class="text-ui-h5">WhatsApp bubble · AI turn · Meta template status</h2>
      <div class="flex flex-wrap items-start gap-8">
        <bo-whatsapp-bubble [texto]="waTexto" hora="18:42" imagen="/img/componentes/focal.webp" [botones]="waBotones" />
        <bo-whatsapp-bubble [texto]="waTexto" hora="18:42" [botones]="waBotones" />
        <bo-whatsapp-bubble texto="¡Gracias! Aquí tienes el enlace directo a tu sesión del sábado por la mañana: grstrengthcup.com/entradas" hora="18:42" />
      </div>
      <div class="flex max-w-[720px] flex-col gap-3">
        <bo-ai-turn role="user" texto="Añade la cuenta atrás encima del botón" />
        <bo-ai-turn role="assistant" texto="Hecho: he añadido la cuenta atrás y he marcado los horarios como «Solo email»." />
        <bo-ai-turn role="receipt" texto="claude-sonnet · 18:42" />
        <bo-ai-turn role="thinking" texto="Diseñando · 6 s" />
      </div>
      <div class="flex flex-wrap gap-4">@for (m of metas; track m) { <bo-meta-status [status]="m" /> }</div>
    </section>
  `,
})
export class ComponentesEditor {
  protected readonly icons = Object.entries(BO_BUILDER_ICONS);
  protected readonly devices: BoDevice[] = ['desktop', 'tablet', 'mobile'];
  protected readonly modes: BoEditorMode[] = ['design', 'preview', 'html'];
  protected readonly canales: (BoCanal | null)[] = [null, 'email', 'whatsapp'];
  protected readonly flows: BoFlowNode[] = ['ready', 'pending', 'off'];
  protected readonly saves: BoSave[] = ['new', 'saving', 'dirty', 'saved'];
  protected readonly metas: BoMeta[] = ['approved', 'review', 'rejected', 'paused'];
  protected readonly waTexto = 'Última semana para reservar tu entrada. La entrada es gratis, pero las plazas por sesión son limitadas.';
  protected readonly waBotones = ['Reservar entrada', 'Ver horarios'];
}
