import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon, GrTelefono, telefonoValido } from '@grcup/ui';
import { COMPETITION_SLUG } from '../core/competition';
import { textoError } from '../core/errores';
import { I18n } from '../core/i18n';

const T = {
  es: {
    eyebrow: 'GRS Coaching', titulo: '¿Necesitas handler?', tituloB: 'Podemos hacértelo, y gratis.',
    texto: 'Déjanos tus datos y te escribimos por email o WhatsApp para organizarlo.',
    nombre: 'Nombre y apellidos', telefono: 'Teléfono', email: 'Correo', edad: 'Edad', prueba: 'Competición',
    categoria: 'Categoría', categoriaPh: 'Ej. -74 kg Open', entrenador: '¿Tienes entrenador?', entrenadorPh: 'Su nombre (vacío si no tienes)',
    idea: 'Cuéntanos qué idea de competición tienes', enviar: 'Pedir handler gratis',
    ok: '¡Recibido! Te escribimos en breve para organizar tu handler.', error: 'No se ha podido enviar. Inténtalo otra vez.',
    falta: 'Rellena todos los campos obligatorios.',
    tel: 'Escribe el número de teléfono completo.',
  },
  en: {
    eyebrow: 'GRS Coaching', titulo: 'Need a handler?', tituloB: "We'll handle you, for free.",
    texto: "Leave your details and we'll get in touch by email or WhatsApp to arrange it.",
    nombre: 'Full name', telefono: 'Phone', email: 'Email', edad: 'Age', prueba: 'Competition',
    categoria: 'Category', categoriaPh: 'E.g. -74 kg Open', entrenador: 'Do you have a coach?', entrenadorPh: 'Their name (empty if none)',
    idea: 'Tell us your competition plan', enviar: 'Get a free handler',
    ok: "Got it! We'll be in touch shortly to arrange your handler.", error: "It couldn't be sent. Please try again.",
    falta: 'Fill in all the required fields.',
    tel: 'Enter the full phone number.',
  },
};

const CAMPO = 'h-12 w-full rounded-[10px] border border-line-strong bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none';

/** BIZ-161: «¿Necesitas handler? Podemos hacértelo, y gratis.» → email + WhatsApp (plantilla handler-solicitud). */
@Component({
  selector: 'gr-handler-gratis',
  imports: [FormsModule, GrButton, GrIcon, GrTelefono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section id="handler-gratis" class="mt-18 rounded-lg border border-line-subtle bg-bg-card p-6 md:mt-24 md:p-10">
      <p class="text-label-s text-accent-text">{{ t().eyebrow }}</p>
      <h2 class="mt-2 text-display-s md:text-display-m">{{ t().titulo }} <span class="text-accent-text">{{ t().tituloB }}</span></h2>
      <p class="mt-3 text-body-m text-text-tertiary">{{ t().texto }}</p>
      @if (enviado()) {
        <p class="mt-6 flex items-center gap-2 text-body-m" role="status"><gr-icon name="check" [size]="18" />{{ t().ok }}</p>
      } @else {
        <form class="mt-6 grid gap-4 sm:grid-cols-2" (ngSubmit)="enviar()" novalidate>
          <div class="flex flex-col gap-2 sm:col-span-2"><label class="text-label-s" for="hg-nombre">{{ t().nombre }}</label>
            <input id="hg-nombre" name="nombre" autocomplete="name" maxlength="140" required [class]="campo" [(ngModel)]="d.nombre" /></div>
          <div class="flex flex-col gap-2"><label class="text-label-s" for="hg-telefono">{{ t().telefono }}</label>
            <gr-telefono id="hg-telefono" name="telefono" [aria-label]="t().telefono" [(ngModel)]="d.telefono" /></div>
          <div class="flex flex-col gap-2"><label class="text-label-s" for="hg-email">{{ t().email }}</label>
            <input id="hg-email" name="email" type="email" autocomplete="email" maxlength="254" required [class]="campo" [(ngModel)]="d.email" /></div>
          <div class="flex flex-col gap-2"><label class="text-label-s" for="hg-edad">{{ t().edad }}</label>
            <input id="hg-edad" name="edad" type="number" inputmode="numeric" min="10" max="99" required [class]="campo" [(ngModel)]="d.edad" /></div>
          <div class="flex flex-col gap-2"><label class="text-label-s" for="hg-prueba">{{ t().prueba }}</label>
            <select id="hg-prueba" name="prueba" required [class]="campo" [(ngModel)]="d.prueba"><option value="aep2">AEP-2</option><option value="aep3">AEP-3</option></select></div>
          <div class="flex flex-col gap-2"><label class="text-label-s" for="hg-categoria">{{ t().categoria }}</label>
            <input id="hg-categoria" name="categoria" maxlength="60" required [placeholder]="t().categoriaPh" [class]="campo" [(ngModel)]="d.categoria" /></div>
          <div class="flex flex-col gap-2"><label class="text-label-s" for="hg-entrenador">{{ t().entrenador }}</label>
            <input id="hg-entrenador" name="entrenador" maxlength="80" [placeholder]="t().entrenadorPh" [class]="campo" [(ngModel)]="d.entrenador" /></div>
          <div class="flex flex-col gap-2 sm:col-span-2"><label class="text-label-s" for="hg-idea">{{ t().idea }}</label>
            <textarea id="hg-idea" name="idea" rows="4" maxlength="1000" required class="w-full rounded-[10px] border border-line-strong bg-bg-field px-3.5 py-3 text-body-m focus:border-accent-text focus:outline-none" [(ngModel)]="d.idea"></textarea></div>
          <input class="sr-only" aria-hidden="true" name="web" tabindex="-1" autocomplete="off" [(ngModel)]="d.web" />
          @if (error(); as e) { <p class="flex items-center gap-1.5 text-body-s text-accent-text sm:col-span-2" role="alert"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
          <div class="sm:col-span-2"><button type="submit" grButton variant="primary" size="l" [loading]="enviando()">{{ t().enviar }}</button></div>
        </form>
      }
    </section>
  `,
})
export class HandlerGratis {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly campo = CAMPO;
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal('');
  protected d = { nombre: '', telefono: '', email: '', edad: null as number | null, prueba: 'aep2', categoria: '', entrenador: '', idea: '', web: '' };

  protected async enviar(): Promise<void> {
    const d = this.d;
    const [nombre, ...resto] = d.nombre.trim().split(/\s+/);
    if (!nombre || !resto.length || !d.telefono.trim() || !d.email.trim() || !d.edad || !d.categoria.trim() || !d.idea.trim()) {
      this.error.set(this.t().falta);
      return;
    }
    if (!telefonoValido(d.telefono)) {
      this.error.set(this.t().tel);
      return;
    }
    this.error.set('');
    this.enviando.set(true);
    try {
      await firstValueFrom(this.http.post(`/api/competiciones/${COMPETITION_SLUG}/alta-atleta/handler`, {
        nombre, apellidos: resto.join(' '), telefono: d.telefono.trim(), email: d.email.trim(), edad: Number(d.edad), prueba: d.prueba,
        categoria: d.categoria.trim(), entrenador: d.entrenador.trim(), idea: d.idea.trim(), web: d.web,
      }));
      this.enviado.set(true);
    } catch (e) {
      this.error.set(textoError(e, this.t().error, this.i18n.lang()));
    } finally {
      this.enviando.set(false);
    }
  }
}
