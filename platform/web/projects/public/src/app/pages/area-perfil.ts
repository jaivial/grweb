import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { sinTimeout } from '@grcup/ui';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrButton, GrIcon } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { AREA_API, type Panel } from '../core/area';
import { textoError } from '../core/errores';
import { I18n, LocPipe } from '../core/i18n';
import { AreaPerfilEditar } from './area-perfil-editar';

const T = {
  es: {
    volver: 'Volver al panel', tuPerfil: 'Tu perfil', loVeran: 'Lo verán en /atletas/',
    encuadre: 'Encuadre: pulsa en tu cara', fotoPerfil: 'Foto de perfil', fotoTxt: 'JPG, PNG o WebP hasta 8 MB. Pulsa en la foto para centrar tu cara (se guarda la posición).',
    subiendo: 'Subiendo…', subirFoto: 'Subir foto', cambiar: 'Cambiar',
    noPublica: 'Tu foto no se publicará en tu ficha hasta que aceptes el consentimiento de imagen.',
    acepto: 'Acepto que la organización publique mi foto en la web de la competición (', consImg: 'consentimiento de imagen', retirarlo: '). Puedo retirarlo cuando quiera.', retirar: 'Retirarlo',
    consentGuardar: 'Guardar el consentimiento',
    consAceptado: (v: string) => `Consentimiento de imagen aceptado (${v}).`,
    mostrar: 'Mostrar mi perfil público', mostrarTxt: 'Tu ficha en /atletas con foto, bio, Instagram y marcas. Tu nombre, club, categoría, horario y resultados son públicos siempre en participantes y resultados.',
    noSubir: 'No se pudo subir la foto.', noGuardarGen: 'No se pudo guardar. Inténtalo de nuevo.', caducada: 'Tu sesión ha caducado.',
    fotoPendiente: 'Tu nueva foto está pendiente de revisión; mientras tanto se sigue viendo la anterior en tu perfil público.',
  },
  en: {
    volver: 'Back to the dashboard', tuPerfil: 'Your profile', loVeran: 'They will see it at /atletas/',
    encuadre: 'Framing: tap on your face', fotoPerfil: 'Profile photo', fotoTxt: 'JPG, PNG or WebP up to 8 MB. Tap on the photo to centre your face (the position is saved).',
    subiendo: 'Uploading…', subirFoto: 'Upload photo', cambiar: 'Change',
    noPublica: 'Your photo will not be published on your page until you accept the image consent.',
    acepto: 'I agree that the organisers may publish my photo on the competition website (', consImg: 'image consent', retirarlo: '). I can withdraw it at any time.', retirar: 'Withdraw it',
    consentGuardar: 'Save consent',
    consAceptado: (v: string) => `Image consent accepted (${v}).`,
    mostrar: 'Show my public profile', mostrarTxt: 'Your page on /atletas with photo, bio, Instagram and lifts. Your name, club, weight class, schedule and results are always public in participants and results.',
    noSubir: "Couldn't upload the photo.", noGuardarGen: "Couldn't save. Please try again.", caducada: 'Your session has expired.',
    fotoPendiente: 'Your new photo is pending review; until then your public profile keeps showing the previous one.',
  },
};

/**
 * `/area-atleta?vista=perfil`: «Editar mi perfil» (área de atleta). The photo, the visibility of the page and the image
 * consent are settings and are saved at once; in the details of the record, name, surnames, email, sex and
 * competition (and the photo) are reviewed by the team and everything else is saved at once.
 */
@Component({
  selector: 'gr-area-perfil',
  imports: [RouterLink, LocPipe, FormsModule, GrButton, GrIcon, AreaPerfilEditar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-xl">
      <a [routerLink]="'/area-atleta' | loc" class="mb-4 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent"><gr-icon name="chevron-left" [size]="16" />{{ t().volver }}</a>
      <h1 class="text-display-m outline-none" tabindex="-1">{{ t().tuPerfil }}</h1>
      <p class="mt-1 text-body-s text-text-tertiary">{{ t().loVeran }}{{ panel().atleta.perfil.slug }}</p>
      <div class="mt-6 flex gap-4">
        <button type="button" class="relative size-24 shrink-0 overflow-hidden rounded-full bg-bg-raised" (click)="focal($event)" [disabled]="!panel().atleta.perfil.fotoUrl" [attr.aria-label]="t().encuadre">
          @if (panel().atleta.perfil.fotoUrl) { <img [src]="panel().atleta.perfil.fotoUrl" [alt]="panel().atleta.nombre + ' ' + panel().atleta.apellidos" class="size-full object-cover" [style.object-position]="fx + '% ' + fy + '%'" /> }
          @else { <span class="flex size-full items-center justify-center text-label-l text-text-tertiary">{{ ((panel().atleta.nombre[0] ?? '') + (panel().atleta.apellidos[0] ?? '')).toUpperCase() }}</span> }
        </button>
        <div class="min-w-0">
          <p class="text-label-m">{{ t().fotoPerfil }}</p>
          <p class="text-body-xs text-text-tertiary">{{ t().fotoTxt }}</p>
          <label class="mt-2 inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 text-label-s focus-within:outline-2 focus-within:outline-accent">{{ subiendo() ? t().subiendo : panel().atleta.perfil.fotoUrl ? t().cambiar : t().subirFoto }}<gr-icon name="arrow-right" [size]="14" />
            <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="foto($event)" [disabled]="subiendo()" /></label>
        </div>
      </div>
      <p class="sr-only" aria-live="polite">{{ fotoPendiente() ? t().fotoPendiente : '' }}</p>
      @if (fotoPendiente()) {
        <p class="mt-4 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().fotoPendiente }}</p>
      }
      @if (!panel().atleta.perfil.imagen) {
        @if (panel().atleta.perfil.fotoUrl) { <p class="mt-4 text-body-s text-warning" role="note">{{ t().noPublica }}</p> }
        <label class="mt-4 flex min-h-11 items-start gap-3 rounded-md border border-line-subtle bg-bg-card p-3 text-body-s text-text-secondary">
          <input type="checkbox" name="imagen" [(ngModel)]="aceptaImagen" class="mt-0.5 size-6 shrink-0 accent-[#C42B3E]" />
          <span>{{ t().acepto }}<a [href]="'/consentimiento-datos' | loc" target="_blank" class="text-accent-text underline">{{ t().consImg }}</a>{{ t().retirarlo }}</span>
        </label>
        <button grButton variant="secondary" class="mt-3 self-start" [disabled]="!aceptaImagen || guardando()" (click)="consentimiento(false)">{{ t().consentGuardar }}</button>
      } @else {
        <p class="mt-4 text-body-xs text-text-tertiary">{{ t().consAceptado(panel().atleta.perfil.imagen!.version) }} <button type="button" class="text-accent-text underline" (click)="consentimiento(true)">{{ t().retirar }}</button></p>
      }
      <!-- Visibilidad de la ficha: es un ajuste, se guarda al momento -->
      <div class="mt-4 flex items-center justify-between gap-4 rounded-md border border-line-subtle bg-bg-card p-4">
        <span><span class="block text-label-m">{{ t().mostrar }}</span><span class="block text-body-xs text-text-tertiary">{{ t().mostrarTxt }}</span></span>
        <button type="button" role="switch" [attr.aria-checked]="panel().atleta.perfil.visible" (click)="visibilidad(!panel().atleta.perfil.visible)" [disabled]="guardando()"
          class="flex h-11 w-12 shrink-0 items-center justify-center disabled:opacity-50" [attr.aria-label]="t().mostrar">
          <span class="relative h-6 w-10 rounded-pill" [class]="panel().atleta.perfil.visible ? 'bg-accent' : 'bg-line-strong'"><span class="absolute top-0.5 size-5 rounded-full bg-white transition-[left]" [style.left.px]="panel().atleta.perfil.visible ? 18 : 2"></span></span>
        </button>
      </div>
      @if (error()) { <p class="mt-3 text-body-s text-accent-text" role="alert">{{ error() }}</p> }
      <!-- Los datos de la ficha: unos se guardan al momento y otros los revisa el equipo -->
      <gr-area-perfil-editar class="mt-8" (sesionCaducada)="expirada.emit()" />
    </div>
  `,
})
export class AreaPerfilPage implements OnInit {
  readonly panel = input.required<Panel>();
  /** The saved profile: the shell keeps it (header, completitud) without asking the API again. */
  readonly guardado = output<Panel>();
  /** Saved from the form: the shell shows the dashboard with the confirmation. */
  readonly listo = output<Panel>();
  /** 401: the session is gone, the shell goes back to the login. */
  readonly expirada = output<void>();

  protected readonly t = inject(I18n).dict(T);
  private readonly http = inject(HttpClient);

  protected aceptaImagen = false;
  protected fx = 50;
  protected fy = 50;
  protected readonly subiendo = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  /** The last photo uploaded waits for the team's review (the public profile keeps the previous one). */
  protected readonly fotoPendiente = signal(false);

  ngOnInit(): void {
    const a = this.panel().atleta;
    this.fx = a.perfil.focalX;
    this.fy = a.perfil.focalY;
  }

  /** Tapping the photo fixes the framing (the focus point of the public profile picture). */
  protected async focal(ev: MouseEvent): Promise<void> {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.fx = Math.round(((ev.clientX - r.left) / r.width) * 100);
    this.fy = Math.round(((ev.clientY - r.top) / r.height) * 100);
    try {
      this.guardado.emit(await firstValueFrom(this.http.put<Panel>(`${AREA_API}/foto/encuadre`, { focalX: this.fx, focalY: this.fy })));
    } catch {
      /* the next save keeps trying */
    }
  }

  protected async foto(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set('');
    this.subiendo.set(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const p = await firstValueFrom(this.http.post<Panel & { fotoPendiente?: boolean }>(`${AREA_API}/foto`, fd, { context: sinTimeout() }));
      this.fotoPendiente.set(!!p.fotoPendiente);
      this.fx = p.atleta.perfil.focalX;
      this.fy = p.atleta.perfil.focalY;
      this.guardado.emit(p);
    } catch (e) {
      this.error.set(this.msg(e, this.t().noSubir));
    } finally {
      this.subiendo.set(false);
    }
  }

  /** Acepta o retira el consentimiento de imagen (es inmediato: no pasa por la revisión de los cambios). */
  protected async consentimiento(retirar: boolean): Promise<void> {
    const p = await this.inmediato(retirar ? { retirarConsentimiento: true } : { aceptaUsoDeImagen: true });
    if (!p) return;
    this.aceptaImagen = false;
    this.listo.emit(p);
  }

  /** Muestra u oculta la ficha pública (es un ajuste: se guarda al momento y se sigue en la página). */
  protected async visibilidad(visible: boolean): Promise<void> {
    const p = await this.inmediato({ visible });
    if (p) this.guardado.emit(p);
  }

  /**
   * Lo que se guarda al momento en la ficha: la visibilidad y el consentimiento de imagen. Los datos personales van
   * por «Editar mi perfil» (gr-area-perfil-editar), que decide qué se aplica ya y qué revisa el equipo.
   */
  private async inmediato(v: { visible?: boolean; aceptaUsoDeImagen?: boolean; retirarConsentimiento?: boolean }): Promise<Panel | null> {
    if (this.guardando()) return null;
    this.error.set('');
    this.guardando.set(true);
    try {
      return await firstValueFrom(this.http.put<Panel>(`${AREA_API}/perfil`, v));
    } catch (e) {
      this.error.set(this.msg(e, this.t().noGuardarGen));
      return null;
    } finally {
      this.guardando.set(false);
    }
  }

  private msg(e: unknown, porDefecto: string): string {
    if (e instanceof HttpErrorResponse && e.status === 401) {
      this.expirada.emit();
      return this.t().caducada;
    }
    return textoError(e, porDefecto);
  }
}
