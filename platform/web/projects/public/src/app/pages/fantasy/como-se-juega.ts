/**
 * fantasy/como-se-juega.ts — /fantasy/como-se-juega (Figma «72 · /fantasy» · Cómo se juega): las reglas de GRS
 * Fantasy, cómo se calcula la nota 0–10 de cada atleta, la leyenda de colores por tramo y tres ejemplos.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GrButton, GrIcon } from '@grcup/ui';
import { JuegosEstado, type Nota } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { JuegosNav } from '../porra/componentes';
import { GrAviso, GrNota } from './componentes';

interface BloqueReglas {
  titulo: string;
  icono: 'credit-card' | 'users' | 'zap' | 'gift';
  puntos: string[];
}

/** Una nota de muestra para la leyenda y los ejemplos. */
const muestra = (valor: number): Nota => ({ valor, tieneNota: valor > 0, blanqueo: false, validos: 0, nulos: 0, desglose: [] });

@Component({
  selector: 'gr-como-se-juega-page',
  imports: [Page, GrAviso, GrButton, GrIcon, GrNota, JuegosNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Cómo se juega" accent="" suffix="· GRS Fantasy" crumb="Cómo se juega" section="Juegos"
      subtitle="El manager de la GR Strength Cup: fichas atletas con monedas virtuales, pones tu alineación y puntúas lo que levantan en directo.">
      <gr-juegos-nav class="mb-6 md:mb-8" juego="fantasy" activa="reglas" />

      <ol class="grid gap-4 md:grid-cols-2">
        @for (b of bloques; track b.titulo; let i = $index) {
          <li class="relative overflow-hidden rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
            <span class="pointer-events-none absolute -top-4 right-3 font-display text-[88px] leading-none text-white/[0.04] italic" aria-hidden="true">{{ i + 1 }}</span>
            <h2 class="flex items-center gap-3 text-ui-h5">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon [name]="b.icono" [size]="18" /></span>
              <span><span class="block text-mono-xs text-text-tertiary">Paso {{ i + 1 }}</span>{{ b.titulo }}</span>
            </h2>
            <ul class="mt-4 flex flex-col gap-2.5">
              @for (p of b.puntos; track p) {
                <li class="flex gap-2.5 text-body-s text-text-secondary">
                  <gr-icon name="check" [size]="15" class="mt-1 shrink-0 text-accent-text" />{{ p }}
                </li>
              }
            </ul>
          </li>
        }
      </ol>

      <section class="mt-8 flex flex-col gap-6" aria-labelledby="tabla-nota">
        <h2 id="tabla-nota" class="text-display-xs">Cómo se calcula la nota</h2>
        <p class="text-body-m text-text-secondary">Cada atleta tiene una nota de 0,0 a 10,0: A intentos válidos + B puesto en categoría + C bonus − {{ nulo() }} por intento nulo. Tu nota es la media de las notas de tus 5 atletas.</p>
        <gr-aviso tono="error" titulo="Blanqueo = nota 0,0">Tres nulos en un mismo movimiento (bomb-out) o descalificación dejan la nota del atleta en 0,0 absoluto: se anula todo lo acumulado y su cláusula baja un 30 %.</gr-aviso>

        <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-surface" role="table" aria-label="Tabla de la nota">
          <p class="flex items-center gap-3 bg-bg-raised px-4 py-3 text-mono-xs text-text-muted" role="row"><span class="flex-1" role="columnheader">Componente</span><span role="columnheader">Valor</span></p>
          @for (f of tabla(); track f.concepto) {
            <p class="flex flex-col gap-1 border-t border-line-subtle px-4 py-3 sm:flex-row sm:items-center sm:gap-3" [class.bg-bg-deep]="f.fondo" role="row">
              <span class="flex min-w-0 flex-1 flex-col gap-0.5" role="cell">
                <span class="text-label-s text-text-primary">{{ f.concepto }}</span>
                <span class="text-body-xs text-text-tertiary">{{ f.detalle }}</span>
              </span>
              <span class="shrink-0 text-mono-s tabular-nums" [class]="f.tono === 'rojo' ? 'text-nota-rojo' : 'text-text-primary'" role="cell">{{ f.valor }}</span>
            </p>
          }
        </div>

        <div class="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="leyenda-nota">
            <h3 id="leyenda-nota" class="text-ui-h5">Color de la nota por tramo</h3>
            <ul class="flex flex-col gap-2">
              @for (t of tramos; track t.rango) {
                <li class="flex items-center gap-3">
                  <gr-nota [nota]="t.nota" />
                  <span class="flex min-w-0 flex-col gap-0.5"><span class="text-mono-s text-text-primary">{{ t.rango }}</span><span class="text-body-xs text-text-tertiary">{{ t.nombre }}</span></span>
                </li>
              }
            </ul>
          </section>
          <div class="flex flex-col gap-4">
            @for (e of ejemplos; track e.titulo) {
              <section class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-surface p-5">
                <h3 class="text-ui-h5">{{ e.titulo }}</h3>
                <p class="text-body-xs text-text-tertiary">{{ e.detalle }}</p>
                @for (f of e.filas; track f.l) {
                  <p class="flex items-center gap-3"><span class="min-w-0 flex-1 text-body-s text-text-secondary">{{ f.l }}</span><span class="shrink-0 text-mono-s tabular-nums" [class]="f.rojo ? 'text-nota-rojo' : 'text-text-primary'">{{ f.v }}</span></p>
                }
                <p class="flex items-center gap-3 pt-2"><span class="flex-1 text-mono-xs text-text-muted">Nota</span><gr-nota [nota]="e.nota" /></p>
              </section>
            }
          </div>
        </div>

        <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="nota-alineacion">
          <h3 id="nota-alineacion" class="text-ui-h5">Nota de la alineación</h3>
          <p class="text-body-s text-text-secondary">· Media aritmética de las 5 notas de atleta, con 2 decimales.</p>
          <p class="text-body-s text-text-secondary">· Atleta que aún no ha competido: no cuenta hasta su primer intento (media «provisional n/5»).</p>
          <p class="text-body-s text-text-secondary">· Hueco vacío en la alineación = 0,0. No se presenta (DNS) = 0,0.</p>
          <p class="text-body-s text-text-secondary">· Retirada (DNF) = lo logrado hasta entonces, sin puesto ni total, con las restas por nulos.</p>
        </section>
      </section>

      <section class="mt-4 flex flex-col gap-1.5 rounded-md bg-bg-surface px-4 py-3">
        <p class="text-label-xs text-text-muted">Desempate del ranking</p>
        <p class="text-body-xs text-text-secondary">1.º valor de la alineación → 2.º saldo → 3.º quién llegó antes.</p>
      </section>

      <div class="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-line-strong bg-bg-surface px-6 py-8 text-center">
        <p class="text-display-xs">¿Listo para fichar?</p>
        <div class="flex flex-wrap justify-center gap-3">
          <a grButton variant="primary" href="/fantasy/salas" iconRight="arrow-right">Ver salas</a>
          <a grButton variant="outline" href="/fantasy">Ver mi equipo</a>
        </div>
      </div>
    </gr-page>
  `,
})
export class ComoSeJuegaPage {
  private readonly estado = inject(JuegosEstado);
  /** La tabla de la nota de la configuración pública (con la del diseño como respaldo). */
  protected readonly tabla = this.estado.tablaNota;
  protected readonly nulo = computed(() => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1 }).format(this.estado.nulo()));
  protected readonly maxClausulazos = this.estado.maxClausulazos;
  protected readonly proteccionMin = this.estado.proteccionMin;
  protected readonly plantillaMax = this.estado.plantillaMax;
  protected readonly clausulaInicial = this.estado.clausulaInicial;
  protected readonly clausulaMin = this.estado.clausulaMin;
  protected readonly clausulaMax = this.estado.clausulaMax;
  /** La leyenda de los 6 tramos, con una nota de muestra de cada uno. */
  protected readonly tramos: { rango: string; nombre: string; nota: Nota }[] = (
    [
      ['< 1,0', 'Gris · incluye 0,0 y sin nota', 0],
      ['1,0 – 4,9', 'Rojo', 3.2],
      ['5,0 – 5,9', 'Ámbar oscuro', 5.5],
      ['6,0 – 7,9', 'Azul', 7.1],
      ['8,0 – 8,9', 'Verde', 8.6],
      ['9,0 – 10,0', 'Morado', 9.6],
    ] as [string, string, number][]
  ).map(([rango, nombre, valor]) => ({ rango, nombre, nota: muestra(valor) }));
  protected readonly ejemplos: { titulo: string; detalle: string; filas: { l: string; v: string; rojo?: boolean }[]; nota: Nota }[] = [
    {
      titulo: 'Atleta bueno · Lucía Rubio',
      detalle: '9/9 válidos, 0 nulos, 1.ª de su categoría',
      filas: [{ l: 'A · 9 válidos', v: '5,0' }, { l: 'B · 1.º categoría', v: '3,0' }, { l: 'C · pleno 0,5 + récord comp. 1,0 + total 0,3', v: '1,8' }, { l: 'Nulos 0 × 0,3', v: '0,0' }],
      nota: muestra(9.8),
    },
    {
      titulo: 'Atleta medio con nulos · Marcos Gil',
      detalle: '6 válidos y 3 nulos (uno por movimiento), 3.º, total completado',
      filas: [{ l: 'A · 6 válidos', v: '3,3' }, { l: 'B · 3.º categoría', v: '1,8' }, { l: 'C · total completado', v: '0,3' }, { l: 'Nulos 3 × 0,3', v: '−0,9', rojo: true }],
      nota: muestra(4.5),
    },
    {
      titulo: 'Blanqueo · Pablo Ortiz',
      detalle: 'Llevaba 4,9; 3 nulos en peso muerto',
      filas: [{ l: 'Nota antes del bomb-out', v: '4,9' }, { l: 'Bomb-out → todo a cero', v: '−4,9', rojo: true }],
      nota: muestra(0),
    },
  ];
  protected readonly bloques: BloqueReglas[] = [
    {
      titulo: 'Tu cartera y tu alineación',
      icono: 'credit-card',
      puntos: [
        '1.000.000 monedas fantasy por jornada, separadas de las de la porra.',
        `Alineación de exactamente ${this.plantillaMax()} atletas, sin suplentes.`,
        'Se juega por salas de 2 a 10 jugadores: un atleta tiene como mucho un dueño por sala.',
        'Un atleta no se puede cambiar mientras su flight esté en curso (candado).',
      ],
    },
    {
      titulo: 'Fichajes, cláusulas y ventas',
      icono: 'users',
      puntos: [
        'Los atletas libres se fichan al instante por su valor (cláusula) actual.',
        `La cláusula empieza en ${monedas(this.clausulaInicial())} y se mueve con la nota: ±${this.estado.config()?.puntos?.pctClausula ?? 4} % por punto sobre o bajo 5,0; blanqueo −30 %; compra o clausulazo +3 %.`,
        `Mínimo ${monedas(this.clausulaMin())} y máximo ${monedas(this.clausulaMax())}, redondeado a 1.000.`,
        'Vender devuelve el 100 % del valor actual al mercado.',
      ],
    },
    {
      titulo: 'Clausulazo',
      icono: 'zap',
      puntos: [
        'Pagas la cláusula de un atleta con dueño y el dinero va al dueño anterior.',
        `Máximo ${this.maxClausulazos()} clausulazos por usuario y jornada; se cierran al empezar la última sesión del día.`,
        `Protección de ${this.proteccionMin()} minutos tras cualquier fichaje o clausulazo.`,
        'Sin deuda: no se puede dejar el saldo en negativo.',
      ],
    },
    {
      titulo: 'Gana monedas sin gastar dinero',
      icono: 'gift',
      puntos: [
        '5 mensajes en el chat: +10.000 · 10 mensajes: +50.000 (se suma).',
        'Donativos: +10.000 por cada euro donado; si se reembolsa, se retira lo acreditado.',
        'Las monedas nunca se compran con dinero ni se canjean por dinero.',
        'Reglas y valores configurables en el backoffice.',
      ],
    },
  ];

  constructor() {
    void this.estado.cargarConfig();
    inject(Seo).set({
      title: 'Cómo se juega · GRS Fantasy · GR Strength Cup',
      description: 'Las reglas de GRS Fantasy: salas, alineación de 5 atletas, fichajes, cláusulas, clausulazo, monedas y la nota de 0 a 10.',
      path: '/fantasy/como-se-juega',
    });
  }
}
