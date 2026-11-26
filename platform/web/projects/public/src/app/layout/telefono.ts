import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The iPhone frame (home «Alta de atleta» and the post builder preview): fixed 9:19.5 box, bezel, Dynamic Island and
 * home indicator, all sized in cqw so the proportions are the same at any width. The consumer sets the width and
 * projects the screen content (a flex column filling the screen).
 */
@Component({
  selector: 'gr-telefono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: '@container block' },
  template: `
    <div class="relative aspect-[9/19.5] rounded-[15.6cqw] border border-white/20 bg-[#0b0a0a] p-[3.33cqw] shadow-[0_30px_80px_rgb(0_0_0/0.6)]">
      <div class="relative flex size-full flex-col overflow-hidden rounded-[12.2cqw] bg-black">
        <ng-content />
        <span class="absolute top-[2.8cqw] left-1/2 h-[7.8cqw] w-[26.7cqw] -translate-x-1/2 rounded-pill bg-black" aria-hidden="true"></span>
        <span class="absolute bottom-[2.2cqw] left-1/2 h-1 w-[30.6cqw] -translate-x-1/2 rounded-pill bg-white/80" aria-hidden="true"></span>
      </div>
    </div>
  `,
})
export class GrTelefono {}
