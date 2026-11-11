import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrInput, GrToasts } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, errText } from '../../../shared/ui';
import { SoCard, SoGrupo, SoGuardar, SoNumber, SoSkelFilas, num } from '../ui';
import { JuegosApi, type ConfigJuegos, type Jornada } from './api';

interface Campo {
  label: string;
  /** Unit shown at the right of the input («%», «pts», «min»). */
  unidad?: string;
  valor: (c: ConfigJuegos) => number;
  cambia: (c: ConfigJuegos, v: number) => ConfigJuegos;
}

interface Grupo {
  t: string;
  campos: Campo[];
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
 * «Juegos · Configuración» (Figma 73 · «BO · Juegos · Configuración», UI v2).
 * Recompensas, límites de la porra, tabla de puntos y reglas de cláusula, en grupos con su unidad; el valor que
 * cambia se marca en ámbar hasta guardar. Ojo: el backend guarda la configuración completa (PUT /juegos/config),
 * así que se manda el objeto entero.
 */
@Component({
  selector: 'bo-juegos-config',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, BoPageHeader, GrAlert, GrButton, GrEmpty, GrInput, SoCard, SoGrupo, SoGuardar, SoNumber, SoSkelFilas],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6" [class.pb-24]="!sucio()" [class.pb-44]="sucio()">
      <bo-page-header title="Juegos · Configuración" [badge]="jornadaActiva()" [badgeTone]="'accent'"
        subtitle="Recompensas, puntos, cláusulas y límites · los acredita juegos-worker con ref idempotente (§6.4)"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Juegos', 'Configuración']">
        <ng-container actions>
          <a grButton icon="chevron-left" [routerLink]="['/', comps.current()?.slug, 'juegos']">Jornadas</a>
          <button grButton variant="secondary" icon="undo" [disabled]="!sucio()" (click)="restaurar()">Restaurar valores</button>
          <button grButton variant="primary" icon="check" [loading]="guardando()" [disabled]="!sucio() || !puede()" (click)="guardar()">Guardar cambios</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar los juegos">Hace falta el permiso «directo.operar».</gr-alert>
      }

      <gr-alert tone="info" icon="scale" title="Las monedas de porra nunca se compran con dinero real">
        Solo se acreditan por alta (100.000 por jornada), hitos de chat y premios de liquidación. Los donativos acreditan fantasy, nunca porra (§6.1 y §6.4).
        Donaciones y juegos no comparten base de datos ni código de cartera.
      </gr-alert>

      @if (cargando()) {
        <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"><so-skel-filas [n]="8" [avatar]="false" /></div>
      } @else if (error()) {
        <div class="rounded-lg border border-line-subtle bg-bg-card">
          <gr-empty icon="wifi-off" title="No hemos podido cargar la configuración" [text]="error()">
            <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
          </gr-empty>
        </div>
      } @else {
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <!-- ===== Recompensas ===== -->
          <so-card titulo="Recompensas" ayuda="Monedas por participar · las acredita juegos-worker con ref idempotente (§6.4)">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[440px] text-left text-body-s">
                <thead class="font-mono text-mono-xs text-text-tertiary">
                  <tr class="border-b border-line-subtle"><th class="pb-2 font-medium">Origen</th><th class="w-[130px] pb-2 text-right font-medium">Porra</th><th class="w-[130px] pb-2 text-right font-medium">Fantasy</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="py-2 pr-2 text-text-secondary">Chat · cada 5 mensajes</td>
                    <td class="py-2"><so-number ancho="s" label="Porra por cada 5 mensajes" [disabled]="!puede()" [valor]="form().hito5Porra" [cambiado]="form().hito5Porra !== original().hito5Porra" (changed)="set({ hito5Porra: $event })" /></td>
                    <td class="py-2 pl-2"><so-number ancho="s" label="Fantasy por cada 5 mensajes" [disabled]="!puede()" [valor]="form().hito5Fantasy" [cambiado]="form().hito5Fantasy !== original().hito5Fantasy" (changed)="set({ hito5Fantasy: $event })" /></td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-2 text-text-secondary">Chat · cada 10 mensajes</td>
                    <td class="py-2"><so-number ancho="s" label="Porra por cada 10 mensajes" [disabled]="!puede()" [valor]="form().hito10Porra" [cambiado]="form().hito10Porra !== original().hito10Porra" (changed)="set({ hito10Porra: $event })" /></td>
                    <td class="py-2 pl-2"><so-number ancho="s" label="Fantasy por cada 10 mensajes" [disabled]="!puede()" [valor]="form().hito10Fantasy" [cambiado]="form().hito10Fantasy !== original().hito10Fantasy" (changed)="set({ hito10Fantasy: $event })" /></td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-2 text-text-secondary">Donativo · por euro</td>
                    <td class="py-2 text-right font-mono text-text-muted">—</td>
                    <td class="py-2 pl-2"><so-number ancho="s" label="Fantasy por euro donado" [disabled]="!puede()" [valor]="form().fantasyPorEuro" [cambiado]="form().fantasyPorEuro !== original().fantasyPorEuro" (changed)="set({ fantasyPorEuro: $event })" /></td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-2 text-text-secondary">Donativo reembolsado</td>
                    <td class="py-2 text-right font-mono text-text-muted">—</td>
                    <td class="py-2 pl-2 text-right text-body-xs text-text-tertiary">se retira</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-body-xs text-text-tertiary">Con 10 mensajes hay dos hitos (el del 5 y el del 10, se suman). Tope: {{ num(form().maxHitos) }} hitos por fan y jornada (se cambia en Chat).</p>
          </so-card>

          <so-card titulo="Límites de la porra" ayuda="Apuesta por mercado y fan, en monedas de porra" class="self-start">
            @for (c of limiteCampos; track c.label) {
              <div class="flex items-center gap-3">
                @if (cambiado(c)) { <span class="size-1.5 shrink-0 rounded-pill bg-warning" aria-hidden="true"></span> }
                <span class="min-w-0 flex-1 text-body-s text-text-secondary">{{ c.label }}</span>
                <so-number [label]="c.label" [disabled]="!puede()" [valor]="c.valor(form())" [cambiado]="cambiado(c)" (changed)="cambia(c, $event)" />
              </div>
            }
          </so-card>
        </div>

        <so-card titulo="Cierre de apuestas" ayuda="Hora (Madrid) del día de la jornada · la home muestra la cuenta atrás · vacío: sin cuenta atrás">
          @if (!jornadasAbiertas().length) {
            <p class="text-body-s text-text-tertiary">No hay jornadas sin cerrar.</p>
          }
          <div class="flex flex-col gap-2.5">
            @for (j of jornadasAbiertas(); track j.id) {
              <div class="flex flex-wrap items-center gap-3">
                <span class="min-w-0 flex-1 truncate text-body-s text-text-secondary">{{ j.nombre }} · {{ j.dia }}</span>
                <input grInput type="time" class="w-36 [color-scheme:dark]" [attr.aria-label]="'Hora de cierre de ' + j.nombre"
                  [disabled]="!puede()" [value]="j.horaCierre ?? ''" #hc />
                <button grButton size="s" [disabled]="!puede()" [loading]="guardandoCierre() === j.id" (click)="guardarCierre(j, hc.value)">Guardar</button>
              </div>
            }
          </div>
        </so-card>

        <so-card titulo="Puntos fantasy" ayuda="Lo que suma cada atleta de la plantilla en la jornada">
          @if (cambiosEn(puntosGrupos)) { <span cardActions class="inline-flex h-6 items-center rounded-2xs border border-warning/30 bg-warning/10 px-2 font-mono text-mono-xs text-warning">{{ cambiosEn(puntosGrupos) }} {{ cambiosEn(puntosGrupos) === 1 ? 'cambio' : 'cambios' }}</span> }
          <div class="grid gap-x-10 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
            @for (col of puntosCols; track $index) {
              <div class="flex flex-col gap-6">
                @for (g of col; track g.t) { <ng-container [ngTemplateOutlet]="grupoTpl" [ngTemplateOutletContext]="{ $implicit: g }" /> }
              </div>
            }
          </div>
        </so-card>

        <so-card titulo="Cláusulas y mercado de fichajes" ayuda="Redondeo a 1.000 · cada cambio queda en historial_clausulas y emite fantasy.clausula">
          @if (cambiosEn(clausulaGrupos)) { <span cardActions class="inline-flex h-6 items-center rounded-2xs border border-warning/30 bg-warning/10 px-2 font-mono text-mono-xs text-warning">{{ cambiosEn(clausulaGrupos) }} {{ cambiosEn(clausulaGrupos) === 1 ? 'cambio' : 'cambios' }}</span> }
          <div class="grid gap-x-10 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
            @for (col of clausulaCols; track $index) {
              <div class="flex flex-col gap-6">
                @for (g of col; track g.t) { <ng-container [ngTemplateOutlet]="grupoTpl" [ngTemplateOutletContext]="{ $implicit: g }" /> }
              </div>
            }
          </div>
        </so-card>

        <ng-template #grupoTpl let-g>
          <div class="flex flex-col gap-2.5">
            <so-grupo>{{ g.t }}</so-grupo>
            @for (c of g.campos; track c.label) {
              <div class="flex items-center gap-3">
                @if (cambiado(c)) { <span class="size-1.5 shrink-0 rounded-pill bg-warning" aria-hidden="true"></span> }
                <span class="min-w-0 flex-1 truncate text-body-s text-text-secondary" [title]="c.label">{{ c.label }}</span>
                <so-number [ancho]="c.unidad ? 'xs' : 'm'" [label]="g.t + ' · ' + c.label" [unidad]="c.unidad ?? ''" [disabled]="!puede()" [valor]="c.valor(form())" [cambiado]="cambiado(c)" (changed)="cambia(c, $event)" />
              </div>
            }
          </div>
        </ng-template>

        @if (sucio()) {
          <so-guardar [titulo]="cambios() + (cambios() === 1 ? ' cambio sin guardar' : ' cambios sin guardar')" detalle="Recompensas, puntos y cláusulas de la competición">
            <button grButton class="flex-1 sm:flex-none" variant="ghost" (click)="restaurar()">Descartar</button>
            <button grButton class="flex-1 sm:flex-none" variant="primary" [loading]="guardando()" [disabled]="!puede()" (click)="guardar()">Guardar cambios</button>
          </so-guardar>
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
  protected readonly jornadasAbiertas = computed(() => this.jornadas().filter((j) => j.estado !== 'cerrada'));
  protected readonly guardandoCierre = signal('');
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  private readonly g = (t: string, campos: Campo[]): Grupo => ({ t, campos });
  protected readonly puntosGrupos: Grupo[] = [
    this.g('INTENTOS', [
      { label: 'Intento válido (máx. 9)', unidad: 'pts', valor: (c) => c.puntos.intentoValido, cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, intentoValido: v } }) },
      { label: 'Pleno 9/9 (bonus)', unidad: 'pts', valor: (c) => c.puntos.pleno, cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, pleno: v } }) },
      { label: 'Blanqueo (3 nulos)', unidad: 'pts', valor: (c) => c.puntos.blanqueo, cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, blanqueo: v } }) },
    ]),
    this.g('MOVIMIENTOS', [
      { label: '1.º', unidad: 'pts', valor: (c) => c.puntos.mov[0], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, mov: [v, ...c.puntos.mov.slice(1)] } }) },
      { label: '2.º', unidad: 'pts', valor: (c) => c.puntos.mov[1], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, mov: [c.puntos.mov[0], v, c.puntos.mov[2]] } }) },
      { label: '3.º', unidad: 'pts', valor: (c) => c.puntos.mov[2], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, mov: [...c.puntos.mov.slice(0, 2), v] } }) },
    ]),
    this.g('PUESTO EN CATEGORÍA', [
      { label: '1.º', unidad: 'pts', valor: (c) => c.puntos.cat[0], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 0), v, ...c.puntos.cat.slice(1)] } }) },
      { label: '2.º', unidad: 'pts', valor: (c) => c.puntos.cat[1], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [c.puntos.cat[0], v, ...c.puntos.cat.slice(2)] } }) },
      { label: '3.º', unidad: 'pts', valor: (c) => c.puntos.cat[2], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 2), v, ...c.puntos.cat.slice(3)] } }) },
      { label: '4.º–5.º', unidad: 'pts', valor: (c) => c.puntos.cat[3], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 3), v, c.puntos.cat[4]] } }) },
      { label: 'Resto que acaba', unidad: 'pts', valor: (c) => c.puntos.cat[4], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, cat: [...c.puntos.cat.slice(0, 4), v] } }) },
    ]),
    this.g('IPF GL DEL SEXO', [
      { label: '1.º', unidad: 'pts', valor: (c) => c.puntos.gl[0], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [v, ...c.puntos.gl.slice(1)] } }) },
      { label: '2.º', unidad: 'pts', valor: (c) => c.puntos.gl[1], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [c.puntos.gl[0], v, ...c.puntos.gl.slice(2)] } }) },
      { label: '3.º', unidad: 'pts', valor: (c) => c.puntos.gl[2], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [...c.puntos.gl.slice(0, 2), v, c.puntos.gl[3]] } }) },
      { label: '4.º–10.º', unidad: 'pts', valor: (c) => c.puntos.gl[3], cambia: (c, v) => ({ ...c, puntos: { ...c.puntos, gl: [...c.puntos.gl.slice(0, 3), v] } }) },
    ]),
  ];
  protected readonly puntosCols: Grupo[][] = [[this.puntosGrupos[0], this.puntosGrupos[1]], [this.puntosGrupos[2]], [this.puntosGrupos[3]]];
  protected readonly clausulaGrupos: Grupo[] = [
    this.g('VALOR DE LA CLÁUSULA · MONEDAS', [
      { label: 'Inicial', unidad: '', valor: (c) => c.clausulaInicial, cambia: (c, v) => ({ ...c, clausulaInicial: v }) },
      { label: 'Mínima', unidad: '', valor: (c) => c.clausulaMin, cambia: (c, v) => ({ ...c, clausulaMin: v }) },
      { label: 'Máxima', unidad: '', valor: (c) => c.clausulaMax, cambia: (c, v) => ({ ...c, clausulaMax: v }) },
    ]),
    this.g('MERCADO', [
      { label: 'Protección tras fichar', unidad: 'min', valor: (c) => c.proteccionMin, cambia: (c, v) => ({ ...c, proteccionMin: v }) },
      { label: 'Clausulazos por fan', unidad: 'máx.', valor: (c) => c.maxClausulazos, cambia: (c, v) => ({ ...c, maxClausulazos: v }) },
    ]),
    this.g('VARIACIÓN POR INTENTO', [
      { label: 'Intento válido', unidad: '%', valor: (c) => c.pctValido, cambia: (c, v) => ({ ...c, pctValido: v }) },
      { label: 'Intento nulo', unidad: '%', valor: (c) => c.pctNulo, cambia: (c, v) => ({ ...c, pctNulo: v }) },
      { label: 'Blanqueo', unidad: '%', valor: (c) => c.pctBlanqueo, cambia: (c, v) => ({ ...c, pctBlanqueo: v }) },
      { label: 'Compra o clausulazo', unidad: '%', valor: (c) => c.pctDemanda, cambia: (c, v) => ({ ...c, pctDemanda: v }) },
    ]),
    this.g('AJUSTE POR PUESTO FINAL', [
      { label: '1.º', unidad: '%', valor: (c) => c.pctPuesto[0], cambia: (c, v) => ({ ...c, pctPuesto: [v, c.pctPuesto[1], c.pctPuesto[2]] }) },
      { label: '2.º', unidad: '%', valor: (c) => c.pctPuesto[1], cambia: (c, v) => ({ ...c, pctPuesto: [c.pctPuesto[0], v, c.pctPuesto[2]] }) },
      { label: '3.º', unidad: '%', valor: (c) => c.pctPuesto[2], cambia: (c, v) => ({ ...c, pctPuesto: [c.pctPuesto[0], c.pctPuesto[1], v] }) },
    ]),
  ];
  protected readonly clausulaCols: Grupo[][] = [[this.clausulaGrupos[0], this.clausulaGrupos[1]], [this.clausulaGrupos[2]], [this.clausulaGrupos[3]]];
  protected readonly limiteCampos: Campo[] = [
    { label: 'Apuesta mínima', unidad: '', valor: (c) => c.porraMin, cambia: (c, v) => ({ ...c, porraMin: v }) },
    { label: 'Apuesta máxima', unidad: '', valor: (c) => c.porraMax, cambia: (c, v) => ({ ...c, porraMax: v }) },
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
  private readonly todosCampos = computed(() => [...this.puntosGrupos, ...this.clausulaGrupos].flatMap((g) => g.campos).concat(this.limiteCampos));
  /** Valores distintos de los guardados (recompensas + campos de los grupos). */
  protected readonly cambios = computed(() => {
    const f = this.form();
    const o = this.original();
    const rec = (['hito5Porra', 'hito10Porra', 'hito5Fantasy', 'hito10Fantasy', 'fantasyPorEuro'] as const).filter((k) => f[k] !== o[k]).length;
    return rec + this.todosCampos().filter((c) => c.valor(f) !== c.valor(o)).length || (this.sucio() ? 1 : 0);
  });

  protected cambiado(c: Campo): boolean {
    return c.valor(this.form()) !== c.valor(this.original());
  }
  protected cambiosEn(gs: Grupo[]): number {
    return gs.flatMap((g) => g.campos).filter((c) => this.cambiado(c)).length;
  }

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

  protected async guardarCierre(j: Jornada, hora: string): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.guardandoCierre.set(j.id);
    try {
      await this.api.jornada(cid, j.id, { horaCierre: hora });
      this.jornadas.update((l) => l.map((x) => (x.id === j.id ? { ...x, horaCierre: hora } : x)));
      this.toasts.success(hora ? `Cierre de ${j.nombre} a las ${hora}` : `Cierre de ${j.nombre} quitado`);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar la hora de cierre.'));
    } finally {
      this.guardandoCierre.set('');
    }
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
