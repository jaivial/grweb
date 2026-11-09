/**
 * fantasy/como-se-juega.ts — /fantasy/como-se-juega (Figma «72 · /fantasy» · Cómo se juega): las reglas de GRS
 * Fantasy y la tabla de puntos (contrato §6.3).
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GrButton, GrIcon } from '@grcup/ui';
import { JuegosEstado } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { JuegosNav } from '../porra/componentes';

interface BloqueReglas {
  titulo: string;
  icono: 'credit-card' | 'users' | 'zap' | 'gift';
  puntos: string[];
}

@Component({
  selector: 'gr-como-se-juega-page',
  imports: [Page, GrButton, GrIcon, JuegosNav],
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

      <section class="mt-8 overflow-hidden rounded-lg border border-accent/50 bg-bg-card" aria-labelledby="tabla-puntos">
        <header class="border-b border-accent/40 bg-accent-deep/40 px-5 py-4 md:px-6">
          <h2 id="tabla-puntos" class="text-display-xs">Tabla de puntos</h2>
          <p class="mt-1 text-body-xs text-text-secondary">Puntúa lo que levanta tu titular en el momento del veredicto; los puestos, al titular cuando se publican los resultados.</p>
        </header>
        <ul class="flex flex-col divide-y divide-line-subtle px-5 md:px-6">
          @for (f of tabla; track f.concepto) {
            <li class="flex flex-col gap-1.5 py-3.5 md:flex-row md:items-center md:justify-between md:gap-6">
              <span class="min-w-0">
                <span class="block text-label-s text-text-primary">{{ f.concepto }}</span>
                @if (f.detalle) { <span class="block text-body-xs text-text-tertiary">{{ f.detalle }}</span> }
              </span>
              @if (f.puntos) {
                <span class="self-start rounded-sm border px-2.5 py-1 font-mono text-[13px] font-bold tabular-nums md:self-auto md:shrink-0"
                  [class]="f.puntos.trim().startsWith('−') || f.puntos.trim().startsWith('-') ? 'border-warning/40 bg-warning/10 text-warning' : 'border-success/40 bg-success/10 text-success'">{{ f.puntos }}</span>
              }
            </li>
          }
        </ul>
      </section>

      <section class="mt-4 rounded-lg border border-line-subtle bg-bg-card p-5">
        <p class="text-mono-xs text-text-tertiary">Desempate del ranking</p>
        <ol class="mt-3 flex flex-wrap items-center gap-2 text-body-s text-text-secondary">
          <li class="rounded-pill border border-line-strong bg-bg-raised px-3 py-1.5"><b class="font-mono text-text-primary">1.º</b> valor de la plantilla</li>
          <li aria-hidden="true"><gr-icon name="chevron-right" [size]="16" class="text-text-muted" /></li>
          <li class="rounded-pill border border-line-strong bg-bg-raised px-3 py-1.5"><b class="font-mono text-text-primary">2.º</b> saldo</li>
          <li aria-hidden="true"><gr-icon name="chevron-right" [size]="16" class="text-text-muted" /></li>
          <li class="rounded-pill border border-line-strong bg-bg-raised px-3 py-1.5"><b class="font-mono text-text-primary">3.º</b> quién llegó antes</li>
        </ol>
        <p class="mt-3 text-body-xs text-text-tertiary">Igual que en LaLiga Fantasy, pero sin deuda.</p>
      </section>

      <div class="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-line-strong bg-bg-surface px-6 py-8 text-center">
        <p class="text-display-xs">¿Listo para fichar?</p>
        <div class="flex flex-wrap justify-center gap-3">
          <a grButton variant="primary" href="/fantasy/mercado" iconRight="arrow-right">Ir al mercado</a>
          <a grButton variant="outline" href="/fantasy">Ver mi equipo</a>
        </div>
      </div>
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
