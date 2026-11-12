import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { GrBadge, GrButton, GrField, GrIconButton, GrInput, GrSegmented, type GrTone } from '@grcup/ui';
import { BoToggle } from '../shared/ui';
import {
  BoApiType, BoCheckbox, BoDateRange, BoDropzone, BoFilterPill, BoImageFocal, BoLiveStatus, BoMenu, BoPublishStatus, BoRadioCard,
  BoSearch, BoSelect, BoTabButton, BoTagInput, BoToggleRow, BoTooltip, type BoApi, type BoLive, type BoMenuItem, type BoPublish,
} from '../shared/kit';

/** Figma 48 «BO · Componentes · base»: catalogue of every BO base component and state, for visual QA (root only). */
@Component({
  selector: 'bo-componentes-page',
  imports: [
    GrBadge, GrButton, GrField, GrIconButton, GrInput, GrSegmented, BoToggle, BoApiType, BoCheckbox, BoDateRange, BoDropzone, BoFilterPill, BoImageFocal,
    BoLiveStatus, BoMenu, BoPublishStatus, BoRadioCard, BoSearch, BoSelect, BoTabButton, BoTagInput, BoToggleRow, BoTooltip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-bg-base px-4 py-8 text-text-primary md:px-10' },
  template: `
    <h1 class="text-ui-h3 md:text-[28px]">BO · Componentes base</h1>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-btn">
      <h2 id="c-btn" class="text-ui-h5">Button</h2>
      <!-- Figma 96-171: rows M 40 then 44 (touch); columns default · hover · pressed · disabled · loading -->
      @for (lg of [false, true]; track lg) {
        @for (b of buttons; track b.v) {
          <div class="flex flex-wrap items-center gap-3">
            <button grButton [variant]="b.v" [class]="lg ? 'h-11! px-5!' : ''">{{ b.t }}</button>
            <button grButton [variant]="b.v" [class]="(lg ? 'h-11! px-5! ' : '') + b.hover" tabindex="-1">{{ b.t }}</button>
            <button grButton [variant]="b.v" [class]="(lg ? 'h-11! px-5! ' : '') + b.hover + ' brightness-90'" tabindex="-1">{{ b.t }}</button>
            <button grButton [variant]="b.v" [class]="lg ? 'h-11! px-5!' : ''" [disabled]="true">{{ b.t }}</button>
            <button grButton [variant]="b.v" [class]="lg ? 'h-11! px-5!' : ''" [loading]="true">{{ b.t }}</button>
          </div>
        }
      }
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-ib">
      <h2 id="c-ib" class="text-ui-h5">Icon button</h2>
      <!-- Figma 96-295: 32 · 44 × (more · download · trash) × default · hover · pressed · disabled -->
      @for (sz of iconSizes; track sz) {
        <div class="flex flex-wrap items-center gap-3">
          @for (ib of iconButtons; track ib.icon) {
            <button grIconButton [icon]="ib.icon" [kind]="ib.kind" [size]="sz" [label]="ib.label"></button>
            <button grIconButton [icon]="ib.icon" [kind]="ib.kind" [size]="sz" [label]="ib.label" [class]="ib.hover" tabindex="-1"></button>
            <button grIconButton [icon]="ib.icon" [kind]="ib.kind" [size]="sz" [label]="ib.label" [class]="ib.hover + ' brightness-90'" tabindex="-1"></button>
            <button grIconButton [icon]="ib.icon" [kind]="ib.kind" [size]="sz" [label]="ib.label" disabled></button>
          }
        </div>
      }
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-badge">
      <h2 id="c-badge" class="text-ui-h5">Badge</h2>
      @for (o of [false, true]; track o) {
        <div class="flex flex-wrap gap-2">@for (b of badges; track b.tone) { <gr-badge [tone]="b.tone" [outline]="o">{{ b.t }}</gr-badge> }</div>
      }
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-seg">
      <h2 id="c-seg" class="text-ui-h5">Segmented</h2>
      <div class="flex flex-wrap gap-4">
        <gr-segmented [options]="periodos" value="hoy" label="Periodo" />
        <gr-segmented [options]="periodos" value="7d" label="Periodo" />
        <gr-segmented [options]="periodos" [(value)]="periodo" label="Periodo" />
      </div>
    </section>
    <section class="mt-8 grid max-w-xl gap-4" aria-labelledby="c-in">
      <h2 id="c-in" class="text-ui-h5">Input</h2>
      <gr-field label="Nombre" for="c1" hint="Texto de ayuda"><input grInput id="c1" placeholder="Placeholder" /></gr-field>
      <gr-field label="Email" for="c2" error="Email no válido"><input grInput id="c2" [invalid]="true" value="ana@" /></gr-field>
      <gr-field label="Desactivado" for="c3"><input grInput id="c3" disabled value="Bloqueado" /></gr-field>
      <gr-field label="Notas" for="c4" [optional]="true"><textarea grInput id="c4" rows="3"></textarea></gr-field>
    </section>
    <section class="mt-8 flex items-center gap-4" aria-labelledby="c-tg">
      <h2 id="c-tg" class="text-ui-h5">Toggle</h2>
      <bo-toggle label="Activo" [(value)]="on" />
      <bo-toggle label="Desactivado" [disabled]="true" />
    </section>
    <section class="mt-8 flex flex-wrap items-center gap-6" aria-labelledby="c-cb">
      <h2 id="c-cb" class="w-full text-ui-h5">Checkbox</h2>
      <!-- Figma 96-320: off · on · mixed, each enabled · disabled · error -->
      <bo-checkbox [(value)]="cb" aria="Seleccionar fila" /><bo-checkbox [value]="true" aria="Seleccionar fila" /><bo-checkbox value="mixed" aria="Seleccionar todas" />
      <bo-checkbox [disabled]="true" aria="Seleccionar fila" /><bo-checkbox [value]="true" [disabled]="true" aria="Seleccionar fila" /><bo-checkbox value="mixed" [disabled]="true" aria="Seleccionar todas" />
      <bo-checkbox [error]="true" aria="Seleccionar fila" /><bo-checkbox [value]="true" [error]="true" aria="Seleccionar fila" /><bo-checkbox value="mixed" [error]="true" aria="Seleccionar todas" />
    </section>
    <section class="mt-8 grid gap-x-8 md:grid-cols-2" aria-labelledby="c-tr">
      <h2 id="c-tr" class="text-ui-h5 md:col-span-2">Toggle row</h2>
      <bo-toggle-row [(value)]="on" label="Avisar a los atletas al publicar" description="Envía un email con su flight y hora de pesaje" />
      <bo-toggle-row label="Avisar a los atletas al publicar" description="Envía un email con su flight y hora de pesaje" [disabled]="true" />
      <bo-toggle-row [value]="true" label="Avisar a los atletas al publicar" description="Envía un email con su flight y hora de pesaje" [loading]="true" />
    </section>
    <section class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-labelledby="c-rc" role="radiogroup">
      <h2 id="c-rc" class="text-ui-h5 md:col-span-2 xl:col-span-4">Radio card</h2>
      @for (m of modos; track m) {
        <bo-radio-card name="modo" [option]="m" [(value)]="modo" title="Sorteo ponderado" description="Cada boleto es una papeleta: más boletos, más probabilidad." [disabled]="m === 'd'" />
      }
    </section>
    <section class="mt-8 grid gap-6 md:min-h-64 md:grid-cols-2 xl:grid-cols-4" aria-labelledby="c-sel">
      <h2 id="c-sel" class="text-ui-h5 md:col-span-2 xl:col-span-4">Select</h2>
      <bo-select label="Sesión" [options]="sesiones" [(value)]="sesion" />
      <bo-select label="Sesión" [options]="sesiones" value="sab-t" [expanded]="true" />
      <bo-select label="Sesión" [options]="sesiones" value="sab-m" [disabled]="true" />
      <bo-select label="Sesión" [options]="sesiones" placeholder="Selecciona una sesión" error="Obligatorio" />
    </section>
    <section class="mt-8 grid gap-4 md:grid-cols-2" aria-labelledby="c-se">
      <h2 id="c-se" class="text-ui-h5 md:col-span-2">Search field</h2>
      <bo-search /><bo-search value="laura gómez" /><bo-search value="laura gómez" [loading]="true" />
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-tab">
      <h2 id="c-tab" class="text-ui-h5">Tab · Filter pill</h2>
      <div role="tablist" class="flex flex-wrap gap-2">
        @for (t of [0, 1, 2]; track t) { <button boTab [active]="tab() === t" [count]="t ? 138 : null" (click)="tab.set(t)">Confirmadas</button> }
        <button boTab [count]="138" disabled>Confirmadas</button>
      </div>
      <div class="flex flex-wrap gap-3">
        <bo-filter-pill label="Estado" /><bo-filter-pill label="Estado" [count]="1" /><bo-filter-pill label="Estado" [count]="2" /><bo-filter-pill label="Estado" [disabled]="true" />
      </div>
    </section>
    <section class="mt-8 grid gap-6 md:grid-cols-2" aria-labelledby="c-tag">
      <h2 id="c-tag" class="text-ui-h5 md:col-span-2">Tag input · Date range</h2>
      <bo-tag-input label="Etiquetas del contacto" [(value)]="tags" />
      <bo-tag-input label="Etiquetas del contacto" [value]="tags()" error="Máximo 10 etiquetas" />
      <div><bo-date-range [(value)]="rango" launch="2026-01-15" /></div>
    </section>
    <section class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-labelledby="c-dz">
      <h2 id="c-dz" class="text-ui-h5 md:col-span-2 xl:col-span-5">Dropzone</h2>
      <bo-dropzone title="Arrastra el acta de la AEP o haz clic" hint=".xlsx · .csv · máx. 10 MB" accept=".xlsx,.csv" />
      <bo-dropzone state="over" />
      <bo-dropzone state="uploading" status="acta-aep3-valencia.xlsx" subStatus="412 KB de 640 KB" [progress]="64" />
      <bo-dropzone state="success" status="acta-aep3-valencia.xlsx · 148 filas" subStatus="Listo para mapear columnas" />
      <bo-dropzone state="error" status="Formato no admitido" subStatus="Sube un .xlsx o .csv exportado desde la AEP" />
    </section>
    <section class="mt-8 grid gap-8 md:grid-cols-2 xl:max-w-[1000px]" aria-labelledby="c-if">
      <h2 id="c-if" class="text-ui-h5 md:col-span-2">Image focal</h2>
      <bo-image-focal src="img/componentes/focal.webp" alt="Atleta del GRStrength" [(value)]="focal" />
      <bo-image-focal src="img/componentes/focal.webp" alt="Atleta del GRStrength" [value]="{ x: 50, y: 18 }" [preview]="true" />
    </section>
    <section class="mt-8 flex flex-wrap items-start gap-6" aria-labelledby="c-menu">
      <h2 id="c-menu" class="w-full text-ui-h5">Tooltip · Menu</h2>
      <bo-tooltip text="Plazas de la sesión (aforo del pabellón)"><button grButton variant="secondary">Aforo</button></bo-tooltip>
      <bo-tooltip text="Buscar" kbd="⌘K"><button grIconButton icon="search" label="Buscar"></button></bo-tooltip>
      <bo-menu [items]="filaMenu" />
      <bo-menu [items]="userMenu">
        <div menuHeader class="flex flex-col gap-1 px-2 pt-2 pb-1"><span class="text-label-s">Nico García</span><span class="text-body-xs text-text-tertiary">nico&#64;grstrength.com</span></div>
      </bo-menu>
    </section>
    <section class="mt-8 flex flex-col gap-4 pb-16" aria-labelledby="c-st">
      <h2 id="c-st" class="text-ui-h5">API type · Live status · Publish status</h2>
      <div class="flex flex-wrap gap-4">@for (a of apis; track a) { <bo-api-type [type]="a" /> }</div>
      <div class="flex flex-wrap gap-3">@for (l of lives; track l) { <bo-live-status [status]="l" [viewers]="342" /> }</div>
      <div class="flex flex-wrap gap-3">@for (p of pubs; track p) { <bo-publish-status [status]="p" when="12 jun 10:00" /> }</div>
    </section>
  `,
})
export class ComponentesPage {
  /* Static hover/pressed previews mirror the :hover classes of the BO skin (ui/button.ts). */
  protected readonly buttons = [
    { v: 'primary', t: 'Guardar cambios', hover: 'brightness-115' },
    { v: 'secondary', t: 'Exportar CSV', hover: 'bg-bg-hover!' },
    { v: 'ghost', t: 'Cancelar', hover: 'bg-bg-raised!' },
    { v: 'danger', t: 'Anular entrada', hover: 'bg-error/18!' },
  ] as const;
  protected readonly iconSizes = [null, 'm'] as const;
  protected readonly iconButtons = [
    { icon: 'more', kind: 'ghost', label: 'Más acciones', hover: 'bg-bg-raised!' },
    { icon: 'download', kind: 'secondary', label: 'Descargar', hover: 'bg-bg-hover!' },
    { icon: 'trash', kind: 'danger', label: 'Eliminar', hover: 'bg-error/18!' },
  ] as const;
  protected readonly badges: { tone: GrTone; t: string }[] = [
    { tone: 'neutral', t: 'BORRADOR' }, { tone: 'success', t: 'CONFIRMADA' }, { tone: 'warning', t: 'PENDIENTE' }, { tone: 'danger', t: 'ERROR' },
    { tone: 'info', t: 'PROGRAMADO' }, { tone: 'accent', t: 'DESTACADO' }, { tone: 'live', t: 'EN DIRECTO' },
  ];
  protected readonly periodos = [{ value: 'hoy', label: 'Hoy' }, { value: '7d', label: '7 días' }, { value: 'todo', label: 'Todo' }];
  protected readonly periodo = signal('todo');
  protected readonly on = signal(true);
  protected readonly cb = signal<boolean | 'mixed'>(false);
  protected readonly modos = ['a', 'b', 'c', 'd'];
  protected readonly modo = signal<string | null>('c');
  protected readonly sesiones = [
    { value: 'sab-m', label: 'Sábado mañana' },
    { value: 'sab-t', label: 'Sábado tarde' },
    { value: 'dom-m', label: 'Domingo mañana' },
    { value: 'dom-t', label: 'Domingo tarde · agotada', disabled: true },
  ];
  protected readonly sesion = signal<string | null>('sab-m');
  protected readonly tab = signal(2);
  protected readonly tags = signal(['ig_story', 'club_grstrength', 'voluntario']);
  protected readonly rango = signal({ from: '2026-06-01', to: '2026-06-30' });
  protected readonly focal = signal({ x: 50, y: 18 });
  protected readonly filaMenu: BoMenuItem[] = [
    { id: 'ver', label: 'Ver detalle', icon: 'eye' },
    { id: 'editar', label: 'Editar', icon: 'pencil' },
    { id: 'reenviar', label: 'Reenviar email', icon: 'send' },
    { id: 'copiar', label: 'Copiar código', icon: 'copy' },
    { id: 'anular', label: 'Anular entrada', icon: 'trash', danger: true },
  ];
  protected readonly userMenu: BoMenuItem[] = [
    { id: 'perfil', label: 'Mi perfil', icon: 'user' },
    { id: 'comp', label: 'Cambiar competición', icon: 'refresh' },
    { id: 'atajos', label: 'Atajos de teclado', icon: 'keyboard' },
    { id: 'salir', label: 'Cerrar sesión', icon: 'log-out' },
  ];
  protected readonly apis: BoApi[] = ['REST', 'SSE', 'WEBHOOK', 'JOB', 'HUB'];
  protected readonly lives: BoLive[] = ['connected', 'reconnecting', 'offline', 'paused'];
  protected readonly pubs: BoPublish[] = ['draft', 'pending', 'scheduled', 'publishing', 'published', 'error'];
}
