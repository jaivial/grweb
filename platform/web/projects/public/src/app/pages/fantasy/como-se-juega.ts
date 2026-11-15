import { RouterLink } from '@angular/router';
/**
 * fantasy/como-se-juega.ts — /fantasy/como-se-juega (Figma «72 · /fantasy» · Cómo se juega): las reglas de GRS
 * Fantasy, cómo se calcula la nota 0–10 de cada atleta, la leyenda de colores por tramo y tres ejemplos.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GrButton, GrIcon } from '@grcup/ui';
import { JuegosEstado, type Nota } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { I18n, LocPipe } from '../../core/i18n';
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

/** Values for the rule texts (from the public config). */
interface Valores {
  plantillaMax: number;
  clausulaInicial: string;
  pct: number;
  clausulaMin: string;
  clausulaMax: string;
  maxClausulazos: number;
  proteccionMin: number;
}

const T = {
  es: {
    titulo: 'Cómo se juega',
    section: 'Juegos',
    subtitle: 'El manager de la GR Strength Cup: fichas atletas con monedas virtuales, pones tu alineación y puntúas lo que levantan en directo.',
    paso: 'Paso',
    comoNota: 'Cómo se calcula la nota',
    notaTxt: (nulo: string) => `Cada atleta tiene una nota de 0,0 a 10,0: A intentos válidos + B puesto en categoría + C bonus − ${nulo} por intento nulo. Tu nota es la media de las notas de tus 5 atletas.`,
    blanqueo: 'Blanqueo = nota 0,0',
    blanqueoTxt: 'Tres nulos en un mismo movimiento (bomb-out) o descalificación dejan la nota del atleta en 0,0 absoluto: se anula todo lo acumulado y su cláusula baja un 30 %.',
    tabla: 'Tabla de la nota',
    componente: 'Componente',
    valor: 'Valor',
    colorTramo: 'Color de la nota por tramo',
    nota: 'Nota',
    notaAlineacion: 'Nota de la alineación',
    alineacion: [
      '· Media aritmética de las 5 notas de atleta, con 2 decimales.',
      '· Atleta que aún no ha competido: no cuenta hasta su primer intento (media «provisional n/5»).',
      '· Hueco vacío en la alineación = 0,0. No se presenta (DNS) = 0,0.',
      '· Retirada (DNF) = lo logrado hasta entonces, sin puesto ni total, con las restas por nulos.',
    ],
    desempate: 'Desempate del ranking',
    desempateTxt: '1.º valor de la alineación → 2.º saldo → 3.º quién llegó antes.',
    listo: '¿Listo para fichar?',
    verSalas: 'Ver salas',
    verEquipo: 'Ver mi equipo',
    tramos: [
      ['< 1,0', 'Gris · incluye 0,0 y sin nota', 0],
      ['1,0 – 4,9', 'Rojo', 3.2],
      ['5,0 – 5,9', 'Ámbar oscuro', 5.5],
      ['6,0 – 7,9', 'Azul', 7.1],
      ['8,0 – 8,9', 'Verde', 8.6],
      ['9,0 – 10,0', 'Morado', 9.6],
    ] as [string, string, number][],
    ejemplos: [
      {
        titulo: 'Atleta bueno · Lucía Rubio',
        detalle: '9/9 válidos, 0 nulos, 1.ª de su categoría',
        filas: [{ l: 'A · 9 válidos', v: '5,0' }, { l: 'B · 1.º categoría', v: '3,0' }, { l: 'C · pleno 0,5 + récord comp. 1,0 + total 0,3', v: '1,8' }, { l: 'Nulos 0 × 0,3', v: '0,0' }],
        valor: 9.8,
      },
      {
        titulo: 'Atleta medio con nulos · Marcos Gil',
        detalle: '6 válidos y 3 nulos (uno por movimiento), 3.º, total completado',
        filas: [{ l: 'A · 6 válidos', v: '3,3' }, { l: 'B · 3.º categoría', v: '1,8' }, { l: 'C · total completado', v: '0,3' }, { l: 'Nulos 3 × 0,3', v: '−0,9', rojo: true }],
        valor: 4.5,
      },
      {
        titulo: 'Blanqueo · Pablo Ortiz',
        detalle: 'Llevaba 4,9; 3 nulos en peso muerto',
        filas: [{ l: 'Nota antes del bomb-out', v: '4,9' }, { l: 'Bomb-out → todo a cero', v: '−4,9', rojo: true }],
        valor: 0,
      },
    ] as { titulo: string; detalle: string; filas: { l: string; v: string; rojo?: boolean }[]; valor: number }[],
    bloques: (v: Valores) => [
      {
        titulo: 'Tu cartera y tu alineación',
        puntos: [
          '1.000.000 monedas fantasy por jornada, separadas de las de la porra.',
          `Alineación de exactamente ${v.plantillaMax} atletas, sin suplentes.`,
          'Se juega por salas de 2 a 10 jugadores: un atleta tiene como mucho un dueño por sala.',
          'Un atleta no se puede cambiar mientras su flight esté en curso (candado).',
        ],
      },
      {
        titulo: 'Fichajes, cláusulas y ventas',
        puntos: [
          'Los atletas libres se fichan al instante por su valor (cláusula) actual.',
          `La cláusula empieza en ${v.clausulaInicial} y se mueve con la nota: ±${v.pct} % por punto sobre o bajo 5,0; blanqueo −30 %; compra o clausulazo +3 %.`,
          `Mínimo ${v.clausulaMin} y máximo ${v.clausulaMax}, redondeado a 1.000.`,
          'Vender devuelve el 100 % del valor actual al mercado.',
        ],
      },
      {
        titulo: 'Clausulazo',
        puntos: [
          'Pagas la cláusula de un atleta con dueño y el dinero va al dueño anterior.',
          `Máximo ${v.maxClausulazos} clausulazos por usuario y jornada; se cierran al empezar la última sesión del día.`,
          `Protección de ${v.proteccionMin} minutos tras cualquier fichaje o clausulazo.`,
          'Sin deuda: no se puede dejar el saldo en negativo.',
        ],
      },
      {
        titulo: 'Gana monedas sin gastar dinero',
        puntos: [
          '5 mensajes en el chat: +10.000 · 10 mensajes: +50.000 (se suma).',
          'Donativos: +10.000 por cada euro donado; si se reembolsa, se retira lo acreditado.',
          'Las monedas nunca se compran con dinero ni se canjean por dinero.',
          'Reglas y valores configurables en el backoffice.',
        ],
      },
    ],
    seoTitulo: 'Cómo se juega · GRS Fantasy · GR Strength Cup',
    seoDesc: 'Las reglas de GRS Fantasy: salas, alineación de 5 atletas, fichajes, cláusulas, clausulazo, monedas y la nota de 0 a 10.',
  },
  en: {
    titulo: 'How to play',
    section: 'Games',
    subtitle: 'The GR Strength Cup manager game: sign athletes with virtual coins, set your line-up and score what they lift live.',
    paso: 'Step',
    comoNota: 'How the score is calculated',
    notaTxt: (nulo: string) => `Each athlete gets a score from 0.0 to 10.0: A good lifts + B category placing + C bonus − ${nulo} per no lift. Your score is the average of your 5 athletes' scores.`,
    blanqueo: 'Bomb-out = score 0.0',
    blanqueoTxt: "Three no lifts on the same lift (bomb-out) or a disqualification leave the athlete's score at an absolute 0.0: everything accumulated is cancelled and their release clause drops by 30%.",
    tabla: 'Score table',
    componente: 'Component',
    valor: 'Value',
    colorTramo: 'Score colour by band',
    nota: 'Score',
    notaAlineacion: 'Line-up score',
    alineacion: [
      '· Arithmetic mean of the 5 athlete scores, to 2 decimal places.',
      "· An athlete who hasn't competed yet doesn't count until their first attempt (“provisional n/5” average).",
      '· Empty slot in the line-up = 0.0. Did not start (DNS) = 0.0.',
      '· Withdrawal (DNF) = what was achieved until then, with no placing or total, minus the no-lift deductions.',
    ],
    desempate: 'Ranking tie-break',
    desempateTxt: '1st line-up value → 2nd balance → 3rd who got there first.',
    listo: 'Ready to sign?',
    verSalas: 'See leagues',
    verEquipo: 'See my team',
    tramos: [
      ['< 1.0', 'Grey · includes 0.0 and no score', 0],
      ['1.0 – 4.9', 'Red', 3.2],
      ['5.0 – 5.9', 'Dark amber', 5.5],
      ['6.0 – 7.9', 'Blue', 7.1],
      ['8.0 – 8.9', 'Green', 8.6],
      ['9.0 – 10.0', 'Purple', 9.6],
    ] as [string, string, number][],
    ejemplos: [
      {
        titulo: 'Strong athlete · Lucía Rubio',
        detalle: '9/9 good lifts, 0 no lifts, 1st in her category',
        filas: [{ l: 'A · 9 good lifts', v: '5.0' }, { l: 'B · 1st in category', v: '3.0' }, { l: 'C · 9/9 0.5 + comp. record 1.0 + total 0.3', v: '1.8' }, { l: 'No lifts 0 × 0.3', v: '0.0' }],
        valor: 9.8,
      },
      {
        titulo: 'Average athlete with no lifts · Marcos Gil',
        detalle: '6 good lifts and 3 no lifts (one per lift), 3rd, total completed',
        filas: [{ l: 'A · 6 good lifts', v: '3.3' }, { l: 'B · 3rd in category', v: '1.8' }, { l: 'C · total completed', v: '0.3' }, { l: 'No lifts 3 × 0.3', v: '−0.9', rojo: true }],
        valor: 4.5,
      },
      {
        titulo: 'Bomb-out · Pablo Ortiz',
        detalle: 'Was on 4.9; 3 no lifts on the deadlift',
        filas: [{ l: 'Score before the bomb-out', v: '4.9' }, { l: 'Bomb-out → everything to zero', v: '−4.9', rojo: true }],
        valor: 0,
      },
    ] as { titulo: string; detalle: string; filas: { l: string; v: string; rojo?: boolean }[]; valor: number }[],
    bloques: (v: Valores) => [
      {
        titulo: 'Your wallet and your line-up',
        puntos: [
          '1,000,000 fantasy coins per day, separate from the betting pool ones.',
          `A line-up of exactly ${v.plantillaMax} athletes, no substitutes.`,
          'Played in leagues of 2 to 10 players: an athlete has at most one owner per league.',
          "An athlete can't be swapped while their flight is under way (locked).",
        ],
      },
      {
        titulo: 'Signings, release clauses and sales',
        puntos: [
          'Free athletes are signed instantly for their current value (release clause).',
          `The release clause starts at ${v.clausulaInicial} and moves with the score: ±${v.pct}% per point above or below 5.0; bomb-out −30%; purchase or clause buy-out +3%.`,
          `Minimum ${v.clausulaMin} and maximum ${v.clausulaMax}, rounded to 1,000.`,
          'Selling returns 100% of the current value to the market.',
        ],
      },
      {
        titulo: 'Clause buy-out',
        puntos: [
          "You pay the release clause of an owned athlete and the money goes to the previous owner.",
          `Up to ${v.maxClausulazos} clause buy-outs per user and day; they close when the day's last session begins.`,
          `${v.proteccionMin} minutes' protection after any signing or clause buy-out.`,
          'No debt: your balance can never go negative.',
        ],
      },
      {
        titulo: 'Earn coins without spending money',
        puntos: [
          '5 chat messages: +10,000 · 10 messages: +50,000 (cumulative).',
          'Donations: +10,000 for every euro donated; if refunded, the credited coins are withdrawn.',
          'Coins are never bought with money or exchanged for money.',
          'Rules and values can be configured in the back office.',
        ],
      },
    ],
    seoTitulo: 'How to play · GRS Fantasy · GR Strength Cup',
    seoDesc: 'The GRS Fantasy rules: leagues, a 5-athlete line-up, signings, release clauses, clause buy-outs, coins and the 0 to 10 score.',
  },
};

@Component({
  selector: 'gr-como-se-juega-page',
  imports: [RouterLink, LocPipe, Page, GrAviso, GrButton, GrIcon, GrNota, JuegosNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" accent="" suffix="· GRS Fantasy" [crumb]="t().titulo" [section]="t().section"
      [subtitle]="t().subtitle">
      <gr-juegos-nav class="mb-6 md:mb-8" juego="fantasy" activa="reglas" />

      <ol class="grid gap-4 md:grid-cols-2">
        @for (b of bloques(); track b.titulo; let i = $index) {
          <li class="relative overflow-hidden rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
            <span class="pointer-events-none absolute -top-4 right-3 font-display text-[88px] leading-none text-white/[0.04] italic" aria-hidden="true">{{ i + 1 }}</span>
            <h2 class="flex items-center gap-3 text-ui-h5">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-sm border border-accent/40 bg-accent-deep/40 text-accent-text"><gr-icon [name]="b.icono" [size]="18" /></span>
              <span><span class="block text-meta text-text-tertiary">{{ t().paso }} {{ i + 1 }}</span>{{ b.titulo }}</span>
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
        <h2 id="tabla-nota" class="text-display-xs">{{ t().comoNota }}</h2>
        <p class="text-body-m text-text-secondary">{{ t().notaTxt(nulo()) }}</p>
        <gr-aviso tono="error" [titulo]="t().blanqueo">{{ t().blanqueoTxt }}</gr-aviso>

        <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-surface" role="table" [attr.aria-label]="t().tabla">
          <p class="flex items-center gap-3 bg-bg-raised px-4 py-3 text-meta text-text-tertiary" role="row"><span class="flex-1" role="columnheader">{{ t().componente }}</span><span role="columnheader">{{ t().valor }}</span></p>
          @for (f of tabla(); track f.concepto) {
            <p class="flex flex-col gap-1 border-t border-line-subtle px-4 py-3 sm:flex-row sm:items-center sm:gap-3" [class.bg-bg-deep]="f.fondo" role="row">
              <span class="flex min-w-0 flex-1 flex-col gap-0.5" role="cell">
                <span class="text-label-s text-text-primary">{{ f.concepto }}</span>
                <span class="text-body-s text-text-tertiary">{{ f.detalle }}</span>
              </span>
              <span class="shrink-0 text-mono-s tabular-nums" [class]="f.tono === 'rojo' ? 'text-nota-rojo' : 'text-text-primary'" role="cell">{{ f.valor }}</span>
            </p>
          }
        </div>

        <div class="grid gap-4 lg:grid-cols-2 lg:items-start">
          <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="leyenda-nota">
            <h3 id="leyenda-nota" class="text-ui-h5">{{ t().colorTramo }}</h3>
            <ul class="flex flex-col gap-2">
              @for (r of tramos(); track r.rango) {
                <li class="flex items-center gap-3">
                  <gr-nota [nota]="r.nota" />
                  <span class="flex min-w-0 flex-col gap-0.5"><span class="text-mono-s text-text-primary">{{ r.rango }}</span><span class="text-body-s text-text-tertiary">{{ r.nombre }}</span></span>
                </li>
              }
            </ul>
          </section>
          <div class="flex flex-col gap-4">
            @for (e of ejemplos(); track e.titulo) {
              <section class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-surface p-5">
                <h3 class="text-ui-h5">{{ e.titulo }}</h3>
                <p class="text-body-s text-text-tertiary">{{ e.detalle }}</p>
                @for (f of e.filas; track f.l) {
                  <p class="flex items-center gap-3"><span class="min-w-0 flex-1 text-body-s text-text-secondary">{{ f.l }}</span><span class="shrink-0 text-mono-s tabular-nums" [class]="f.rojo ? 'text-nota-rojo' : 'text-text-primary'">{{ f.v }}</span></p>
                }
                <p class="flex items-center gap-3 pt-2"><span class="flex-1 text-meta text-text-tertiary">{{ t().nota }}</span><gr-nota [nota]="e.nota" /></p>
              </section>
            }
          </div>
        </div>

        <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="nota-alineacion">
          <h3 id="nota-alineacion" class="text-ui-h5">{{ t().notaAlineacion }}</h3>
          @for (l of t().alineacion; track l) { <p class="text-body-s text-text-secondary">{{ l }}</p> }
        </section>
      </section>

      <section class="mt-4 flex flex-col gap-1.5 rounded-md bg-bg-surface px-4 py-3">
        <p class="text-label-xs text-text-tertiary">{{ t().desempate }}</p>
        <p class="text-body-s text-text-secondary">{{ t().desempateTxt }}</p>
      </section>

      <div class="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-line-strong bg-bg-surface px-6 py-8 text-center">
        <p class="text-display-xs">{{ t().listo }}</p>
        <div class="flex flex-wrap justify-center gap-3">
          <a grButton variant="primary" [routerLink]="'/fantasy/salas' | loc" iconRight="arrow-right">{{ t().verSalas }}</a>
          <a grButton variant="outline" [routerLink]="'/fantasy' | loc">{{ t().verEquipo }}</a>
        </div>
      </div>
    </gr-page>
  `,
})
export class ComoSeJuegaPage {
  private readonly estado = inject(JuegosEstado);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  /** La tabla de la nota de la configuración pública (con la del diseño como respaldo). */
  protected readonly tabla = this.estado.tablaNota;
  protected readonly nulo = computed(() => new Intl.NumberFormat(this.i18n.locale(), { minimumFractionDigits: 1 }).format(this.estado.nulo()));
  protected readonly maxClausulazos = this.estado.maxClausulazos;
  protected readonly proteccionMin = this.estado.proteccionMin;
  protected readonly plantillaMax = this.estado.plantillaMax;
  protected readonly clausulaInicial = this.estado.clausulaInicial;
  protected readonly clausulaMin = this.estado.clausulaMin;
  protected readonly clausulaMax = this.estado.clausulaMax;
  /** La leyenda de los 6 tramos, con una nota de muestra de cada uno. */
  protected readonly tramos = computed<{ rango: string; nombre: string; nota: Nota }[]>(() =>
    this.t().tramos.map(([rango, nombre, valor]) => ({ rango, nombre, nota: muestra(valor) })),
  );
  protected readonly ejemplos = computed(() => this.t().ejemplos.map((e) => ({ ...e, nota: muestra(e.valor) })));
  private readonly iconos: BloqueReglas['icono'][] = ['credit-card', 'users', 'zap', 'gift'];
  protected readonly bloques = computed<BloqueReglas[]>(() => {
    const loc = this.i18n.locale();
    return this.t()
      .bloques({
        plantillaMax: this.plantillaMax(),
        clausulaInicial: monedas(this.clausulaInicial(), loc),
        pct: this.estado.config()?.puntos?.pctClausula ?? 4,
        clausulaMin: monedas(this.clausulaMin(), loc),
        clausulaMax: monedas(this.clausulaMax(), loc),
        maxClausulazos: this.maxClausulazos(),
        proteccionMin: this.proteccionMin(),
      })
      .map((b, i) => ({ ...b, icono: this.iconos[i] }));
  });

  constructor() {
    void this.estado.cargarConfig();
    inject(Seo).set({
      title: this.t().seoTitulo,
      description: this.t().seoDesc,
      path: '/fantasy/como-se-juega',
    });
  }
}
