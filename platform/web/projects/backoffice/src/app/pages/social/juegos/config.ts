import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrIcon, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, errText } from '../../../shared/ui';
import { SoNumber, num } from '../ui';
import { JuegosApi, type ConfigJuegos, type Jornada } from './api';

interface Campo {
  label: string;
  /** Unit shown at the right of the input («%», «pts», «min», «monedas»). */
  unidad?: string;
  valor: (c: ConfigJuegos) => number;
  cambia: (c: ConfigJuegos, v: number) => ConfigJuegos;
}

const cfgPorDefecto: ConfigJuegos = {
  porraMin: 100, porraMax: 50000,
  hito5Porra: 100, hito10Porra: 500, hito5Fantasy: 10000, hito10Fantasy: 50000, fantasyPorEuro: 10000,
  maxHitos: 100, maxClausulazos: 3, proteccionMin: 10, plantillaMax: 8, titularesMax: 5,
  clausulaInicial: 200000, clausulaMin: 50000, clausulaMax: 5000000,
  pctValido: 5, pctNulo: -4, pctBlanqueo: -30, pctDemanda: 3, pctPuesto: [25, 15, 8],
  puntos: { intentoValido: 3, pleno: 5, blanqueo: -15, cat: [20, 14, 10, 5, 2], gl: [25, 18, 12, 4], mov: [10, 6, 3] },
  activo: true, version: 1, updatedPor: '',
};

/**
 * «Juegos · Configuración» (Figma 73 · «BO · Juegos · Configuración»).
 * Recompensas, tabla de puntos, reglas de cláusula y límites. Ojo: el backend guarda la configuración completa
 * (PUT /juegos/config), así que se manda el objeto entero.
 */
@Component({
  selector: 'bo-juegos-config',
  imports: [FormsModule, RouterLink, BoPageHeader, GrAlert, GrButton, GrEmpty, GrIcon, GrSkeleton, SoNumber],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5" [class.pb-24]="!sucio()" [class.pb-44]="sucio()">
      <bo-page-header title="Juegos · Configuración" [badge]="jornadaActiva()" [badgeTone]="'accent'"
        subtitle="Recompensas, puntos, cláusulas y límites · los acredita juegos-worker con ref idempotente (§6.4)"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Juegos', 'Configuración']">
        <ng-container actions>
          <a grButton icon="chevron-left" [routerLink]="['/', comps.current()?.slug, 'juegos']">Jornadas</a>
          <button grButton variant="secondary" icon="undo" [disabled]="!sucio()" (click)="restaurar()">Restaurar valores</button>
          <button grButton variant="primary" icon="check" [loading]="guardando()" [disabled]="!sucio()" (click)="guardar()">Guardar cambios</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar los juegos">Hace falta el permiso «directo.operar».</gr-alert>
      }

      <gr-alert tone="info" title="Las monedas de porra nunca se pueden comprar con dinero real">
        Solo se acreditan por alta (100.000 por jornada), hitos de chat y premios de liquidación. Los donativos acreditan fantasy, nunca porra (§6.1 y §6.4).
        Donaciones y juegos no comparten base de datos ni código de cartera.
      </gr-alert>

      @if (cargando()) {
        <gr-skeleton class="h-96 rounded-lg" />
      } @else if (error()) {
        <gr-empty icon="wifi-off" title="No hemos podido cargar la configuración" [text]="error()">
          <button grButton (click)="cargar()">Reintentar</button>
        </gr-empty>
      } @else {
        <div class="grid gap-5 lg:grid-cols-3">
          <!-- ===== Recompensas ===== -->
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-label-xs text-text-tertiary">Recompensas · §6.4</h2>
            <table class="mt-4 w-full text-left text-body-s">
              <thead class="text-mono-xs text-text-tertiary"><tr><th class="pb-2">Origen</th><th class="pb-2 text-right">Porra</th><th class="pb-2 text-right">Fantasy</th></tr></thead>
              <tbody>
                <tr class="border-t border-line-subtle">
                  <td class="py-2.5 pr-2">Chat · cada 5 mensajes</td>
                  <td class="py-2.5"><so-number ancho="s" label="Porra por cada 5 mensajes" [valor]="form().hito5Porra" (changed)="set({ hito5Porra: $event })" /></td>
                  <td class="py-2.5 pl-2"><so-number ancho="s" label="Fantasy por cada 5 mensajes" [valor]="form().hito5Fantasy" (changed)="set({ hito5Fantasy: $event })" /></td>
                </tr>
                <tr class="border-t border-line-subtle">
                  <td class="py-2.5 pr-2">Chat · cada 10 mensajes</td>
                  <td class="py-2.5"><so-number ancho="s" label="Porra por cada 10 mensajes" [valor]="form().hito10Porra" (changed)="set({ hito10Porra: $event })" /></td>
                  <td class="py-2.5 pl-2"><so-number ancho="s" label="Fantasy por cada 10 mensajes" [valor]="form().hito10Fantasy" (changed)="set({ hito10Fantasy: $event })" /></td>
                </tr>
                <tr class="border-t border-line-subtle">
                  <td class="py-2.5 pr-2">Donativo · por euro</td>
                  <td class="py-2.5 text-right font-mono text-text-muted">—</td>
                  <td class="py-2.5 pl-2"><so-number ancho="s" label="Fantasy por euro donado" [valor]="form().fantasyPorEuro" (changed)="set({ fantasyPorEuro: $event })" /></td>
                </tr>
                <tr class="border-t border-line-subtle">
                  <td class="py-2.5 pr-2">Donativo reembolsado</td>
                  <td class="py-2.5 text-right font-mono text-text-muted">—</td>
                  <td class="py-2.5 pl-2 text-right font-mono text-text-tertiary">se retira</td>
                </tr>
              </tbody>
            </table>
            <p class="mt-4 text-body-xs text-text-tertiary">Con 10 mensajes hay dos hitos: el del 5 y el del 10 (se suman). Tope: {{ num(form().maxHitos) }} hitos por fan y jornada.</p>
          </section>

          <!-- ===== Puntos ===== -->
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-label-xs text-text-tertiary">Puntos fantasy · editable</h2>
            <ul class="mt-4 flex flex-col gap-3">
              @for (c of puntosCampos; track c.label) {
                <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span class="min-w-0 text-body-xs leading-snug text-text-secondary">{{ c.label }}</span>
                  <so-number [label]="c.label" [unidad]="c.unidad ?? ''" [valor]="c.valor(form())" (changed)="cambia(c, $event)" />
                </li>
              }
            </ul>
          </section>

          <!-- ===== Cláusulas y límites ===== -->
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-label-xs text-text-tertiary">Cláusulas y límites</h2>
            <ul class="mt-4 flex flex-col gap-3">
              @for (c of clausulaCampos; track c.label) {
                <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span class="min-w-0 text-body-xs leading-snug text-text-secondary">{{ c.label }}</span>
                  <so-number [label]="c.label" [unidad]="c.unidad ?? ''" [valor]="c.valor(form())" (changed)="cambia(c, $event)" />
                </li>
              }
            </ul>
            <p class="mt-4 text-body-xs text-text-tertiary">Redondeo a 1.000 · cambios en historial_clausulas y evento fantasy.clausula.</p>
          </section>
        </div>

        <!-- ===== Barra de cambios (solo si hay cambios pendientes) ===== -->
        @if (sucio()) {
          <div class="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-strong bg-bg-raised p-4 shadow-card">
            <div class="flex min-w-0 items-center gap-3">
              <gr-icon name="pencil" [size]="20" class="text-warning" />
              <div class="min-w-0">
                <p class="text-label-s">Cambios sin guardar</p>
                <p class="text-body-xs text-text-tertiary">Recompensas, puntos y cláusulas de la competición</p>
              </div>
            </div>
            <div class="flex gap-2">
              <button grButton variant="ghost" (click)="restaurar()">Descartar</button>
              <button grButton variant="primary" [loading]="guardando()" (click)="guardar()">Guardar cambios</button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class JuegosConfigPage {
  private readonly api = inject(JuegosApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);

  protected readonly num = num;
  protected readonly form = signal<ConfigJuegos>({ ...cfgPorDefecto });
  protected readonly original = signal<ConfigJuegos>({ ...cfgPorDefecto });
  protected readonly jornadas = signal<Jornada[]>([]);
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected readonly puntosCampos: Campo[] = [
    { label: 'Intento válido (máx. 9)', unidad: 'pts', valor: (c) => c.puntos.intentoValido, cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, intentoValido: v } }) },
    { label: 'Pleno 9/9 (bonus)', unidad: 'pts', valor: (c) => c.puntos.pleno, cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, pleno: v } }) },
    { label: 'Blanqueo (3 nulos)', unidad: 'pts', valor: (c) => c.puntos.blanqueo, cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, blanqueo: v } }) },
    { label: 'Puesto 1.º categoría', unidad: 'pts', valor: (c) => c.puntos.cat[0], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 0), v, ...c.puntos.cat.slice(1)] } }) },
    { label: 'Puesto 2.º categoría', unidad: 'pts', valor: (c) => c.puntos.cat[1], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [c.puntos.cat[0], v, ...c.puntos.cat.slice(2)] } }) },
    { label: 'Puesto 3.º categoría', unidad: 'pts', valor: (c) => c.puntos.cat[2], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 2), v, ...c.puntos.cat.slice(3)] } }) },
    { label: 'Puestos 4.º–5.º', unidad: 'pts', valor: (c) => c.puntos.cat[3], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 3), v, c.puntos.cat[4]] } }) },
    { label: 'Resto que acaba', unidad: 'pts', valor: (c) => c.puntos.cat[4], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 4), v] } }) },
    { label: 'IPF GL 1.º del sexo', unidad: 'pts', valor: (c) => c.puntos.gl[0], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [v, ...c.puntos.gl.slice(1)] } }) },
    { label: 'IPF GL 2.º', unidad: 'pts', valor: (c) => c.puntos.gl[1], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [c.puntos.gl[0], v, ...c.puntos.gl.slice(2)] } }) },
    { label: 'IPF GL 3.º', unidad: 'pts', valor: (c) => c.puntos.gl[2], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [...c.puntos.gl.slice(0, 2), v, c.puntos.gl[3]] } }) },
    { label: 'IPF GL 4.º–10.º', unidad: 'pts', valor: (c) => c.puntos.gl[3], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [...c.puntos.gl.slice(0, 3), v] } }) },
    { label: 'Movimiento 1.º', unidad: 'pts', valor: (c) => c.puntos.mov[0], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, mov: [v, ...c.puntos.mov.slice(1)] } }) },
    { label: 'Movimiento 2.º', unidad: 'pts', valor: (c) => c.puntos.mov[1], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, mov: [c.puntos.mov[0], v, c.puntos.mov[2]] } }) },
    { label: 'Movimiento 3.º', unidad: 'pts', valor: (c) => c.puntos.mov[2], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, mov: [...c.puntos.mov.slice(0, 2), v] } }) },
  ];

  protected readonly clausulaCampos: Campo[] = [
    { label: 'Cláusula inicial', unidad: 'monedas', valor: (c) => c.clausulaInicial, cambia: (c, v) => ({ ...c, clausulaInicial: v }) },
    { label: 'Intento válido', unidad: '%', valor: (c) => c.pctValido, cambia: (c, v) => ({ ...c, pctValido: v }) },
    { label: 'Intento nulo', unidad: '%', valor: (c) => c.pctNulo, cambia: (c, v) => ({ ...c, pctNulo: v }) },
    { label: 'Blanqueo', unidad: '%', valor: (c) => c.pctBlanqueo, cambia: (c, v) => ({ ...c, pctBlanqueo: v }) },
    { label: 'Compra o clausulazo', unidad: '%', valor: (c) => c.pctDemanda, cambia: (c, v) => ({ ...c, pctDemanda: v }) },
    { label: 'Ajuste 1.º puesto', unidad: '%', valor: (c) => c.pctPuesto[0], cambia: (c, v) => ({ ...c, pctPuesto: [v, c.pctPuesto[1], c.pctPuesto[2]] }) },
    { label: 'Ajuste 2.º puesto', unidad: '%', valor: (c) => c.pctPuesto[1], cambia: (c, v) => ({ ...c, pctPuesto: [c.pctPuesto[0], v, c.pctPuesto[2]] }) },
    { label: 'Ajuste 3.º puesto', unidad: '%', valor: (c) => c.pctPuesto[2], cambia: (c, v) => ({ ...c, pctPuesto: [c.pctPuesto[0], c.pctPuesto[1], v] }) },
    { label: 'Cláusula mínima', unidad: 'monedas', valor: (c) => c.clausulaMin, cambia: (c, v) => ({ ...c, clausulaMin: v }) },
    { label: 'Cláusula máxima', unidad: 'monedas', valor: (c) => c.clausulaMax, cambia: (c, v) => ({ ...c, clausulaMax: v }) },
    { label: 'Protección tras fichaje', unidad: 'min', valor: (c) => c.proteccionMin, cambia: (c, v) => ({ ...c, proteccionMin: v }) },
    { label: 'Clausulazos máx. por fan', unidad: '', valor: (c) => c.maxClausulazos, cambia: (c, v) => ({ ...c, maxClausulazos: v }) },
    { label: 'Porra · apuesta mínima', unidad: 'monedas', valor: (c) => c.porraMin, cambia: (c, v) => ({ ...c, porraMin: v }) },
    { label: 'Porra · apuesta máxima', unidad: 'monedas', valor: (c) => c.porraMax, cambia: (c, v) => ({ ...c, porraMax: v }) },
  ];

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly jornadaActiva = computed(() => {
    const l = this.jornadas();
    const hoy = new Date().toISOString().slice(0, 10);
    const j = l.find((x) => x.estado === 'en_juego') ?? l.find((x) => x.estado === 'abierta') ?? l.find((x) => x.dia === hoy);
    return j ? `Jornada activa · ${j.nombre}` : 'Sin jornada activa';
  });
  protected readonly sucio = computed(() => JSON.stringify(this.form()) !== JSON.stringify(this.original()));

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const [cfg, jornadas] = await Promise.all([this.api.config(cid), this.api.jornadas(cid)]);
      this.jornadas.set(jornadas.jornadas);
      this.form.set({ ...cfg });
      this.original.set({ ...cfg });
    } catch (e) {
      this.error.set(errText(e, 'No se pudo cargar la configuración.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected set(p: Partial<ConfigJuegos>): void {
    this.form.update((c) => ({ ...c, ...p }));
  }

  protected cambia(c: Campo, v: unknown): void {
    const n = Number(v);
    if (Number.isNaN(n)) return;
    this.form.update((f) => c.cambia(f, n));
  }

  protected restaurar(): void {
    this.form.set({ ...this.original() });
  }

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.guardando.set(true);
    try {
      const guardado = await this.api.guardarConfig(cid, this.form());
      this.form.set({ ...guardado });
      this.original.set({ ...guardado });
      this.toasts.success('Configuración de los juegos guardada');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar la configuración.'));
      await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }
}
