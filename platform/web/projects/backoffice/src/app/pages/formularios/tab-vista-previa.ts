import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { GrAlert, GrSegmented, GrSkeleton } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoWhatsappBubble } from '../../shared/kit';
import { errText } from '../../shared/ui';
import { FormulariosApi, type Previsualizacion } from './api';
import { BoFormularioRender } from './formulario-render';
import { FormularioStore } from './store';

type Modo = 'web-escritorio' | 'web-movil' | 'email' | 'whatsapp';
const DEMO_ENLACE = 'https://grcup.es/formularios/ejemplo';
const DEBOUNCE_MS = 600;

/**
 * «Vista previa» tab: the form as the person sees it on the web (fillable, nothing is saved), as the email (the
 * server's compiled HTML in an inert iframe) and as the WhatsApp message. Reads the draft from the store.
 */
@Component({
  selector: 'bo-tab-vista-previa',
  imports: [BoFormularioRender, BoWhatsappBubble, GrAlert, GrSegmented, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = store.draft();
    <div class="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div class="flex flex-wrap items-center gap-3">
        <gr-segmented [options]="modos" [value]="modo()" (valueChange)="modo.set($any($event))" label="Tipo de vista previa" />
        <span class="flex-1"></span>
        @if (modo() === 'email' && previa()?.soloWeb) { <span class="text-body-xs text-text-tertiary">Solo web</span> }
      </div>

      @if (error() && modo() === 'email') { <gr-alert tone="danger" title="No se ha podido generar la vista previa">{{ error() }}</gr-alert> }

      @if (b) {
        @switch (modo()) {
          @case ('web-escritorio') {
            <section class="rounded-lg border border-line-subtle bg-[#ece7e7] p-4 md:p-6" aria-label="Vista web de escritorio">
              <p class="mb-3 text-center text-mono-xs text-[#7a7072]">WEB · ESCRITORIO</p>
              <bo-formulario-render [esquema]="b.esquema" [escritorio]="true" [interactivo]="true" [valores]="valores()" (valorCambia)="valor($event.id, $event.valor)" />
              <p class="mt-4 text-center text-body-xs text-[#7a7072]">Vista de prueba: lo que escribas aquí no se guarda.</p>
            </section>
          }
          @case ('web-movil') {
            <section class="rounded-lg border border-line-subtle bg-[#ece7e7] p-4 md:p-6" aria-label="Vista web móvil">
              <p class="mb-3 text-center text-mono-xs text-[#7a7072]">WEB · MÓVIL</p>
              <bo-formulario-render [esquema]="b.esquema" [escritorio]="false" [interactivo]="true" [valores]="valores()" (valorCambia)="valor($event.id, $event.valor)" />
              <p class="mt-4 text-center text-body-xs text-[#7a7072]">Vista de prueba: lo que escribas aquí no se guarda.</p>
            </section>
          }
          @case ('email') {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-4 md:p-6" aria-label="Vista del email">
              @if (previa(); as p) {
                <div class="mx-auto flex max-w-[640px] flex-col gap-3">
                  <p class="truncate text-label-s">Asunto: {{ p.asunto || b.email.asunto || '—' }}</p>
                  @if (p.soloWeb) { <gr-alert tone="info" title="Solo web">Este formulario tiene subida de archivos. El email lleva solo el botón al formulario web.</gr-alert> }
                  <div class="overflow-hidden rounded-lg border border-line-strong bg-white">
                    <iframe [srcdoc]="srcdoc()" title="Vista previa del email" class="block h-[720px] w-full border-0 bg-white" sandbox=""></iframe>
                  </div>
                </div>
              } @else { <gr-skeleton class="mx-auto h-[640px] max-w-[640px] rounded-lg" /> }
            </section>
          }
          @case ('whatsapp') {
            <section class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card p-6" aria-label="Vista del mensaje de WhatsApp">
              <p class="text-mono-xs text-text-tertiary">WHATSAPP · MENSAJE DEL FORMULARIO</p>
              <bo-whatsapp-bubble [texto]="textoWa()" hora="10:24" [botones]="[b.esquema.ajustes.botonEnviar || 'Rellenar en la web']" />
              <p class="max-w-sm text-center text-body-xs text-text-tertiary">En la vista el nombre se sustituye por un nombre de ejemplo. Al enviarlo, cada destinatario recibe el suyo.</p>
            </section>
          }
        }
      }
    </div>
  `,
})
export class FormularioTabVistaPrevia {
  protected readonly store = inject(FormularioStore);
  private readonly api = inject(FormulariosApi);
  private readonly comps = inject(Competitions);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly modos = [
    { value: 'web-escritorio', label: 'Web escritorio' },
    { value: 'web-movil', label: 'Web móvil' },
    { value: 'email', label: 'Email' },
    { value: 'whatsapp', label: 'WhatsApp' },
  ];
  protected readonly modo = signal<Modo>('web-escritorio');
  protected readonly valores = signal<Record<string, unknown>>({});
  protected readonly previa = signal<Previsualizacion | null>(null);
  protected readonly error = signal('');
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  protected readonly srcdoc = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(this.previa()?.emailHtml ?? ''));

  /** Text of the WhatsApp message with sample values: the server's text for the draft (it applies the default when the draft has none). */
  protected readonly textoWa = computed(() => {
    const b = this.store.draft();
    const base = this.previa()?.whatsappTexto ?? b?.whatsapp.texto ?? '';
    return base
      .replace(/\{\{\s*nombre\s*\}\}/g, 'Laura')
      .replace(/\{\{\s*competicion\s*\}\}/g, this.comps.current()?.nombre ?? '')
      .replace(/\{\{\s*formulario\s*\}\}/g, b?.esquema.ajustes.titulo ?? '')
      .replace(/\{\{\s*enlace\s*\}\}/g, DEMO_ENLACE);
  });

  constructor() {
    // Email and WhatsApp come from the server: refreshed (debounced) while the draft changes.
    effect(() => {
      this.store.draft();
      const m = this.modo();
      if (m !== 'email' && m !== 'whatsapp') return;
      untracked(() => this.programar());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected valor(id: string, v: unknown): void {
    this.valores.update((x) => ({ ...x, [id]: v }));
  }

  private programar(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pedir(), DEBOUNCE_MS);
  }

  private async pedir(): Promise<void> {
    const b = this.store.draft();
    const cid = this.comps.current()?.id;
    if (!b || !cid) return;
    const mine = ++this.seq;
    try {
      const r = await this.api.previsualizar(cid, { esquema: b.esquema, email: b.email, whatsapp: b.whatsapp });
      if (mine !== this.seq) return; // a newer request already answered
      this.previa.set(r);
      this.error.set('');
    } catch (e) {
      if (mine === this.seq) this.error.set(errText(e, 'No se pudo generar la vista previa.'));
    }
  }
}
