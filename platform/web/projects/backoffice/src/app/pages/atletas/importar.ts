import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrIcon, GrToasts, type GrTone } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, errText } from '../../shared/ui';
import { AtletasApi, type FilaDiff, type Importacion } from './api';

const RESULTADO: Record<FilaDiff['accion'] | 'baja', { label: string; tone: GrTone }> = {
  crear: { label: 'Crear', tone: 'success' },
  actualizar: { label: 'Actualizar', tone: 'info' },
  igual: { label: 'Igual', tone: 'neutral' },
  error: { label: 'Error', tone: 'danger' },
  baja: { label: 'Baja', tone: 'neutral' },
};

/** «Importar acta de la AEP» (Figma page 55 · «Atletas · importar AEP»): upload → map columns → review the diff → confirm. */
@Component({
  selector: 'bo-atletas-importar',
  imports: [FormsModule, RouterLink, BoPageHeader, GrAlert, GrBadge, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let imp = importacion();
    <div class="mx-auto flex max-w-[1180px] flex-col gap-6">
      <bo-page-header title="Importar acta de la AEP" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Atletas', 'Importar']">
        <a actions grButton variant="ghost" routerLink="..">{{ paso() === 4 && imp?.estado === 'confirmada' ? 'Volver a atletas' : 'Cancelar' }}</a>
      </bo-page-header>

      <ol class="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Pasos">
        @for (p of pasos; track p.n; let last = $last) {
          <li class="flex shrink-0 items-center gap-2" [attr.aria-current]="paso() === p.n ? 'step' : null">
            <span class="flex size-7 items-center justify-center rounded-full text-label-xs" [class]="paso() > p.n ? 'bg-accent text-white' : paso() === p.n ? 'border-2 border-accent text-accent-text' : 'border border-line-strong text-text-tertiary'">
              @if (paso() > p.n) { <gr-icon name="check" [size]="14" /> } @else { {{ p.n }} }
            </span>
            <span class="text-label-s" [class]="paso() >= p.n ? 'text-text-primary' : 'text-text-tertiary'">{{ p.label }}</span>
            @if (!last) { <span class="mx-2 h-px w-8 md:w-24" [class]="paso() > p.n ? 'bg-accent' : 'bg-line-strong'"></span> }
          </li>
        }
      </ol>

      @switch (paso()) {
        @case (1) {
          <label class="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors"
            [class]="arrastrando() ? 'border-accent-text bg-accent-deep/20' : 'border-line-strong bg-bg-card hover:border-text-tertiary'"
            (dragover)="$event.preventDefault(); arrastrando.set(true)" (dragleave)="arrastrando.set(false)" (drop)="soltar($event)">
            <span class="flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="download" [size]="22" class="rotate-180" /></span>
            <span class="text-ui-h5">{{ subiendo() ? 'Leyendo el acta…' : 'Arrastra el acta aquí o pulsa para elegirla' }}</span>
            <span class="text-body-s text-text-tertiary">.xlsx o .csv de la AEP · máx. 5 MB · una fila por atleta</span>
            <input type="file" class="sr-only" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" (change)="elegir($event)" [disabled]="subiendo()" />
          </label>
          <p class="text-body-s text-text-tertiary">¿No tienes el formato? <button type="button" class="text-accent-text underline" (click)="plantilla()">Descarga la plantilla del acta</button>. La importación es idempotente por licencia: volver a subir el acta actualiza los cambios y marca como baja a quien ya no aparece.</p>
          @if (error()) { <gr-alert tone="danger" title="No se pudo leer el acta">{{ error() }}</gr-alert> }
        }
        @case (2) {
          <section class="rounded-lg border border-line-subtle bg-bg-card">
            <header class="border-b border-line-subtle px-5 py-4">
              <h2 class="text-ui-h5">Mapear columnas · {{ imp?.archivo }}</h2>
              <p class="mt-0.5 text-body-xs text-text-tertiary">{{ imp?.total }} filas · hemos propuesto un mapeo según las cabeceras; revísalo antes de seguir.</p>
            </header>
            <ul>
              @for (c of imp?.campos ?? []; track c.clave) {
                <li class="grid gap-2 border-b border-line-subtle px-5 py-3 last:border-0 md:grid-cols-[220px_260px_minmax(0,1fr)] md:items-center">
                  <label [for]="'m-' + c.clave" class="text-label-s">{{ c.etiqueta }} @if (c.obligatorio) { <span class="text-accent-text">*</span> }</label>
                  <select [id]="'m-' + c.clave" [ngModel]="mapeo()[c.clave] ?? ''" (ngModelChange)="mapear(c.clave, $event)" class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-body-s md:h-10">
                    <option value="">— No importar —</option>
                    @for (col of imp?.columnas ?? []; track col) { <option [value]="col">{{ col }}</option> }
                  </select>
                  <span class="truncate text-mono-xs text-text-tertiary">{{ ejemplo(c.clave) }}</span>
                </li>
              }
            </ul>
          </section>
          @if (error()) { <gr-alert tone="danger" title="Revisa el mapeo">{{ error() }}</gr-alert> }
          <div class="flex justify-end gap-2">
            <button grButton variant="ghost" (click)="paso.set(1)">Atrás</button>
            <button grButton variant="primary" [loading]="trabajando()" (click)="revisar()">Revisar cambios</button>
          </div>
        }
        @case (3) {
          @if (imp) {
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
              @for (k of kpis(); track k.label) {
                <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <p class="text-label-xs text-text-tertiary">{{ k.label }}</p>
                  <p class="mt-2 text-[40px] leading-none font-bold" [class]="k.cls">{{ k.n }}</p>
                  <p class="mt-2 text-body-xs text-text-tertiary">{{ k.caption }}</p>
                </div>
              }
            </div>
            @if (imp.resumen.errores) {
              <gr-alert tone="warning" [title]="imp.resumen.errores + (imp.resumen.errores === 1 ? ' fila con errores no se importará' : ' filas con errores no se importarán')">
                {{ resumenErrores() }}
                <button alertAction type="button" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-warning" (click)="informe()">Descargar informe <gr-icon name="arrow-right" [size]="14" /></button>
              </gr-alert>
            }
            <section class="rounded-lg border border-line-subtle bg-bg-card">
              <div class="hidden md:block">
                <table class="w-full table-fixed text-left">
                  <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                    <tr><th class="w-16 px-4 py-3 font-normal">Fila</th><th class="w-56 px-3 py-3 font-normal">Atleta</th><th class="w-32 px-3 py-3 font-normal">Licencia</th><th class="px-3 py-3 font-normal">Cambio</th><th class="w-32 px-3 py-3 font-normal">Resultado</th></tr>
                  </thead>
                  <tbody>
                    @for (f of filasVista(); track f.key) {
                      <tr class="border-b border-line-subtle last:border-0" [class.bg-accent-deep/10]="f.accion === 'error'">
                        <td class="px-4 py-3 text-mono-s">{{ f.fila || '–' }}</td>
                        <td class="truncate px-3 py-3 text-label-s">{{ f.nombre || '–' }}</td>
                        <td class="px-3 py-3 text-mono-s">{{ f.licencia || '–' }}</td>
                        <td class="px-3 py-3 text-body-s text-text-secondary">{{ f.texto }}</td>
                        <td class="px-3 py-3"><gr-badge [tone]="resultado[f.accion].tone">{{ resultado[f.accion].label }}</gr-badge></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <ul class="md:hidden">
                @for (f of filasVista(); track f.key) {
                  <li class="flex items-start gap-3 border-b border-line-subtle px-4 py-3 last:border-0">
                    <span class="min-w-0 flex-1"><span class="block truncate text-label-s">{{ f.nombre || '–' }} <span class="text-mono-xs text-text-tertiary">· fila {{ f.fila || '–' }}</span></span><span class="block text-body-xs text-text-tertiary">{{ f.texto }}</span></span>
                    <gr-badge [tone]="resultado[f.accion].tone">{{ resultado[f.accion].label }}</gr-badge>
                  </li>
                }
              </ul>
              @if (!filasVista().length) { <p class="px-5 py-8 text-center text-body-s text-text-tertiary">No hay cambios: el acta coincide con los atletas actuales.</p> }
            </section>
            <div class="flex justify-end gap-2">
              <button grButton variant="ghost" (click)="paso.set(2)">Atrás</button>
              <button grButton variant="primary" [disabled]="!aplicables()" [loading]="trabajando()" (click)="confirmar()">Importar {{ aplicables() }} {{ aplicables() === 1 ? 'fila' : 'filas' }}</button>
            </div>
          }
        }
        @case (4) {
          <section class="flex flex-col items-center rounded-lg border border-line-subtle bg-bg-card px-6 py-12 text-center">
            @if (imp?.estado === 'confirmada') {
              <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="28" /></span>
              <h2 class="mt-4 text-ui-h4">Acta importada</h2>
              <p class="mt-2 text-body-s text-text-secondary">{{ imp.resumen.nuevos }} nuevos · {{ imp.resumen.cambios }} actualizados · {{ imp.resumen.bajas }} bajas{{ imp.resumen.errores ? ' · ' + imp.resumen.errores + ' filas omitidas' : '' }}</p>
              <a grButton variant="primary" class="mt-6" routerLink="..">Ver atletas</a>
            } @else if (imp?.estado === 'fallida') {
              <gr-alert tone="danger" title="La importación se ha detenido">Puedes reintentarla: las filas ya aplicadas no se duplican.</gr-alert>
              <button grButton variant="primary" class="mt-6" [loading]="trabajando()" (click)="confirmar()">Reintentar</button>
            } @else {
              <h2 class="text-ui-h4">Importando…</h2>
              <p class="mt-2 text-body-s text-text-secondary">{{ imp?.hechas ?? 0 }} de {{ totalTrabajo() }} · puedes salir de esta pantalla, te avisaremos al terminar.</p>
              <div class="mt-6 h-2 w-full max-w-md overflow-hidden rounded-pill bg-bg-raised" role="progressbar" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full rounded-pill bg-accent transition-[width] duration-500" [style.width.%]="pct()"></div>
              </div>
            }
          </section>
        }
      }
    </div>
  `,
})
export class AtletasImportarPage {
  protected readonly comps = inject(Competitions);
  private readonly api = inject(AtletasApi);
  private readonly toasts = inject(GrToasts);
  private readonly router = inject(Router);
  protected readonly resultado = RESULTADO;
  protected readonly pasos = [{ n: 1, label: 'Subir archivo' }, { n: 2, label: 'Mapear columnas' }, { n: 3, label: 'Revisar cambios' }, { n: 4, label: 'Confirmar' }];
  protected readonly paso = signal(1);
  protected readonly importacion = signal<Importacion | null>(null);
  protected readonly mapeo = signal<Record<string, string>>({});
  protected readonly arrastrando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly trabajando = signal(false);
  protected readonly error = signal('');
  private poll?: ReturnType<typeof setInterval>;

  protected readonly kpis = computed(() => {
    const r = this.importacion()?.resumen;
    if (!r) return [];
    return [
      { label: 'Nuevos', n: r.nuevos, caption: 'se crearán', cls: '' },
      { label: 'Con cambios', n: r.cambios, caption: 'categoría, club o estado', cls: '' },
      { label: 'Bajas', n: r.bajas, caption: 'ya no están en el acta', cls: '' },
      { label: 'Con errores', n: r.errores, caption: 'se omiten', cls: r.errores ? 'text-accent-text' : '' },
    ];
  });
  protected readonly aplicables = computed(() => {
    const r = this.importacion()?.resumen;
    return r ? r.nuevos + r.cambios + r.bajas : 0;
  });
  protected readonly totalTrabajo = computed(() => this.importacion()?.resumen ? this.aplicables() : 0);
  protected readonly pct = computed(() => {
    const t = this.totalTrabajo();
    return t ? Math.min(100, Math.round(((this.importacion()?.hechas ?? 0) * 100) / t)) : 0;
  });
  protected readonly filasVista = computed(() => {
    const imp = this.importacion();
    if (!imp) return [];
    const filas = imp.filas.map((f) => ({ key: 'f' + f.fila, fila: f.fila, nombre: f.nombre, licencia: f.licencia, accion: f.accion as FilaDiff['accion'] | 'baja', texto: f.error || f.cambios.join(' · ') }));
    const bajas = imp.resumen.listaBajas.map((b) => ({ key: 'b' + b.atletaId, fila: 0, nombre: b.nombre, licencia: b.licencia, accion: 'baja' as const, texto: 'No aparece en el acta nueva' }));
    return [...filas.filter((f) => f.accion === 'error'), ...filas.filter((f) => f.accion !== 'error'), ...bajas];
  });
  protected readonly resumenErrores = computed(() => (this.importacion()?.filas ?? []).filter((f) => f.accion === 'error').slice(0, 3).map((f) => `Fila ${f.fila}: ${f.error.toLowerCase()}`).join(' · '));

  constructor() {
    const sub = inject(Realtime).events.subscribe((e) => {
      const imp = this.importacion();
      if (e.tipo !== 'import.progreso' || !imp || e.datos?.['importacionId'] !== imp.id) return;
      this.importacion.set({ ...imp, hechas: Number(e.datos['hechas'] ?? imp.hechas), estado: (e.datos['estado'] as Importacion['estado']) ?? imp.estado });
      if (e.datos['estado'] === 'confirmada') this.terminar();
    });
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      clearInterval(this.poll);
    });
  }

  protected soltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(false);
    const f = ev.dataTransfer?.files?.[0];
    if (f) void this.subir(f);
  }
  protected elegir(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) void this.subir(f);
  }

  private async subir(f: File): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.error.set('');
    this.subiendo.set(true);
    try {
      const imp = await this.api.subirActa(cid, f);
      this.importacion.set(imp);
      this.mapeo.set({ ...imp.mapeo });
      this.paso.set(2);
    } catch (e) {
      this.error.set(errText(e, 'Comprueba que es el .xlsx o .csv de la AEP.'));
    } finally {
      this.subiendo.set(false);
    }
  }

  protected mapear(campo: string, col: string): void {
    this.mapeo.update((m) => ({ ...m, [campo]: col }));
  }
  protected ejemplo(campo: string): string {
    const imp = this.importacion();
    const col = this.mapeo()[campo];
    if (!imp || !col) return '';
    const i = imp.columnas.indexOf(col);
    return (imp.muestra ?? []).map((r) => r[i]).filter(Boolean).slice(0, 2).join(' · ');
  }

  protected async revisar(): Promise<void> {
    const cid = this.comps.current()?.id;
    const imp = this.importacion();
    if (!cid || !imp) return;
    this.error.set('');
    this.trabajando.set(true);
    try {
      const r = await this.api.mapear(cid, imp.id, this.mapeo());
      this.importacion.set({ ...r, muestra: imp.muestra });
      this.paso.set(3);
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.trabajando.set(false);
    }
  }

  protected async confirmar(): Promise<void> {
    const cid = this.comps.current()?.id;
    const imp = this.importacion();
    if (!cid || !imp) return;
    this.trabajando.set(true);
    try {
      const r = await this.api.confirmar(cid, imp.id);
      this.importacion.set({ ...imp, estado: r.estado, hechas: 0 });
      this.paso.set(4);
      // SSE gives the live progress; polling is the fallback if the stream is down.
      clearInterval(this.poll);
      this.poll = setInterval(async () => {
        const s = await this.api.importacion(cid, imp.id).catch(() => null);
        if (!s) return;
        this.importacion.set({ ...s, muestra: imp.muestra });
        if (s.estado === 'confirmada' || s.estado === 'fallida') this.terminar();
      }, 2500);
    } catch (e) {
      this.toasts.error('No se pudo confirmar', errText(e));
    } finally {
      this.trabajando.set(false);
    }
  }

  private terminar(): void {
    clearInterval(this.poll);
    const imp = this.importacion();
    if (imp?.estado === 'confirmada') this.toasts.success('Acta importada', `${imp.resumen.nuevos} nuevos · ${imp.resumen.cambios} actualizados · ${imp.resumen.bajas} bajas`);
  }

  /** Error report (CSV, generated in the browser from the reviewed rows). */
  protected informe(): void {
    const rows = [['Fila', 'Atleta', 'Licencia', 'Error'], ...(this.importacion()?.filas ?? []).filter((f) => f.accion === 'error').map((f) => [String(f.fila), f.nombre, f.licencia, f.error])];
    const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'errores-acta.csv';
    a.click();
  }

  protected async plantilla(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (cid) await this.api.plantilla(cid).catch((e) => this.toasts.error('No se pudo descargar', errText(e)));
  }

  protected volver(): void {
    void this.router.navigate(['/', this.comps.current()?.slug, 'atletas']);
  }
}
