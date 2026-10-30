import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrSkeleton, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoPageHeader, Confirm, errText } from '../../shared/ui';
import { DirectoApi, MOV, gl, kg, type Fila, type Mov, type ResultadosAdmin } from './api';

const MEDALLA = { oro: { l: 'Oro', c: 'border-[#c9a227]/50 bg-[#c9a227]/15 text-[#e3c25a]' }, plata: { l: 'Plata', c: 'border-[#a9b0b8]/50 bg-[#a9b0b8]/15 text-[#c9d0d8]' }, bronce: { l: 'Bronce', c: 'border-[#b0703e]/50 bg-[#b0703e]/15 text-[#d79a66]' } };
const fecha = (iso: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso)).replace('.', '');

/** «Resultados · clasificación» (Figma page 57): rankings by category computed live, absolute by GL points, publication to /resultados and the CSV record. */
@Component({
  selector: 'bo-resultados',
  imports: [BoPageHeader, GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = res();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Resultados" [badge]="r?.archivo ? 'Archivo' : r?.publicarAuto ? 'Publicación automática' : ''" badgeTone="info"
        [subtitle]="r ? (r.archivo ? 'Edición celebrada · ' : r.cerrados + ' de ' + r.flights + ' flights cerrados · ') + totalAtletas() + ' atletas en ' + r.categorias.length + ' categorías' : ''"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Resultados']">
        @if (r?.categorias?.length) {
          <ng-container actions>
            <button grButton icon="download" (click)="acta()">Exportar acta</button>
            @if (puedePublicar() && sel() !== 'absoluta' && !r?.archivo) { <button grButton variant="primary" icon="send" [loading]="publicando()" (click)="publicar()">{{ actual()?.publicado ? 'Publicar cambios' : 'Publicar resultados' }}</button> }
          </ng-container>
        }
      </bo-page-header>

      @if (r === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar los resultados"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (r === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
      @else if (!r.categorias.length) { <gr-empty icon="award" title="Aún no hay clasificaciones">Aparecen cuando se publican los horarios y la mesa empieza a juzgar intentos.</gr-empty> }
      @else {
        <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Categorías">
          @for (c of r.categorias; track c.clave) {
            <button type="button" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s" [class]="sel() === c.clave ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="sel() === c.clave ? 'page' : null" (click)="elegir(c.clave)">
              {{ c.corto }}<span class="rounded-2xs px-1.5 text-mono-xs" [class]="sel() === c.clave ? 'bg-accent-deep/50 text-accent-text' : 'bg-bg-raised'">{{ c.atletas }}</span>
              @if (c.publicado) { <gr-icon [name]="c.cambios ? 'circle-alert' : 'circle-check'" [size]="14" [class]="c.cambios ? 'text-warning' : 'text-success'" [label]="c.cambios ? 'Cambios sin publicar' : 'Publicada'" /> }
              @if (sel() === c.clave) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
          <button type="button" class="relative flex h-11 shrink-0 items-center px-3 text-label-s" [class]="sel() === 'absoluta' ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="elegir('absoluta')">Absoluta
            @if (sel() === 'absoluta') { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }</button>
        </nav>

        @if (sel() === 'absoluta') {
          <div class="grid gap-5 lg:grid-cols-2">
            @for (s of sexos; track s.k) {
              <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
                <h2 class="border-b border-line-subtle px-4 py-3 text-ui-h5">{{ s.l }} · puntos GL</h2>
                <table class="w-full min-w-[420px] text-left text-body-s">
                  <thead class="text-mono-xs text-text-tertiary"><tr><th class="px-4 py-2">#</th><th class="px-2 py-2">Atleta</th><th class="px-2 py-2 text-right">Total</th><th class="px-4 py-2 text-right">GL</th></tr></thead>
                  <tbody>
                    @for (f of r.absoluta[s.k]; track f.atletaId) {
                      <tr class="border-t border-line-subtle"><td class="px-4 py-2.5 font-mono">{{ f.puesto }}</td><td class="px-2 py-2.5"><p class="text-label-s">{{ f.nombre }}</p><p class="text-body-xs text-text-tertiary">{{ f.club }}</p></td>
                        <td class="px-2 py-2.5 text-right font-mono">{{ kg(f.total) }}</td><td class="px-4 py-2.5 text-right font-mono text-accent-text">{{ gl(f.gl) }}</td></tr>
                    } @empty { <tr><td colspan="4" class="px-4 py-8 text-center text-text-tertiary">{{ r.archivo ? 'Sin peso corporal no hay puntos GL.' : 'Nadie con total todavía.' }}</td></tr> }
                  </tbody>
                </table>
              </section>
            }
          </div>
        } @else if (r.categoria; as c) {
          @if (actual(); as a) {
            @if (a.publicado) {
              <p class="flex flex-wrap items-center gap-2 text-body-s text-text-secondary">
                <gr-badge [tone]="a.cambios ? 'warning' : 'success'">{{ a.cambios ? 'Cambios sin publicar' : 'Publicada' }}</gr-badge>
                v{{ a.publicado.version }} · {{ fecha(a.publicado.at) }} · {{ a.publicado.por }}
                @if (puedePublicar() && !r.archivo) { <button type="button" class="ml-auto text-label-s text-text-tertiary hover:text-accent-text" (click)="retirar()">Retirar de /resultados</button> }
                @if (r.archivo) { <span class="ml-auto text-body-xs text-text-tertiary">Edición sin horarios en la plataforma: solo lectura</span> }
              </p>
            }
          }
          <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
            <table class="w-full min-w-[860px] text-left text-body-s">
              <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                <tr><th class="px-4 py-3">#</th><th class="px-3 py-3">Atleta</th><th class="px-3 py-3 text-right">Peso</th>@for (m of movs; track m) { <th class="px-3 py-3 text-right">{{ m.toUpperCase() }}</th> }<th class="px-3 py-3 text-right">Total</th><th class="px-3 py-3 text-right">GL</th><th class="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                @for (f of c.filas; track f.atletaId) {
                  <tr class="border-b border-line-subtle last:border-0">
                    <td class="px-4 py-2.5 font-mono">{{ f.puesto || '–' }}</td>
                    <td class="px-3 py-2.5"><div class="flex items-center gap-3"><span class="flex size-8 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-bg-raised text-mono-xs">{{ f.iniciales }}</span>
                      <div class="min-w-0"><p class="text-label-s">{{ f.nombre }}</p><p class="text-body-xs text-text-tertiary">{{ f.club || 'Independiente' }} · {{ f.division }}</p></div></div></td>
                    <td class="px-3 py-2.5 text-right font-mono text-text-secondary">{{ kg(f.pesoCorporal) }}</td>
                    @for (m of movs; track m) { <td class="px-3 py-2.5 text-right font-mono" [title]="intentos(f, m)">{{ kg(f[m]) }}</td> }
                    <td class="px-3 py-2.5 text-right font-mono text-label-s">@if (f.total) { {{ kg(f.total) }} } @else if (f.subtotal) { <span class="text-text-tertiary" title="Subtotal provisional">{{ kg(f.subtotal) }}</span> } @else { – }</td>
                    <td class="px-3 py-2.5 text-right font-mono text-text-secondary">{{ gl(f.gl) }}</td>
                    <td class="px-4 py-2.5"><div class="flex flex-wrap justify-end gap-1.5">
                      @if (f.medalla) { <span class="rounded-2xs border px-1.5 py-0.5 text-mono-xs uppercase" [class]="med[f.medalla].c">{{ med[f.medalla].l }}</span> }
                      @for (x of f.records ?? []; track x) { <gr-badge tone="info">{{ x }}</gr-badge> }
                      @if (f.sinTotal) { <gr-badge tone="danger">Sin total</gr-badge> } @else if (!f.completo) { <gr-badge>En curso</gr-badge> }
                    </div></td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
          @if (!r.archivo) {
          <gr-alert tone="info" [title]="r.publicarAuto ? 'Publicación programada al cerrar el flight' : 'Publicación manual'">
            {{ r.publicarAuto ? 'Cuando terminen todos los atletas de la categoría se publicará en /resultados y se avisará a los seguidores de cada atleta.' : 'Publica cada categoría cuando la revises; la primera vez se avisa a los atletas y a sus seguidores.' }} El acta oficial la valida la AEP.
          </gr-alert>
          }
        }
      }
    </div>
  `,
})
export class ResultadosPage {
  private readonly api = inject(DirectoApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly movs: Mov[] = ['sq', 'bp', 'dl'];
  protected readonly sexos: { k: 'F' | 'M'; l: string }[] = [{ k: 'F', l: 'Mejor levantadora' }, { k: 'M', l: 'Mejor levantador' }];
  protected readonly med = MEDALLA;
  protected readonly kg = kg;
  protected readonly gl = gl;
  protected readonly fecha = fecha;
  protected readonly res = signal<ResultadosAdmin | null | undefined>(undefined);
  protected readonly sel = signal(this.route.snapshot.queryParamMap.get('categoria') ?? '');
  protected readonly publicando = signal(false);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puedePublicar = computed(() => this.auth.can(this.cid(), 'resultados.publicar'));
  protected readonly actual = computed(() => this.res()?.categorias.find((c) => c.clave === this.res()?.categoria?.clave));
  protected readonly totalAtletas = computed(() => (this.res()?.categorias ?? []).reduce((n, c) => n + c.atletas, 0));
  private t: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('directo.') || e.tipo.startsWith('resultados.')) {
        clearTimeout(this.t);
        this.t = setTimeout(() => void this.cargar(), 800);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.t);
      sub.unsubscribe();
    });
  }

  async cargar(): Promise<void> {
    try {
      const s = this.sel();
      const r = await this.api.resultados(this.cid(), s && s !== 'absoluta' ? s : undefined);
      this.res.set(r);
      if (!s && r.categoria) this.sel.set(r.categoria.clave);
    } catch {
      if (!this.res()) this.res.set(null);
    }
  }

  protected elegir(k: string): void {
    this.sel.set(k);
    void this.router.navigate([], { queryParams: { categoria: k }, replaceUrl: true });
    if (k !== 'absoluta') void this.cargar();
  }

  protected intentos(f: Fila, m: Mov): string {
    return `${MOV[m]}: ` + (f.intentos[m] ?? []).map((c) => (c.resultado === 'pendiente' ? '·' : c.resultado === 'renuncia' ? '—' : (c.resultado === 'nulo' ? '✗ ' : '') + kg(c.peso))).join(' / ');
  }

  protected async publicar(): Promise<void> {
    const a = this.actual();
    if (!a) return;
    const incompleta = a.completos < a.atletas;
    const ok = await this.confirm.ask({
      title: `¿Publicar ${a.titulo}?`,
      text: incompleta
        ? `Aún faltan ${a.atletas - a.completos} atletas por terminar: se publicará la clasificación provisional, sin avisos (se envían cuando termine la categoría).`
        : a.publicado ? 'Se actualiza la clasificación de /resultados. Solo se avisa a quien aún no recibió sus resultados.' : 'Sale en /resultados y se avisa por email a los atletas y a sus seguidores.',
      confirm: 'Publicar',
    });
    if (!ok) return;
    this.publicando.set(true);
    try {
      const r = await this.api.publicar(this.cid(), [a.clave], true);
      this.toasts.success(r.publicadas.length ? `${a.titulo} publicada` : 'Ya estaba publicada así');
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo publicar.'));
    } finally {
      this.publicando.set(false);
    }
  }

  protected async retirar(): Promise<void> {
    const a = this.actual();
    if (!a) return;
    const ok = await this.confirm.ask({ title: `¿Retirar ${a.titulo} de /resultados?`, text: 'Deja de verse en la web hasta que la vuelvas a publicar. Los avisos ya enviados no se repiten.', confirm: 'Retirar', danger: true });
    if (!ok) return;
    try {
      await this.api.retirar(this.cid(), a.clave);
      this.toasts.success('Retirada de /resultados');
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo retirar.'));
    }
  }

  protected async acta(): Promise<void> {
    try {
      const b = await this.api.acta(this.cid());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `acta-resultados-${this.comps.current()?.slug ?? ''}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo exportar.'));
    }
  }
}
