/**
 * fantasy/como-se-juega.ts — /fantasy/como-se-juega (Figma «72 · /fantasy» · Cómo se juega): las reglas de GRS
 * Fantasy y la tabla de puntos (contrato §6.3).
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GrIcon } from '@grcup/ui';
import { JuegosEstado } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { AvisoJuegos } from '../porra/componentes';

interface BloqueReglas {
  titulo: string;
  icono: 'credit-card' | 'users' | 'zap' | 'gift';
  puntos: string[];
}

@Component({
  selector: 'gr-como-se-juega-page',
  imports: [Page, GrIcon, AvisoJuegos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Cómo se juega" accent="" suffix="· GRS Fantasy" crumb="Cómo se juega" section="Juegos"
      subtitle="El manager de la GR Strength Cup: fichas atletas con monedas virtuales, pones tu alineación y puntúas lo que levantan en directo.">
      <div class="grid gap-4 md:grid-cols-2">
        @for (b of bloques; track b.titulo) {
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="flex items-center gap-2 text-ui-h5">
              <span class="flex size-7 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon [name]="b.icono" [size]="16" /></span>
              {{ b.titulo }}
            </h2>
            <ul class="mt-3 flex flex-col gap-2">
              @for (p of b.puntos; track p) {
                <li class="flex gap-2.5 text-body-s text-text-secondary">
                  <gr-icon name="check" [size]="15" class="mt-1 shrink-0 text-accent-text" />{{ p }}
                </li>
              }
            </ul>
          </section>
        }
      </div>

      <section class="mt-8 rounded-lg border border-accent/50 bg-bg-card p-5 md:p-6">
        <h2 class="text-display-2xs">Tabla de puntos</h2>
        <p class="mt-2 text-body-xs text-text-tertiary">Puntúa lo que levanta tu titular en el momento del veredicto; los puestos, al titular cuando se publican los resultados.</p>
        <ul class="mt-4 flex flex-col divide-y divide-line-subtle">
          @for (f of tabla; track f.concepto) {
            <li class="flex flex-col gap-1 py-3 md:flex-row md:items-center md:justify-between">
              <span class="text-label-s text-text-primary">{{ f.concepto }}</span>
              @if (f.detalle) { <span class="text-body-xs text-text-tertiary md:max-w-[52%]">{{ f.detalle }}</span> }
              @if (f.puntos) { <span class="font-mono text-label-s text-success">{{ f.puntos }}</span> }
            </li>
          }
        </ul>
      </section>

      <section class="mt-4 rounded-lg border border-line-subtle bg-bg-card p-5">
        <p class="text-label-xs text-text-tertiary uppercase">Desempate del ranking</p>
        <p class="mt-2 text-body-s text-text-secondary">1.º valor de la plantilla → 2.º saldo → 3.º quién llegó antes. Igual que en LaLiga Fantasy, pero sin deuda.</p>
      </section>

      <gr-aviso-juegos class="mt-8" />
    </gr-page>
  `,
})
export class ComoSeJuegaPage {
  private readonly estado = inject(JuegosEstado);
  /** La tabla de puntos de la configuración pública (con la del contrato §6.3 como respaldo). */
  protected readonly tabla = this.estado.tablaPuntos();
  protected readonly maxClausulazos = this.estado.maxClausulazos;
  protected readonly proteccionMin = this.estado.proteccionMin;
  protected readonly plantillaMax = this.estado.plantillaMax;
  protected readonly titularesMax = this.estado.titularesMax;
  protected readonly clausulaInicial = this.estado.clausulaInicial;
  protected readonly clausulaMin = this.estado.clausulaMin;
  protected readonly clausulaMax = this.estado.clausulaMax;
  protected readonly bloques: BloqueReglas[] = [
    {
      titulo: 'Tu cartera y tu plantilla',
      icono: 'credit-card',
      puntos: [
        '1.000.000 monedas fantasy por jornada, separadas de las de la porra.',
        `Plantilla de hasta ${this.plantillaMax()} atletas: ${this.titularesMax()} titulares + hasta ${this.plantillaMax() - this.titularesMax()} suplentes.`,
        'Un atleta tiene como mucho un dueño por jornada.',
        'Cambia titular ↔ suplente cuando quieras, salvo si su flight está en curso (candado).',
      ],
    },
    {
      titulo: 'Fichajes, cláusulas y ventas',
      icono: 'users',
      puntos: [
        'Los atletas libres se fichan al instante por su valor (cláusula) actual.',
        `La cláusula empieza en ${this.clausulaInicial().toLocaleString('es-ES')}: válido +5 %, nulo −4 %, blanqueo −30 %; puesto 1.º +25 %, 2.º +15 %, 3.º +8 %; compra o clausulazo +3 %.`,
        `Mínimo ${this.clausulaMin().toLocaleString('es-ES')} y máximo ${this.clausulaMax().toLocaleString('es-ES')}, redondeado a 1.000.`,
        'Vender devuelve el 100 % del valor actual al mercado.',
      ],
    },
    {
      titulo: 'Clausulazo',
      icono: 'zap',
      puntos: [
        'Pagas la cláusula de un atleta con dueño y el dinero va al dueño anterior.',
        `Máximo ${this.maxClausulazos()} clausulazos por usuario y jornada.`,
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
      description: 'Las reglas de GRS Fantasy: plantilla, fichajes, cláusulas, clausulazo, monedas y la tabla de puntos.',
      path: '/fantasy/como-se-juega',
    });
  }
}
