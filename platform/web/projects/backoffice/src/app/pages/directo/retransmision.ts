import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts, embedVideo, tipoVideo } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { webPublica } from '../../core/web';
import { BoPageHeader, BoToggle, errText } from '../../shared/ui';
import { DirectoApi, type Mesa } from './api';

const FASE: Record<string, { l: string; d: string }> = {
  antes: { l: 'Antes del evento', d: '/en-directo muestra la emisión programada (YouTube enseña su sala de espera y «Recordarme»).' },
  en_directo: { l: 'En directo', d: '/en-directo muestra la emisión, en silencio hasta que se active el sonido.' },
  finalizado: { l: 'Finalizado', d: '/en-directo muestra la repetición (o la misma emisión si no hay repetición).' },
};

/** «Directo · Retransmisión» (Figma page 57): the YouTube broadcast of /en-directo, its replay and whether the page shows it. */
@Component({
  selector: 'bo-retransmision',
  imports: [FormsModule, RouterLink, BoPageHeader, BoToggle, GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = mesa();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Directo" subtitle="El vídeo de /en-directo antes, durante y después de la competición" [crumbs]="[comps.current()?.nombreCorto || '', 'Hoy', 'Directo']">
        <ng-container actions>
          <a grButton icon="external-link" [href]="web + '/en-directo'" target="_blank" rel="noopener">Ver /en-directo</a>
          @if (puede() && m) { <button grButton variant="primary" [loading]="guardando()" [disabled]="!valida()" (click)="guardar()">Guardar</button> }
        </ng-container>
      </bo-page-header>
      <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Directo">
        @for (t of tabs; track t.l) {
          <a [routerLink]="['/', comps.current()?.slug].concat(t.ruta)" class="relative flex h-11 shrink-0 items-center px-3 text-label-s" [attr.aria-current]="t.actual ? 'page' : null"
            [class]="t.actual ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">{{ t.l }}@if (t.actual) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }</a>
        }
      </nav>
      @if (m === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar el directo"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (m === undefined) { <gr-skeleton class="h-[480px] rounded-lg" /> }
      @else {
        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_480px]">
          <section class="flex flex-col gap-5 rounded-lg border border-line-subtle bg-bg-card p-5">
            <div><h2 class="text-ui-h5">Retransmisión de YouTube</h2><p class="mt-0.5 text-body-xs text-text-tertiary">El vídeo que se ve en /en-directo</p></div>
            <div class="flex flex-col gap-2">
              <gr-field label="Emisión en directo (YouTube)" for="r-stream" hint="Enlace de la emisión: youtube.com/live/…, youtube.com/watch?v=… o youtu.be/… (también un canal de Twitch)">
                <input grInput id="r-stream" type="url" inputmode="url" placeholder="https://www.youtube.com/live/…" [(ngModel)]="f.streamUrl" (ngModelChange)="tocar()" [invalid]="!!f.streamUrl && !tipo(f.streamUrl)" [disabled]="!puede()" />
              </gr-field>
              <p class="flex items-center gap-2 text-body-s" role="status" [class]="!f.streamUrl.trim() ? 'text-text-tertiary' : tipo(f.streamUrl) ? 'text-success' : 'text-accent-text'">
                <gr-icon [name]="!f.streamUrl.trim() ? 'info' : tipo(f.streamUrl) ? 'circle-check' : 'circle-alert'" [size]="16" class="shrink-0" />
                {{ !f.streamUrl.trim() ? 'Sin emisión: /en-directo muestra la foto del pabellón.' : tipo(f.streamUrl) === 'youtube' ? 'Vídeo de YouTube válido · se incrusta en /en-directo' : tipo(f.streamUrl) === 'twitch' ? 'Canal de Twitch válido · se incrusta en /en-directo' : 'No es un enlace de YouTube o Twitch que se pueda incrustar.' }}
              </p>
            </div>
            <div class="flex flex-col gap-2">
              <gr-field label="Repetición" for="r-replay" [optional]="true" hint="Si se deja vacío, al terminar se usa la misma emisión">
                <input grInput id="r-replay" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=…" [(ngModel)]="f.replayUrl" (ngModelChange)="tocar()" [invalid]="!!f.replayUrl && !tipo(f.replayUrl)" [disabled]="!puede()" />
              </gr-field>
              @if (f.replayUrl.trim() && !tipo(f.replayUrl)) { <p class="flex items-center gap-2 text-body-s text-accent-text" role="status"><gr-icon name="circle-alert" [size]="16" class="shrink-0" />No es un enlace de YouTube o Twitch que se pueda incrustar.</p> }
            </div>
            <div class="flex items-center gap-4 border-t border-line-subtle pt-4">
              <div class="flex-1"><p class="text-label-s">Mostrar la retransmisión en /en-directo</p><p class="text-body-xs text-text-tertiary">Antes del evento se ve la emisión programada («Recordarme»). Apagado: la foto del pabellón en las tres fases.</p></div>
              <bo-toggle [(value)]="f.visible" (changed)="tocar()" label="Mostrar la retransmisión en /en-directo" [disabled]="!puede()" />
            </div>
            <div class="flex items-center gap-4">
              <div class="flex-1"><p class="text-label-s">Mostrar el vídeo también en la home el día del evento</p><p class="text-body-xs text-text-tertiary">Mientras hay directo, la home enseña la emisión con un enlace a /en-directo.</p></div>
              <bo-toggle [(value)]="f.home" (changed)="tocar()" label="Mostrar el vídeo también en la home el día del evento" [disabled]="!puede() || !f.visible" />
            </div>
            <gr-alert tone="info" title="Privacidad">Se incrusta con youtube-nocookie.com y sin reproducción automática con sonido: en directo empieza en silencio.</gr-alert>
            @if (!puede()) { <p class="text-body-xs text-text-tertiary">Cambiar la retransmisión requiere el permiso «directo.operar».</p> }
          </section>
          <aside class="flex h-fit flex-col gap-3">
            <div><h2 class="text-ui-h5">Vista previa</h2><p class="mt-0.5 text-body-xs text-text-tertiary">Así se verá en /en-directo · fase actual: {{ fase().l }}</p></div>
            <div class="relative aspect-video overflow-hidden rounded-lg border border-line-subtle bg-black">
              @if (previa(); as v) { <iframe [src]="v" class="absolute inset-0 size-full border-0" title="Vista previa de la retransmisión" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe> }
              @else {
                <img [src]="web + '/img/home/org-publico-s.webp'" alt="" class="absolute inset-0 size-full object-cover opacity-50" />
                <p class="absolute inset-x-4 bottom-4 text-label-s">{{ f.visible ? 'Sin vídeo: la foto del pabellón' : 'Vídeo oculto: la foto del pabellón' }}</p>
              }
            </div>
            <p class="text-body-xs text-text-tertiary">{{ fase().d }}</p>
          </aside>
        </div>
      }
    </div>
  `,
})
export class RetransmisionPage {
  private readonly api = inject(DirectoApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly san = inject(DomSanitizer);
  protected readonly web = webPublica();
  protected readonly tipo = tipoVideo;
  protected readonly mesa = signal<Mesa | null | undefined>(undefined);
  protected readonly guardando = signal(false);
  private readonly cambios = signal(0);
  protected f = { streamUrl: '', replayUrl: '', visible: true, home: false };
  protected readonly tabs = [
    { l: 'Mesa', ruta: ['directo'], actual: false }, { l: 'Pantalla', ruta: ['directo', 'pantalla'], actual: false },
    { l: 'Retransmisión', ruta: ['directo', 'retransmision'], actual: true }, { l: 'Resultados', ruta: ['resultados'], actual: false },
  ];
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly fase = computed(() => FASE[this.mesa()?.estado.fase ?? 'antes'] ?? FASE['antes']);
  /** Same choice as /en-directo for the current phase, without autoplay. */
  protected readonly previa = computed<SafeResourceUrl | null>(() => {
    this.cambios();
    const fase = this.mesa()?.estado.fase;
    if (!this.f.visible) return null;
    const url = fase === 'finalizado' ? this.f.replayUrl.trim() || this.f.streamUrl.trim() : this.f.streamUrl.trim();
    const e = embedVideo(url, location.hostname);
    return e ? this.san.bypassSecurityTrustResourceUrl(e) : null;
  });
  protected readonly valida = computed(() => {
    this.cambios();
    return [this.f.streamUrl, this.f.replayUrl].every((u) => !u.trim() || !!tipoVideo(u.trim()));
  });

  constructor() {
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
  }

  protected tocar(): void { this.cambios.update((n) => n + 1); }

  async cargar(): Promise<void> {
    try {
      const m = await this.api.mesa(this.cid());
      this.f = { streamUrl: m.estado.streamUrl ?? '', replayUrl: m.estado.replayUrl ?? '', visible: m.estado.streamVisible ?? true, home: m.estado.streamHome ?? false };
      this.mesa.set(m);
      this.tocar();
    } catch {
      this.mesa.set(null);
    }
  }

  protected async guardar(): Promise<void> {
    const m = this.mesa();
    if (!m || !this.valida()) return;
    this.guardando.set(true);
    try {
      const r = await this.api.retransmision(this.cid(), m.estado.version, { streamUrl: this.f.streamUrl.trim(), replayUrl: this.f.replayUrl.trim(), visible: this.f.visible, home: this.f.visible && this.f.home });
      this.mesa.set(r);
      this.toasts.success('Retransmisión guardada', this.f.visible && this.f.streamUrl ? '/en-directo ya muestra el vídeo.' : '/en-directo muestra la foto del pabellón.');
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error?.code === 'CONFLICTO_EDICION') { this.toasts.error('Otra persona ha cambiado el directo', 'Se ha recargado: revisa la retransmisión y vuelve a guardar.'); void this.cargar(); }
      else this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
