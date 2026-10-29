import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GrToaster } from '@grcup/ui';

@Component({
  selector: 'bo-root',
  imports: [RouterOutlet, GrToaster],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><gr-toaster />`,
})
export class App {}
