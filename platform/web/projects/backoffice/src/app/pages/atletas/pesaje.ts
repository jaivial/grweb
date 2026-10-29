import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrAvatar, GrButton, GrIcon, GrSkeleton, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { errText } from '../../shared/ui';
import { AtletasApi, cat, categoriaPorPeso, kg, type Atleta, type ItemLista } from './api';

/** Weigh-in desk (Figma page 55 · «Móvil · pesaje»): search, body weight with a live class check, rack heights. */
@Component({
  selector: 'bo-pesaje',
  imports: [FormsModule, RouterLink, UpperCasePipe, GrAlert, GrAvatar, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = atleta();
    <div class="mx-auto flex max-w-xl flex-col gap-5">
      <header class="flex items-center justify-between gap-3">
        <h1 class="text-ui-h3">Pesaje{{ a?.flight ? ' · Flight ' + a?.flight : '' }}</h1>
        <a routerLink=".." class="text-label-s text-text-tertiary hover:text-text-primary">Atletas</a>
      </header>

      <label class="relative block">
        <span class="sr-only">Buscar atleta</span>
        <gr-icon name="search" [size]="22" class="absolute top-1/2 left-4 -translate-y-1/2 text-text-tertiary" />
        <input type="search" placeholder="Nombre o licencia" autocomplete="off" [ngModel]="q()" (ngModelChange)="buscar($event)"
          class="h-16 w-full rounded-lg border border-line-strong bg-bg-field pr-12 pl-12 text-[22px] placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
        @if (q()) { <button type="button" class="absolute top-1/2 right-2 flex size-12 -translate-y-1/2 items-center justify-center text-text-tertiary" aria-label="Borrar búsqueda" (click)="buscar('')"><gr-icon name="x" [size]="22" /></button> }
      </label>

      @if (!a) {
        <ul class="flex flex-col gap-2">
          @for (r of resultados(); track r.id) {
            <li><button type="button" class="flex min-h-16 w-full items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-4 text-left" (click)="elegir(r.id)">
              <gr-avatar [name]="r.nombreCompleto" />
              <span class="min-w-0 flex-1"><span class="block truncate text-label-l">{{ r.nombreCompleto }}</span><span class="block text-body-s text-text-tertiary">{{ r.sexo }} {{ cat(r.categoria) }}{{ r.flight ? ' · Flight ' + r.flight : '' }}</span></span>
              <span class="text-mono-xs" [class]="r.pesaje === 'ok' ? 'text-success' : r.pesaje === 'fuera' ? 'text-warning' : 'text-text-tertiary'">{{ estadoTxt[r.pesaje] }}</span>
            </button></li>
          } @empty {
            @if (buscando()) { <gr-skeleton class="h-16 rounded-lg" /> }
            @else if (q().length >= 2) { <li class="p-6 text-center text-body-m text-text-tertiary">Nadie coincide con «{{ q() }}».</li> }
            @else { <li class="p-6 text-center text-body-m text-text-tertiary">Busca al atleta por su nombre o su licencia.</li> }
          }
        </ul>
      } @else {
        <section class="rounded-xl border border-line-subtle bg-bg-card p-5">
          <div class="flex items-center gap-4">
            <gr-avatar [name]="a.nombreCompleto" class="size-16 text-[22px]" />
            <div class="min-w-0 flex-1">
              <p class="line-clamp-2 text-ui-h4 break-words">{{ a.nombreCompleto }}</p>
              <p class="text-body-m text-text-tertiary">{{ a.sexo }} {{ cat(a.categoria) }}{{ a.flight ? ' · Flight ' + a.flight : '' }}</p>
            </div>
            <span class="rounded-sm px-2.5 py-1 text-label-s" [class]="a.pesaje.estado === 'ok' ? 'bg-success/15 text-success' : a.pesaje.estado === 'fuera' ? 'bg-warning/15 text-warning' : 'bg-warning/10 text-warning'">{{ estadoTxt[a.pesaje.estado] | uppercase }}</span>
          </div>
          <label class="mt-6 block text-label-l" for="p-peso">Peso corporal (kg)</label>
          <input id="p-peso" type="text" inputmode="decimal" autocomplete="off" [ngModel]="peso()" (ngModelChange)="peso.set($event)"
            class="mt-2 h-16 w-full rounded-lg border border-line-strong bg-bg-field px-4 text-[26px] focus:border-accent-text focus:outline-none" />
          <p class="mt-2 flex items-center gap-1.5 text-body-l" [class]="check().cls" aria-live="polite">{{ check().texto }} @if (check().ok) { <gr-icon name="check" [size]="18" /> }</p>
          <div class="mt-5 grid grid-cols-2 gap-4">
            <div><label class="block text-label-l" for="p-rsq">Rack SQ</label><input id="p-rsq" type="text" inputmode="numeric" [(ngModel)]="rackSq" class="mt-2 h-16 w-full rounded-lg border border-line-strong bg-bg-field px-4 text-[22px] focus:border-accent-text focus:outline-none" /></div>
            <div><label class="block text-label-l" for="p-rbp">Rack BP</label><input id="p-rbp" type="text" placeholder="6 / 3" [(ngModel)]="rackBp" class="mt-2 h-16 w-full rounded-lg border border-line-strong bg-bg-field px-4 text-[22px] focus:border-accent-text focus:outline-none" /></div>
          </div>
          @if (a.pesaje.intentos.sq || a.pesaje.intentos.bp || a.pesaje.intentos.dl) {
            <p class="mt-4 text-body-s text-text-tertiary">Primeros intentos declarados: {{ kg(a.pesaje.intentos.sq) }} / {{ kg(a.pesaje.intentos.bp) }} / {{ kg(a.pesaje.intentos.dl) }} kg</p>
          }
        </section>
        @if (error()) { <gr-alert tone="danger" title="No se pudo registrar">{{ error() }}</gr-alert> }
        <button grButton variant="primary" size="l" [block]="true" class="h-16 text-[20px]" [loading]="guardando()" [disabled]="!pesoValido()" (click)="registrar()">Registrar pesaje</button>
        <button grButton variant="ghost" [block]="true" (click)="atleta.set(null)">Pesar a otro atleta</button>
      }
    </div>
  `,
})
export class PesajePage {
  /** Optional ?atleta=<id> (from the record). */
  readonly atletaId = input<string | undefined>(undefined, { alias: 'atleta' });
  protected readonly comps = inject(Competitions);
  private readonly api = inject(AtletasApi);
  private readonly toasts = inject(GrToasts);
  protected readonly cat = cat;
  protected readonly kg = kg;
  protected readonly estadoTxt: Record<string, string> = { pendiente: 'Sin pesar', ok: 'Pesado', fuera: 'Fuera', no_compite: 'No compite' };
  protected readonly q = signal('');
  protected readonly resultados = signal<ItemLista[]>([]);
  protected readonly buscando = signal(false);
  protected readonly atleta = signal<Atleta | null>(null);
  protected readonly peso = signal('');
  protected rackSq = '';
  protected rackBp = '';
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  private timer?: ReturnType<typeof setTimeout>;

  private readonly pesoNum = computed(() => Number(this.peso().replace(',', '.')));
  protected readonly pesoValido = computed(() => this.pesoNum() >= 20 && this.pesoNum() <= 300);
  protected readonly check = computed(() => {
    const a = this.atleta();
    if (!a || !this.pesoValido()) return { texto: a ? `Inscrito en ${cat(a.categoria)} kg` : '', ok: false, cls: 'text-text-tertiary' };
    const got = categoriaPorPeso(a.sexo, this.pesoNum(), a.division === 'subjunior' || a.division === 'junior');
    return got === a.categoria
      ? { texto: `Dentro de ${cat(a.categoria)}`, ok: true, cls: 'text-text-secondary' }
      : { texto: `Fuera de ${cat(a.categoria)}: le corresponde ${cat(got)}`, ok: false, cls: 'text-warning' };
  });

  constructor() {
    effect(() => {
      const id = this.atletaId();
      if (id && this.comps.current()?.id) untracked(() => void this.elegir(id));
    });
  }

  protected buscar(v: string): void {
    this.q.set(v);
    clearTimeout(this.timer);
    if (v.trim().length < 2) {
      this.resultados.set([]);
      return;
    }
    this.timer = setTimeout(async () => {
      const cid = this.comps.current()?.id;
      if (!cid) return;
      this.buscando.set(true);
      try {
        this.resultados.set((await this.api.lista(cid, { pestana: 'confirmados', q: v, por: 12 })).items);
      } finally {
        this.buscando.set(false);
      }
    }, 200);
  }

  protected async elegir(id: string): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.error.set('');
    const a = await this.api.ficha(cid, id);
    this.atleta.set(a);
    this.peso.set(a.pesaje.peso ? String(a.pesaje.peso).replace('.', ',') : '');
    this.rackSq = a.pesaje.rackSq ? String(a.pesaje.rackSq) : '';
    this.rackBp = a.pesaje.rackBp;
  }

  protected async registrar(): Promise<void> {
    const cid = this.comps.current()?.id;
    const a = this.atleta();
    if (!cid || !a) return;
    this.guardando.set(true);
    this.error.set('');
    try {
      const r = await this.api.pesaje(cid, a.id, { peso: this.pesoNum(), rackSq: this.rackSq ? Number(this.rackSq) : undefined, rackBp: this.rackBp.replace(/\s/g, ''), intentos: {} });
      this.atleta.set(r.atleta);
      if (r.categoriaOk) this.toasts.success(`${a.nombre} pesado`, `${kg(this.pesoNum())} kg · dentro de ${cat(a.categoria)}`);
      else this.toasts.error(`${a.nombre}: fuera de categoría`, `Le corresponde ${cat(r.sugerencia)}. La organización decidirá en su ficha.`);
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
