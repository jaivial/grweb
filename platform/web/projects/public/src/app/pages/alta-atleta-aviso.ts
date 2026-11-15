import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon } from '@grcup/ui';
import { I18n, LocPipe } from '../core/i18n';

const T = {
  es: {
    atletas: 'Ver atletas', escribenos: (c: string) => 'Escríbenos a ' + c, reintentar: 'Reintentar', cancelar: 'Cancelar',
    cerradaT: 'El alta de atletas está cerrada ahora mismo',
    cerradaP: 'El organizador ha cerrado el formulario temporalmente. Consulta la lista de atletas o escríbenos si necesitas algo.',
    cerradaI: 'Cuando vuelva a abrirse, esta página mostrará el formulario de nuevo.',
    legalT: 'El formulario no está disponible temporalmente',
    legalP: 'Falta publicar el texto legal que hay que aceptar para darse de alta. En cuanto el organizador lo publique, el formulario vuelve a estar disponible aquí mismo.',
    legalI: (c: string) => 'Si necesitas el alta antes de eso, escríbenos a ' + c + ' y lo resolvemos por email.',
    errorT: 'No hemos podido cargar el formulario', errorP: 'Es un problema temporal: vuelve a intentarlo en unos minutos.',
    aprobadaT: 'Tu alta ya está aprobada', duplicadoT: 'Ya tienes una solicitud en revisión',
    dupP: (ok: boolean) => 'Con este email ya hay ' + (ok ? 'una ficha aprobada: edítala desde el área de atleta' : 'una solicitud de alta esperando revisión') + '. No hace falta enviar otra.',
    dupI: 'Te avisamos por email en cuanto la revisemos. Puedes corregir los datos si te escribimos.',
    area: 'Área de atleta', noEsTuya: (c: string) => '¿No es la tuya? Escríbenos a ' + c,
    limiteT: 'Has enviado demasiadas solicitudes', limiteP: 'Por seguridad, hemos pausado los envíos desde este dispositivo un rato.',
    limiteI: (e: string) => 'Vuelve a intentarlo en ' + e + '.', limiteE: (c: string) => 'Si crees que es un error, escríbenos a ' + c,
    redT: 'No hemos podido enviar tu solicitud', redP: 'Ha habido un problema de conexión. No pasa nada: tus datos siguen guardados en esta página.',
    redI: 'Pulsa «Reintentar» y te enviaremos la solicitud sin que tengas que escribir nada otra vez.',
    borrador: 'Guardamos un borrador en este dispositivo. La foto no se guarda: si la vuelves a elegir, sube el archivo de nuevo.',
  },
  en: {
    atletas: 'View athletes', escribenos: (c: string) => 'Write to us at ' + c, reintentar: 'Retry', cancelar: 'Cancel',
    cerradaT: 'Athlete sign-up is closed right now',
    cerradaP: 'The organiser has closed the form for now. Check the list of athletes or write to us if you need anything.',
    cerradaI: 'When it reopens, this page will show the form again.',
    legalT: 'The form is temporarily unavailable',
    legalP: 'The legal text you need to accept to sign up has not been published yet. As soon as the organiser publishes it, the form will be available again right here.',
    legalI: (c: string) => "If you need to sign up before then, write to us at " + c + " and we'll sort it out by email.",
    errorT: "We couldn't load the form", errorP: "It's a temporary problem: please try again in a few minutes.",
    aprobadaT: 'Your sign-up is already approved', duplicadoT: 'You already have a request under review',
    dupP: (ok: boolean) => 'This email already has ' + (ok ? 'an approved profile: edit it from the athlete area' : 'a sign-up request awaiting review') + ". There's no need to send another.",
    dupI: "We'll let you know by email as soon as we've reviewed it. You can correct your details if we write to you.",
    area: 'Athlete area', noEsTuya: (c: string) => 'Not yours? Write to us at ' + c,
    limiteT: "You've sent too many requests", limiteP: "For security, we've paused submissions from this device for a while.",
    limiteI: (e: string) => 'Please try again in ' + e + '.', limiteE: (c: string) => 'If you think this is a mistake, write to us at ' + c,
    redT: "We couldn't send your request", redP: "There was a connection problem. Don't worry: your details are still saved on this page.",
    redI: "Press «Retry» and we'll send the request without you having to type anything again.",
    borrador: "We keep a draft on this device. The photo isn't saved: if you choose it again, upload the file again.",
  },
};

/** Tipos de tarjeta que sustituyen al formulario (cierre, legal, error de carga y fallos del envío). */
export type TipoAviso = 'cerrada' | 'legal' | 'error' | 'duplicado' | 'aprobada' | 'limite' | 'red';

/** Figma 75: tarjetas de estado de la columna del formulario. */
@Component({
  selector: 'gr-alta-aviso',
  imports: [RouterLink, GrButton, GrIcon, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tipo() === 'cerrada') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7">
        <h2 class="text-ui-h4 md:text-ui-h3">{{ t().cerradaT }}</h2>
        <p class="text-body-s text-text-secondary">{{ t().cerradaP }}</p>
        <p class="flex items-start gap-3 rounded-md border border-info/40 bg-info/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-info" />{{ t().cerradaI }}
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" [routerLink]="'/atletas' | loc">{{ t().atletas }}</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">{{ t().escribenos(contacto()) }}</a>
        </div>
      </section>
    } @else if (tipo() === 'legal') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7">
        <h2 class="text-ui-h4 md:text-ui-h3">{{ t().legalT }}</h2>
        <p class="text-body-s text-text-secondary">{{ t().legalP }}</p>
        <p class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().legalI(contacto()) }}
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" [routerLink]="'/atletas' | loc">{{ t().atletas }}</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">{{ t().escribenos(contacto()) }}</a>
        </div>
      </section>
    } @else if (tipo() === 'error') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7">
        <h2 class="text-ui-h4 md:text-ui-h3">{{ t().errorT }}</h2>
        <p class="text-body-s text-text-secondary">{{ t().errorP }}</p>
        <button grButton variant="primary" size="l" type="button" (click)="reintentar.emit()">{{ t().reintentar }}</button>
      </section>
    } @else if (tipo() === 'duplicado' || tipo() === 'aprobada') {
      @let ok = tipo() === 'aprobada';
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7" role="alert">
        <h2 class="text-ui-h4 md:text-ui-h3">{{ ok ? t().aprobadaT : t().duplicadoT }}</h2>
        <p class="text-body-s text-text-secondary">{{ t().dupP(ok) }}</p>
        @if (!ok) {
        <p class="flex items-start gap-3 rounded-md border border-info/40 bg-info/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="info" [size]="18" class="mt-0.5 shrink-0 text-info" />{{ t().dupI }}
        </p>
        }
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" [routerLink]="(ok ? '/area-atleta' : '/atletas') | loc">{{ ok ? t().area : t().atletas }}</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">{{ t().noEsTuya(contacto()) }}</a>
        </div>
      </section>
    } @else if (tipo() === 'limite') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7" role="alert">
        <h2 class="text-ui-h4 md:text-ui-h3">{{ t().limiteT }}</h2>
        <p class="text-body-s text-text-secondary">{{ t().limiteP }}</p>
        <p class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().limiteI(espera()) }}
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="primary" size="l" [routerLink]="'/atletas' | loc">{{ t().atletas }}</a>
          <a [href]="'mailto:' + contacto()" class="self-center text-label-s text-accent-text hover:underline">{{ t().limiteE(contacto()) }}</a>
        </div>
      </section>
    } @else if (tipo() === 'red') {
      <section class="flex flex-col gap-4 rounded-[18px] border border-line-subtle bg-bg-card p-5 md:p-7" role="alert">
        <h2 class="text-ui-h4 md:text-ui-h3">{{ t().redT }}</h2>
        <p class="text-body-s text-text-secondary">{{ t().redP }}</p>
        <p class="flex items-start gap-3 rounded-md border border-accent bg-accent/8 p-4 text-body-s text-text-secondary">
          <gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0 text-accent-text" />{{ t().redI }}
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <button grButton variant="primary" size="l" type="button" (click)="reintentar.emit()">{{ t().reintentar }}</button>
          <button type="button" class="self-center text-label-s text-text-secondary hover:text-text-primary" (click)="cancelar.emit()">{{ t().cancelar }}</button>
        </div>
        <p class="text-body-s text-text-muted">{{ t().borrador }}</p>
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
  protected readonly t = inject(I18n).dict(T);
}
