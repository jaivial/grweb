import { webPublica } from '../../core/web';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts, fmtAgo, fmtShortDate } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoCount, BoToggle, Confirm, Media, errText } from '../../shared/ui';
import { AtletasApi, CATEGORIAS, DIVISIONES, cat, kg, type Atleta, type Historial, type Marcas } from './api';
import { ESTADO } from './list';

type Tab = 'perfil' | 'competicion' | 'comunicaciones' | 'historial';

const PUBLIC_WEB = webPublica();

/** Athlete record (Figma page 55 · «Atletas · ficha (perfil público)»). */
@Component({
  selector: 'bo-atleta-ficha',
  imports: [FormsModule, RouterLink, BoCount, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = atleta();
    <div class="mx-auto flex max-w-[1180px] flex-col gap-6 pb-24">
      @if (!a) {
        @if (noExiste()) { <gr-empty icon="user" title="Atleta no encontrado" text="Puede que lo hayan borrado." /> }
        @else { <gr-skeleton class="h-20" /><gr-skeleton class="h-96 rounded-lg" /> }
      } @else {
        <header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div class="min-w-0">
            <nav class="flex flex-wrap items-center gap-1.5 text-body-xs text-text-tertiary" aria-label="Migas">
              <span>{{ comps.current()?.nombreCorto }}</span><gr-icon name="chevron-right" [size]="12" /><span>Evento</span><gr-icon name="chevron-right" [size]="12" />
              <a routerLink=".." class="hover:text-text-primary">Atletas</a><gr-icon name="chevron-right" [size]="12" /><span class="text-text-secondary">{{ a.nombreCompleto }}</span>
            </nav>
            <h1 class="mt-2 flex flex-wrap items-center gap-3 text-ui-h2">{{ a.nombreCompleto }} <gr-badge [tone]="estado[a.estado].tone">{{ estado[a.estado].label }}</gr-badge></h1>
            <p class="mt-1 text-body-s text-text-tertiary">{{ subtitulo() }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            @if (a.estado === 'confirmado') { <a grButton icon="external-link" [href]="web + '/atletas/' + a.perfil.slug" target="_blank" rel="noopener">Ver en la web</a> }
            @if (canEdit() && a.estado !== 'baja') { <button grButton icon="send" [loading]="enviando()" (click)="enlace()">Enviar enlace al área</button> }
          </div>
        </header>

        <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Ficha">
          @for (t of tabs; track t.key) {
            <button type="button" (click)="tab.set(t.key)" [attr.aria-current]="tab() === t.key ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s"
              [class]="tab() === t.key ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">{{ t.label }}
              @if (t.key === 'historial' && historial().length) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ historial().length }}</span> }
              @if (tab() === t.key) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
        </nav>

        @if (conflicto()) {
          <gr-alert tone="warning" title="Otra persona ha guardado esta ficha">Tus cambios no se han guardado para no pisar los suyos.
            <button alertAction grButton size="s" class="mt-3" (click)="cargar()">Recargar la ficha</button>
          </gr-alert>
        }
        @for (i of a.incidencias; track i.tipo) {
          <gr-alert [tone]="i.tipo === 'menor_sin_autorizacion' ? 'info' : 'warning'" [title]="incTitulo[i.tipo]">{{ i.texto }}
            @if (i.tipo === 'pesaje_fuera' && canEdit()) {
              <div alertAction class="mt-3 flex flex-wrap gap-2">
                <button grButton size="s" (click)="decidir('cambiar_categoria')">Pasar a {{ cat(a.pesaje.sugerencia) }} kg</button>
                <button grButton size="s" variant="ghost" (click)="decidir('no_compite')">No compite</button>
              </div>
            }
          </gr-alert>
        }

        @switch (tab()) {
          @case ('perfil') {
            <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_312px]">
              <div class="flex min-w-0 flex-col gap-6">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Foto y presentación</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">La foto la sube el atleta desde su área o el equipo. Pulsa en la cara para fijar el encuadre.</p>
                  @if (p.fotoUrl) {
                    <button type="button" class="relative mt-4 block aspect-[16/9] w-full max-w-lg overflow-hidden rounded-md bg-bg-deep" (click)="focal($event)" [disabled]="!canEdit()" aria-label="Fijar el punto focal">
                      <img [src]="p.fotoUrl" alt="" class="size-full object-cover" [style.object-position]="p.focalX + '% ' + p.focalY + '%'" />
                      <span class="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-black/30" [style.left.%]="p.focalX" [style.top.%]="p.focalY" aria-hidden="true"><span class="size-1.5 rounded-full bg-white"></span></span>
                    </button>
                    <div class="mt-3 flex items-end gap-3">
                      @for (c of crops; track c.label) {
                        <figure><img [src]="p.fotoUrl" alt="" [class]="c.cls + ' rounded-sm object-cover'" [style.object-position]="p.focalX + '% ' + p.focalY + '%'" /><figcaption class="mt-1 text-mono-xs text-text-muted">{{ c.label }}</figcaption></figure>
                      }
                    </div>
                    <p class="mt-2 text-mono-xs text-text-tertiary">focal {{ p.focalX }} % / {{ p.focalY }} % · object-position: {{ p.focalX }}% {{ p.focalY }}%</p>
                  } @else {
                    <p class="mt-4 rounded-md border border-dashed border-line-strong p-6 text-center text-body-s text-text-tertiary">Sin foto. Sin foto, su ficha pública solo muestra las iniciales.</p>
                  }
                  @if (canEdit()) {
                    <label class="mt-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 text-label-s hover:border-text-tertiary">
                      <gr-icon name="download" [size]="14" class="rotate-180" />{{ subiendo() ? 'Subiendo…' : p.fotoUrl ? 'Cambiar foto' : 'Subir foto' }}
                      <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" (change)="subirFoto($event)" />
                    </label>
                  }
                  <div class="mt-5 grid gap-4 md:grid-cols-2">
                    <gr-field label="Frase" for="p-frase" class="md:col-span-2"><bo-count fieldAside [value]="p.frase" [max]="80" /><input grInput id="p-frase" [(ngModel)]="p.frase" maxlength="80" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Sobre el atleta" for="p-bio" class="md:col-span-2"><bo-count fieldAside [value]="p.bio" [max]="280" /><textarea grInput id="p-bio" rows="3" [(ngModel)]="p.bio" maxlength="280" [disabled]="!canEdit()"></textarea></gr-field>
                    <gr-field label="Instagram" for="p-ig" [hint]="a.menor ? 'Menor de edad: no se guardan redes' : null"><input grInput id="p-ig" [(ngModel)]="p.instagram" placeholder="@usuario" [disabled]="!canEdit() || a.menor" /></gr-field>
                    <gr-field label="Entrenador / club" for="p-ent"><input grInput id="p-ent" [(ngModel)]="p.entrenador" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Historial" for="p-hist" class="md:col-span-2" hint="p. ej. 2025 · AEP-2 Llíria · −83 kg · 4.º · 612,5 kg"><input grInput id="p-hist" [(ngModel)]="p.historial" maxlength="300" [disabled]="!canEdit()" /></gr-field>
                  </div>
                </section>

                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Marcas previas</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">Se muestran como «total previsto»; el atleta puede actualizarlas desde su área hasta el pesaje.</p>
                  <div class="mt-4 grid grid-cols-3 gap-3">
                    @for (m of lifts; track m.k) {
                      <gr-field [label]="m.label" [for]="'p-' + m.k"><input grInput type="number" inputmode="decimal" step="2.5" min="0" max="600" [id]="'p-' + m.k" [(ngModel)]="p.marcas[m.k]" [disabled]="!canEdit()" /></gr-field>
                    }
                  </div>
                </section>

                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Visibilidad y consentimientos</h2>
                  <ul class="mt-2">
                    <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Mostrar en /atletas</span><span class="block text-body-xs text-text-tertiary">Ficha pública /atletas/{{ a.perfil.slug }}{{ a.menor && !p.autorizacionUrl ? ' · no se publica hasta tener la autorización del tutor' : '' }} (nombre, club y categoría siguen en participantes y resultados)</span></span><bo-toggle [(value)]="p.visible" label="Mostrar perfil público" [disabled]="!canEdit()" /></li>
                    <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Mostrar marcas previas</span><span class="block text-body-xs text-text-tertiary">Si se ocultan, la ficha solo enseña categoría y flight</span></span><bo-toggle [(value)]="p.mostrarMarcas" label="Mostrar marcas previas" [disabled]="!canEdit()" /></li>
                    <li class="flex items-center justify-between gap-4 py-2"><span><span class="block text-label-s">Permitir que le sigan</span><span class="block text-body-xs text-text-tertiary">{{ a.seguidores }} {{ a.seguidores === 1 ? 'persona recibe' : 'personas reciben' }} su hora de salida</span></span><bo-toggle [(value)]="p.permiteSeguir" label="Permitir que le sigan" [disabled]="!canEdit() || a.menor" /></li>
                  </ul>
                  @if (a.menor) {
                    <div class="mt-3 rounded-md border border-info/30 bg-info/5 p-4">
                      <p class="text-label-s text-info">Autorización del tutor ({{ a.edad }} años)</p>
                      <p class="mt-1 text-body-xs text-text-secondary">Sin ella, su perfil público y su foto no se muestran. Sube el documento firmado (foto o PDF).</p>
                      @if (p.autorizacionUrl) { <a [href]="p.autorizacionUrl" target="_blank" rel="noopener" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text">Ver autorización <gr-icon name="external-link" [size]="12" /></a> }
                      @if (canEdit()) {
                        <label class="mt-2 ml-3 inline-flex h-9 cursor-pointer items-center gap-1 text-label-s text-text-secondary underline">{{ p.autorizacionUrl ? 'Sustituir' : 'Subir autorización' }}
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="sr-only" (change)="subirAutorizacion($event)" /></label>
                      }
                    </div>
                  }
                  <div class="mt-4 rounded-md border border-line-subtle bg-bg-surface p-4">
                    <div class="flex items-center justify-between gap-3">
                      <p class="flex items-center gap-2 text-label-s"><gr-icon name="shield" [size]="16" />Uso de imagen en web y redes</p>
                      <gr-badge [tone]="a.perfil.imagen ? 'success' : 'warning'">{{ a.perfil.imagen ? 'Confirmado' : 'Pendiente' }}</gr-badge>
                    </div>
                    @if (a.perfil.imagen; as im) {
                      <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-body-xs">
                        <dt class="text-text-tertiary">Texto aceptado</dt><dd class="truncate text-right text-mono-xs">CONSENTIMIENTO {{ im.version || '–' }}{{ im.hash ? ' · SHA256 ' + im.hash.slice(0, 6) + '…' : '' }}</dd>
                        <dt class="text-text-tertiary">Origen</dt><dd class="text-right text-mono-xs uppercase">{{ im.origen }}</dd>
                        <dt class="text-text-tertiary">Fecha</dt><dd class="text-right text-mono-xs">{{ fecha(im.at) }} (Europe/Madrid)</dd>
                        @if (im.ip) { <dt class="text-text-tertiary">IP</dt><dd class="text-right text-mono-xs">{{ im.ip }} (anonimizada)</dd> }
                      </dl>
                    } @else {
                      <p class="mt-2 text-body-xs text-text-secondary">La foto no se publica sin consentimiento. El atleta lo da desde su área; si lo firmó en papel, regístralo aquí.</p>
                      @if (canEdit()) { <label class="mt-3 flex min-h-11 items-start gap-3 text-body-s text-text-secondary"><input type="checkbox" [(ngModel)]="registrarConsentimiento" class="mt-1 size-5 accent-[#C42B3E]" />Registrar el consentimiento firmado en papel (formulario de la organización)</label> }
                    }
                  </div>
                </section>
              </div>

              <aside class="flex flex-col gap-6">
                <section>
                  <h2 class="text-label-m">Así se ve</h2>
                  <p class="text-mono-xs text-text-tertiary">/atletas/{{ a.perfil.slug }}</p>
                  <div class="mt-3 rounded-[28px] border-4 border-bg-raised bg-bg-base p-3 shadow-card">
                    <div class="relative aspect-[4/5] overflow-hidden rounded-xl bg-[linear-gradient(160deg,#3a0f17,#171213)]">
                      @if (fotoPublica()) { <img [src]="p.fotoUrl" alt="" class="size-full object-cover" [style.object-position]="p.focalX + '% ' + p.focalY + '%'" /> }
                      @else { <span class="absolute inset-0 flex items-center justify-center font-display text-[56px] text-white/90">{{ iniciales() }}</span> }
                    </div>
                    <p class="mt-3 font-display text-[22px] leading-tight uppercase italic">{{ a.nombreCompleto }}</p>
                    <p class="text-body-xs text-text-tertiary">{{ a.sexo }} {{ cat(a.categoria) }} · {{ a.divisionNombre }} · {{ a.club || 'Independiente' }}</p>
                    <dl class="mt-3 text-body-xs">
                      <div class="flex justify-between border-b border-line-subtle py-1.5"><dt class="text-text-tertiary">Flight</dt><dd>{{ a.flight ? a.flight + (a.horaInicio ? ' · ' + hora(a.horaInicio) : '') : 'Por publicar' }}</dd></div>
                      @if (p.mostrarMarcas && total()) { <div class="flex justify-between py-1.5"><dt class="text-text-tertiary">Total previsto</dt><dd>{{ kg(total()) }} kg</dd></div> }
                    </dl>
                    @if (p.permiteSeguir && !a.menor) { <span class="mt-3 flex h-10 items-center justify-center rounded-md bg-accent text-label-s">Seguir · {{ a.seguidores }}</span> }
                  </div>
                </section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Área del atleta</h2>
                  <dl class="mt-3 text-body-s">
                    <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Último acceso</dt><dd>{{ a.area.ultimoAcceso ? ago(a.area.ultimoAcceso) : 'Nunca' }}</dd></div>
                    <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Enlace mágico</dt><dd>{{ a.area.enlaceEnvio ? 'enviado ' + fmtShortDate(a.area.enlaceEnvio) + (a.area.enlaceUsado ? ' · usado' : '') : 'No enviado' }}</dd></div>
                    <div class="flex justify-between gap-3 py-2"><dt class="text-text-tertiary">Altura de rack</dt><dd>{{ a.pesaje.rackSq ? 'SQ ' + a.pesaje.rackSq : '–' }}{{ a.pesaje.rackBp ? ' · BP ' + a.pesaje.rackBp : '' }}</dd></div>
                  </dl>
                </section>
              </aside>
            </div>
          }
          @case ('competicion') {
            <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_312px]">
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">Datos de competición</h2>
                <p class="mt-0.5 text-body-xs text-text-tertiary">Vienen del acta de la AEP{{ a.origen === 'manual' ? ' (este atleta se añadió a mano)' : '' }}: si los cambias aquí, el acta siguiente puede volver a cambiarlos.</p>
                <div class="mt-4 grid gap-4 md:grid-cols-2">
                  <gr-field label="Nombre" for="d-n"><input grInput id="d-n" [(ngModel)]="d.nombre" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Apellidos" for="d-a"><input grInput id="d-a" [(ngModel)]="d.apellidos" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Licencia AEP" for="d-l"><input grInput id="d-l" [(ngModel)]="d.licencia" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Fecha de nacimiento" for="d-f" [hint]="a.edad !== undefined ? a.edad + ' años el día de la competición' : null"><input grInput id="d-f" type="date" [(ngModel)]="d.fechaNacimiento" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Sexo" for="d-s"><select grInput id="d-s" [(ngModel)]="d.sexo" [disabled]="!canEdit()"><option value="F">Femenino</option><option value="M">Masculino</option></select></gr-field>
                  <gr-field label="Categoría de peso" for="d-c"><select grInput id="d-c" [(ngModel)]="d.categoria" [disabled]="!canEdit()">@for (c of categorias(); track c) { <option [value]="c">{{ cat(c) }} kg</option> }@if (!categorias().includes(d.categoria)) { <option [value]="d.categoria">{{ d.categoria }} (no válida)</option> }</select></gr-field>
                  <gr-field label="División" for="d-d"><select grInput id="d-d" [(ngModel)]="d.division" [disabled]="!canEdit()">@for (v of divisiones; track v.value) { <option [value]="v.value">{{ v.label }}</option> }</select></gr-field>
                  <gr-field label="Estado" for="d-e"><select grInput id="d-e" [(ngModel)]="d.estado" [disabled]="!canEdit()"><option value="confirmado">Confirmado</option><option value="reserva">Reserva</option><option value="baja">Baja</option></select></gr-field>
                  <gr-field label="Club" for="d-club"><input grInput id="d-club" [(ngModel)]="d.club" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Ciudad" for="d-city"><input grInput id="d-city" [(ngModel)]="d.ciudad" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Email" for="d-mail"><input grInput id="d-mail" type="email" [(ngModel)]="d.email" [disabled]="!canEdit()" /></gr-field>
                  <gr-field label="Teléfono" for="d-tel" [hint]="a.menor ? 'Menor de edad: usa el teléfono del tutor' : null"><input grInput id="d-tel" type="tel" [(ngModel)]="d.telefono" [disabled]="!canEdit()" /></gr-field>
                </div>
              </section>
              <aside class="flex flex-col gap-6">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Pesaje</h2>
                  <dl class="mt-3 text-body-s">
                    <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Peso corporal</dt><dd>{{ a.pesaje.peso ? kg(a.pesaje.peso) + ' kg' : 'Sin pesar' }}</dd></div>
                    <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Resultado</dt><dd>{{ pesajeTxt[a.pesaje.estado] }}</dd></div>
                    <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Rack</dt><dd>{{ a.pesaje.rackSq ? 'SQ ' + a.pesaje.rackSq : '–' }}{{ a.pesaje.rackBp ? ' · BP ' + a.pesaje.rackBp : '' }}</dd></div>
                    <div class="flex justify-between gap-3 py-2"><dt class="text-text-tertiary">Primeros intentos</dt><dd>{{ kg(a.pesaje.intentos.sq) }} / {{ kg(a.pesaje.intentos.bp) }} / {{ kg(a.pesaje.intentos.dl) }}</dd></div>
                  </dl>
                  @if (a.pesaje.at) { <p class="mt-2 text-body-xs text-text-tertiary">{{ a.pesaje.por }} · {{ ago(a.pesaje.at) }}</p> }
                  @if (canWeigh() && a.estado === 'confirmado') { <a grButton class="mt-4" [block]="true" icon="scale" [routerLink]="['../pesaje']" [queryParams]="{ atleta: a.id }">Ir al pesaje</a> }
                </section>
                @if (a.estado === 'reserva' && canEdit()) {
                  <section class="rounded-lg border border-info/30 bg-info/5 p-5">
                    <h2 class="text-ui-h5">Reserva · puesto {{ a.ordenReserva }}</h2>
                    <p class="mt-1 text-body-xs text-text-secondary">Al promocionarlo pasa a confirmado y le avisamos por email con el enlace a su área.</p>
                    <button grButton variant="primary" class="mt-4" [block]="true" [loading]="guardando()" (click)="promocionar()">Promocionar y avisar</button>
                  </section>
                }
                @if (canEdit()) {
                  <section class="rounded-lg border border-accent-text/30 p-5">
                    <h2 class="text-ui-h5">Borrar atleta</h2>
                    <p class="mt-1 text-body-xs text-text-secondary">Derecho de supresión: borra su ficha, perfil, avisos e historial. Para una baja normal usa el estado «Baja».</p>
                    <button grButton variant="danger" class="mt-4" [block]="true" (click)="borrar()">Borrar sus datos</button>
                  </section>
                }
              </aside>
            </div>
          }
          @case ('comunicaciones') {
            <gr-empty icon="mail" title="Aún no hay comunicaciones con este atleta" text="Los emails de su área, los avisos y las campañas que reciba aparecerán aquí." />
          }
          @case ('historial') {
            <section class="rounded-lg border border-line-subtle bg-bg-card">
              <ul>
                @for (h of historial(); track $index) {
                  <li class="flex gap-3 border-b border-line-subtle px-5 py-3 last:border-0">
                    <span class="mt-1.5 size-2 shrink-0 rounded-full bg-accent"></span>
                    <span class="min-w-0 flex-1"><span class="block text-label-s">{{ h.accion }}</span>@if (h.detalle) { <span class="block text-body-xs text-text-secondary">{{ h.detalle }}</span> }<span class="block text-body-xs text-text-tertiary">{{ h.actor }} · {{ fecha(h.at) }}</span></span>
                  </li>
                } @empty { <li class="px-5 py-8 text-center text-body-s text-text-tertiary">Sin cambios registrados.</li> }
              </ul>
            </section>
          }
        }
      }
    </div>

    @if (a && canEdit() && (tab() === 'perfil' || tab() === 'competicion') && sucio()) {
      <div class="fixed inset-x-0 bottom-0 z-40 border-t border-line-subtle bg-bg-base/95 px-5 py-3 backdrop-blur md:left-[256px]">
        <div class="mx-auto flex max-w-[1180px] items-center justify-end gap-2">
          <span class="mr-auto text-body-xs text-text-tertiary">Cambios sin guardar</span>
          <button grButton variant="ghost" (click)="descartar()">Descartar</button>
          <button grButton variant="primary" [loading]="guardando()" (click)="guardar()">Guardar cambios</button>
        </div>
      </div>
    }
  `,
})
export class AtletaFichaPage {
  readonly id = input.required<string>();
  protected readonly comps = inject(Competitions);
  private readonly api = inject(AtletasApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirmSvc = inject(Confirm);
  private readonly media = inject(Media);
  private readonly router = inject(Router);
  protected readonly estado = ESTADO;
  protected readonly cat = cat;
  protected readonly kg = kg;
  protected readonly fmtShortDate = fmtShortDate;
  protected readonly web = PUBLIC_WEB;
  protected readonly divisiones = DIVISIONES;
  protected readonly tabs: { key: Tab; label: string }[] = [{ key: 'perfil', label: 'Perfil público' }, { key: 'competicion', label: 'Competición' }, { key: 'comunicaciones', label: 'Comunicaciones' }, { key: 'historial', label: 'Historial' }];
  protected readonly lifts: { k: keyof Marcas; label: string }[] = [{ k: 'sq', label: 'Sentadilla' }, { k: 'bp', label: 'Press banca' }, { k: 'dl', label: 'Peso muerto' }];
  protected readonly crops = [{ label: '1:1 avatar', cls: 'size-14' }, { label: '4:5 ficha', cls: 'h-16 w-[51px]' }, { label: '16:9 cabecera', cls: 'h-14 w-[100px]' }];
  protected readonly incTitulo = { menor_sin_autorizacion: 'Menor de edad', categoria_invalida: 'Categoría no válida', pesaje_fuera: 'Pesaje fuera de categoría', foto_sin_consentimiento: 'Foto sin consentimiento' };
  protected readonly pesajeTxt = { pendiente: 'Sin pesar', ok: 'Dentro de categoría', fuera: 'Fuera de categoría', no_compite: 'No compite' };

  protected readonly atleta = signal<Atleta | null>(null);
  protected readonly historial = signal<Historial[]>([]);
  protected readonly noExiste = signal(false);
  protected readonly tab = signal<Tab>('perfil');
  protected readonly guardando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly conflicto = signal(false);
  private readonly rev = signal(0); // bumped when the form model is replaced or changed outside a template event
  protected p: Atleta['perfil'] = this.blankPerfil();
  protected d = this.blankDatos();
  protected registrarConsentimiento = false;

  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'atletas.editar'));
  protected readonly canWeigh = computed(() => this.auth.can(this.comps.current()?.id, 'checkin.escanear') || this.canEdit());
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    if (!a) return '';
    return [`${a.sexo} ${cat(a.categoria)} kg`, a.divisionNombre, a.club || 'Independiente', a.licencia ? `licencia ${a.licencia}` : '', a.flight ? `Flight ${a.flight}${a.horaInicio ? ' (' + this.hora(a.horaInicio) + ')' : ''}` : '']
      .filter(Boolean).join(' · ');
  });
  protected categorias(): string[] {
    return CATEGORIAS[this.d.sexo as 'F' | 'M'] ?? [];
  }
  protected readonly iniciales = computed(() => (this.atleta()?.nombreCompleto ?? '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase());
  protected fotoPublica(): boolean {
    const a = this.atleta();
    return !!a && !!this.p.fotoUrl && this.p.visible && (!!a.perfil.imagen || this.registrarConsentimiento) && (!a.menor || !!this.p.autorizacionUrl);
  }
  protected total(): number {
    const m = this.p.marcas;
    return m.sq && m.bp && m.dl ? Number(m.sq) + Number(m.bp) + Number(m.dl) : 0;
  }

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.comps.current()?.id && id) untracked(() => void this.cargar());
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('athletes.') && e.datos?.['id'] === this.id() && !this.sucio()) void this.cargar(true);
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  async cargar(silencioso = false): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    try {
      const [a, h] = await Promise.all([this.api.ficha(cid, this.id()), this.api.historial(cid, this.id())]);
      this.set(a);
      this.historial.set(h);
      this.conflicto.set(false);
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) this.noExiste.set(true);
      else if (!silencioso) this.toasts.error('No se pudo cargar la ficha', errText(e));
    }
  }

  private set(a: Atleta): void {
    this.atleta.set(a);
    this.p = structuredClone(a.perfil);
    this.d = this.datosDe(a);
    this.registrarConsentimiento = false;
    this.rev.update((v) => v + 1);
  }

  /** Plain method: re-evaluated on every change detection (form events trigger it in zoneless mode). */
  protected sucio(): boolean {
    this.rev();
    const a = this.atleta();
    if (!a) return false;
    return JSON.stringify(this.perfilBody()) !== JSON.stringify(this.perfilBody(a.perfil)) || this.registrarConsentimiento || JSON.stringify(this.d) !== JSON.stringify(this.datosDe(a));
  }

  protected descartar(): void {
    const a = this.atleta();
    if (a) this.set(a);
  }

  protected async guardar(): Promise<void> {
    const cid = this.comps.current()?.id;
    let a = this.atleta();
    if (!cid || !a) return;
    this.guardando.set(true);
    try {
      if (JSON.stringify(this.d) !== JSON.stringify(this.datosDe(a))) a = await this.api.guardarDatos(cid, a, this.d);
      if (JSON.stringify(this.perfilBody()) !== JSON.stringify(this.perfilBody(a.perfil)) || this.registrarConsentimiento) {
        a = await this.api.guardarPerfil(cid, a, { ...this.perfilBody(), registrarConsentimiento: this.registrarConsentimiento });
      }
      this.set(a);
      this.historial.set(await this.api.historial(cid, a.id));
      this.toasts.success('Ficha guardada');
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error?.code === 'CONFLICTO_EDICION') this.conflicto.set(true);
      else this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected focal(ev: MouseEvent): void {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.p.focalX = Math.round(((ev.clientX - r.left) / r.width) * 100);
    this.p.focalY = Math.round(((ev.clientY - r.top) / r.height) * 100);
    this.rev.update((v) => v + 1);
  }

  protected async subirFoto(ev: Event): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.subiendo.set(true);
    try {
      this.p.fotoUrl = await this.media.upload(f, this.atleta()?.nombreCompleto ?? '');
      this.p.focalX = 50;
      this.p.focalY = 35;
      this.rev.update((v) => v + 1);
    } catch (e) {
      this.toasts.error('No se pudo subir la foto', errText(e));
    } finally {
      this.subiendo.set(false);
    }
  }

  protected async subirAutorizacion(ev: Event): Promise<void> {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      this.p.autorizacionUrl = await this.media.upload(f, 'Autorización del tutor');
      this.rev.update((v) => v + 1);
    } catch (e) {
      this.toasts.error('No se pudo subir la autorización', errText(e));
    }
  }

  protected async enlace(): Promise<void> {
    const cid = this.comps.current()?.id;
    const a = this.atleta();
    if (!cid || !a) return;
    this.enviando.set(true);
    try {
      await this.api.enlace(cid, a.id);
      this.toasts.success('Enlace enviado', `Le llegará a ${a.email} y caduca en 30 minutos.`);
      await this.cargar(true);
    } catch (e) {
      this.toasts.error('No se pudo enviar', errText(e));
    } finally {
      this.enviando.set(false);
    }
  }

  protected async promocionar(): Promise<void> {
    const cid = this.comps.current()?.id;
    const a = this.atleta();
    if (!cid || !a) return;
    this.guardando.set(true);
    try {
      const r = await this.api.promocionar(cid, a.id, true);
      this.set(r);
      if (r.estado === 'reserva') this.toasts.success(`Plaza ofrecida a ${a.nombreCompleto}`, 'Se inscribió con pago: le hemos enviado el enlace para pagar (caduca en 24 h).');
      else this.toasts.success(`${a.nombreCompleto} ya está confirmado`, 'Le hemos enviado el email «Tienes plaza».');
    } catch (e) {
      this.toasts.error('No se pudo promocionar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async decidir(accion: 'cambiar_categoria' | 'no_compite'): Promise<void> {
    const cid = this.comps.current()?.id;
    const a = this.atleta();
    if (!cid || !a) return;
    const ok = await this.confirmSvc.ask(accion === 'cambiar_categoria'
      ? { title: `¿Pasar a ${cat(a.pesaje.sugerencia)} kg?`, text: 'Compite en la categoría que le corresponde por peso. La AEP debe confirmarlo en su acta.', confirm: 'Cambiar de categoría' }
      : { title: '¿Marcar que no compite?', text: 'Seguirá inscrito, pero no saldrá en los flights ni en la plataforma.', confirm: 'No compite', danger: true });
    if (!ok) return;
    try {
      this.set(await this.api.decidir(cid, a.id, accion));
      this.toasts.success('Decisión guardada');
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    }
  }

  protected async borrar(): Promise<void> {
    const cid = this.comps.current()?.id;
    const a = this.atleta();
    if (!cid || !a) return;
    const ok = await this.confirmSvc.ask({ title: `¿Borrar los datos de ${a.nombreCompleto}?`, text: 'Se borran su ficha, su perfil, sus avisos y su historial. No se puede deshacer.', confirm: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await this.api.borrar(cid, a.id);
      this.toasts.success('Datos borrados');
      void this.router.navigate(['/', this.comps.current()?.slug, 'atletas']);
    } catch (e) {
      this.toasts.error('No se pudo borrar', errText(e));
    }
  }

  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  }
  protected fecha(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  }
  protected ago(iso: string): string {
    return fmtAgo(iso);
  }

  private perfilBody(p = this.p) {
    const n = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));
    return {
      fotoUrl: p.fotoUrl, focalX: p.focalX, focalY: p.focalY, frase: p.frase, bio: p.bio, instagram: p.instagram, entrenador: p.entrenador, historial: p.historial,
      marcas: { sq: n(p.marcas.sq), bp: n(p.marcas.bp), dl: n(p.marcas.dl) }, visible: p.visible, mostrarMarcas: p.mostrarMarcas, permiteSeguir: p.permiteSeguir, autorizacionUrl: p.autorizacionUrl,
    };
  }
  private datosDe(a: Atleta) {
    return { licencia: a.licencia, nombre: a.nombre, apellidos: a.apellidos, email: a.email, telefono: a.telefono, sexo: a.sexo, fechaNacimiento: a.fechaNacimiento ?? '', categoria: a.categoria, division: a.division, club: a.club, ciudad: a.ciudad, estado: a.estado };
  }
  private blankPerfil(): Atleta['perfil'] {
    return { slug: '', fotoUrl: '', focalX: 50, focalY: 50, frase: '', bio: '', instagram: '', entrenador: '', historial: '', marcas: {}, visible: true, mostrarMarcas: true, permiteSeguir: true, autorizacionUrl: '' };
  }
  private blankDatos() {
    return { licencia: '', nombre: '', apellidos: '', email: '', telefono: '', sexo: 'F' as 'F' | 'M', fechaNacimiento: '', categoria: '', division: 'open', club: '', ciudad: '', estado: 'confirmado' as Atleta['estado'] };
  }
}
