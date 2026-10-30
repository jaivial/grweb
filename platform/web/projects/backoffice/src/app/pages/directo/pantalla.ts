import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { GrButton, GrIcon, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { BoPageHeader, BoToggle, Confirm, errText } from '../../shared/ui';
import { DirectoApi, type Mesa, type Pantalla } from './api';

/** «Directo · pantalla» (Figma page 57): live preview of the arena screen, what it shows and its signed URL. */
@Component({
  selector: 'bo-pantalla',
  imports: [BoPageHeader, BoToggle, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Pantalla del pabellón" [crumbs]="[comps.current()?.nombreCorto || '', 'Hoy', 'Directo', 'Pantalla']">
        <ng-container actions>
          @if (url()) { <a grButton icon="external-link" [href]="url()" target="_blank" rel="noopener">Abrir en ventana</a> }
        </ng-container>
      </bo-page-header>
      <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section #marco class="relative aspect-video overflow-hidden rounded-lg border border-line-subtle bg-black" aria-label="Vista previa de la pantalla">
          @if (src(); as s) {
            <iframe [src]="s" title="Pantalla del pabellón" class="absolute top-0 left-0 h-[1080px] w-[1920px] origin-top-left border-0" [style.transform]="'scale(' + escala() + ')'" tabindex="-1"></iframe>
          } @else { <gr-skeleton class="absolute inset-0" /> }
        </section>
        <aside class="flex h-fit flex-col gap-1 rounded-lg border border-line-subtle bg-bg-card p-5">
          <h2 class="text-ui-h5">Ajustes de la pantalla</h2>
          @if (p(); as x) {
            @for (o of opciones; track o.k) {
              <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">{{ o.l }}</p><p class="text-body-xs text-text-tertiary">{{ o.h }}</p></div>
                <bo-toggle [value]="x[o.k]" [label]="o.l" [disabled]="!puede()" (changed)="guardar(o.k, $event)" /></div>
            }
          }
          <dl class="mt-4 flex flex-col gap-3 border-t border-line-subtle pt-4 text-body-s">
            <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Estado</dt><dd [class]="enLinea() ? 'text-success' : 'text-text-tertiary'">{{ estado() }}</dd></div>
            <div class="flex items-center justify-between gap-3"><dt class="text-text-tertiary">URL</dt>
              <dd class="flex min-w-0 items-center gap-1"><span class="truncate font-mono text-mono-xs">{{ corta() }}</span>
                <button type="button" class="flex size-9 shrink-0 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="copiar()" aria-label="Copiar el enlace"><gr-icon name="copy" [size]="16" /></button></dd></div>
          </dl>
          @if (puede()) { <button grButton size="s" variant="ghost" icon="refresh" class="mt-2 self-start" (click)="rotar()">Nuevo enlace</button> }
          <p class="mt-2 text-body-xs text-text-tertiary">Abre el enlace en el ordenador de la pantalla a pantalla completa (F11). Si se filtra, genera uno nuevo: el anterior deja de funcionar.</p>
        </aside>
      </div>
    </div>
  `,
})
export class PantallaPage {
  private readonly api = inject(DirectoApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly san = inject(DomSanitizer);
  private readonly marco = viewChild<ElementRef<HTMLElement>>('marco');
  protected readonly url = signal('');
  private readonly ping = signal<string | undefined>(undefined);
  private readonly mesa = signal<Mesa | null>(null);
  protected readonly escala = signal(0.4);
  private readonly ahora = signal(Date.now());
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly p = computed(() => this.mesa()?.estado.pantalla);
  protected readonly src = computed<SafeResourceUrl | null>(() => (this.url() ? this.san.bypassSecurityTrustResourceUrl(this.url() + '&previa=1') : null));
  protected readonly enLinea = computed(() => !!this.ping() && this.ahora() - new Date(this.ping()!).getTime() < 60_000);
  protected readonly estado = computed(() => {
    const p = this.ping();
    if (!p) return 'Sin conectar';
    const s = Math.max(0, Math.floor((this.ahora() - new Date(p).getTime()) / 1000));
    return this.enLinea() ? `En línea · último ping ${s} s` : `Desconectada · último ping hace ${Math.floor(s / 60)} min`;
  });
  protected readonly corta = computed(() => this.url().replace(/^https?:\/\/[^/]+/, '').replace(/token=(.{6}).*/, 'token=$1…'));

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
    const t = setInterval(async () => {
      this.ahora.set(Date.now());
      if (Date.now() % 10_000 < 1000) {
        try {
          this.ping.set((await this.api.pantalla(this.cid())).ping);
        } catch { /* keep the last state */ }
      }
    }, 1000);
    const ro = new ResizeObserver(() => {
      const w = this.marco()?.nativeElement.clientWidth;
      if (w) this.escala.set(w / 1920);
    });
    effect(() => {
      const el = this.marco()?.nativeElement;
      if (el) ro.observe(el);
    });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(t);
      ro.disconnect();
    });
  }

  private async cargar(): Promise<void> {
    try {
      const [pan, m] = await Promise.all([this.api.pantalla(this.cid()), this.api.mesa(this.cid())]);
      this.url.set(pan.url);
      this.ping.set(pan.ping);
      this.mesa.set(m);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cargar la pantalla.'));
    }
  }

  protected readonly opciones: { k: 'siguientes' | 'carrusel' | 'qr'; l: string; h: string }[] = [
    { k: 'siguientes', l: 'Mostrar siguientes 3', h: 'Debajo del atleta actual' },
    { k: 'carrusel', l: 'Carrusel de patrocinadores', h: 'Entre intentos, 8 s por logo' },
    { k: 'qr', l: 'Mostrar QR de /en-directo', h: 'Esquina inferior' },
  ];

  protected async guardar(k: 'siguientes' | 'carrusel' | 'qr', v: boolean): Promise<void> {
    const over: Partial<Pantalla> = { [k]: v };
    const m = this.mesa();
    if (!m) return;
    const e = m.estado;
    try {
      this.mesa.set(await this.api.estado(this.cid(), e.version, { fase: e.fase, flightId: e.flightId, movimiento: e.movimiento, pausa: e.pausa, retrasoMin: e.retrasoMin,
        streamUrl: e.streamUrl, replayUrl: e.replayUrl, pantalla: { ...e.pantalla, ...over }, publicarAuto: e.publicarAuto }));
    } catch (err) {
      this.toasts.error(errText(err, 'No se pudo guardar.'));
      void this.cargar();
    }
  }

  protected async copiar(): Promise<void> {
    await navigator.clipboard.writeText(this.url());
    this.toasts.success('Enlace copiado');
  }

  protected async rotar(): Promise<void> {
    const ok = await this.confirm.ask({ title: '¿Generar un enlace nuevo?', text: 'La pantalla que use el enlace actual dejará de funcionar hasta que abras el nuevo.', confirm: 'Generar enlace' });
    if (!ok) return;
    try {
      const r = await this.api.rotar(this.cid());
      this.url.set(r.url);
      this.ping.set(undefined);
      this.toasts.success('Nuevo enlace listo: ábrelo en la pantalla');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo generar.'));
    }
  }
}
