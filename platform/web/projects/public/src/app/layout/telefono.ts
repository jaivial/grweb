import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The iPhone frame (home «Alta de atleta» and the post builder preview): fixed 9:19.5 box, bezel, Dynamic Island and
 * home indicator. The consumer sets the width and projects the screen content (a flex column filling the screen).
 */
@Component({
  selector: 'gr-telefono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block aspect-[9/19.5] rounded-[44px] border border-white/20 bg-[#0b0a0a] p-[9px] sm:rounded-[50px] sm:p-[11px] lg:rounded-[56px] lg:p-[12px] shadow-[0_30px_80px_rgb(0_0_0/0.6)]' },
  template: `
    <div class="relative flex size-full flex-col overflow-hidden rounded-[35px] bg-black sm:rounded-[39px] lg:rounded-[44px]">
      <ng-content />
      <span class="absolute top-2.5 left-1/2 h-[22px] w-[76px] -translate-x-1/2 sm:h-7 sm:w-[96px] rounded-pill bg-black" aria-hidden="true"></span>
      <span class="absolute bottom-2 left-1/2 h-1 w-[110px] -translate-x-1/2 rounded-pill bg-white/80" aria-hidden="true"></span>
    </div>
  `,
})
export class GrTelefono {}
