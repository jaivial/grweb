import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'gr-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {
  constructor() {
    // In-page links («routerLink="." fragment="…"»): leave room for the floating navbar (88 px) above the target.
    inject(ViewportScroller).setOffset([0, 104]);
  }
}
