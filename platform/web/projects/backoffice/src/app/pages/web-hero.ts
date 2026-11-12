import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { GrAlert, GrBadge, GrButton, GrIcon, GrInput, GrToasts, fmtAgo } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { webPublica } from '../core/web';
import { BoFocal } from '../shared/focal';
import { BoSchemaForm, type FieldDef } from '../shared/schema-form';
import { Confirm, errText } from '../shared/ui';
import { WebSections, type Seccion } from './web';

/** Figma 54 «Web · editar hero»: texts, background image with focal point and crops, desktop/mobile preview,
 * autosaved draft, discard, schedule and publish. */
@Component({
  selector: 'bo-web-hero',
  imports: [GrAlert, GrBadge, GrButton, GrIcon, GrInput, BoSchemaForm, BoFocal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    <div class="flex flex-wrap items-center gap-3">
      <button grButton variant="ghost" size="s" icon="arrow-left" (click)="closed.emit()">Secciones</button>
      <h2 class="text-ui-h4">Hero · trofeo animado</h2>
      <gr-badge [tone]="seccion().estado === 'publicada' ? 'success' : 'neutral'">{{ seccion().estado === 'publicada' ? 'Publicado' : 'Borrador' }}</gr-badge>
      @if (programada(); as at) { <gr-badge tone="info">Programado {{ fecha(at) }}</gr-badge> }
      <span class="flex-1"></span>
      @if (canEdit()) { <button grButton variant="ghost" [disabled]="seccion().estado === 'publicada' && !programada()" (click)="discard()">Descartar borrador</button> }
      @if (canPublish()) {
        <button grButton (click)="programando.set(!programando())" [attr.aria-expanded]="programando()">Programar</button>
        <button grButton variant="primary" [loading]="busy()" (click)="publish()">Publicar</button>
      }
    </div>
    @if (programando()) {
      <div class="flex flex-wrap items-end gap-3 rounded-lg border border-line-subtle bg-bg-card p-4">
        <label class="flex flex-col gap-1 text-label-s" for="hero-programar">Publicar el
          <input grInput id="hero-programar" type="datetime-local" [value]="cuando()" (input)="cuando.set($any($event.target).value)" /></label>
        <button grButton variant="primary" [disabled]="!cuando()" [loading]="busy()" (click)="schedule()">Programar publicación</button>
      </div>
    }
    @if (error()) {
      <gr-alert tone="danger" [title]="conflict() ? 'Otra persona ha guardado antes' : 'No se pudo guardar'">{{ error() }}
        @if (conflict()) { <button grButton size="s" class="mt-3" (click)="reload()">Recargar sus cambios</button> }
      </gr-alert>
    }
    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div class="flex min-w-0 flex-col gap-6">
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
          <h3 class="text-ui-h5">Textos</h3>
          <p class="mt-0.5 mb-4 text-body-xs text-text-tertiary">Se muestran sobre la animación del trofeo</p>
          <bo-schema-form [fields]="textos()" [value]="draft()" (valueChange)="change($event)" prefix="hero-" />
        </section>
        <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
          <h3 class="text-ui-h5">Imagen de fondo (móvil sin animación)</h3>
          <p class="mt-0.5 mb-4 text-body-xs text-text-tertiary">JPG/WebP · el CDN genera 480/960/1600 px</p>
          <bo-schema-form [fields]="imagen" [value]="draft()" (valueChange)="change($event)" prefix="hero-img-" />
          @if (str('imagen'); as src) {
            <bo-focal class="mt-4" [src]="src" [alt]="str('titulo')" [x]="num('focalX')" [y]="num('focalY')"
              (xChange)="change({ focalX: $event })" (yChange)="change({ focalY: $event })" />
          }
        </section>
      </div>
      <aside class="flex flex-col gap-4">
        <div class="flex items-start justify-between gap-3">
          <div><h3 class="text-ui-h5">Vista previa</h3><p class="text-body-xs text-text-tertiary">{{ seccion().estado === 'publicada' && !dirty() ? 'Publicado' : 'Borrador sin publicar' }}</p></div>
          <div class="inline-flex rounded-md border border-line-subtle bg-bg-surface p-1" role="group" aria-label="Dispositivo">
            @for (d of ['Escritorio', 'Móvil']; track d) {
              <button type="button" class="h-9 rounded-sm px-4 text-label-s" [attr.aria-pressed]="device() === d"
                [class]="device() === d ? 'bg-bg-raised text-text-primary' : 'text-text-secondary'" (click)="device.set(d)">{{ d }}</button>
            }
          </div>
        </div>
        <div class="mx-auto w-full overflow-hidden rounded-lg border border-line-subtle bg-bg-surface" [class.max-w-[280px]]="device() === 'Móvil'">
          <div class="flex items-center gap-1.5 border-b border-line-subtle px-3 py-2">
            <span class="size-2 rounded-full bg-line-strong"></span><span class="size-2 rounded-full bg-line-strong"></span><span class="size-2 rounded-full bg-line-strong"></span>
            <span class="ml-2 truncate text-mono-xs uppercase text-text-tertiary">{{ host }}</span>
          </div>
          <div class="relative m-3 overflow-hidden rounded-md bg-[linear-gradient(180deg,#5a1520,#1b1718)] px-4 py-6 text-center">
            @if (device() === 'Móvil' && str('imagen')) {
              <img [src]="vista(str('imagen'))" alt="" class="absolute inset-0 size-full object-cover opacity-40" [style.object-position]="num('focalX') + '% ' + num('focalY') + '%'" />
            }
            <div class="relative">
              @if (str('eyebrow')) { <p class="text-mono-xs uppercase tracking-wider text-text-secondary">{{ str('eyebrow') }}</p> }
              <p class="mt-2 font-display leading-tight uppercase" [class]="device() === 'Móvil' ? 'text-[24px]' : 'text-[32px]'">{{ str('titulo') || comps.current()?.nombre }}</p>
              @if (str('fecha')) { <p class="mt-2 text-body-xs text-text-secondary">{{ str('fecha') }}</p> }
              @if (str('ctaTexto')) { <span class="mt-3 inline-flex h-9 items-center rounded-sm bg-accent px-4 text-label-s">{{ str('ctaTexto') }}</span> }
            </div>
          </div>
        </div>
        <gr-alert tone="info" title="Decisiones de diseño">El texto largo se corta en móvil a partir de 40 caracteres: el contador avisa antes. «Programar» publica a una hora concreta (p. ej. al abrir las entradas).</gr-alert>
      </aside>
    </div>
    <footer class="flex items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-5 py-4" aria-live="polite">
      <gr-icon name="circle-check" [size]="20" [class]="saving() ? 'text-text-tertiary' : 'text-success'" />
      <div class="flex-1">
        <p class="text-label-s">{{ saving() ? 'Guardando…' : dirty() ? 'Cambios sin guardar' : 'Borrador guardado' }}</p>
        <p class="text-body-xs text-text-tertiary">{{ savedAt() ? 'Autoguardado ' + ago(savedAt()!) + ' · ' : '' }}aún no es público hasta publicar</p>
      </div>
      <a grButton [href]="web" target="_blank" rel="noopener">Ver en la web</a>
    </footer>
  `,
})
export class WebHeroEditor {
  readonly seccion = input.required<Seccion>();
  readonly closed = output<void>();
  private readonly secs = inject(WebSections);
  private readonly auth = inject(Auth);
  protected readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly draft = signal<Record<string, unknown>>({});
  protected readonly saving = signal(false);
  protected readonly busy = signal(false);
  protected readonly dirty = signal(false);
  protected readonly savedAt = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly conflict = signal(false);
  protected readonly device = signal('Escritorio');
  protected readonly programando = signal(false);
  protected readonly cuando = signal('');
  protected readonly web = webPublica();
  protected readonly host = new URL(webPublica()).host;
  protected readonly ago = fmtAgo;
  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'web.editar'));
  protected readonly canPublish = computed(() => this.auth.can(this.comps.current()?.id, 'web.publicar'));
  /** Pending schedule only: once the scheduler publishes, estado is «publicada» and the badge goes away (U30-R2-4). */
  protected readonly programada = computed(() => { const at = this.seccion().programadaAt; return at && this.seccion().estado !== 'publicada' && new Date(at) > new Date() ? at : null; });
  /** Text fields of the API schema; the short ones go in two columns as in Figma. */
  protected readonly textos = computed<FieldDef[]>(() => this.seccion().campos.filter((c) => ['eyebrow', 'fecha', 'titulo', 'ctaTexto', 'ctaDestino'].includes(c.clave))
    .map((c) => (c.clave === 'titulo' ? c : { ...c, ancho: 'mitad' as const })));
  protected readonly imagen: FieldDef[] = [{ clave: 'imagen', etiqueta: 'Imagen', tipo: 'imagen' }];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private rev = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.timer) { clearTimeout(this.timer); void this.flush(); } });
  }

  ngOnInit(): void { this.reset(this.seccion()); }

  private reset(s: Seccion): void {
    this.draft.set(structuredClone(s.borrador ?? {}));
    this.rev = s.rev;
    this.savedAt.set(s.updatedAt);
    this.dirty.set(false);
  }

  protected str(k: string): string { const v = this.draft()[k]; return typeof v === 'string' ? v : ''; }
  protected num(k: string): number { const v = this.draft()[k]; return typeof v === 'number' ? v : 50; }
  protected vista(u: string): string { return u.startsWith('/') && !u.startsWith('//') ? webPublica() + u : u; }
  protected fecha(v: string): string { return new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }); }

  /** Every edit is autosaved as draft 1.5 s after the last keystroke. */
  protected change(v: Record<string, unknown>): void {
    if (!this.canEdit()) return;
    this.draft.update((d) => ({ ...d, ...v }));
    this.dirty.set(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 1500);
  }

  private async flush(): Promise<boolean> {
    this.timer = undefined;
    if (!this.dirty()) return true;
    this.saving.set(true);
    this.error.set('');
    this.conflict.set(false);
    try {
      const s = await this.secs.save(this.seccion().id, { borrador: this.draft() }, this.rev);
      this.rev = s.rev;
      this.dirty.set(false);
      this.savedAt.set(s.updatedAt);
      return true;
    } catch (e) {
      this.conflict.set(e instanceof HttpErrorResponse && e.error?.code === 'CONFLICTO_EDICION');
      this.error.set(errText(e));
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected async reload(): Promise<void> {
    await this.secs.load(this.comps.current()!.id, this.secs.pagina());
    const s = (this.secs.items() ?? []).find((x) => x.id === this.seccion().id);
    if (s) this.reset(s);
    this.error.set('');
    this.conflict.set(false);
  }

  protected async publish(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.busy.set(true);
    try {
      if (!(await this.flush())) return;
      await this.secs.publish(['hero']);
      this.toasts.success('Hero publicado', 'Ya se ve en la web.');
      this.closed.emit();
    } catch (e) {
      this.toasts.error('No se pudo publicar', errText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async schedule(): Promise<void> {
    const at = new Date(this.cuando());
    if (this.timer) clearTimeout(this.timer);
    this.busy.set(true);
    try {
      if (!(await this.flush())) return;
      await this.secs.publish(['hero'], at.toISOString());
      this.programando.set(false);
      this.toasts.success('Publicación programada', this.fecha(at.toISOString()));
    } catch (e) {
      this.toasts.error('No se pudo programar', errText(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async discard(): Promise<void> {
    const ok = await this.confirm.ask({ title: '¿Descartar el borrador del hero?', text: 'Vuelve a lo publicado y se anula la programación. No se puede deshacer.', confirm: 'Descartar', danger: true });
    if (!ok) return;
    if (this.timer) clearTimeout(this.timer);
    try {
      const s = await this.secs.discard(this.seccion().id);
      this.reset(s);
      this.toasts.success('Borrador descartado');
    } catch (e) {
      this.toasts.error('No se pudo descartar', errText(e));
    }
  }
}

