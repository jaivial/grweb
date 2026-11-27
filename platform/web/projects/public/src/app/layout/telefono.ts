import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The iPhone frame (home «Alta de atleta» and the post builder preview): fixed 9:19.5 box, thin bezel, Dynamic Island
 * and home indicator, all sized in cqw so the proportions are the same at any width (iPhone 15/16 Pro: 393 × 852 pt;
 * bezel ≈ 5 pt, corner radius ≈ 55 pt, island 126 × 37 pt at 11 pt from the top). The consumer sets the width and
 * projects the screen content (a flex column filling the screen).
 */
@Component({
  selector: 'gr-telefono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: '@container block' },
  template: `
    <div class="relative aspect-[9/19.5] rounded-[14.3cqw] bg-[#0b0a0a] p-[1.35cqw] shadow-[0_30px_80px_rgb(0_0_0/0.6)] ring-1 ring-white/10">
      <div class="relative flex size-full flex-col overflow-hidden rounded-[12.9cqw] bg-black">
        <ng-content />
        <span class="absolute top-[2.8cqw] left-1/2 h-[9.4cqw] w-[32cqw] -translate-x-1/2 rounded-pill bg-black" aria-hidden="true"></span>
        <span class="absolute bottom-[2.2cqw] left-1/2 h-[1.2cqw] w-[34cqw] -translate-x-1/2 rounded-pill bg-white/80" aria-hidden="true"></span>
      </div>
    </div>
  `,
})
export class GrTelefono {}
