import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { GrButton, GrField, GrInput, GrBadge } from '@grcup/ui';
import { BoDrawer } from '../shared/ui';
import {
  BO_ROW, BoActivityItem, BoChartCard, BoChecklistItem, BoCommandPalette, BoFilterPill, BoInlineEdit, BoKpi, BoModalForm, BoNavItem, BoNotificationItem,
  BoSearch, BoSkeleton, BoStepper, BoTableToolbar, BoWorkspaceSwitcher, BoCheckbox, type BoPaletteGroup, type BoSkeletonKind, type BoWorkspace,
} from '../shared/kit';

/** Figma 49 (2.ª parte): shell, datos y feedback del catálogo /_componentes. */
@Component({
  selector: 'bo-componentes-nav',
  imports: [
    GrButton, GrField, GrInput, GrBadge, BoDrawer, BoActivityItem, BoChartCard, BoChecklistItem, BoCommandPalette, BoFilterPill, BoInlineEdit, BoKpi, BoModalForm, BoNavItem,
    BoNotificationItem, BoSearch, BoSkeleton, BoStepper, BoTableToolbar, BoWorkspaceSwitcher, BoCheckbox,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-nav">
      <h2 id="c-nav" class="text-ui-h5">Nav item</h2>
      <div class="flex flex-wrap gap-3">
        @for (b of navBadges; track $index) {
          <div class="flex w-[232px] flex-col gap-1">
            <a boNavItem href="#" icon="ticket" label="Entradas y aforo" [badge]="b" (click)="$event.preventDefault()"></a>
            <a boNavItem href="#" icon="ticket" label="Entradas y aforo" [badge]="b" class="bg-bg-card! text-text-primary!" tabindex="-1"></a>
            <a boNavItem href="#" icon="ticket" label="Entradas y aforo" [badge]="b" [active]="true" (click)="$event.preventDefault()"></a>
            <a boNavItem href="#" icon="ticket" label="Entradas y aforo" [badge]="b" [disabled]="true"></a>
          </div>
        }
        <div class="flex flex-col gap-1">@for (b of navBadges; track $index) { <div class="flex gap-1"><a boNavItem href="#" icon="ticket" label="Entradas" [collapsed]="true" [badge]="b"></a><a boNavItem href="#" icon="ticket" label="Entradas" [collapsed]="true" [badge]="b" [active]="true"></a></div> }</div>
      </div>
    </section>
    <section class="mt-8 flex flex-wrap items-start gap-6" aria-labelledby="c-ws">
      <h2 id="c-ws" class="w-full text-ui-h5">Workspace switcher</h2>
      <bo-workspace-switcher class="w-[232px]" [items]="ws" [current]="ws[0]" [root]="true" />
      <bo-workspace-switcher class="w-[232px]" [items]="ws" [current]="ws[0]" [loading]="true" />
    </section>
    <section class="mt-8 flex flex-col items-start gap-6" aria-labelledby="c-cp">
      <h2 id="c-cp" class="text-ui-h5">Command palette</h2>
      <bo-command-palette [groups]="palEmpty" />
      <bo-command-palette [groups]="palRes" query="lau" />
      <bo-command-palette [groups]="[]" query="grc-zzz9" hint="Los códigos de entrada tienen 4 caracteres tras GRC- · prueba con el email" />
      <bo-command-palette [groups]="[]" query="lau" [loading]="true" />
    </section>
    <section class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6" aria-labelledby="c-kpi">
      <h2 id="c-kpi" class="text-ui-h5 sm:col-span-2 xl:col-span-6">KPI</h2>
      <bo-kpi label="Entradas reservadas" value="1.248" delta="+18 %" caption="esta semana" [trend]="[4, 6, 5, 8, 9, 12]" />
      <bo-kpi label="Aforo libre" value="312" delta="−6 %" caption="vs. ayer" [trend]="[12, 10, 9, 8, 7, 6]" />
      <bo-kpi label="Atletas confirmados" value="148" delta="0 %" caption="sin cambios" [trend]="[5, 5, 5, 5, 5]" />
      <bo-kpi label="Entradas reservadas" [loading]="true" />
      <bo-kpi label="Entradas reservadas" [error]="true" />
      <bo-kpi label="Entradas reservadas" />
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-tb">
      <h2 id="c-tb" class="text-ui-h5">Table toolbar · Table row</h2>
      @for (st of ['default', 'filtered', 'loading']; track st) {
        <bo-table-toolbar noun="entradas" [total]="st === 'filtered' ? 42 : 1248" [filtered]="st === 'filtered'" [loading]="st === 'loading'">
          <bo-search filters class="w-[280px]" placeholder="Buscar por nombre, email o código" [shortcut]="false" [value]="st === 'filtered' ? 'laura' : ''" [loading]="st === 'loading'" />
          <bo-filter-pill filters label="Sesión" [count]="st === 'filtered' ? 1 : 0" />
          <bo-filter-pill filters label="Estado" [count]="st === 'filtered' ? 2 : 0" />
          <bo-filter-pill filters label="Origen" />
          <button actions grButton variant="secondary" icon="download">Exportar CSV</button>
        </bo-table-toolbar>
      }
      <bo-table-toolbar [total]="1248" [selected]="12">
        <button bulk grButton variant="secondary" icon="mail">Reenviar email</button><button bulk grButton variant="secondary">Mover</button><button bulk grButton variant="danger">Anular</button>
      </bo-table-toolbar>
      <div class="overflow-x-auto rounded-lg border border-line-subtle"><table class="w-full min-w-[720px]"><tbody>
        @for (k of rowKinds; track k) {
          <tr [class]="row[k]"><td class="w-12 px-4"><bo-checkbox [value]="k === 'selected'" /></td><td class="text-[14px] font-semibold">Laura Gómez Ruiz</td><td class="font-mono text-[13px] text-text-secondary">GRC-7K3P</td><td><gr-badge tone="info">Reservada</gr-badge></td><td class="text-body-s text-text-secondary">Sábado mañana · 3 personas</td></tr>
        }
      </tbody></table><bo-skeleton [count]="1" class="[&>div]:rounded-none [&>div]:border-0" /></div>
    </section>
    <section class="mt-8 grid gap-4 xl:grid-cols-2" aria-labelledby="c-sk">
      <h2 id="c-sk" class="text-ui-h5 xl:col-span-2">Skeleton</h2>
      @for (k of skKinds; track k) { <bo-skeleton [kind]="k" [count]="4" /> }
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-dr">
      <h2 id="c-dr" class="text-ui-h5">Modal formulario · Drawer</h2>
      <div class="flex flex-wrap gap-2"><button grButton variant="secondary" (click)="form.set(true)">Modal Form</button><button grButton variant="secondary" (click)="drawer.set(true)">Drawer Detail</button></div>
      <bo-modal-form [(open)]="form" title="Nueva entrada manual">
        <gr-field label="Nombre y apellidos" for="mf-n"><input grInput id="mf-n" value="Laura Gómez Ruiz" /></gr-field>
        <div class="grid gap-3 sm:grid-cols-2"><gr-field label="Sesión" for="mf-s"><input grInput id="mf-s" value="Sábado mañana" /></gr-field><gr-field label="Personas" for="mf-p"><input grInput id="mf-p" value="3" /></gr-field></div>
        <gr-field label="Email" for="mf-e"><input grInput id="mf-e" placeholder="nombre@email.com" /></gr-field>
        <button modalActions grButton variant="ghost" type="button" (click)="form.set(false)">Cancelar</button><button modalActions grButton type="submit">Crear entrada</button>
      </bo-modal-form>
      <bo-drawer [(open)]="drawer" title="GRC-7K3P" sub="Laura Gómez Ruiz · Sábado mañana" badge="Reservada" badgeTone="info">
        @for (d of detalle; track d[0]) { <div class="flex justify-between border-b border-line-subtle py-3 text-body-s"><span class="text-text-tertiary">{{ d[0] }}</span><span>{{ d[1] }}</span></div> }
        <button drawerActions grButton variant="secondary" icon="mail">Reenviar email</button>
      </bo-drawer>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="c-st">
      <h2 id="c-st" class="text-ui-h5">Stepper</h2>
      @for (i of [0, 1, 2, 3]; track i) { <bo-stepper [steps]="pasos" [current]="i" /> }
      <bo-stepper [steps]="pasos" [current]="2" [error]="2" />
    </section>
    <section class="mt-8 grid gap-4 xl:grid-cols-2" aria-labelledby="c-ch">
      <h2 id="c-ch" class="text-ui-h5 xl:col-span-2">Chart card</h2>
      <bo-chart-card title="Reservas por día" period="1 jun – 30 jun" [values]="bars" [marks]="marks" />
      <bo-chart-card kind="line" title="Acumulado de entradas vs. objetivo" period="1 jun – 30 jun" [values]="acum" [goal]="2400" goalLabel="Objetivo 2.400 personas" />
      <bo-chart-card title="Reservas por día" period="1 jun – 30 jun" [loading]="true" />
      <bo-chart-card title="Reservas por día" period="1 jun – 30 jun" emptyTitle="Sin reservas en este periodo" emptyText="Las entradas se abren el 1 de junio" />
    </section>
    <section class="mt-8 grid gap-x-8 md:grid-cols-2 xl:grid-cols-3" aria-labelledby="c-ac">
      <h2 id="c-ac" class="text-ui-h5 md:col-span-2 xl:col-span-3">Activity item · Notification item</h2>
      @for (a of actividad; track a.title) { <bo-activity-item [icon]="a.icon" [tone]="a.tone" [title]="a.title" [detail]="a.detail" time="hace 2 min" /> }
      <bo-notification-item [unread]="true" title="Exportación lista para descargar" detail="entradas-2026-06-12.csv · caduca en 24 h" time="18:42" />
      <bo-notification-item title="Exportación lista para descargar" detail="entradas-2026-06-12.csv · caduca en 24 h" time="18:42" />
      <bo-notification-item icon="triangle-alert" tone="warning" title="Aforo del sábado al 94 %" detail="¿Abrir lista de espera?" time="18:42">
        <button grButton variant="secondary">Abrir lista</button><button grButton variant="ghost">Ignorar</button>
      </bo-notification-item>
    </section>
    <section class="mt-8 grid gap-4 pb-16 md:grid-cols-2" aria-labelledby="c-ie">
      <h2 id="c-ie" class="text-ui-h5 md:col-span-2">Inline edit · Checklist item</h2>
      <div class="flex flex-wrap gap-6">
        <bo-inline-edit class="w-[280px]" label="aforo" [value]="aforo()" (save)="aforo.set($event)" />
        <bo-inline-edit class="w-[280px]" label="aforo" value="600 plazas" [saving]="true" />
        <bo-inline-edit class="w-[280px]" label="aforo" value="600 plazas" error="Hay 612 reservas: el aforo no puede ser menor" />
      </div>
      <div class="flex flex-col gap-3">
        <bo-checklist-item state="done" title="Datos del evento" detail="Fecha, sede y nivel confirmados" />
        <bo-checklist-item state="progress" title="Importar atletas de la AEP" detail="96 de 148 filas revisadas"><button grButton variant="secondary">Continuar</button></bo-checklist-item>
        <bo-checklist-item state="pending" title="Abrir la venta de entradas" detail="Crea al menos una sesión"><button grButton variant="secondary">Crear sesión</button></bo-checklist-item>
        <bo-checklist-item state="blocked" title="Activar la venta del sorteo" detail="Pendiente de visto bueno legal"><button grButton variant="secondary">Ver checklist</button></bo-checklist-item>
      </div>
    </section>
  `,
})
export class ComponentesNav {
  protected readonly navBadges: (number | 'alert' | null)[] = [null, 12, 'alert'];
  protected readonly ws: BoWorkspace[] = [
    { slug: 'grcup', nombre: 'GR Cup 2026', detalle: 'grcup · 25 jul · Admin' }, { slug: 'fer', nombre: 'FER CUP II', detalle: 'fer · 25 jul · Staff' },
    { slug: 'grcup-2025', nombre: 'GR Cup 2025', detalle: 'archivada · solo lectura' },
  ];
  protected readonly palEmpty: BoPaletteGroup[] = [
    { label: 'Acciones', items: [{ id: 'a1', icon: 'plus', title: 'Nueva entrada manual', kbd: 'N E' }, { id: 'a2', icon: 'scan', title: 'Abrir escáner de check-in', kbd: 'G C' }, { id: 'a3', icon: 'upload', title: 'Publicar horarios', sub: 'Hay 3 cambios sin publicar' }] },
    { label: 'Recientes', items: [{ id: 'r1', icon: 'user', title: 'Laura Gómez Ruiz', sub: 'Atleta · F −63 · Flight B' }, { id: 'r2', icon: 'ticket', title: 'GRC-7K3P', sub: 'Entrada · Sábado mañana · 3 personas' }] },
  ];
  protected readonly palRes: BoPaletteGroup[] = [
    { label: 'Atletas · 2', items: [{ id: 'x1', icon: 'user', title: 'Laura Gómez Ruiz', sub: 'F −63 · GRStrength · Flight B' }, { id: 'x2', icon: 'user', title: 'Laura Martín Soler', sub: 'F −57 · Independiente · Flight A' }] },
    { label: 'Entradas · 1', items: [{ id: 'x3', icon: 'ticket', title: 'GRC-7K3P · Laura Gómez', sub: 'Sábado mañana · 3 personas' }] },
    { label: 'Contactos · 4', items: [{ id: 'x4', icon: 'users', title: 'laura.gomez@email.com', sub: 'Novedades confirmadas · origen ig_story' }] },
  ];
  protected readonly row = BO_ROW;
  protected readonly rowKinds = ['default', 'hover', 'selected', 'disabled', 'error', 'new'] as const;
  protected readonly skKinds: BoSkeletonKind[] = ['table', 'cards', 'kpis', 'form', 'detail'];
  protected readonly form = signal(false);
  protected readonly drawer = signal(false);
  protected readonly detalle = [['Personas', '3'], ['Email', 'laura.gomez@email.com'], ['Origen', 'ig_story_lanzamiento · Instagram'], ['Reservada', '12/06 18:22']];
  protected readonly marks: Record<number, string> = { 4: 'Lanzamiento', 13: 'Reel atletas', 29: 'Horarios' };
  protected readonly pasos = ['Subir archivo', 'Mapear columnas', 'Revisar cambios', 'Confirmar'];
  protected readonly bars = [14, 20, 17, 25, 73, 45, 35, 32, 29, 34, 40, 37, 46, 100, 79, 59, 53, 51, 57, 66, 69, 75, 82, 102, 136, 109, 95, 125, 150, 170];
  protected readonly acum = this.bars.reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + v * 1.2], []);
  protected readonly actividad = [
    { icon: 'ticket', tone: 'accent', title: 'Laura Gómez reservó 3 entradas', detail: 'Sábado mañana · ig_story_lanzamiento' },
    { icon: 'gift', tone: 'live', title: 'Nuevo item en el escaparate del sorteo', detail: 'Cinturón SBD · presencial' },
    { icon: 'mail', tone: 'info', title: 'Newsletter enviada', detail: '2.430 contactos · 41 % de apertura' },
    { icon: 'user', tone: 'success', title: 'Atleta confirmada', detail: 'Marta Ruiz · F −63' },
    { icon: 'settings', tone: 'neutral', title: 'Copia de seguridad completada', detail: 'grcup_ticketing · 12 MB' },
    { icon: 'circle-alert', tone: 'error', title: '3 emails rebotados', detail: 'Buzón inexistente · revisar contactos' },
  ] as const;
  protected readonly aforo = signal('600 plazas');
}
