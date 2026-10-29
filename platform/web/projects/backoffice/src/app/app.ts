import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GrToaster } from '@grcup/ui';
import { ConfirmHost } from './shared/ui';

@Component({
  selector: 'bo-root',
  imports: [RouterOutlet, GrToaster, ConfirmHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><gr-toaster /><bo-confirm-host />`,
})
export class App {}
