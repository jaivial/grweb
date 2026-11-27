/**
 * porra/como-funciona.ts — «¿Cómo funciona?» de la porra: un botón y una gr-sheet con cómo se juega (parimutuel), los
 * mercados, el premio, un ejemplo con cifras y la fórmula GL.
 */
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GrIcon, GrSheet } from '@grcup/ui';
import { I18n } from '../../core/i18n';

const T = {
  es: {
    boton: '¿Cómo funciona?',
    titulo: 'Cómo funciona la porra',
    cerrar: 'Cerrar',
    queEs: 'Qué es',
    queEsTxt: 'Una porra parimutuel: todo el dinero apostado en un mercado forma el bote y el bote se reparte entre quienes aciertan. Las cuotas no las fija la casa: cambian con cada apuesta.',
    mercados: 'Mercados',
    mercadosTxt: 'Hay cinco mercados por sexo y nivel (AEP-2 y AEP-3): ganador de la categoría de peso, mejor total IPF GL, mayor sentadilla, mayor press de banca y mayor peso muerto. Cada mercado tiene su propio bote y sus cuotas, independientes de los demás.',
    premio: 'Solo gana el primero',
    premioTxt: 'Solo cobra quien acierta el primer puesto. No hay premios de segundo ni de tercero.',
    cuota: 'Cuota',
    cuotaTxt: 'Cuota = bote total del mercado / total apostado a ese atleta. Es la multiplicación que cobrarías por cada moneda si ese atleta gana.',
    recompensa: 'Tu premio',
    recompensaTxt: 'Tu premio = (lo que apostaste a ese atleta, sumando todas tus apuestas) × bote / total apostado al ganador.',
    ejemploTitulo: 'Ejemplo',
    ejemplo: 'Bote del mercado: 10.000 monedas. Apostado al ganador: 2.000 monedas (incluye tus 200). Tu premio: 200 × 10.000 / 2.000 = 1.000 monedas.',
    empates: 'Empates',
    empatesTxt: 'Si dos atletas empatan en el primer puesto, comparten el bote según lo apostado a cada uno.',
    devolucion: 'Sin ganador apostado',
    devolucionTxt: 'Si nadie apostó al ganador, se devuelve todo: cada apuesta recupera su importe.',
    cierre: 'Cierre',
    cierreTxt: 'Los mercados cierran cuando se juzga el segundo intento del atleta. Hasta entonces la cuota puede cambiar.',
    gl: 'La puntuación GL',
    glTxt: 'GL = resultado × 100 / (A − B · e^(−C · peso corporal)). Coeficientes oficiales IPF 2020 para powerlifting clásico:',
    glHombres: 'Hombres: A = 1199,72839 · B = 1025,18162 · C = 0,00921.',
    glMujeres: 'Mujeres: A = 610,32796 · B = 1045,59282 · C = 0,03048.',
    monedas: 'Monedas de juego',
    monedasTxt: 'Las monedas son virtuales: no se compran, no se canjean por dinero y no tienen valor económico.',
  },
  en: {
    boton: 'How does it work?',
    titulo: 'How the pool works',
    cerrar: 'Close',
    queEs: 'What it is',
    queEsTxt: 'A parimutuel pool: all the money bet on a market forms the pot, and the pot is shared among the winners. The house does not set the odds: they change with every bet.',
    mercados: 'Markets',
    mercadosTxt: 'There are five markets per sex and level (AEP-2 and AEP-3): weight class winner, best IPF GL total, heaviest squat, heaviest bench press and heaviest deadlift. Each market has its own pot and odds, independent of the others.',
    premio: 'Only the winner collects',
    premioTxt: 'Only those who get the first place collect. There are no prizes for second or third.',
    cuota: 'Odds',
    cuotaTxt: 'Odds = total pot of the market / total staked on that athlete. It is the multiplier you would collect per coin if that athlete wins.',
    recompensa: 'Your payout',
    recompensaTxt: 'Your payout = (what you bet on that athlete, adding all your bets) × pot / total staked on the winner.',
    ejemploTitulo: 'Example',
    ejemplo: 'Market pot: 10,000 coins. Staked on the winner: 2,000 coins (includes your 200). Your payout: 200 × 10,000 / 2,000 = 1,000 coins.',
    empates: 'Ties',
    empatesTxt: 'If two athletes tie for first place, they share the pot according to what was staked on each.',
    devolucion: 'No stake on the winner',
    devolucionTxt: 'If nobody bet on the winner, everything is refunded: each bet gets its amount back.',
    cierre: 'Closing',
    cierreTxt: 'Markets close when the athlete’s 2nd attempt is judged. Until then the odds can change.',
    gl: 'The GL score',
    glTxt: 'GL = lift × 100 / (A − B · e^(−C · body weight)). Official IPF 2020 coefficients for classic powerlifting:',
    glHombres: 'Men: A = 1199.72839 · B = 1025.18162 · C = 0.00921.',
    glMujeres: 'Women: A = 610.32796 · B = 1045.59282 · C = 0.03048.',
    monedas: 'Game coins',
    monedasTxt: 'Coins are virtual: they are never bought, never exchanged for money and have no monetary value.',
  },
};

@Component({
  selector: 'gr-como-funciona',
  imports: [GrSheet, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button type="button" class="inline-flex min-h-11 items-center gap-2 px-1 text-label-s text-accent-text hover:underline underline-offset-4" aria-haspopup="dialog" (click)="abierta.set(true)">
      <gr-icon name="help" [size]="16" />{{ t().boton }}
    </button>
    <gr-sheet [abierto]="abierta()" [titulo]="t().titulo" [cerrarTxt]="t().cerrar" (cerrar)="abierta.set(false)">
      <div class="flex flex-col gap-5 pb-4 text-body-s text-text-secondary">
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().queEs }}</h3><p>{{ t().queEsTxt }}</p></section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().mercados }}</h3><p>{{ t().mercadosTxt }}</p></section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().premio }}</h3><p>{{ t().premioTxt }}</p></section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().cuota }}</h3><p>{{ t().cuotaTxt }}</p></section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().recompensa }}</h3><p>{{ t().recompensaTxt }}</p></section>
        <section class="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-bg-card p-3.5">
          <h3 class="text-label-m text-text-primary">{{ t().ejemploTitulo }}</h3><p class="font-mono text-body-xs">{{ t().ejemplo }}</p>
        </section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().empates }}</h3><p>{{ t().empatesTxt }}</p></section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().devolucion }}</h3><p>{{ t().devolucionTxt }}</p></section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().cierre }}</h3><p>{{ t().cierreTxt }}</p></section>
        <section class="flex flex-col gap-1.5">
          <h3 class="text-label-m text-text-primary">{{ t().gl }}</h3><p>{{ t().glTxt }}</p>
          <p class="font-mono text-body-xs">{{ t().glHombres }}</p><p class="font-mono text-body-xs">{{ t().glMujeres }}</p>
        </section>
        <section class="flex flex-col gap-1.5"><h3 class="text-label-m text-text-primary">{{ t().monedas }}</h3><p>{{ t().monedasTxt }}</p></section>
      </div>
    </gr-sheet>
  `,
})
export class ComoFunciona {
  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly abierta = signal(false);
}
