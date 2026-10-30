import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrAvatar, GrBadge, GrButton, GrEmpty, GrIcon, GrKpi, GrSkeleton, GrToasts, fmtNumber, fmtShortDate, type GrTone } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, BoToggle, errText } from '../../shared/ui';
import { AtletasApi, cat, type ItemLista, type Lista } from './api';

type Pestana = 'todos' | 'confirmados' | 'reserva' | 'bajas' | 'incidencias';

export const ESTADO: Record<ItemLista['estado'], { label: string; tone: GrTone }> = {
  confirmado: { label: 'Confirmado', tone: 'success' },
  reserva: { label: 'Reserva', tone: 'info' },
  baja: { label: 'Baja', tone: 'neutral' },
};
const IMAGEN: Record<ItemLista['imagen'], { label: string; cls: string }> = {
  si: { label: 'Sí', cls: 'text-text-secondary' },
  pendiente: { label: 'Pendiente', cls: 'text-warning' },
  menor: { label: 'Menor', cls: 'text-info' },
  no: { label: 'No', cls: 'text-text-muted' },
};

/** «Atletas» (Figma page 55 · «Atletas · lista», «casos límite», «vacío y carga»). */
@Component({
  selector: 'bo-atletas',
  imports: [FormsModule, RouterLink, A11yModule, BoPageHeader, BoToggle, GrAlert, GrAvatar, GrBadge, GrButton, GrEmpty, GrIcon, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <div class="mx-auto flex max-w-[1180px] flex-col gap-6">
      <bo-page-header title="Atletas" [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Atletas']">
        @if (canEdit()) { <a actions grButton icon="ticket" routerLink="inscripcion">Inscripción</a> }
        @if (canWeigh()) { <a actions grButton icon="scale" routerLink="pesaje">Pesaje</a> }
        @if (canEdit() && l?.pestanas?.todos) { <button actions grButton icon="download" [loading]="exporting()" (click)="exportar()">Exportar</button> }
        @if (canEdit()) { <a actions grButton variant="primary" routerLink="importar">Importar acta AEP</a> }
      </bo-page-header>

      @if (l && l.pestanas.todos === 0 && !cargando()) {
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="flex flex-col items-center justify-center rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
            <span class="flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="sparkles" [size]="22" /></span>
            <h2 class="mt-4 text-ui-h4">Aún no hay atletas</h2>
            <p class="mt-2 max-w-sm text-body-s text-text-tertiary">La AEP envía el acta en .xlsx cuando cierra la inscripción. Impórtala y revisa los cambios antes de confirmar.</p>
            @if (canEdit()) {
              <div class="mt-5 flex flex-wrap justify-center gap-2">
                <a grButton variant="primary" routerLink="importar">Importar acta AEP</a>
                <button grButton variant="ghost" (click)="plantilla()">Formato del acta</button>
              </div>
            }
          </div>
          <div class="hidden flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5 lg:flex" aria-hidden="true">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) { <gr-skeleton class="h-8 opacity-40" /> }
          </div>
        </div>
      } @else {
        <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Estado">
          @for (t of tabs; track t.key) {
            <button type="button" (click)="cambiarPestana(t.key)" [attr.aria-current]="pestana() === t.key ? 'page' : null"
              class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s whitespace-nowrap" [class]="pestana() === t.key ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
              {{ t.label }}
              <span class="rounded-2xs px-1.5 text-mono-xs" [class]="t.key === 'incidencias' && (l?.pestanas?.incidencias ?? 0) > 0 ? 'bg-accent-deep/50 text-accent-text' : 'bg-bg-raised text-text-secondary'">{{ l?.pestanas?.[t.key] ?? '·' }}</span>
              @if (pestana() === t.key) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
        </nav>

        @if (pestana() === 'incidencias') {
          <div class="flex flex-col gap-3">
            @for (a of incidencias(); track a.id) {
              <gr-alert [tone]="a.tono" [title]="a.titulo">
                {{ a.texto }}
                <a alertAction [routerLink]="a.id" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text">{{ a.accion }} <gr-icon name="arrow-right" [size]="14" /></a>
              </gr-alert>
            } @empty {
              @if (!cargando()) { <gr-empty icon="circle-check" title="Sin incidencias" text="Menores, categorías y pesajes están en orden." /> }
            }
          </div>
        }

        @if (pestana() !== 'incidencias' || reservas().length) {
          @if (pestana() !== 'incidencias') {
            <div class="flex flex-wrap items-center gap-2">
              <label class="relative min-w-0 flex-1 basis-60">
                <span class="sr-only">Buscar atleta</span>
                <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
                <input type="search" placeholder="Buscar atleta, club o licencia…" [ngModel]="q()" (ngModelChange)="buscar($event)"
                  class="h-11 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-9 text-body-s placeholder:text-text-muted focus:border-accent-text focus:outline-none md:h-10" />
              </label>
              <select [ngModel]="sexo()" (ngModelChange)="sexo.set($event); recargar(1)" aria-label="Sexo" class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-label-s md:h-10">
                <option value="">Sexo</option><option value="F">Femenino</option><option value="M">Masculino</option>
              </select>
              <select [ngModel]="categoria()" (ngModelChange)="categoria.set($event); recargar(1)" aria-label="Categoría" class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-label-s md:h-10">
                <option value="">Categoría</option>
                @for (c of l?.categorias ?? []; track c) { <option [value]="c">{{ cat(c) }}</option> }
              </select>
              @if (l?.flights?.length) {
                <select [ngModel]="flight()" (ngModelChange)="flight.set($event); recargar(1)" aria-label="Flight" class="h-11 rounded-md border border-line-strong bg-bg-field px-3 text-label-s md:h-10">
                  <option value="">Flight</option>
                  @for (f of l!.flights; track f) { <option [value]="f">{{ f }}</option> }
                </select>
              }
              <span class="ml-auto hidden text-body-xs text-text-tertiary md:inline">{{ fmtNumber(l?.total) }} atletas</span>
              <button type="button" (click)="incompletos.set(!incompletos()); recargar(1)" [attr.aria-pressed]="incompletos()"
                class="inline-flex h-11 items-center gap-1.5 rounded-md border px-3 text-label-s md:h-10" [class]="incompletos() ? 'border-accent-text bg-accent-deep/30' : 'border-line-strong'">
                <gr-icon name="user" [size]="14" />Perfil incompleto
              </button>
            </div>
          } @else {
            <h2 class="mt-2 text-ui-h5">Reserva AEP <span class="text-body-xs text-text-tertiary">· al dar de baja a un confirmado, promociona al primero</span></h2>
          }

          <section class="rounded-lg border border-line-subtle bg-bg-card" [attr.aria-busy]="cargando()">
            <div class="hidden md:block">
              <table class="w-full table-fixed text-left">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                  <tr>
                    @if (pestana() === 'incidencias') { <th class="w-16 px-4 py-3 font-normal">Orden</th> }
                    <th class="px-4 py-3 font-normal">Atleta</th>
                    <th class="w-24 px-3 py-3 font-normal">Categoría</th>
                    <th class="w-16 px-3 py-3 font-normal">Flight</th>
                    <th class="w-32 px-3 py-3 font-normal">Estado AEP</th>
                    <th class="w-40 px-3 py-3 font-normal">Perfil público</th>
                    <th class="w-24 px-3 py-3 font-normal">Imagen</th>
                    <th class="w-24 px-3 py-3 text-right font-normal">Seguidores</th>
                    <th [class]="pestana() === 'incidencias' ? 'w-36' : 'w-12'"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of filas(); track a.id) {
                    <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" [class.opacity-55]="a.estado === 'baja'" (click)="abrir(a.id)">
                      @if (pestana() === 'incidencias') { <td class="px-4 py-3 text-mono-s">{{ a.ordenReserva }}</td> }
                      <td class="px-4 py-3">
                        <a [routerLink]="a.id" class="flex min-w-0 items-center gap-3" (click)="$event.stopPropagation()">
                          @if (a.fotoUrl) { <img [src]="a.fotoUrl" alt="" class="size-9 shrink-0 rounded-full object-cover" loading="lazy" /> } @else { <gr-avatar [name]="a.nombreCompleto" /> }
                          <span class="min-w-0"><span class="block truncate text-label-s">{{ a.nombreCompleto }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }} · {{ a.divisionNombre }}</span></span>
                        </a>
                      </td>
                      <td class="px-3 py-3 text-mono-s">{{ a.sexo }} {{ cat(a.categoria) }}</td>
                      <td class="px-3 py-3 text-mono-s">{{ a.flight || '–' }}</td>
                      <td class="px-3 py-3">
                        @if (a.incidencias && a.estado !== 'baja') { <gr-badge tone="warning">{{ a.estado === 'reserva' ? 'Reserva' : 'Revisar' }}</gr-badge> }
                        @else { <gr-badge [tone]="estado[a.estado].tone">{{ estado[a.estado].label }}</gr-badge> }
                      </td>
                      <td class="px-3 py-3"><span class="flex items-center gap-2"><span class="h-1.5 flex-1 rounded-pill bg-bg-raised"><span class="block h-full rounded-pill" [class]="a.completo >= 70 ? 'bg-success' : 'bg-warning'" [style.width.%]="a.completo"></span></span><span class="w-10 text-right text-mono-xs text-text-secondary">{{ a.completo }} %</span></span></td>
                      <td class="px-3 py-3 text-body-s" [class]="imagen[a.imagen].cls">{{ imagen[a.imagen].label }}</td>
                      <td class="px-3 py-3 text-right text-mono-s">{{ a.seguidores || '–' }}</td>
                      <td class="px-2 py-3">
                        @if (pestana() === 'incidencias' && a.estado === 'reserva' && canEdit()) {
                          <button grButton size="s" (click)="$event.stopPropagation(); promocionar(a)">Promocionar</button>
                        } @else { <gr-icon name="chevron-right" [size]="16" class="text-text-tertiary" /> }
                      </td>
                    </tr>
                  } @empty {
                    @if (cargando()) { @for (i of [1, 2, 3, 4, 5]; track i) { <tr><td colspan="9" class="px-4 py-2"><gr-skeleton class="h-10" /></td></tr> } }
                    @else { <tr><td colspan="9" class="px-4 py-10 text-center text-body-s text-text-tertiary">No hay atletas con estos filtros.</td></tr> }
                  }
                </tbody>
              </table>
            </div>
            <ul class="flex flex-col md:hidden">
              @for (a of filas(); track a.id) {
                <li class="border-b border-line-subtle last:border-0" [class.opacity-55]="a.estado === 'baja'">
                  <a [routerLink]="a.id" class="flex min-h-16 items-center gap-3 px-4 py-3">
                    @if (a.fotoUrl) { <img [src]="a.fotoUrl" alt="" class="size-10 shrink-0 rounded-full object-cover" loading="lazy" /> } @else { <gr-avatar [name]="a.nombreCompleto" /> }
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-label-s">{{ a.nombreCompleto }}</span>
                      <span class="block truncate text-body-xs text-text-tertiary">{{ a.sexo }} {{ cat(a.categoria) }} · {{ a.club || 'Independiente' }}{{ a.flight ? ' · Flight ' + a.flight : '' }}</span>
                    </span>
                    @if (a.incidencias && a.estado !== 'baja') { <gr-badge tone="warning">Revisar</gr-badge> } @else { <gr-badge [tone]="estado[a.estado].tone">{{ estado[a.estado].label }}</gr-badge> }
                  </a>
                  @if (pestana() === 'incidencias' && a.estado === 'reserva' && canEdit()) {
                    <div class="px-4 pb-3"><button grButton size="s" [block]="true" (click)="promocionar(a)">Promocionar (reserva {{ a.ordenReserva }})</button></div>
                  }
                </li>
              } @empty {
                @if (cargando()) { @for (i of [1, 2, 3]; track i) { <li class="p-4"><gr-skeleton class="h-10" /></li> } }
                @else { <li class="p-8 text-center text-body-s text-text-tertiary">No hay atletas con estos filtros.</li> }
              }
            </ul>
            @if (paginas() > 1 && pestana() !== 'incidencias') {
              <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-body-xs text-text-tertiary">
                <span>Mostrando {{ desde() }}–{{ hasta() }} de {{ l?.total }}</span>
                <nav class="flex items-center gap-1" aria-label="Páginas">
                  <button type="button" class="flex size-9 items-center justify-center rounded-sm border border-line-strong disabled:opacity-40" [disabled]="pagina() === 1" (click)="recargar(pagina() - 1)" aria-label="Anterior"><gr-icon name="chevron-left" [size]="14" /></button>
                  @for (p of paginasVisibles(); track $index) {
                    @if (p === 0) { <span class="px-1">…</span> }
                    @else { <button type="button" class="flex size-9 items-center justify-center rounded-sm text-mono-s" [class]="p === pagina() ? 'bg-accent text-white' : 'border border-line-strong'" (click)="recargar(p)" [attr.aria-current]="p === pagina() ? 'page' : null">{{ p }}</button> }
                  }
                  <button type="button" class="flex size-9 items-center justify-center rounded-sm border border-line-strong disabled:opacity-40" [disabled]="pagina() === paginas()" (click)="recargar(pagina() + 1)" aria-label="Siguiente"><gr-icon name="chevron-right" [size]="14" /></button>
                </nav>
              </footer>
            }
          </section>
        }

        @if (l && pestana() !== 'incidencias') {
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <gr-kpi label="Perfiles completos" [value]="fmtNumber(l.kpis.perfilesCompletos)" [caption]="l.kpis.pctCompletos + ' % del total'" />
            <gr-kpi label="Sin foto" [value]="fmtNumber(l.kpis.sinFoto)" caption="bloquean la ficha pública" />
            <gr-kpi label="Consentimiento imagen" [value]="fmtNumber(l.kpis.conImagen)" [caption]="l.kpis.imagenPendiente + ' pendientes · ' + l.kpis.menoresPendientes + ' menores'" />
            <gr-kpi label="Seguimientos" [value]="fmtNumber(l.kpis.seguimientos)" [caption]="'+' + l.kpis.seguimientosSemana + ' esta semana'" />
          </div>
        }
      }
    </div>

    @if (promo(); as p) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="promo.set(null)" (keydown.escape)="promo.set(null)">
        <div class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" [attr.aria-label]="'Promocionar a ' + p.nombreCompleto"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">Promocionar a {{ p.nombreCompleto }}</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="promo.set(null)"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">Pasará de Reserva a Confirmado y, si lo eliges, recibirá un email «Tienes plaza» con el enlace a su área. La AEP debe confirmarlo en su acta.</p>
          <div class="mt-4 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-2">
            <span><span class="block text-label-s">Avisar al atleta</span><span class="block text-body-xs text-text-tertiary">Email «Tienes plaza» + enlace a su área</span></span>
            <bo-toggle [(value)]="avisar" label="Avisar al atleta" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="promo.set(null)">Cancelar</button>
            <button grButton variant="primary" [loading]="promoBusy()" (click)="confirmarPromo(p)">{{ avisar() ? 'Promocionar y avisar' : 'Promocionar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AtletasPage {
  protected readonly comps = inject(Competitions);
  private readonly api = inject(AtletasApi);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly toasts = inject(GrToasts);
  protected readonly estado = ESTADO;
  protected readonly imagen = IMAGEN;
  protected readonly cat = cat;
  protected readonly fmtNumber = fmtNumber;
  protected readonly tabs: { key: Pestana; label: string }[] = [
    { key: 'todos', label: 'Todos' }, { key: 'confirmados', label: 'Confirmados' }, { key: 'reserva', label: 'Reserva' }, { key: 'bajas', label: 'Bajas' }, { key: 'incidencias', label: 'Con incidencias' },
  ];
  protected readonly lista = signal<Lista | null>(null);
  protected readonly reservas = signal<ItemLista[]>([]);
  protected readonly incidenciasDe = signal<{ id: string; tono: GrTone; titulo: string; texto: string; accion: string }[]>([]);
  protected readonly cargando = signal(true);
  protected readonly exporting = signal(false);
  protected readonly pestana = signal<Pestana>('todos');
  protected readonly q = signal('');
  protected readonly sexo = signal('');
  protected readonly categoria = signal('');
  protected readonly flight = signal('');
  protected readonly incompletos = signal(false);
  protected readonly pagina = signal(1);
  protected readonly promo = signal<ItemLista | null>(null);
  protected readonly avisar = signal(true);
  protected readonly promoBusy = signal(false);
  private timer?: ReturnType<typeof setTimeout>;
  private readonly por = 25;

  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'atletas.editar'));
  protected readonly canWeigh = computed(() => this.auth.can(this.comps.current()?.id, 'checkin.escanear') || this.canEdit());
  protected readonly filas = computed(() => (this.pestana() === 'incidencias' ? this.reservas() : (this.lista()?.items ?? [])));
  protected readonly incidencias = computed(() => this.incidenciasDe());
  protected readonly paginas = computed(() => Math.max(1, Math.ceil((this.lista()?.total ?? 0) / this.por)));
  protected readonly desde = computed(() => ((this.lista()?.total ?? 0) === 0 ? 0 : (this.pagina() - 1) * this.por + 1));
  protected readonly hasta = computed(() => Math.min(this.pagina() * this.por, this.lista()?.total ?? 0));
  protected readonly paginasVisibles = computed(() => {
    const n = this.paginas();
    const p = this.pagina();
    const set = new Set([1, 2, p - 1, p, p + 1, n].filter((x) => x >= 1 && x <= n));
    const out: number[] = [];
    let prev = 0;
    for (const x of [...set].sort((a, b) => a - b)) {
      if (x - prev > 1) out.push(0);
      out.push(x);
      prev = x;
    }
    return out;
  });
  protected readonly subtitulo = computed(() => {
    const l = this.lista();
    const c = this.comps.current();
    if (!l) return '';
    const plazas = (c as { inscripcion?: { plazas?: number } } | null)?.inscripcion?.plazas;
    const parts = [plazas ? `${plazas} plazas (cupo AEP)` : '', `${fmtNumber(l.pestanas.confirmados)} confirmados`];
    if (l.importado) parts.push(`actualizado desde el acta del ${fmtShortDate(l.importado)}`);
    return parts.filter(Boolean).join(' · ');
  });

  constructor() {
    effect(() => {
      const cid = this.comps.current()?.id;
      if (cid) untracked(() => void this.recargar(1));
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('athletes.') || (e.tipo === 'import.progreso' && e.datos?.['estado'] === 'confirmada')) void this.recargar(this.pagina(), true);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  protected buscar(v: string): void {
    this.q.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.recargar(1), 250);
  }

  protected cambiarPestana(p: Pestana): void {
    this.pestana.set(p);
    void this.recargar(1);
  }

  async recargar(pagina: number, silencioso = false): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.pagina.set(pagina);
    if (!silencioso) this.cargando.set(true);
    try {
      if (this.pestana() === 'incidencias') {
        const [inc, res] = await Promise.all([
          this.api.lista(cid, { pestana: 'incidencias', por: 200 }),
          this.api.lista(cid, { pestana: 'reserva', orden: 'reserva', por: 200 }),
        ]);
        this.lista.set(inc);
        this.reservas.set(res.items);
        this.incidenciasDe.set(inc.items.flatMap((f) => f.avisos.map((i) => ({
          id: f.id,
          tono: (i.tipo === 'menor_sin_autorizacion' ? 'info' : 'warning') as GrTone,
          titulo: { menor_sin_autorizacion: `${f.nombreCompleto} es menor de edad (${f.edad} años)`, categoria_invalida: `${f.nombreCompleto}: categoría no válida`, pesaje_fuera: `Pesaje fuera de categoría · ${f.nombreCompleto}`, foto_sin_consentimiento: `${f.nombreCompleto}: foto sin consentimiento` }[i.tipo],
          texto: i.texto,
          accion: { menor_sin_autorizacion: 'Subir autorización', categoria_invalida: 'Corregir categoría', pesaje_fuera: 'Decidir', foto_sin_consentimiento: 'Revisar perfil' }[i.tipo],
        }))));
      } else {
        this.lista.set(await this.api.lista(cid, {
          pestana: this.pestana(), q: this.q(), sexo: this.sexo(), categoria: this.categoria(), flight: this.flight(), perfil: this.incompletos() ? 'incompleto' : '', pagina, por: this.por,
        }));
      }
    } catch (e) {
      this.toasts.error('No se pudieron cargar los atletas', errText(e, 'Inténtalo de nuevo.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected abrir(id: string): void {
    void this.router.navigate(['/', this.comps.current()?.slug, 'atletas', id]);
  }

  protected promocionar(a: ItemLista): void {
    this.avisar.set(true);
    this.promo.set(a);
  }

  protected async confirmarPromo(a: ItemLista): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.promoBusy.set(true);
    try {
      await this.api.promocionar(cid, a.id, this.avisar());
      this.toasts.success(`${a.nombreCompleto} ya está confirmado`, this.avisar() ? 'Le hemos enviado el email «Tienes plaza».' : 'Sin aviso por email.');
      this.promo.set(null);
      await this.recargar(1, true);
    } catch (e) {
      this.toasts.error('No se pudo promocionar', errText(e));
    } finally {
      this.promoBusy.set(false);
    }
  }

  protected async exportar(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.exporting.set(true);
    try {
      await this.api.exportar(cid);
    } catch (e) {
      this.toasts.error('No se pudo exportar', errText(e));
    } finally {
      this.exporting.set(false);
    }
  }

  protected async plantilla(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (cid) await this.api.plantilla(cid).catch((e) => this.toasts.error('No se pudo descargar', errText(e)));
  }
}
