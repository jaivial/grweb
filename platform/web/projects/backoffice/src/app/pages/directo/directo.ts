import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../../core/api';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, errText } from '../../shared/ui';
import { DirectoApi, MOV, MOV_CORTO, ORD, cat, ini, kg, veredicto, type EstadoIn, type FilaMesa, type IntentoMesa, type Mesa, type Mov } from './api';

interface Pendiente { n: number; id: string; votos?: string; renuncia?: boolean; nombre: string; at: number }
interface Corr { fila: FilaMesa; mov: Mov; n: number; it: IntentoMesa; res: string; peso: number | null; motivo: string }
interface Decl { fila: FilaMesa; mov: Mov; n: number; peso: number | null; record: boolean }

const OPCIONES = [
  { v: 'BBB', l: 'Válido (3-0)' }, { v: 'BBR', l: 'Válido (2-1)' }, { v: 'BRR', l: 'Nulo (1-2)' }, { v: 'RRR', l: 'Nulo (0-3)' }, { v: 'renuncia', l: 'Renuncia' },
];
const JUECES = ['Lateral 1', 'Central', 'Lateral 2'];

/** «Directo · mesa» (Figma page 57): flight table, the athlete on the platform, the judges' lights, delay, pause and corrections.
 *  On a phone it opens the speaker view («Móvil · locutor»). Decisions made without network are kept on the device and sent in order. */
@Component({
  selector: 'bo-directo',
  imports: [FormsModule, RouterLink, BoPageHeader, BoDrawer, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = mesa();
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header [title]="m?.flight ? 'Mesa · Flight ' + m.flight.codigo : 'Mesa del directo'" [badge]="badge()" [badgeTone]="m?.estado?.pausa ? 'warning' : m?.estado?.fase === 'en_directo' ? 'info' : 'neutral'"
        [subtitle]="subtitulo()" [crumbs]="[comps.current()?.nombreCorto || '', 'Hoy', 'Directo']">
        @if (m?.horariosPublicados) {
          <ng-container actions>
            <div class="flex h-10 rounded-md border border-line-strong p-0.5 md:hidden" role="tablist" aria-label="Vista">
              @for (v of vistas; track v.v) { <button type="button" role="tab" class="rounded-sm px-3 text-label-s" [attr.aria-selected]="vista() === v.v" [class]="vista() === v.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'" (click)="vista.set(v.v)">{{ v.l }}</button> }
            </div>
            @if (puedeOperar() && m.estado.fase === 'en_directo') {
              <button grButton [icon]="m.estado.pausa ? 'play' : 'pause'" [loading]="guardando() === 'pausa'" (click)="cambiar({ pausa: !m.estado.pausa }, 'pausa')">{{ m.estado.pausa ? 'Reanudar' : 'Pausa técnica' }}</button>
            }
            <a grButton icon="monitor" [routerLink]="['/', comps.current()?.slug, 'directo', 'pantalla']">Pantalla del pabellón</a>
            @if (puedeOperar()) { <button grButton variant="ghost" icon="settings" (click)="abrirAjustes()" aria-label="Ajustes del directo"></button> }
          </ng-container>
        }
      </bo-page-header>

      @if (cola().length || offlineDesde()) {
        <gr-alert tone="danger" [title]="offlineDesde() ? 'Sin conexión desde hace ' + segundos(offlineDesde()!) : 'Decisiones pendientes de enviar'">
          {{ cola().length }} {{ cola().length === 1 ? 'decisión guardada' : 'decisiones guardadas' }} en este dispositivo @if (cola().length) { (#{{ cola()[0].n }}@if (cola().length > 1) {–#{{ cola()[cola().length - 1].n }}}) }.
          Se enviarán en orden al reconectar. No cierres esta pestaña.
          <button type="button" class="mt-1 block text-label-s text-accent-text hover:underline" (click)="vaciarCola()">Reintentar ahora →</button>
        </gr-alert>
      }

      @if (m === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar la mesa"><button grButton (click)="cargar()">Reintentar</button></gr-empty> }
      @else if (m === undefined) { <gr-skeleton class="h-[560px] rounded-lg" /> }
      @else if (!m.horariosPublicados) {
        <gr-empty icon="clock" title="Publica los horarios primero">La mesa trabaja con los flights publicados: el orden de los atletas, sus lotes y sus primeros intentos del pesaje.
          <a grButton class="mt-4" [routerLink]="['/', comps.current()?.slug, 'horarios']">Ir a Horarios y flights</a></gr-empty>
      } @else {
        <!-- Controls: flight, lift, delay -->
        <section class="flex flex-wrap items-end gap-3">
          <gr-field label="Flight" class="w-full sm:w-64">
            <select grInput [ngModel]="m.estado.flightId ?? ''" (ngModelChange)="elegirFlight($event)" [disabled]="!puedeOperar() || !!guardando()">
              <option value="" disabled>Elige el flight</option>
              @for (f of m.flights; track f.id) { <option [value]="f.id">{{ f.codigo }} · {{ f.titulo }} · {{ estadoFlight[f.estado] }}</option> }
            </select>
          </gr-field>
          @if (m.flight) {
            <div class="flex h-10 rounded-md border border-line-strong p-0.5" role="radiogroup" aria-label="Movimiento">
              @for (v of movs; track v) {
                <button type="button" role="radio" [attr.aria-checked]="m.estado.movimiento === v" [disabled]="!puedeOperar() || !!guardando()" class="rounded-sm px-3 text-label-s"
                  [class]="m.estado.movimiento === v ? 'bg-accent-deep/60 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" (click)="cambiar({ movimiento: v }, 'mov')">{{ MOVC[v] }}</button>
              }
            </div>
          }
          <div class="flex h-10 items-center gap-1 rounded-md border border-line-strong pl-3" role="group" aria-label="Retraso">
            <span class="text-label-s text-text-secondary">Retraso</span>
            <button type="button" class="flex size-9 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-40" [disabled]="!puedeOperar() || m.estado.retrasoMin <= 0" (click)="cambiar({ retrasoMin: max0(m.estado.retrasoMin - 5) }, 'retraso')" aria-label="Menos retraso"><gr-icon name="minus" [size]="16" /></button>
            <span class="min-w-14 text-center font-mono text-mono-s" [class.text-warning]="m.estado.retrasoMin > 0">{{ m.estado.retrasoMin ? '+' + m.estado.retrasoMin + ' min' : 'en hora' }}</span>
            <button type="button" class="flex size-9 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-40" [disabled]="!puedeOperar()" (click)="cambiar({ retrasoMin: m.estado.retrasoMin + 5 }, 'retraso')" aria-label="Más retraso"><gr-icon name="plus" [size]="16" /></button>
          </div>
          <p class="pb-2.5 text-body-xs text-text-tertiary">{{ m.espectadores }} espectadores conectados · pantalla del pabellón {{ pantallaEnLinea() ? 'en línea' : 'sin conectar' }}</p>
        </section>

        @if (!m.flight) {
          <section class="rounded-lg border border-line-subtle bg-bg-card p-6 md:p-8">
            <p class="text-mono-xs text-text-tertiary">{{ m.estado.fase === 'finalizado' ? 'Competición terminada' : 'Antes del directo' }}</p>
            <h2 class="mt-2 text-ui-h4">{{ m.estado.fase === 'finalizado' ? 'El directo ha terminado' : 'Elige el flight que empieza' }}</h2>
            <p class="mt-2 max-w-xl text-body-s text-text-secondary">Al elegir un flight la web pasa a «En directo», /horarios lo marca en la plataforma y se crean los primeros intentos con los pesos del pesaje.</p>
            @if (primerFlight(); as f) { @if (puedeOperar()) { <button grButton variant="primary" icon="play" class="mt-5" [loading]="guardando() === 'flight'" (click)="elegirFlight(f.id)">Empezar con el Flight {{ f.codigo }}</button> } }
          </section>
        } @else {
          @if (vista() === 'locutor') {
            <!-- Speaker view (mobile) -->
            <section class="flex flex-col gap-4 md:hidden">
              @if (m.actual; as a) {
                <div class="rounded-lg border border-accent/40 bg-[linear-gradient(140deg,#3a0f17,#1b1112_70%)] p-5">
                  <p class="text-mono-xs text-text-tertiary">En la plataforma · {{ MOVN[m.estado.movimiento] }} {{ ORD[a.numero] }}</p>
                  <p class="mt-2 font-display text-[34px] leading-none uppercase italic">{{ a.nombre }}</p>
                  <p class="mt-2 text-body-s text-text-secondary">{{ cat(a.sexo, a.categoria) }} · {{ a.club || 'Independiente' }} · <span class="font-mono text-text-primary">{{ kg(a.peso) }} kg</span></p>
                  @if (a.frase) { <p class="mt-3 text-body-s text-text-secondary italic">«{{ a.frase }}»</p> }
                </div>
              } @else { <gr-alert tone="info" title="{{ MOVN[m.estado.movimiento] }} terminada">Esperando a que la mesa pase al siguiente movimiento.</gr-alert> }
              <div>
                <p class="text-mono-xs text-text-tertiary">Siguientes</p>
                <ul class="mt-2 divide-y divide-line-subtle rounded-lg border border-line-subtle bg-bg-card">
                  @for (s of m.siguientes; track s.atletaId + s.numero) {
                    <li class="flex items-center justify-between gap-3 px-4 py-3 text-body-s"><span class="text-label-s">{{ s.nombre }}</span><span class="text-right text-body-xs text-text-tertiary">{{ kg(s.peso) }} kg · {{ ORD[s.numero] }} · {{ s.club || 'Independiente' }}</span></li>
                  } @empty { <li class="px-4 py-3 text-body-s text-text-tertiary">Nadie más en esta ronda.</li> }
                </ul>
              </div>
            </section>
          }
          <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]" [class.max-md:hidden]="vista() === 'locutor'">
            <!-- Flight table -->
            <section class="min-w-0 overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
              <table class="w-full min-w-[560px] text-left text-body-s">
                <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                  <tr><th class="px-3 py-3">Lote</th><th class="px-3 py-3">Atleta</th>@for (i of [1, 2, 3]; track i) { <th class="px-2 py-3 text-center">{{ ORD[i] }}</th> }<th class="px-3 py-3 text-right">Mejor</th></tr>
                </thead>
                <tbody>
                  @for (f of m.atletas; track f.id) {
                    <tr class="border-b border-line-subtle last:border-0" [class]="f.turno === 1 ? 'bg-accent-deep/25' : ''">
                      <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ f.lote.toString().padStart(2, '0') }}</td>
                      <td class="px-3 py-2.5"><p class="text-label-s" [class.text-accent-text]="f.turno === 1">{{ f.nombre }}</p><p class="text-body-xs text-text-tertiary">{{ cat(f.sexo, f.categoria) }}@if (f.sinPeso) { · <span class="text-warning">sin peso declarado</span> }</p></td>
                      @for (c of f.intentos[m.estado.movimiento]; track $index; let i = $index) {
                        <td class="px-1.5 py-2">
                          @if (c) {
                            <button type="button" class="flex h-9 w-full min-w-16 items-center justify-center gap-1 rounded-sm border font-mono text-mono-s transition-colors" [disabled]="!puedeOperar()"
                              [class]="celda(f, c, i + 1)" (click)="clicCelda(f, i + 1, c)" [attr.aria-label]="f.nombre + ' ' + ORD[i + 1] + ': ' + kg(c.peso) + ' kg, ' + ver(c.votos, c.resultado)">
                              {{ c.resultado === 'renuncia' ? '—' : kg(c.peso) }}@if (c.corregido) { <gr-icon name="pencil" [size]="11" /> }
                            </button>
                          } @else if (puedeDeclarar(f, i + 1)) {
                            <button type="button" class="flex h-9 w-full min-w-16 items-center justify-center rounded-sm border border-dashed border-line-strong text-mono-xs text-text-tertiary hover:text-text-primary" (click)="abrirDecl(f, i + 1)">+ peso</button>
                          } @else { <span class="block text-center text-text-muted">–</span> }
                        </td>
                      }
                      <td class="px-3 py-2.5 text-right font-mono">{{ kg(f.mejor[m.estado.movimiento]) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>

            <!-- On the platform -->
            <aside class="flex h-fit flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5 lg:sticky lg:top-20" aria-label="En la plataforma">
              @if (m.actual; as a) {
                <header class="flex items-center justify-between gap-2"><h2 class="text-ui-h5">En la plataforma</h2><gr-badge tone="accent">{{ MOVN[m.estado.movimiento] }} · {{ ORD[a.numero] }}</gr-badge></header>
                <div class="flex items-center gap-3">
                  <span class="flex size-11 shrink-0 items-center justify-center rounded-pill border border-line-strong bg-bg-raised text-label-s">{{ ini(a.nombre) }}</span>
                  <div class="min-w-0"><p class="truncate text-ui-h5">{{ a.nombre }} · {{ cat(a.sexo, a.categoria) }}</p><p class="text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }}@if (m.estado.movimiento === 'sq' && a.rackSq) { · rack SQ {{ a.rackSq }} }@if (m.estado.movimiento === 'bp' && a.rackBp) { · rack BP {{ a.rackBp }} }</p></div>
                </div>
                <gr-field label="Peso declarado (kg)" [hint]="a.numero === 1 ? 'Primer intento del pesaje' : 'Cambios hasta 1 min antes de su turno (2.º/3.º)'">
                  <input grInput type="number" inputmode="decimal" step="2.5" min="20" class="font-mono" [class.border-accent]="pesoEditado()" [ngModel]="pesoActual()" (ngModelChange)="pesoActual.set($event); pesoEditado.set(true)"
                    (keydown.enter)="guardarPeso()" (blur)="guardarPeso()" [disabled]="!puedeOperar()" />
                </gr-field>
                <div class="flex items-center justify-between rounded-md bg-bg-raised px-4 py-3">
                  <span class="text-label-s text-text-secondary">Tiempo para el intento</span>
                  <span class="font-mono text-ui-h4 tabular-nums" [class]="m.estado.pausa ? 'text-warning' : restante() <= 10 ? 'text-accent-text' : 'text-warning'">{{ m.estado.pausa ? 'Pausa' : reloj() }}</span>
                </div>
                <div>
                  <p class="text-mono-xs text-text-tertiary">Jueces</p>
                  <div class="mt-2 grid grid-cols-3 gap-2">
                    @for (j of jueces; track $index; let i = $index) {
                      <div class="flex flex-col gap-1.5">
                        <span class="text-center text-body-xs text-text-tertiary">{{ j }}</span>
                        <button type="button" class="h-10 rounded-sm border text-label-s transition-colors" [class]="votos()[i] === 'B' ? 'border-white bg-white text-[#141012]' : 'border-line-strong hover:bg-bg-raised'" [attr.aria-pressed]="votos()[i] === 'B'" (click)="votar(i, 'B')" [disabled]="!puedeOperar()">Blanca</button>
                        <button type="button" class="h-10 rounded-sm border text-label-s transition-colors" [class]="votos()[i] === 'R' ? 'border-accent bg-accent text-white' : 'border-line-strong hover:bg-bg-raised'" [attr.aria-pressed]="votos()[i] === 'R'" (click)="votar(i, 'R')" [disabled]="!puedeOperar()">Roja</button>
                      </div>
                    }
                  </div>
                  <p class="mt-3 flex items-center gap-2 text-body-xs" aria-live="polite">
                    @for (v of votos(); track $index) { <span class="size-5 rounded-pill border" [class]="v === 'B' ? 'border-white bg-white' : v === 'R' ? 'border-accent bg-accent' : 'border-line-strong'"></span> }
                    <span [class]="completo() ? (valido() ? 'text-success' : 'text-accent-text') : 'text-text-tertiary'">{{ completo() ? ver(votos().join(''), valido() ? 'valido' : 'nulo') : 'Esperando jueces' }}</span>
                  </p>
                </div>
                <button grButton variant="primary" class="w-full" [disabled]="!completo() || !puedeOperar() || !a.intentoId" [loading]="guardando() === 'veredicto'" (click)="guardarVeredicto()">Guardar y siguiente</button>
                <div class="flex items-center justify-between gap-2 text-body-xs text-text-tertiary">
                  <span>@if (m.siguientes[0]; as s) { Siguiente: {{ s.nombre }} · {{ kg(s.peso) }} kg } @else { Último de la ronda }</span>
                  @if (puedeOperar() && a.intentoId) { <button type="button" class="text-label-s hover:text-text-primary" (click)="renuncia()">Renuncia</button> }
                </div>
              } @else if (m.flightCompleto) {
                <h2 class="text-ui-h5">Flight {{ m.flight.codigo }} terminado</h2>
                <p class="text-body-s text-text-secondary">Todos los intentos están juzgados.@if (m.estado.publicarAuto) { Las categorías completas se publican solas en /resultados. }</p>
                @if (siguienteFlight(); as f) { @if (puedeOperar()) { <button grButton variant="primary" icon="arrow-right" [loading]="guardando() === 'flight'" (click)="elegirFlight(f.id)">Pasar al Flight {{ f.codigo }}</button> } }
                <a grButton [routerLink]="['/', comps.current()?.slug, 'resultados']">Ver resultados</a>
              } @else if (m.movimientoCompleto && m.siguienteMovimiento) {
                <h2 class="text-ui-h5">{{ MOVN[m.estado.movimiento] }} terminada</h2>
                <p class="text-body-s text-text-secondary">Los tres intentos de todos los atletas están juzgados.</p>
                @if (puedeOperar()) { <button grButton variant="primary" icon="arrow-right" [loading]="guardando() === 'mov'" (click)="cambiar({ movimiento: m.siguienteMovimiento }, 'mov')">Pasar a {{ MOVN[m.siguienteMovimiento].toLowerCase() }}</button> }
              } @else {
                <h2 class="text-ui-h5">Falta el peso</h2>
                <p class="text-body-s text-text-secondary">Hay atletas sin peso declarado para esta ronda: añádelo con «+ peso» en la tabla.</p>
              }
            </aside>
          </div>
        }
      }
    </div>

    <!-- Correction -->
    @if (corr(); as c) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="corr.set(null)" (keydown.escape)="corr.set(null)">
        <form class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" [attr.aria-label]="'Corregir intento · ' + c.fila.nombre" (click)="$event.stopPropagation()" (ngSubmit)="guardarCorreccion()">
          <header class="flex items-start justify-between gap-3"><h2 class="text-ui-h5">Corregir intento · {{ c.fila.nombre }}</h2><button type="button" class="-mt-1 -mr-2 flex size-9 items-center justify-center rounded-sm hover:bg-bg-card" (click)="corr.set(null)" aria-label="Cerrar"><gr-icon name="x" [size]="18" /></button></header>
          <div class="mt-5 flex flex-col gap-4">
            <gr-field label="Resultado" [hint]="'Antes: ' + ver(c.it.votos, c.it.resultado)">
              <select grInput name="res" [(ngModel)]="c.res">@for (o of opciones; track o.v) { <option [value]="o.v">{{ ver(c.it.votos, c.it.resultado) }} → {{ o.l }}</option> }</select>
            </gr-field>
            <div class="grid grid-cols-2 gap-3">
              <gr-field label="Intento"><input grInput [value]="MOVN[c.mov] + ' ' + ORD[c.n]" disabled /></gr-field>
              <gr-field label="Peso (kg)"><input grInput type="number" step="0.5" name="peso" class="font-mono" [(ngModel)]="c.peso" /></gr-field>
            </div>
            <gr-field label="Motivo (obligatorio)" [error]="corrErr()"><input grInput name="motivo" [(ngModel)]="c.motivo" placeholder="Lateral 2 marcó rojo por error" maxlength="200" /></gr-field>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="corr.set(null)">Cancelar</button>
            <button type="submit" grButton variant="primary" [loading]="guardando() === 'corr'">Guardar corrección</button>
          </div>
        </form>
      </div>
    }

    <!-- Declare a weight -->
    @if (decl(); as d) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="decl.set(null)" (keydown.escape)="decl.set(null)">
        <form class="w-full max-w-sm rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" [attr.aria-label]="'Declarar peso · ' + d.fila.nombre" (click)="$event.stopPropagation()" (ngSubmit)="guardarDecl()">
          <h2 class="text-ui-h5">{{ d.fila.nombre }} · {{ MOVN[d.mov] }} {{ ORD[d.n] }}</h2>
          <gr-field label="Peso (kg)" class="mt-4" [error]="declErr()"><input grInput type="number" step="0.5" name="peso" class="font-mono" [(ngModel)]="d.peso" autofocus /></gr-field>
          <label class="mt-3 flex items-center gap-2 text-body-s"><input type="checkbox" class="size-4 accent-[#c42b3e]" name="record" [(ngModel)]="d.record" /> Intento de récord (incrementos de 0,5 kg)</label>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="decl.set(null)">Cancelar</button>
            <button type="submit" grButton variant="primary" [loading]="guardando() === 'decl'">Guardar</button>
          </div>
        </form>
      </div>
    }

    <!-- Live settings -->
    <bo-drawer [(open)]="ajustesOpen" title="Ajustes del directo">
      <div class="flex flex-col gap-5">
        <gr-field label="Emisión en directo" hint="Enlace https de YouTube o Twitch; /en-directo lo incrusta."><input grInput [(ngModel)]="aj.streamUrl" placeholder="https://www.youtube.com/live/…" /></gr-field>
        <gr-field label="Repetición" hint="Se muestra cuando termina la competición."><input grInput [(ngModel)]="aj.replayUrl" placeholder="https://www.youtube.com/watch?v=…" /></gr-field>
        <div class="flex items-center gap-3"><div class="flex-1"><p class="text-label-s">Publicar cada categoría al terminar</p><p class="text-body-xs text-text-tertiary">En /resultados, con aviso a los atletas y sus seguidores. Las correcciones posteriores se publican a mano.</p></div>
          <bo-toggle [(value)]="aj.publicarAuto" label="Publicar cada categoría al terminar" /></div>
        @if (mesa()?.estado?.fase !== 'finalizado') {
          <div class="rounded-md border border-line-subtle p-4"><p class="text-label-s">Terminar la competición</p><p class="mt-1 text-body-xs text-text-tertiary">/en-directo pasa a «Finalizado» con la repetición y el enlace a los resultados.</p>
            <button grButton variant="danger" size="s" class="mt-3" (click)="finalizar()">Dar por terminada</button></div>
        } @else {
          <button grButton size="s" (click)="reabrir()">Volver a «En directo»</button>
        }
      </div>
      <ng-container drawerActions><button grButton variant="primary" [loading]="guardando() === 'ajustes'" (click)="guardarAjustes()">Guardar</button></ng-container>
    </bo-drawer>
  `,
})
export class DirectoPage {
  private readonly api = inject(DirectoApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly MOVN = MOV;
  protected readonly MOVC = MOV_CORTO;
  protected readonly ORD = ORD;
  protected readonly movs: Mov[] = ['sq', 'bp', 'dl'];
  protected readonly jueces = JUECES;
  protected readonly opciones = OPCIONES;
  protected readonly vistas = [{ v: 'mesa' as const, l: 'Mesa' }, { v: 'locutor' as const, l: 'Locutor' }];
  protected readonly estadoFlight = { programado: 'programado', en_curso: 'en curso', finalizado: 'terminado' };
  protected readonly kg = kg;
  protected readonly cat = cat;
  protected readonly ini = ini;
  protected readonly ver = veredicto;

  protected readonly mesa = signal<Mesa | null | undefined>(undefined);
  protected readonly guardando = signal<string>('');
  protected readonly votos = signal<string[]>(['', '', '']);
  protected readonly pesoActual = signal<number | null>(null);
  protected readonly pesoEditado = signal(false);
  protected readonly vista = signal<'mesa' | 'locutor'>(typeof window !== 'undefined' && window.innerWidth < 768 ? 'locutor' : 'mesa');
  protected readonly corr = signal<Corr | null>(null);
  protected readonly corrErr = signal('');
  protected readonly decl = signal<Decl | null>(null);
  protected readonly declErr = signal('');
  protected readonly ajustesOpen = signal(false);
  protected aj = { streamUrl: '', replayUrl: '', publicarAuto: true };
  protected readonly cola = signal<Pendiente[]>([]);
  protected readonly offlineDesde = signal<number | null>(null);
  private readonly ahora = signal(Date.now());
  private seq = 0;
  private t: ReturnType<typeof setTimeout> | undefined;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puedeOperar = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly completo = computed(() => this.votos().every((v) => v));
  protected readonly valido = computed(() => this.votos().filter((v) => v === 'B').length >= 2);
  protected readonly restante = computed(() => {
    const t = this.mesa()?.estado?.turnoAt;
    return t ? Math.max(0, 60 - Math.floor((this.ahora() - new Date(t).getTime()) / 1000)) : 60;
  });
  protected readonly reloj = computed(() => `${Math.floor(this.restante() / 60)}:${String(this.restante() % 60).padStart(2, '0')}`);
  protected readonly pantallaEnLinea = computed(() => {
    const p = this.mesa()?.pantallaPing;
    return !!p && this.ahora() - new Date(p).getTime() < 60_000;
  });
  protected readonly badge = computed(() => {
    const e = this.mesa()?.estado;
    if (!e) return '';
    if (e.pausa) return 'Pausa técnica';
    return e.fase === 'en_directo' ? 'En directo' : e.fase === 'finalizado' ? 'Terminado' : 'Antes del directo';
  });
  protected readonly subtitulo = computed(() => {
    const m = this.mesa();
    if (!m?.flight) return '';
    const r = m.ronda > 3 ? 'terminada' : `ronda ${m.ronda} de 3`;
    return `Plataforma ${m.flight.plataforma} · ${MOV[m.estado.movimiento]} · ${r} · ${m.atletas.length} atletas`;
  });
  protected readonly primerFlight = computed(() => this.mesa()?.flights.find((f) => f.estado !== 'finalizado'));
  protected readonly siguienteFlight = computed(() => {
    const m = this.mesa();
    if (!m?.flight) return undefined;
    const i = m.flights.findIndex((f) => f.id === m.flight!.id);
    return m.flights.slice(i + 1).find((f) => f.estado !== 'finalizado');
  });
  private readonly claveCola = computed(() => `gr-directo-cola-${this.cid()}`);

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => {
        this.cola.set(JSON.parse(localStorage.getItem(this.claveCola()) ?? '[]') as Pendiente[]);
        this.seq = this.cola().reduce((n, x) => Math.max(n, x.n), Number(localStorage.getItem(this.claveCola() + '-n') ?? '400'));
        void this.cargar();
      });
    });
    const tick = setInterval(() => {
      this.ahora.set(Date.now());
      if (this.cola().length && Date.now() % 5000 < 1000) void this.vaciarCola();
    }, 1000);
    const online = () => void this.vaciarCola();
    window.addEventListener('online', online);
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('directo.') || e.tipo.startsWith('resultados.') || e.tipo === 'horarios.publicados') {
        clearTimeout(this.t);
        this.t = setTimeout(() => void this.cargar(), 400);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearTimeout(this.t);
      window.removeEventListener('online', online);
      sub.unsubscribe();
    });
  }

  async cargar(): Promise<void> {
    try {
      this.aplicar(await this.api.mesa(this.cid()));
    } catch {
      if (!this.mesa()) this.mesa.set(null);
    }
  }

  private aplicar(m: Mesa): void {
    const prev = this.mesa();
    const cambia = !prev || prev.actual?.intentoId !== m.actual?.intentoId;
    this.mesa.set(m);
    if (cambia) {
      this.votos.set(['', '', '']);
      this.pesoEditado.set(false);
    }
    if (!this.pesoEditado()) this.pesoActual.set(m.actual?.peso || null);
  }

  private body(over: Partial<EstadoIn>): EstadoIn {
    const e = this.mesa()!.estado;
    return { fase: e.fase, flightId: e.flightId, movimiento: e.movimiento, pausa: e.pausa, retrasoMin: e.retrasoMin, streamUrl: e.streamUrl, replayUrl: e.replayUrl, pantalla: e.pantalla, publicarAuto: e.publicarAuto, ...over };
  }

  protected async cambiar(over: Partial<EstadoIn>, que: string): Promise<void> {
    const m = this.mesa();
    if (!m) return;
    this.guardando.set(que);
    try {
      this.aplicar(await this.api.estado(this.cid(), m.estado.version, this.body(over)));
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar el directo.'));
      if (problemOf(e).code === 'CONFLICTO_EDICION') void this.cargar();
    } finally {
      this.guardando.set('');
    }
  }

  protected async elegirFlight(id: string): Promise<void> {
    const m = this.mesa();
    if (!m || !id || id === m.estado.flightId) return;
    if (m.flight && !m.flightCompleto) {
      const f = m.flights.find((x) => x.id === id);
      const ok = await this.confirm.ask({ title: `¿Pasar al Flight ${f?.codigo}?`, text: `El Flight ${m.flight.codigo} tiene intentos sin juzgar. Podrás volver a él desde este selector.`, confirm: 'Cambiar de flight' });
      if (!ok) return;
    }
    await this.cambiar({ flightId: id, movimiento: 'sq', fase: 'en_directo', pausa: false }, 'flight');
  }

  protected max0(v: number): number { return Math.max(0, v); }
  protected segundos(desde: number): string {
    const s = Math.floor((this.ahora() - desde) / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`;
  }

  protected celda(f: FilaMesa, c: IntentoMesa, n: number): string {
    if (c.resultado === 'valido') return 'border-success/40 bg-success/15 text-success';
    if (c.resultado === 'nulo') return 'border-accent/40 bg-accent/15 text-accent-text line-through';
    if (c.resultado === 'renuncia') return 'border-line-subtle text-text-muted';
    const actual = this.mesa()?.actual;
    if (actual?.atletaId === f.id && actual.numero === n) return 'border-accent bg-transparent text-text-primary ring-1 ring-accent';
    return 'border-line-subtle bg-bg-raised text-text-secondary hover:border-line-strong';
  }

  protected puedeDeclarar(f: FilaMesa, n: number): boolean {
    if (!this.puedeOperar()) return false;
    const its = f.intentos[this.mesa()!.estado.movimiento];
    return n === 1 ? !its[0] : !!its[n - 2] && its[n - 2]!.resultado !== 'pendiente';
  }

  protected clicCelda(f: FilaMesa, n: number, c: IntentoMesa): void {
    const mov = this.mesa()!.estado.movimiento;
    if (c.resultado === 'pendiente') {
      this.declErr.set('');
      this.decl.set({ fila: f, mov, n, peso: c.peso, record: c.peso % 2.5 !== 0 });
      return;
    }
    this.corrErr.set('');
    const res = c.resultado === 'renuncia' ? 'renuncia' : c.votos;
    this.corr.set({ fila: f, mov, n, it: c, res, peso: c.peso, motivo: '' });
  }

  protected abrirDecl(f: FilaMesa, n: number): void {
    const mov = this.mesa()!.estado.movimiento;
    const prev = f.intentos[mov][n - 2];
    this.declErr.set('');
    this.decl.set({ fila: f, mov, n, peso: prev ? prev.peso + (prev.resultado === 'valido' ? 2.5 : 0) : null, record: false });
  }

  protected async guardarDecl(): Promise<void> {
    const d = this.decl();
    if (!d || !d.peso) {
      this.declErr.set('Escribe el peso.');
      return;
    }
    this.guardando.set('decl');
    try {
      this.aplicar(await this.api.declarar(this.cid(), { atletaId: d.fila.id, movimiento: d.mov, numero: d.n, peso: Number(d.peso), record: d.record }));
      this.decl.set(null);
    } catch (e) {
      this.declErr.set(errText(e, 'No se pudo guardar el peso.'));
    } finally {
      this.guardando.set('');
    }
  }

  protected async guardarPeso(): Promise<void> {
    const a = this.mesa()?.actual;
    const p = Number(this.pesoActual());
    if (!a || !this.pesoEditado() || !p || p === a.peso || this.guardando()) return;
    this.guardando.set('peso');
    try {
      const m = await this.api.declarar(this.cid(), { atletaId: a.atletaId, movimiento: this.mesa()!.estado.movimiento, numero: a.numero, peso: p, record: p % 2.5 !== 0 });
      this.pesoEditado.set(false);
      this.aplicar(m);
      this.toasts.success(`${a.nombre}: ${kg(p)} kg`);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar el peso.'));
      this.pesoEditado.set(false);
      this.pesoActual.set(a.peso);
    } finally {
      this.guardando.set('');
    }
  }

  protected votar(i: number, v: 'B' | 'R'): void {
    this.votos.update((l) => l.map((x, k) => (k === i ? (x === v ? '' : v) : x)));
  }

  protected async guardarVeredicto(): Promise<void> {
    const a = this.mesa()?.actual;
    if (!a?.intentoId || !this.completo()) return;
    await this.enviar({ n: ++this.seq, id: a.intentoId, votos: this.votos().join(''), nombre: a.nombre, at: Date.now() });
  }

  protected async renuncia(): Promise<void> {
    const a = this.mesa()?.actual;
    if (!a?.intentoId) return;
    const ok = await this.confirm.ask({ title: `¿${a.nombre} renuncia al ${ORD[a.numero]} intento?`, text: 'Cuenta como no realizado y pasa al siguiente atleta.', confirm: 'Registrar renuncia' });
    if (ok) await this.enviar({ n: ++this.seq, id: a.intentoId, renuncia: true, nombre: a.nombre, at: Date.now() });
  }

  /** Sends a decision; without network it is kept on the device (in order) and the cell is marked locally. */
  private async enviar(p: Pendiente): Promise<void> {
    localStorage.setItem(this.claveCola() + '-n', String(this.seq));
    if (this.cola().length) {
      this.encolar(p);
      return;
    }
    this.guardando.set('veredicto');
    try {
      this.aplicar(await this.api.veredicto(this.cid(), p.id, p.renuncia ? { renuncia: true } : { votos: p.votos }));
      this.offlineDesde.set(null);
    } catch (e) {
      if (e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 502)) this.encolar(p);
      else this.toasts.error(errText(e, 'No se pudo guardar la decisión.'));
    } finally {
      this.guardando.set('');
    }
  }

  private encolar(p: Pendiente): void {
    this.cola.update((l) => [...l, p]);
    localStorage.setItem(this.claveCola(), JSON.stringify(this.cola()));
    if (!this.offlineDesde()) this.offlineDesde.set(Date.now());
    this.toasts.info(`Guardado en este dispositivo · decisión #${p.n} pendiente de enviar`);
    // mark the cell so the desk sees what was decided
    this.mesa.update((m) => {
      if (!m) return m;
      const mov = m.estado.movimiento;
      const res = p.renuncia ? 'renuncia' : [...(p.votos ?? '')].filter((x) => x === 'B').length >= 2 ? 'valido' : 'nulo';
      return { ...m, atletas: m.atletas.map((f) => ({ ...f, intentos: { ...f.intentos, [mov]: f.intentos[mov].map((c) => (c && c.id === p.id ? { ...c, resultado: res, votos: p.votos ?? '' } : c)) } })) } as Mesa;
    });
    this.votos.set(['', '', '']);
  }

  protected async vaciarCola(): Promise<void> {
    if (this.guardando() === 'cola') return;
    this.guardando.set('cola');
    try {
      while (this.cola().length) {
        const p = this.cola()[0];
        try {
          this.aplicar(await this.api.veredicto(this.cid(), p.id, p.renuncia ? { renuncia: true } : { votos: p.votos }));
        } catch (e) {
          if (e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 502)) return; // still offline
          this.toasts.error(`Decisión #${p.n} (${p.nombre}): ${errText(e, 'rechazada')}`);
        }
        this.cola.update((l) => l.slice(1));
        localStorage.setItem(this.claveCola(), JSON.stringify(this.cola()));
      }
      this.offlineDesde.set(null);
      void this.cargar();
    } finally {
      this.guardando.set('');
    }
  }

  protected async guardarCorreccion(): Promise<void> {
    const c = this.corr();
    if (!c) return;
    if (c.motivo.trim().length < 5) {
      this.corrErr.set('Explica el motivo (queda en la auditoría).');
      return;
    }
    this.guardando.set('corr');
    try {
      const body: { votos?: string; renuncia?: boolean; peso?: number; motivo: string } = { motivo: c.motivo.trim() };
      if (c.res === 'renuncia') body.renuncia = true;
      else if (c.res !== c.it.votos) body.votos = c.res;
      if (c.peso && Number(c.peso) !== c.it.peso) body.peso = Number(c.peso);
      this.aplicar(await this.api.corregir(this.cid(), c.it.id, body));
      this.corr.set(null);
      this.toasts.success('Corrección guardada');
    } catch (e) {
      this.corrErr.set(errText(e, 'No se pudo corregir.'));
    } finally {
      this.guardando.set('');
    }
  }

  protected abrirAjustes(): void {
    const e = this.mesa()?.estado;
    if (!e) return;
    this.aj = { streamUrl: e.streamUrl, replayUrl: e.replayUrl, publicarAuto: e.publicarAuto };
    this.ajustesOpen.set(true);
  }

  protected async guardarAjustes(): Promise<void> {
    await this.cambiar({ streamUrl: this.aj.streamUrl.trim(), replayUrl: this.aj.replayUrl.trim(), publicarAuto: this.aj.publicarAuto }, 'ajustes');
    if (!this.guardando()) this.ajustesOpen.set(false);
  }

  protected async finalizar(): Promise<void> {
    const ok = await this.confirm.ask({ title: '¿Dar por terminada la competición?', text: '/en-directo mostrará la repetición y el enlace a los resultados. Puedes volver atrás.', confirm: 'Terminar', danger: true });
    if (!ok) return;
    await this.cambiar({ fase: 'finalizado', pausa: false, streamUrl: this.aj.streamUrl.trim(), replayUrl: this.aj.replayUrl.trim(), publicarAuto: this.aj.publicarAuto }, 'ajustes');
    this.ajustesOpen.set(false);
  }

  protected async reabrir(): Promise<void> {
    await this.cambiar({ fase: this.mesa()?.estado.flightId ? 'en_directo' : 'antes' }, 'ajustes');
    this.ajustesOpen.set(false);
  }
}
