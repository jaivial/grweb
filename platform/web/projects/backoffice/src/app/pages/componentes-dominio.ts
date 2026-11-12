import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { GrBadge } from '@grcup/ui';
import {
  BO_ESTADOS, BoAthleteChip, BoAttemptCell, BoCapacityMeter, BoConsentProof, BoFlightCard, BoJudgeLights, BoPermissionCell, BoScanResult, BoSectionRow, BoSessionCard,
  BoTemplateCard, type BoAttempt, type BoChip, type BoConsent, type BoFlight, type BoPermiso, type BoPlantilla, type BoScan, type BoSeccion, type BoSesion,
} from '../shared/kit';

const H2 = 'text-ui-h5';
const ROW = 'flex items-start gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]';

/** Figma 50 «BO · Componentes · dominio y tiempo real» (1.ª parte): aforo, flights, directo, puerta, permisos, RGPD, plantillas y secciones. */
@Component({
  selector: 'bo-componentes-dominio',
  imports: [GrBadge, BoAthleteChip, BoAttemptCell, BoCapacityMeter, BoConsentProof, BoFlightCard, BoJudgeLights, BoPermissionCell, BoScanResult, BoSectionRow, BoSessionCard, BoTemplateCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <h2 class="mt-12 text-ui-h3 md:text-[28px]">BO · Componentes · dominio y tiempo real</h2>
    <p class="mt-2 max-w-3xl text-body-s text-text-tertiary">Piezas propias de la GR Cup: aforo y sesiones, flights, intentos y jueces, escáner de puerta, permisos, prueba de consentimiento, plantillas de email y secciones de la home. Cada una con sus estados de negocio y sus casos límite.</p>

    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-cap">
      <h2 id="d-cap" [class]="h2">Capacity meter</h2>
      <div [class]="row">@for (m of meters; track $index) { <bo-capacity-meter class="w-[360px] shrink-0" titulo="Sábado mañana · 09:00–14:00" [ocupadas]="m[0]" [aforo]="600" [espera]="24" [cerrada]="m[1]" nota="Cerrada manualmente por Nico · 18:40" /> }</div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-ses">
      <h2 id="d-ses" [class]="h2">Session card</h2>
      <div [class]="row">
        @for (s of sesiones; track s[0]) {
          <bo-session-card class="w-[360px] shrink-0" nombre="Sábado mañana" meterTitulo="Sábado mañana · 09:00–14:00" cuando="sáb 25 jul · 09:00–14:00 · puertas 08:30" [estado]="s[0]" [ocupadas]="s[1]" [aforo]="600" [espera]="24"
            nota="Cerrada manualmente por Nico · 18:40" maxPorReserva="6 personas" [apertura]="s[0] === 'draft' ? 'desde 1 jun 10:00 (programado)' : '1 jun 10:00 → 24 jul 23:59'"
            [listaEspera]="s[0] === 'full' ? '24 personas · auto-promoción ON' : 'automática al agotar'" />
        }
      </div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-fl">
      <h2 id="d-fl" [class]="h2">Athlete chip · Flight card</h2>
      <div class="flex flex-wrap gap-4">
        @for (c of chips; track c) { <bo-athlete-chip class="w-[196px]" nombre="Marta Ruiz" [estado]="c" [detalle]="c === 'conflict' ? 'Pesaje se solapa con A' : c === 'withdrawn' ? 'Baja · 12/07' : '−63 · tot. prev. 360'" /> }
      </div>
      <div [class]="row + ' pt-2'">
        @for (f of flights; track f) {
          <bo-flight-card class="w-[220px] shrink-0" nombre="Flight B" hora="10:40" detalle="Femenino −57/−63 · 14/14" pesaje="Pesaje 08:40–10:10" aviso="Pesaje se solapa con A" [resto]="11" [ocupados]="12" [plazas]="14" [estado]="f">
            @for (a of atletas; track a[0]) { <bo-athlete-chip [nombre]="a[0]" [detalle]="a[1]" /> }
          </bo-flight-card>
        }
      </div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-at">
      <h2 id="d-at" [class]="h2">Attempt cell · Judge lights</h2>
      <div class="flex flex-wrap gap-4">@for (a of intentos; track a[0]) { <bo-attempt-cell [estado]="a[0]" [peso]="a[1]" /> }</div>
      <div class="flex flex-wrap gap-4">@for (v of votos; track v) { <bo-judge-lights [votos]="v" /> }</div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-scan">
      <h2 id="d-scan" [class]="h2">Scan result</h2>
      <div class="flex flex-wrap items-start gap-4">@for (s of scans; track s[0]) { <bo-scan-result class="min-h-[268px] w-full max-w-[358px]" [estado]="s[0]" [titulo]="s[1]" [detalle]="s[2]" [boton]="s[3]" /> }</div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-perm">
      <h2 id="d-perm" [class]="h2">Permission cell · Consent proof</h2>
      <div class="flex gap-4">@for (p of permisos; track $index) { <bo-permission-cell [value]="p" /> }</div>
      <div class="flex flex-wrap items-start gap-4">
        @for (c of consents; track c[0]) {
          <bo-consent-proof class="w-full max-w-[440px]" finalidad="Novedades por email" [estado]="c[0]" texto="Novedades v2026-10 · sha256 9f3a…c1" origen="/entradas · formulario de reserva" fecha="12/06/2026 18:22:04 (Europe/Madrid)" ip="83.45.x.x (anonimizada)" [nota]="c[1]" />
        }
      </div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-tpl">
      <h2 id="d-tpl" [class]="h2">Template card · Section row</h2>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">@for (t of plantillas; track t[0]) { <bo-template-card nombre="Confirmación de entrada" disparador="Al reservar una entrada · inmediato" [estado]="t[0]" [detalle]="t[1]" /> }</div>
      <div class="flex max-w-[760px] flex-col gap-4">@for (s of secciones(); track $index) { <bo-section-row nombre="Entradas gratis · campaña" detalle='Section / Entradas · CTA "Reserva tu entrada gratis"' [estado]="s" (visible)="vis($index, $event)" /> }</div>
    </section>
    <section class="mt-8 flex flex-col gap-4" aria-labelledby="d-map">
      <h2 id="d-map" [class]="h2">Estados de dominio → tono de badge</h2>
      <p class="text-body-s text-text-tertiary">Una sola tabla para que cada estado se pinte igual en todas las pantallas y en la web pública.</p>
      <div class="overflow-hidden rounded-md border border-line-subtle">
        @for (d of dominios; track d[0]; let odd = $odd) {
          <div class="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-6" [class.bg-bg-surface]="odd">
            <span class="w-56 shrink-0 text-[14px] font-semibold">{{ d[0] }}</span>
            <span class="flex flex-wrap gap-2">@for (e of d[1]; track e[0]) { <gr-badge [tone]="e[1]">{{ e[0] }}</gr-badge> }</span>
          </div>
        }
      </div>
    </section>
  `,
})
export class ComponentesDominio {
  protected readonly h2 = H2;
  protected readonly row = ROW;
  protected readonly meters: [number, boolean][] = [[412, false], [562, false], [600, false], [612, false], [380, true]];
  protected readonly sesiones: [BoSesion, number][] = [['open', 412], ['almost', 562], ['full', 600], ['closed', 380], ['draft', 412]];
  protected readonly chips: BoChip[] = ['default', 'dragging', 'conflict', 'withdrawn'];
  protected readonly flights: BoFlight[] = ['default', 'dragging', 'drop', 'conflict', 'locked'];
  protected readonly atletas = [['Laura Gómez', '−63 · tot. prev. 337'], ['Marta Ruiz', '−63 · tot. prev. 360'], ['Lucía Martín', '−57 · tot. prev. 374']];
  protected readonly intentos: [BoAttempt, string][] = [['empty', ''], ['declared', '132,5'], ['current', '135'], ['good', '130'], ['nolift', '140'], ['corrected', '127,5'], ['pass', '']];
  protected readonly votos = ['---', 'VVV', 'VNV', 'NVN', 'NNN'];
  protected readonly scans: [BoScan, string, string, string][] = [
    ['valid', 'GRC-7K3P · Laura Gómez', '3 personas · Sábado mañana', 'Confirmar entrada (3)'],
    ['used', 'GRC-2M9Q · Pablo Romero', 'Entró a las 10:42 · Taquilla 2', 'Ver detalle'],
    ['session', 'GRC-8T1L · Marta Ruiz', 'Su entrada es para Sábado tarde (16:00)', 'Permitir igualmente'],
    ['invalid', 'Firma no reconocida', 'No es una entrada de la GR Cup 2026', 'Buscar por nombre'],
    ['offline', 'GRC-4Z7D · Diego Moreno', 'Se validará al volver la red · 14 en cola', 'Escanear siguiente'],
    ['searching', 'GRC-9H2W', 'Consultando el servidor', 'Cancelar'],
  ];
  protected readonly permisos: BoPermiso[] = ['allow', 'deny', 'inherited', 'locked'];
  protected readonly consents: [BoConsent, string][] = [
    ['confirmed', 'Doble opt-in confirmado 12/06 18:25'], ['pending', 'Email de confirmación enviado 12/06 18:22 · recordatorio en 48 h'],
    ['revoked', 'Baja desde el enlace del email · 30/06 09:12'], ['expired', 'Sin confirmar en 30 días · se borra el 12/07'],
  ];
  protected readonly plantillas: [BoPlantilla, string][] = [
    ['active', 'Enviados 1.248 · fallos 3'], ['draft', 'Sin publicar · editado hace 2 h'], ['error', 'Variable {{sesion.hora}} no existe'], ['paused', 'Pausada durante el evento'],
  ];
  protected readonly secciones = signal<BoSeccion[]>(['visible', 'hidden', 'dragging', 'changed']);
  protected readonly dominios = Object.entries(BO_ESTADOS);
  protected vis(i: number, on: boolean): void {
    this.secciones.update((s) => s.map((x, j) => (j === i ? (on ? 'visible' : 'hidden') : x)));
  }
}
