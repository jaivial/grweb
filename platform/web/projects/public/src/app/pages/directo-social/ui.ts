import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Small presentational pieces of the live social panel (Figma 70, v2): the chat avatar, the coin chip and the medal
 * colours of the rankings. Pure presentation: no data access.
 */

/** Six stable tones for the chat avatars (Figma «Chat avatar»: Rojo · Ámbar · Cian · Verde · Oro · Plata). */
const TONOS = [
  'border-accent-text/35 bg-accent-text/15 text-accent-text',
  'border-warning/35 bg-warning/15 text-warning',
  'border-info/35 bg-info/15 text-info',
  'border-success/35 bg-success/15 text-success',
  'border-[#d4af37]/40 bg-[#d4af37]/15 text-[#e3c25a]',
  'border-[#c0c4cc]/35 bg-[#c0c4cc]/12 text-[#d4dae0]',
];

/** Index of the tone of an alias: the same alias always gets the same colour (djb2 hash). */
export function tonoDe(alias: string): number {
  let h = 5381;
  for (const ch of alias.toLowerCase()) h = ((h << 5) + h + ch.codePointAt(0)!) | 0;
  return Math.abs(h) % TONOS.length;
}

/** «PowerFan_82» → «PF», «Laura_G» → «LG», «Kike89» → «KI», «Anónimo» → «AN». */
export function iniciales(alias: string): string {
  const palabras = alias.split(/[^\p{L}]+/u).filter(Boolean);
  if (palabras.length >= 2) return (palabras[0][0] + palabras[1][0]).toUpperCase();
  const w = palabras[0] ?? alias;
  const mayus = w.match(/\p{Lu}/gu);
  if (mayus && mayus.length >= 2) return (mayus[0] + mayus[1]).toUpperCase();
  return (w.slice(0, 2) || '·').toUpperCase();
}

/** Medal colours of the rankings (Figma variables color/medal/gold · silver · bronze). */
export const MEDALLA: Record<number, string> = {
  1: 'border-[#d4af37]/55 bg-[#d4af37]/15 text-[#e3c25a]',
  2: 'border-[#c0c4cc]/55 bg-[#c0c4cc]/15 text-[#d4dae0]',
  3: 'border-[#c8835a]/55 bg-[#c8835a]/15 text-[#d79a66]',
};

/** Chat avatar (Figma «Chat avatar»): initials and a stable tone per alias; athlete = red ring, own = brand gradient. */
@Component({
  selector: 'gr-chat-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex size-8 shrink-0 select-none items-center justify-center rounded-full border text-[12px] font-medium tracking-[0.02em]', '[class]': 'clase()', 'aria-hidden': 'true' },
  template: `{{ ini() }}`,
})
export class GrChatAvatar {
  readonly alias = input('');
  readonly atleta = input(false);
  readonly mio = input(false);
  protected readonly ini = computed(() => (this.mio() ? 'TÚ' : iniciales(this.alias())));
  protected readonly clase = computed(() => {
    if (this.mio()) return 'border-white/10 bg-accent-grain text-white';
    if (this.atleta()) return 'border-2 border-accent bg-accent-deep/90 text-white';
    return TONOS[tonoDe(this.alias())];
  });
}

/** Coin chip (Figma «Coin chip»): porra (amber) or fantasy (cyan); the amount goes as content. */
@Component({
  selector: 'gr-coin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border border-white/8 bg-bg-deep/60 pr-2.5 pl-1.5 font-mono text-[13px] leading-none text-text-primary whitespace-nowrap' },
  template: `<span class="size-4 shrink-0 rounded-full border-2 border-black/25" [class]="tipo() === 'fantasy' ? 'bg-info' : 'bg-warning'" aria-hidden="true"></span><ng-content />`,
})
export class GrCoin {
  readonly tipo = input<'porra' | 'fantasy'>('porra');
}
