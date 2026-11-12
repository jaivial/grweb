import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GrBadge, GrButton, GrField, GrIconButton, GrInput, GrSegmented, type GrTone } from '@grcup/ui';
import { BoToggle, Confirm } from '../shared/ui';
import {
  BO_ROW, BoAlert, BoEmptyState, BoPagination, BoProgress, BoSaveBar, BoSortHeader, BoToast, BoApiType, BoCheckbox, BoDateRange, BoDropzone, BoFilterPill, BoImageFocal, BoLiveStatus, BoMenu, BoPublishStatus, BoRadioCard,
  BoSearch, BoSelect, BoTabButton, BoTagInput, BoToggleRow, BoTooltip, type BoApi, type BoLive, type BoMenuItem, type BoPublish,
} from '../shared/kit';

/** Figma 48 «BO · Componentes · base»: catalogue of every BO base component and state, for visual QA (root only). */
@Component({
  selector: 'bo-componentes-page',
  imports: [
    GrBadge, GrButton, GrField, GrIconButton, GrInput, GrSegmented, BoToggle, BoApiType, BoCheckbox, BoDateRange, BoDropzone, BoFilterPill, BoImageFocal,
    BoAlert, BoEmptyState, BoPagination, BoProgress, BoSaveBar, BoSortHeader, BoToast, BoLiveStatus, BoMenu, BoPublishStatus, BoRadioCard, BoSearch, BoSelect, BoTabButton, BoTagInput, BoToggleRow, BoTooltip,
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
            <button grButton [variant]="b.v" [class]="(lg ? 'h-11! px-5! ' : '') + b.pressed" tabindex="-1">{{ b.t }}</button>
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
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-st">
      <h2 id="c-st" class="text-ui-h5">API type · Live status · Publish status</h2>
      <div class="flex flex-wrap gap-4">@for (a of apis; track a) { <bo-api-type [type]="a" /> }</div>
      <div class="flex flex-wrap gap-3">@for (l of lives; track l) { <bo-live-status [status]="l" [viewers]="342" /> }</div>
      <div class="flex flex-wrap gap-3">@for (p of pubs; track p) { <bo-publish-status [status]="p" when="12 jun 10:00" /> }</div>
    </section>
    <h1 class="mt-16 text-ui-h3 md:text-[28px]">BO · Navegación, datos y feedback</h1>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-pg">
      <h2 id="c-pg" class="text-ui-h5">Pagination</h2>
      <div class="flex flex-wrap gap-8">
        <bo-pagination [page]="1" [pages]="25" /><bo-pagination [page]="pg()" [pages]="25" (change)="pg.set($event)" /><bo-pagination [page]="25" [pages]="25" /><bo-pagination [page]="3" [pages]="25" [from]="2" [loading]="true" />
      </div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-th">
      <h2 id="c-th" class="text-ui-h5">Table header · Table row</h2>
      <div class="overflow-x-auto rounded-lg border border-line-subtle">
        <table class="w-full min-w-[720px] text-body-s">
          <thead class="bg-bg-surface"><tr>
            <th boSort [sort]="null">Titular</th><th boSort [sort]="'asc'">Código</th><th boSort [sort]="'desc'">Fecha</th>
          </tr></thead>
          <tbody>
            @for (r of rows; track r.k) {
              <tr [class]="row[r.k]"><td class="px-3">Laura Gómez Ruiz <span class="block text-body-xs text-text-tertiary">laura.gomez&#64;email.com</span></td>
                <td class="px-3 text-mono-xs text-text-secondary">GRC-7K3P</td>
                <td class="px-3 text-mono-xs" [class]="r.k === 'error' ? 'text-error' : 'text-text-tertiary'">{{ r.t }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
    <section class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-labelledby="c-es">
      <h2 id="c-es" class="text-ui-h5 md:col-span-2 xl:col-span-3">Empty state</h2>
      <bo-empty-state kind="first-run" title="Aún no hay sesiones de entradas" text="Crea la primera sesión con su aforo para abrir las reservas en /entradas."><button grButton>Crear sesión</button><button grButton variant="ghost">Ver guía</button></bo-empty-state>
      <bo-empty-state kind="no-results" title="Ningún resultado con estos filtros" text='Prueba a quitar "Sesión: Domingo tarde" o busca por email.'><button grButton>Limpiar filtros</button></bo-empty-state>
      <bo-empty-state kind="no-data" title="Todavía no hay boletos del sorteo" text="Aparecerán aquí en tiempo real cuando alguien compre en /sorteo."><button grButton variant="ghost">Ver /sorteo</button></bo-empty-state>
      <bo-empty-state kind="no-permission" title="No tienes acceso a Contactos" text="Tu rol (Taquilla) no incluye contactos.ver. Pídeselo a un Admin: Nico García."><button grButton>Solicitar acceso</button></bo-empty-state>
      <bo-empty-state kind="error" title="No se pudieron cargar las entradas" text="El servidor respondió 503. Ya lo hemos registrado · incidencia #A7F3."><button grButton>Reintentar</button><button grButton variant="ghost">Ver estado</button></bo-empty-state>
      <bo-empty-state kind="offline" title="Sin conexión" text="Los escaneos se guardan en este dispositivo (14 en cola) y se enviarán al volver la red."><button grButton>Reintentar ahora</button></bo-empty-state>
    </section>
    <section class="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-labelledby="c-to">
      <h2 id="c-to" class="text-ui-h5 md:col-span-2 xl:col-span-3">Toast</h2>
      <bo-toast tone="success" title="Horarios publicados" text="148 atletas avisados por email" />
      <bo-toast tone="error" title="No se pudo guardar" text="Conexión perdida · reintentando en 5 s" />
      <bo-toast tone="warning" title="Aforo al 94 %" text="Sábado mañana: quedan 38 entradas" />
      <bo-toast tone="info" title="Exportación lista" text="entradas-2026-06-12.csv · 1.248 filas" />
      <bo-toast tone="loading" title="Importando acta AEP…" text="96 de 148 filas" />
      <bo-toast tone="undo" title="Entrada GRC-7K3P anulada" text="Se ha liberado 3 plazas" action="Deshacer" />
    </section>
    <section class="mt-8 grid gap-4 md:grid-cols-2" aria-labelledby="c-al">
      <h2 id="c-al" class="text-ui-h5 md:col-span-2">Alert</h2>
      <bo-alert tone="info" title="Las entradas se abren el 1 de junio a las 10:00" text="Hasta entonces /entradas muestra la cuenta atrás." action="Cambiar fecha" />
      <bo-alert tone="success" title="Integración con Stripe operativa" text="Último webhook recibido hace 2 min (checkout.session.completed)." />
      <bo-alert tone="warning" title="3 atletas sin categoría válida tras la importación" text="Revisa las filas marcadas antes de publicar los flights." action="Revisar filas" />
      <bo-alert tone="danger" title="El SMTP rechaza los envíos" text="27 emails en cola · último error: 535 Authentication failed." action="Configurar email" />
      <bo-alert tone="legal" title="Revisión de asesoría pendiente" text="Sorteo de pago (2 €): autorización autonómica y tributación. No activar la venta sin visto bueno." action="Ver checklist legal" />
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-md">
      <h2 id="c-md" class="text-ui-h5">Modal</h2>
      <div class="flex flex-wrap gap-2"><button grButton variant="secondary" (click)="modal(false)">Confirm</button><button grButton variant="danger" (click)="modal(true)">Destructive</button></div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-sb">
      <h2 id="c-sb" class="text-ui-h5">Save bar</h2>
      <bo-save-bar state="unsaved" title="Tienes 3 cambios sin guardar" text="Fecha, sede y texto del hero"><button grButton variant="ghost">Descartar</button><button grButton>Guardar cambios</button></bo-save-bar>
      <bo-save-bar state="saving" title="Guardando…" text="No cierres esta pestaña"><button grButton variant="ghost" [disabled]="true">Descartar</button><button grButton [loading]="true" aria-label="Guardando"></button></bo-save-bar>
      <bo-save-bar state="saved" title="Cambios guardados" text="Visibles en la web en menos de 1 min (caché)"><button grButton variant="secondary">Ver en la web</button></bo-save-bar>
      <bo-save-bar state="error" title="No se pudieron guardar los cambios" text="Error 500 · tus cambios siguen aquí"><button grButton variant="ghost">Copiar cambios</button><button grButton>Reintentar</button></bo-save-bar>
      <bo-save-bar state="conflict" title="Laura García editó esta página hace 1 min" text="Revisa sus cambios antes de guardar los tuyos"><button grButton variant="secondary">Ver cambios</button><button grButton variant="danger">Sobrescribir</button></bo-save-bar>
    </section>
    <section class="mt-8 grid gap-4 pb-16 md:grid-cols-2 xl:grid-cols-5" aria-labelledby="c-pr">
      <h2 id="c-pr" class="text-ui-h5 md:col-span-2 xl:col-span-5">Progress</h2>
      <bo-progress title='Enviando newsletter "Horarios publicados"' [value]="612" [total]="2430" note="Quedan ~4 min · 120 emails/min" />
      <bo-progress kind="indeterminate" title="Preparando exportación" note="Te avisaremos cuando esté lista" />
      <bo-progress kind="success" title="Importación completada" [value]="148" [total]="148" note="146 creados · 2 actualizados" />
      <bo-progress kind="error" title="Envío detenido" [value]="1512" [total]="2430" note="SMTP 535 · revisa la configuración y reanuda" />
      <bo-progress kind="paused" title="Envío en pausa" [value]="1215" [total]="2430" note="Pausado por Nico · 18:40" />
    </section>

  `,
})
export class ComponentesPage {
  /* Static hover/pressed previews mirror the :hover classes of the BO skin (ui/button.ts). */
  protected readonly buttons = [
    { v: 'primary', t: 'Guardar cambios', hover: 'brightness-115', pressed: 'brightness-90' },
    { v: 'secondary', t: 'Exportar CSV', hover: 'bg-bg-hover!', pressed: 'bg-bg-hover! brightness-90' },
    { v: 'ghost', t: 'Cancelar', hover: 'bg-bg-raised!', pressed: 'bg-bg-raised! brightness-90' },
    { v: 'danger', t: 'Anular entrada', hover: 'bg-error/18!', pressed: 'bg-error/18! brightness-90' },
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
  protected readonly pg = signal(2);
  protected readonly row = BO_ROW;
  protected readonly rows = [
    { k: 'default', t: '12/06 18:22' }, { k: 'hover', t: '12/06 18:22' }, { k: 'selected', t: '12/06 18:22' },
    { k: 'disabled', t: '12/06 18:22' }, { k: 'error', t: 'SMTP 550 · buzón inexistente' }, { k: 'new', t: 'ahora' },
  ] as const;
  private readonly confirm = inject(Confirm);
  protected modal(danger: boolean): void {
    void this.confirm.ask(danger
      ? { title: 'Anular 12 entradas', text: 'Las 12 entradas pasarán a Anulada, se liberarán 31 plazas y se avisará a sus titulares. Los QR dejarán de ser válidos en la puerta.', confirm: 'Anular 12 entradas', danger: true, word: 'ANULAR' }
      : { title: 'Publicar horarios', text: 'Se publicarán 8 flights en /horarios y se enviará un email a 148 atletas con su hora de pesaje. Podrás corregir y volver a publicar.', confirm: 'Publicar y avisar' });
  }
  protected readonly pubs: BoPublish[] = ['draft', 'pending', 'scheduled', 'publishing', 'published', 'error'];
}
