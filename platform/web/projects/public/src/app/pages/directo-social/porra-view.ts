import { Router, RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession } from '../../core/fan';
import { Juegos, monedas, type Apuesta, type Cartera, type Mercado, type Sexo } from '../../core/juegos';
import { RankingPorra, misPorras, rankingAtletas } from '../porra/ranking';
import { GrCoin } from './ui';

/**
 * Pestaña «Porra» del panel del directo (Figma 171:70257): acceso para jugar (o mi saldo), una vista previa de la
 * porra (buscador y top 3 en vivo, refrescado cada 20 s) y las llamadas a /porra y /fantasy.
 */
@Component({
  selector: 'gr-porra-view',
  imports: [RouterLink, GrIcon, GrButton, GrSkeleton, GrCoin, RankingPorra],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]">
      <!-- saldo -->
      @if (!fan.conSesion()) {
        <div class="flex shrink-0 flex-col gap-3">
          <p class="text-label-m text-text-primary">Entra para jugar con tus monedas</p>
          <button type="button" grButton variant="primary" [block]="true" (click)="fan.abrirAcceso('porra')">Entrar y jugar</button>
        </div>
      } @else if (cargandoCartera()) {
        <gr-skeleton class="h-28 shrink-0 rounded-md" />
      } @else if (cartera(); as c) {
        <div class="shrink-0 rounded-md border border-accent/30 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-3.5">
          <p class="flex items-center justify-between gap-2 font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
            <span class="text-accent-text">Tu saldo de la jornada</span>@if (jornada(); as j) { <span class="truncate text-text-tertiary">{{ j.nombre }}</span> }
          </p>
          <p class="mt-2.5 flex flex-wrap gap-2">
            <gr-coin>{{ monedas(c.porra) }} porra</gr-coin>
            <gr-coin tipo="fantasy">{{ monedas(c.fantasy) }} fantasy</gr-coin>
          </p>
          <p class="mt-2.5 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" class="shrink-0" />Monedas de juego: nunca se compran con dinero.</p>
        </div>
      }

      <!-- vista previa de la porra (Figma 171:70257): buscador y top 3 en vivo -->
      <div class="flex shrink-0 flex-col gap-3 pt-1">
        <p class="flex items-center justify-between gap-3">
          <span class="bg-[linear-gradient(180deg,#ff5a6e,#c8102e)] bg-clip-text pr-1 font-display text-[1.25rem] leading-none text-transparent uppercase italic">Porra</span>
          <span class="flex rounded-pill border border-line-subtle bg-bg-surface p-0.5 text-[11px]">
            <a routerLink="/porra" class="flex h-7 items-center rounded-pill px-2.5 text-text-tertiary hover:text-text-primary">Hacer porra</a>
            <a routerLink="/porra" [queryParams]="{ vista: 'en-vivo' }" class="flex h-7 items-center rounded-pill border border-line-strong bg-bg-raised px-2.5 text-text-primary">En vivo</a>
          </span>
        </p>
        <form class="relative block" role="search" (submit)="buscar($event, $any(campo).value)">
          <label class="sr-only" for="porra-busca">Busca un atleta y haz tu porra</label>
          <gr-icon name="search" [size]="18" class="pointer-events-none absolute top-3.5 left-3.5 text-text-tertiary" />
          <input #campo id="porra-busca" type="search" enterkeyhint="search" autocomplete="off" placeholder="Busca un atleta y haz tu porra"
            class="h-12 w-full rounded-md border border-line-subtle bg-bg-field pr-4 pl-11 text-body-s text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent-text" />
        </form>
        <p class="flex items-center justify-between gap-2">
          <span class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">Más apostados · en vivo</span>
          <span class="flex rounded-pill border border-line-subtle bg-bg-surface p-0.5 text-[11px]" role="group" aria-label="Sexo">
            @for (s of sexos; track s.v) {
              <button type="button" class="h-7 rounded-pill border px-2.5" [class]="sexo() === s.v ? 'border-line-strong bg-bg-raised text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-primary'"
                [attr.aria-pressed]="sexo() === s.v" (click)="sexo.set(s.v)">{{ s.l }}</button>
            }
          </span>
        </p>
        @if (cargando()) {
          <div class="flex flex-col gap-2"><gr-skeleton class="h-12 rounded-md" /><gr-skeleton class="h-12 rounded-md" /><gr-skeleton class="h-12 rounded-md" /></div>
        } @else if (error()) {
          <p class="flex items-center gap-2 rounded-md border border-line-subtle bg-bg-raised p-3 text-body-s text-text-tertiary"><gr-icon name="circle-alert" [size]="16" class="shrink-0" />{{ error() }}</p>
        } @else if (top3().length) {
          <gr-ranking-porra [filas]="top3()" />
        } @else {
          <p class="py-4 text-center text-body-xs text-text-tertiary">Todavía no hay atletas en la porra de esta jornada.</p>
        }
      </div>

      <!-- llamadas -->
      <div class="flex shrink-0 flex-col gap-2 pt-1">
        <a grButton variant="primary" size="l" [block]="true" routerLink="/porra" iconRight="arrow-right">Ir a la porra</a>
        <a class="flex min-h-14 items-center gap-3 rounded-md border border-info/40 bg-info/6 px-3 py-2.5 transition-colors hover:border-info/70" routerLink="/fantasy">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-info/14 text-info"><gr-icon name="star" [size]="18" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-label-s text-text-primary">GRS Fantasy</span>
            <span class="block text-body-xs text-text-tertiary">Ficha 5 titulares con 1.000.000 de monedas</span>
          </span>
          <span class="inline-flex shrink-0 items-center gap-1 text-label-s text-info">Abrir <gr-icon name="arrow-right" [size]="14" /></span>
        </a>
      </div>
    </div>
  `,
})
export class PorraView {
  private readonly juegos = inject(Juegos);
  private readonly router = inject(Router);
  protected readonly fan = inject(FanSession);

  /** Id of the jornada shown (the day selected in the panel). */
  readonly jornadaId = input<string>('');
  /** Name of the jornada shown. */
  readonly jornadaNombre = input<string>('');
  /** The panel has the list of jornadas (until then nothing is asked). */
  readonly cargada = input<boolean>(true);

  protected readonly sexos: { v: Sexo; l: string }[] = [
    { v: 'M', l: 'Masc.' },
    { v: 'F', l: 'Fem.' },
  ];
  protected readonly sexo = signal<Sexo>('F');
  protected readonly mercados = signal<Mercado[]>([]);
  protected readonly apuestas = signal<Apuesta[]>([]);
  protected readonly cartera = signal<Cartera | null>(null);
  protected readonly cargando = signal(true);
  protected readonly cargandoCartera = signal(false);
  protected readonly error = signal<string | null>(null);
  /** La jornada que contesta la API (la activa si no se pide ninguna). */
  protected readonly jornadaApi = signal<{ nombre: string; dia: string } | null>(null);
  protected readonly jornada = computed(() => this.jornadaApi() ?? (this.jornadaNombre() ? { nombre: this.jornadaNombre(), dia: '' } : null));
  /** Los 3 atletas más apostados del sexo elegido, con «Tu porra» si les he apostado. */
  protected readonly top3 = computed(() => rankingAtletas(this.mercados(), this.sexo(), misPorras(this.apuestas())).slice(0, 3));

  constructor() {
    effect(() => {
      const jid = this.jornadaId();
      if (!this.cargada()) return;
      if (!jid) {
        // no jornada today nor an open one: empty state, without asking the API (it answers 404)
        this.mercados.set([]);
        this.error.set(null);
        this.cargando.set(false);
        return;
      }
      this.cargando.set(true);
      void this.cargarMercados(jid).finally(() => this.cargando.set(false));
    });
    effect(() => {
      if (!this.fan.conSesion() || !this.jornadaId()) {
        this.cartera.set(null);
        this.apuestas.set([]);
        return;
      }
      const jid = this.jornadaId();
      this.cargandoCartera.set(true);
      void this.juegos
        .cartera(jid)
        .then((c) => this.cartera.set(c))
        .catch(() => this.cartera.set(null))
        .finally(() => this.cargandoCartera.set(false));
      void this.juegos
        .porraMisApuestas(jid)
        .then((r) => this.apuestas.set(r.apuestas ?? []))
        .catch(() => this.apuestas.set([]));
    });
    // top 3 en vivo: los botes cambian con cada porra, refresco ligero cada 20 s (como /porra)
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const t = setInterval(() => {
        const jid = this.jornadaId();
        if (jid && this.cargada() && !document.hidden) void this.cargarMercados(jid, true);
      }, 20000);
      inject(DestroyRef).onDestroy(() => clearInterval(t));
    }
  }

  private cargarMercados(jid: string, silencioso = false): Promise<void> {
    return this.juegos
      .porraMercados(jid)
      .then((r) => {
        this.mercados.set(r.mercados ?? []);
        this.jornadaApi.set(r.jornada ? { nombre: r.jornada.nombre, dia: r.jornada.dia } : null);
        this.error.set(null);
      })
      .catch(() => {
        if (!silencioso) this.error.set('No hemos podido cargar la porra.');
      });
  }

  /** El buscador lleva a /porra con la búsqueda hecha. */
  protected buscar(e: Event, q: string): void {
    e.preventDefault();
    void this.router.navigate(['/porra'], { queryParams: q.trim() ? { q: q.trim() } : {} });
  }

  protected readonly monedas = monedas;
}
