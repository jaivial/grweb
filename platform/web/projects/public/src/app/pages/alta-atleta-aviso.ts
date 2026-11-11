import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon } from '@grcup/ui';

/** Tipos de tarjeta que sustituyen al formulario (cierre, legal, error de carga y fallos del envío). */
export type TipoAviso = 'cerrada' | 'legal' | 'error' | 'duplicado' | 'limite' | 'red';

/** Figma 75: tarjetas de estado de la columna del formulario. */
@Component({
  selector: 'gr-alta-aviso',
  imports: [RouterLink, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tipo() === 'cerrada') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7">
        <h2 class="text-ui-h4 md:text-ui-h3">El alta de atletas está cerrada ahora mismo</h2>
        <p class="text-body-s text-text-secondary">El organizador ha cerrado el formulario temporalmente. Consulta la lista de atletas o escríbenos si necesitas algo.</p>
        <p class="flex items-start gap-3 rounded-md border border-info/40 bg-info/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-info" />Cuando vuelva a abrirse, esta página mostrará el formulario de nuevo.
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" routerLink="/atletas">Ver atletas</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">Escríbenos a {{ contacto() }}</a>
        </div>
      </section>
    } @else if (tipo() === 'legal') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7">
        <h2 class="text-ui-h4 md:text-ui-h3">El formulario no está disponible temporalmente</h2>
        <p class="text-body-s text-text-secondary">Falta publicar el texto legal que hay que aceptar para darse de alta. En cuanto el organizador lo publique, el formulario vuelve a estar disponible aquí mismo.</p>
        <p class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />Si necesitas el alta antes de eso, escríbenos a {{ contacto() }} y lo resolvemos por email.
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" routerLink="/atletas">Ver atletas</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">Escríbenos a {{ contacto() }}</a>
        </div>
      </section>
    } @else if (tipo() === 'error') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7">
        <h2 class="text-ui-h4 md:text-ui-h3">No hemos podido cargar el formulario</h2>
        <p class="text-body-s text-text-secondary">Es un problema temporal: vuelve a intentarlo en unos minutos.</p>
        <button grButton variant="primary" size="l" type="button" (click)="reintentar.emit()">Reintentar</button>
      </section>
    } @else if (tipo() === 'duplicado') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7" role="alert">
        <h2 class="text-ui-h4 md:text-ui-h3">Ya tienes una solicitud en revisión</h2>
        <p class="text-body-s text-text-secondary">Con este email ya hay una solicitud de alta esperando revisión. No hace falta enviar otra.</p>
        <p class="flex items-start gap-3 rounded-md border border-info/40 bg-info/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-info" />Te avisamos por email en cuanto la revisemos. Puedes corregir los datos si te escribimos.
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" routerLink="/atletas">Ver atletas</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">¿No es la tuya? Escríbenos a {{ contacto() }}</a>
        </div>
      </section>
    } @else if (tipo() === 'limite') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7" role="alert">
        <h2 class="text-ui-h4 md:text-ui-h3">Has enviado demasiadas solicitudes</h2>
        <p class="text-body-s text-text-secondary">Por seguridad, hemos pausado los envíos desde este dispositivo un rato.</p>
        <p class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />Vuelve a intentarlo en {{ espera() }}. Tu solicitud anterior sigue guardada.
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" routerLink="/atletas">Ver atletas</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">Si crees que es un error, escríbenos a {{ contacto() }}</a>
        </div>
      </section>
    } @else if (tipo() === 'red') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7" role="alert">
        <h2 class="text-ui-h4 md:text-ui-h3">No hemos podido enviar tu solicitud</h2>
        <p class="text-body-s text-text-secondary">Ha habido un problema de conexión. No pasa nada: tus datos siguen guardados en esta página.</p>
        <p class="flex items-start gap-3 rounded-md border border-accent bg-accent/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0 text-accent-text" />Pulsa «Reintentar» y te enviaremos la solicitud sin que tengas que escribir nada otra vez.
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <button grButton variant="primary" size="l" type="button" (click)="reintentar.emit()">Reintentar</button>
          <button type="button" class="self-center text-label-s text-text-secondary hover:text-text-primary" (click)="cancelar.emit()">Cancelar</button>
        </div>
        <p class="text-body-xs text-text-muted">Guardamos un borrador en este dispositivo. La foto no se guarda: si la vuelves a elegir, sube el archivo de nuevo.</p>
      </section>
    }
  `,
})
export class AltaAviso {
  readonly tipo = input.required<TipoAviso>();
  readonly contacto = input.required<string>();
  readonly espera = input('');
  readonly reintentar = output<void>();
  readonly cancelar = output<void>();
}
