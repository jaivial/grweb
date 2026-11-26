import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrButton, GrField, GrIcon, GrInput } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { AREA_API, type Marcas, type Panel } from '../core/area';
import { textoError } from '../core/errores';
import { I18n, LocPipe } from '../core/i18n';

const T = {
  es: {
    volver: 'Volver al panel', tuPerfil: 'Tu perfil', loVeran: 'Lo verán en /atletas/',
    encuadre: 'Encuadre: pulsa en tu cara', fotoPerfil: 'Foto de perfil', fotoTxt: 'JPG, PNG o WebP hasta 8 MB. Pulsa en la foto para centrar tu cara (se guarda la posición).',
    subiendo: 'Subiendo…', subirFoto: 'Subir foto', cambiar: 'Cambiar',
    noPublica: 'Tu foto no se publicará en tu ficha hasta que aceptes el consentimiento de imagen.',
    acepto: 'Acepto que la organización publique mi foto en la web de la competición (', consImg: 'consentimiento de imagen', retirarlo: '). Puedo retirarlo cuando quiera.', retirar: 'Retirarlo',
    consAceptado: (v: string) => `Consentimiento de imagen aceptado (${v}).`,
    ciudad: 'Ciudad', usuario: '@usuario', sobreTi: 'Sobre ti (máx. 280)', bioPh: 'Tercera temporada en powerlifting. Vengo de la halterofilia…',
    marcas: 'Mejores marcas (kg)', marcasMal: 'Las marcas van entre 0 y 600 kg.',
    mostrar: 'Mostrar mi perfil público', mostrarTxt: 'Tu ficha en /atletas con foto, bio, Instagram y marcas. Tu nombre, club, categoría, horario y resultados son públicos siempre en participantes y resultados.',
    guardarPerfil: 'Guardar perfil',
    noSubir: 'No se pudo subir la foto.', noGuardarGen: 'No se pudo guardar. Inténtalo de nuevo.', caducada: 'Tu sesión ha caducado.',
  },
  en: {
    volver: 'Back to the dashboard', tuPerfil: 'Your profile', loVeran: 'They will see it at /atletas/',
    encuadre: 'Framing: tap on your face', fotoPerfil: 'Profile photo', fotoTxt: 'JPG, PNG or WebP up to 8 MB. Tap on the photo to centre your face (the position is saved).',
    subiendo: 'Uploading…', subirFoto: 'Upload photo', cambiar: 'Change',
    noPublica: 'Your photo will not be published on your page until you accept the image consent.',
    acepto: 'I agree that the organisers may publish my photo on the competition website (', consImg: 'image consent', retirarlo: '). I can withdraw it at any time.', retirar: 'Withdraw it',
    consAceptado: (v: string) => `Image consent accepted (${v}).`,
    ciudad: 'City', usuario: '@username', sobreTi: 'About you (max. 280)', bioPh: 'Third season in powerlifting. I come from weightlifting…',
    marcas: 'Best lifts (kg)', marcasMal: 'Lifts must be between 0 and 600 kg.',
    mostrar: 'Show my public profile', mostrarTxt: 'Your page on /atletas with photo, bio, Instagram and lifts. Your name, club, weight class, schedule and results are always public in participants and results.',
    guardarPerfil: 'Save profile',
    noSubir: "Couldn't upload the photo.", noGuardarGen: "Couldn't save. Please try again.", caducada: 'Your session has expired.',
  },
};

/**
 * `/area-atleta?vista=perfil`: «Editar mi perfil» (área de atleta). Today's editing UI lives here as its own block;
 * a profile change request flow can replace the form without touching the area shell, the routing or the guard.
 */
@Component({
  selector: 'gr-area-perfil',
  imports: [RouterLink, LocPipe, FormsModule, GrButton, GrField, GrIcon, GrInput],
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
      @if (!panel().atleta.perfil.imagen) {
        @if (panel().atleta.perfil.fotoUrl) { <p class="mt-4 text-body-s text-warning" role="note">{{ t().noPublica }}</p> }
        <label class="mt-4 flex min-h-11 items-start gap-3 rounded-md border border-line-subtle bg-bg-card p-3 text-body-s text-text-secondary">
          <input type="checkbox" name="imagen" [(ngModel)]="aceptaImagen" class="mt-0.5 size-6 shrink-0 accent-[#C42B3E]" />
          <span>{{ t().acepto }}<a [href]="'/consentimiento-datos' | loc" target="_blank" class="text-accent-text underline">{{ t().consImg }}</a>{{ t().retirarlo }}</span>
        </label>
      } @else {
        <p class="mt-4 text-body-xs text-text-tertiary">{{ t().consAceptado(panel().atleta.perfil.imagen!.version) }} <button type="button" class="text-accent-text underline" (click)="retirar = true; guardarPerfil()">{{ t().retirar }}</button></p>
      }
      <form class="mt-6 flex flex-col gap-5" (ngSubmit)="guardarPerfil()" novalidate>
        <gr-field label="Club" for="f-club"><input grInput id="f-club" name="club" [(ngModel)]="f.club" maxlength="120" /></gr-field>
        <gr-field [label]="t().ciudad" for="f-city"><input grInput id="f-city" name="ciudad" autocomplete="address-level2" [(ngModel)]="f.ciudad" maxlength="80" /></gr-field>
        @if (!panel().atleta.menor) { <gr-field label="Instagram" for="f-ig" [optional]="true"><input grInput id="f-ig" name="ig" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" [(ngModel)]="f.instagram" [placeholder]="t().usuario" maxlength="60" /></gr-field> }
        <gr-field [label]="t().sobreTi" for="f-bio"><textarea grInput id="f-bio" name="bio" rows="4" [(ngModel)]="f.bio" maxlength="280" [placeholder]="t().bioPh"></textarea></gr-field>
        <fieldset><legend class="text-label-s">{{ t().marcas }}</legend>
          <div class="mt-2 grid grid-cols-3 gap-3">
            @for (m of lifts; track m.k) { <label class="flex flex-col gap-1"><span class="text-mono-xs text-text-tertiary">{{ m.s }}</span><input grInput type="number" inputmode="decimal" step="2.5" min="0" max="600" [name]="'m' + m.k" [(ngModel)]="f.marcas[m.k]" [attr.aria-invalid]="fuera(f.marcas[m.k]) || null" [attr.aria-describedby]="fuera(f.marcas[m.k]) ? 'm-err' : null" [class.border-accent]="fuera(f.marcas[m.k])" /></label> }
          </div>
          @if (marcasMal()) { <p id="m-err" class="mt-2 text-body-s text-accent-text" role="alert">{{ t().marcasMal }}</p> }
        </fieldset>
        <div class="flex items-center justify-between gap-4 rounded-md border border-line-subtle bg-bg-card p-4">
          <span><span class="block text-label-m">{{ t().mostrar }}</span><span class="block text-body-xs text-text-tertiary">{{ t().mostrarTxt }}</span></span>
          <button type="button" role="switch" [attr.aria-checked]="f.visible" (click)="f.visible = !f.visible" class="flex h-11 w-12 shrink-0 items-center justify-center" [attr.aria-label]="t().mostrar">
            <span class="relative h-6 w-10 rounded-pill" [class]="f.visible ? 'bg-accent' : 'bg-line-strong'"><span class="absolute top-0.5 size-5 rounded-full bg-white transition-[left]" [style.left.px]="f.visible ? 18 : 2"></span></span>
          </button>
        </div>
        @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
        <div class="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-5 max-md:border-t max-md:border-line-subtle max-md:bg-bg-base/95 max-md:px-5 max-md:pt-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))] max-md:backdrop-blur-[10px]"><button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="guardando()" [disabled]="marcasMal()">{{ t().guardarPerfil }}</button></div>
      </form>
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
  protected retirar = false;
  protected fx = 50;
  protected fy = 50;
  protected f = { club: '', ciudad: '', instagram: '', bio: '', marcas: {} as Marcas, visible: true };
  protected readonly lifts: { k: keyof Marcas; s: string }[] = [{ k: 'sq', s: 'SQ' }, { k: 'bp', s: 'BP' }, { k: 'dl', s: 'DL' }];
  protected readonly subiendo = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const a = this.panel().atleta;
    this.f = { club: a.club, ciudad: a.ciudad, instagram: a.perfil.instagram, bio: a.perfil.bio || a.perfil.frase, marcas: { ...a.perfil.marcas }, visible: a.perfil.visible };
    this.fx = a.perfil.focalX;
    this.fy = a.perfil.focalY;
  }

  protected fuera(v: unknown): boolean {
    return v !== null && v !== undefined && v !== '' && !(Number(v) >= 0 && Number(v) <= 600);
  }
  protected marcasMal(): boolean {
    return this.lifts.some((m) => this.fuera(this.f.marcas[m.k]));
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
      const p = await firstValueFrom(this.http.post<Panel>(`${AREA_API}/foto`, fd));
      this.fx = p.atleta.perfil.focalX;
      this.fy = p.atleta.perfil.focalY;
      this.guardado.emit(p);
    } catch (e) {
      this.error.set(this.msg(e, this.t().noSubir));
    } finally {
      this.subiendo.set(false);
    }
  }

  protected async guardarPerfil(): Promise<void> {
    this.error.set('');
    const mal = this.lifts.filter((m) => this.fuera(this.f.marcas[m.k])).map((m) => m.s);
    if (mal.length) return this.error.set(mal.join(', ') + ' · ' + this.t().marcasMal);
    if (this.guardando()) return;
    this.guardando.set(true);
    const n = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));
    try {
      const p = await firstValueFrom(this.http.put<Panel>(`${AREA_API}/perfil`, {
        club: this.f.club, ciudad: this.f.ciudad, instagram: this.f.instagram, bio: this.f.bio, marcas: { sq: n(this.f.marcas.sq), bp: n(this.f.marcas.bp), dl: n(this.f.marcas.dl) },
        visible: this.f.visible, aceptaUsoDeImagen: this.aceptaImagen, retirarConsentimiento: this.retirar,
      }));
      this.retirar = false;
      this.aceptaImagen = false;
      this.listo.emit(p);
    } catch (e) {
      this.error.set(this.msg(e, this.t().noGuardarGen));
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
