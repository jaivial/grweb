import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrBadge, GrButton, GrInput, GrSkeleton, GrToasts, fmtShortDate } from '@grcup/ui';
import { Confirm, errText } from '../../shared/ui';
import { AtletasApi } from './api';
import { SolicitudesApi } from './solicitudes-api';
import {
  DECISION, ORIGEN, categoriaTexto, estadoPadron, nivelTexto, normTexto,
  type EmparejamientoPadron, type FilaPadron, type PersonaPadron,
} from './padron-model';

/** Una fila de la comparación (dato declarado | fila del padrón). */
interface FilaComparada {
  clave: string;
  etiqueta: string;
  a: string;
  p: string;
  distinto: boolean;
}

/**
 * «Padrón AEP»: la coincidencia del atleta o de la solicitud con la lista oficial, las diferencias al lado y las
 * decisiones del equipo (confirmar, descartar, elegir otra fila, reintentar con la IA). Un solo componente para la
 * ficha del atleta y para la revisión de una solicitud.
 */
@Component({
  selector: 'bo-padron-match',
  imports: [FormsModule, GrBadge, GrButton, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <h3 [class]="solicitudId() ? 'text-label-xs text-text-muted uppercase' : 'text-ui-h5'">Padrón AEP</h3>
        @if (emp()) { <gr-badge [tone]="estado().tone">{{ estado().l }}</gr-badge> }
      </div>

      @if (cargando()) {
        <gr-skeleton class="h-24" />
      } @else if (error(); as err) {
        <p class="flex flex-wrap items-center gap-2 text-body-s text-text-tertiary">{{ err }}
          <button grButton size="s" variant="ghost" icon="refresh" (click)="cargar()">Reintentar</button>
        </p>
      } @else if (emp(); as e) {
        <p class="text-body-s text-text-secondary">{{ e.detalle.motivo || 'Todavía no se ha comparado con el padrón.' }}</p>

        @if (e.inscripcion; as f) {
          <!-- El dato del atleta al lado del padrón: lo que no coincide va marcado, no hay que buscarlo -->
          <div class="overflow-hidden rounded-md border border-line-subtle">
            <div class="grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-line-subtle bg-bg-surface px-3 py-2 text-label-xs text-text-muted uppercase sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
              <span></span><span>{{ solicitudId() ? 'Solicitud' : 'Atleta' }}</span><span>Padrón AEP</span>
            </div>
            @for (c of filas(f); track c.clave) {
              <div class="grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2 border-b border-line-subtle px-3 py-2 last:border-0 sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]"
                [class]="c.distinto ? 'bg-warning/8' : ''">
                <span class="text-body-xs text-text-tertiary">{{ c.etiqueta }}</span>
                <span class="text-body-s break-words" [class.font-semibold]="c.distinto" [class.text-warning]="c.distinto">{{ c.a || '—' }}</span>
                <span class="text-body-s break-words" [class.font-semibold]="c.distinto" [class.text-warning]="c.distinto">{{ c.p || '—' }}</span>
              </div>
            }
          </div>
          @if (f.estadoEnlace === 'sugerido') {
            <p class="text-body-xs text-text-tertiary">Esta fila está reservada como propuesta: nadie la ha enlazado todavía.</p>
          }
        } @else {
          <p class="rounded-md border border-dashed border-line-strong px-3 py-4 text-center text-body-s text-text-tertiary">
            Ninguna fila del padrón con el nombre, el sexo y el año de {{ persona().nombre }}. Búscala a mano si crees que está en la lista.
          </p>
        }

        @if (canEdit()) {
          <div class="flex flex-wrap gap-2">
            @if (e.inscripcion && e.estado !== 'auto' && e.estado !== 'confirmada') {
              <button grButton variant="primary" icon="circle-check" [loading]="ocupado() === 'confirmar'" (click)="confirmar(fila())">Confirmar coincidencia</button>
            }
            @if (e.inscripcion && e.estado !== 'auto') {
              <button grButton variant="ghost" icon="circle-x" [loading]="ocupado() === 'descartar'" (click)="descartar()">Descartar</button>
            }
            <button grButton variant="secondary" icon="search" (click)="abrirBuscador()">{{ e.inscripcion ? 'Elegir otra fila' : 'Buscar en el padrón' }}</button>
            @if (puedeReintentar()) {
              <button grButton variant="ghost" icon="refresh" [loading]="ocupado() === 'reintentar'" (click)="reintentar()">Reintentar con IA</button>
            }
          </div>
        }

        @if (buscador()) {
          <div class="flex flex-col gap-2 rounded-md border border-line-subtle bg-bg-surface p-3">
            <label class="flex flex-col gap-1">
              <span class="text-label-s">Buscar en el padrón AEP</span>
              <input grInput type="search" placeholder="Apellidos o nombre…" [ngModel]="q()" (ngModelChange)="buscar($event)" />
            </label>
            @if (buscando()) {
              <gr-skeleton class="h-10" />
            } @else if (resultados().length) {
              <ul class="max-h-64 overflow-y-auto">
                @for (r of resultados(); track r.id) {
                  <li class="flex items-center gap-2 border-b border-line-subtle py-2 last:border-0">
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-label-s">{{ r.apellidos }}, {{ r.nombre }}</span>
                      <span class="block truncate text-body-xs text-text-tertiary">{{ r.sexo }} · {{ r.anio }} · {{ categoriaTexto(r.categoria) }} · {{ r.club || 'sin club' }} · {{ nivelTexto(r.nivel) }}</span>
                    </span>
                    @if (r.atletaId && r.atletaId !== atletaId()) {
                      <span class="text-body-xs text-text-muted">Ya enlazada</span>
                    } @else {
                      <button grButton size="s" [loading]="ocupado() === 'confirmar'" (click)="confirmar(r)">Elegir</button>
                    }
                  </li>
                }
              </ul>
            } @else if (q().trim().length >= 3) {
              <p class="text-body-s text-text-tertiary">Nadie con ese nombre en el padrón.</p>
            } @else {
              <p class="text-body-s text-text-tertiary">Escribe al menos 3 letras de los apellidos o del nombre.</p>
            }
          </div>
        }

        @if (e.log.length) {
          <details class="rounded-md border border-line-subtle">
            <summary class="cursor-pointer px-3 py-2 text-label-s text-text-secondary">Registro · {{ e.log.length }} {{ e.log.length === 1 ? 'decisión' : 'decisiones' }}</summary>
            <ul class="px-3 pb-2">
              @for (l of e.log; track l.id) {
                <li class="flex flex-wrap items-baseline gap-x-2 border-t border-line-subtle py-1.5 text-body-xs">
                  <span class="text-text-primary">{{ decision(l.decision) }}</span>
                  <span class="text-text-tertiary">{{ origen(l.origen) }}{{ pct(l.confianza) }}</span>
                  <span class="ml-auto text-text-muted">{{ l.aplicadoPor || 'Sistema' }} · {{ fmtShortDate(l.createdAt) }}</span>
                </li>
              }
            </ul>
          </details>
        }
      }
    </section>
  `,
})
export class PadronMatch {
  /** Competición en curso. */
  readonly cid = input.required<string>();
  /** Atleta de la ficha (vacío: se está revisando una solicitud). */
  readonly atletaId = input('');
  /** Solicitud abierta en el panel de revisión (vacío: se está viendo un atleta). */
  readonly solicitudId = input('');
  /** Los datos que se comparan con el padrón (los de la solicitud o los del atleta). */
  readonly persona = input.required<PersonaPadron>();
  /** Versión de la solicitud abierta (If-Match de sus endpoints). */
  readonly version = input(0);
  /** Versión del atleta (If-Match de su ficha). */
  readonly atletaVersion = input(0);
  readonly canEdit = input(false);
  /** Una decisión ha cambiado la coincidencia: quien lo usa recarga lo suyo. */
  readonly cambiado = output<void>();

  private readonly atletasApi = inject(AtletasApi);
  private readonly solicitudesApi = inject(SolicitudesApi);
  private readonly toasts = inject(GrToasts);
  private readonly confirmSvc = inject(Confirm);

  protected readonly emp = signal<EmparejamientoPadron | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly ocupado = signal<'' | 'confirmar' | 'descartar' | 'reintentar'>('');
  protected readonly buscador = signal(false);
  protected readonly buscando = signal(false);
  protected readonly q = signal('');
  protected readonly resultados = signal<FilaPadron[]>([]);
  protected readonly estado = computed(() => estadoPadron(this.emp() ?? { estado: 'sin' }));
  /** La IA solo se puede reintentar donde hay una solicitud de la que tirar. */
  protected readonly puedeReintentar = computed(() => !!this.solicitudId() || !!this.emp()?.solicitudId);
  protected readonly fila = computed(() => this.emp()?.inscripcion);
  protected readonly nivelTexto = nivelTexto;
  protected readonly categoriaTexto = categoriaTexto;
  protected readonly fmtShortDate = fmtShortDate;

  constructor() {
    effect(() => {
      const cid = this.cid();
      const id = this.atletaId() || this.solicitudId();
      if (cid && id) untracked(() => void this.cargar());
    });
  }

  protected decision = (d: string) => DECISION[d] ?? d;
  protected origen = (o: string) => ORIGEN[o] ?? o;
  protected pct = (c?: number) => (c == null ? '' : ` · ${Math.round(c * 100)} %`);

  async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      this.emp.set(this.solicitudId()
        ? await this.solicitudesApi.emparejamiento(cid, this.solicitudId())
        : await this.atletasApi.padron(cid, this.atletaId()));
    } catch (e) {
      this.emp.set(null);
      this.error.set(errText(e, 'No se pudo leer la coincidencia con el padrón.'));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Comparación campo a campo: lo que no coincide va resaltado. */
  protected filas(f: FilaPadron): FilaComparada[] {
    const p = this.persona();
    const dif = new Set<string>((this.emp()?.detalle?.discrepancias ?? []).map((d) => d.campo));
    // Lo que cambia es el dato, no la tilde ni la mayúscula: se compara normalizado.
    const c = (clave: string, etiqueta: string, a: string, z: string): FilaComparada =>
      ({ clave, etiqueta, a, p: z, distinto: dif.has(clave) || (!!a && !!z && normTexto(a) !== normTexto(z)) });
    return [
      c('nombre', 'Nombre', p.nombre, f.nombre),
      c('apellidos', 'Apellidos', p.apellidos, f.apellidos),
      c('sexo', 'Sexo', p.sexo === 'F' ? 'Femenino' : p.sexo === 'M' ? 'Masculino' : '', f.sexo === 'F' ? 'Femenino' : 'Masculino'),
      c('anio', 'Año', p.anio ? String(p.anio) : '', String(f.anio)),
      c('club', 'Club', p.club ?? '', f.club ?? ''),
      c('categoria', 'Categoría', categoriaTexto(p.categoria), categoriaTexto(f.categoria)),
      c('division', 'División', p.division, f.division),
      c('nivel', 'Nivel AEP', nivelTexto(p.nivel), nivelTexto(f.nivel)),
    ];
  }

  protected async confirmar(f: FilaPadron | undefined): Promise<void> {
    if (!f) return;
    const ok = await this.confirmSvc.ask({
      title: `¿Es ${f.nombre} ${f.apellidos} la misma persona?`,
      text: 'Se enlaza la fila del padrón con el atleta y la entrada de OpenLifter de su mesa. Si el alta sigue pendiente, se aprueba como cuando la decide la IA (se crea o enlaza el atleta y se le avisa). Comprueba antes las diferencias marcadas.',
      confirm: 'Confirmar coincidencia',
    });
    if (!ok) return;
    this.ocupado.set('confirmar');
    try {
      const cid = this.cid();
      const r = this.solicitudId()
        ? await this.solicitudesApi.confirmarPadron(cid, this.solicitudId(), this.version(), f.id)
        : await this.atletasApi.confirmarPadron(cid, this.atletaId(), this.atletaVersion(), f.id);
      this.emp.set(r);
      this.buscador.set(false);
      this.toasts.success('Coincidencia confirmada', 'La fila del padrón queda enlazada por el equipo.');
      this.cambiado.emit();
    } catch (e) {
      this.toasts.error('No se pudo confirmar la coincidencia', errText(e));
    } finally {
      this.ocupado.set('');
    }
  }

  protected async descartar(): Promise<void> {
    const ok = await this.confirmSvc.ask({
      title: '¿Descartar esta coincidencia?',
      text: 'La fila propuesta vuelve a quedar libre en el padrón y la solicitud se queda sin candidato. Podrás buscarla otra vez a mano.',
      confirm: 'Descartar',
    });
    if (!ok) return;
    this.ocupado.set('descartar');
    try {
      const cid = this.cid();
      this.emp.set(this.solicitudId()
        ? await this.solicitudesApi.descartarPadron(cid, this.solicitudId(), this.version())
        : await this.atletasApi.descartarPadron(cid, this.atletaId(), this.atletaVersion()));
      this.toasts.success('Coincidencia descartada');
      this.cambiado.emit();
    } catch (e) {
      this.toasts.error('No se pudo descartar', errText(e));
    } finally {
      this.ocupado.set('');
    }
  }

  protected async reintentar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.ocupado.set('reintentar');
    try {
      const r = this.solicitudId()
        ? await this.solicitudesApi.reintentarPadron(cid, this.solicitudId())
        : await this.atletasApi.reintentarPadron(cid, this.atletaId());
      this.emp.set(r);
      this.toasts.success('Emparejamiento repetido', r.detalle?.motivo);
      this.cambiado.emit();
    } catch (e) {
      this.toasts.error('No se pudo repetir el emparejamiento', errText(e));
    } finally {
      this.ocupado.set('');
    }
  }

  protected abrirBuscador(): void {
    this.buscador.set(!this.buscador());
    if (this.buscador() && !this.resultados().length) void this.buscar(this.persona().apellidos || this.persona().nombre);
  }

  protected async buscar(q: string): Promise<void> {
    this.q.set(q);
    const cid = this.cid();
    if (!cid || q.trim().length < 3) {
      this.resultados.set([]);
      return;
    }
    this.buscando.set(true);
    try {
      this.resultados.set(await this.atletasApi.buscarPadron(cid, q.trim()));
    } catch {
      this.resultados.set([]);
    } finally {
      this.buscando.set(false);
    }
  }
}
