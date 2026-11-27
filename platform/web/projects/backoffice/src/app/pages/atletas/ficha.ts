import { webPublica } from '../../core/web';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrTelefono, GrToasts, fmtAgo, fmtShortDate, GrSelect, telefonoValido } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { BoCount, BoToggle, Confirm, Media, errText, BoTabsMovil } from '../../shared/ui';
import { AtletasApi, CATEGORIAS, DIVISIONES, HANDLING, cat, diaFecha, kg, type Atleta, type Historial, type Marcas } from './api';
import { AccionNecesariaDialogo } from './accion-necesaria';
import { PerfilExisteDialogo } from './perfil-existe';
import { BoDatePicker } from '../../shared/kit';
import { ESTADO } from './list';
import { ESTADO_MSG, EmailsApi, type Salida } from '../emails/api';
import { PadronMatch } from './padron-match';
import { estadoPadron, personaDeAtleta } from './padron-model';
import { tabEnUrl } from '../../shared/tab-url';

type Tab = 'perfil' | 'competicion' | 'comunicaciones' | 'historial';

const PUBLIC_WEB = webPublica();

/** Athlete record (Figma page 55 · «Atletas · ficha (perfil público)»). */
@Component({
  selector: 'bo-atleta-ficha',
  imports: [PadronMatch, AccionNecesariaDialogo, PerfilExisteDialogo, BoDatePicker, BoTabsMovil, GrSelect, GrTelefono, FormsModule, RouterLink, BoCount, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
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
            <h1 class="mt-2 flex flex-wrap items-center gap-3 text-ui-h2">{{ a.nombreCompleto }} <gr-badge [tone]="estado[a.estado].tone">{{ estado[a.estado].label }}</gr-badge>
              <gr-badge [tone]="padronTag().tone" [title]="'Padrón AEP'">{{ padronTag().l }}</gr-badge></h1>
            <p class="mt-1 text-body-s text-text-tertiary">{{ subtitulo() }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            @if (a.estado === 'confirmado') { <a grButton icon="external-link" [href]="web + '/atletas/' + a.perfil.slug" target="_blank" rel="noopener">Ver en la web</a> }
            @if (canEdit() && a.estado !== 'baja') { <button grButton icon="send" [loading]="enviando()" (click)="enlace()">Enviar enlace al área</button> }
            @if (canEdit() && a.estado !== 'baja') { <button grButton icon="circle-alert" (click)="accion.set(true)">Pedir una acción</button> }
            @if (canEdit() && a.estado !== 'baja') { <button grButton icon="mail" (click)="perfil.set(true)">Enviar acceso al perfil</button> }
          </div>
        </header>
        @if (perfil()) {
          <bo-perfil-existe [ids]="[a.id]" [nombre]="a.nombreCompleto" (cerrar)="perfil.set(false)" (enviado)="perfil.set(false); cargar(true)" />
        }
        @if (accion()) {
          <bo-accion-necesaria [ids]="[a.id]" [nombre]="a.nombreCompleto" (cerrar)="accion.set(false)" (enviado)="accion.set(false); cargar(true)" />
        }

        <bo-tabs-movil label="Ficha">
        <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="Ficha">
          @for (t of tabs; track t.key) {
            <button type="button" (click)="tab.set(t.key)" [attr.aria-current]="tab() === t.key ? 'page' : null" class="relative flex h-11 shrink-0 items-center gap-2 px-3 text-label-s"
              [class]="tab() === t.key ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">{{ t.label }}
              @if (t.key === 'historial' && historial().length) { <span class="rounded-2xs bg-bg-raised px-1.5 text-mono-xs">{{ historial().length }}</span> }
              @if (tab() === t.key) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
        </nav>
        </bo-tabs-movil>

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
                    <p class="mt-4 rounded-md border border-dashed border-line-strong p-6 text-center text-body-s text-text-tertiary">Sin foto, su ficha pública solo muestra las iniciales.</p>
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
                  <h2 class="text-ui-h5">Contacto</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">Email y teléfono del atleta: con ellos entran a su área y reciben los avisos. Si la cuenta del directo usa el mismo email, sigue siendo la misma persona.</p>
                  <div class="mt-4 grid gap-4 md:grid-cols-2">
                    <gr-field label="Email" for="d-mail-p" [error]="errEmail()" [hint]="a.email ? 'Con este email entra al área' : null"><input grInput id="d-mail-p" type="email" autocomplete="email" [(ngModel)]="d.email" (ngModelChange)="errEmail.set('')" [invalid]="!!errEmail()" [attr.aria-describedby]="errEmail() ? 'd-mail-p-error' : null" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Teléfono" for="d-tel-p" [hint]="a.menor ? 'Menor de edad: el teléfono del tutor, para avisos por WhatsApp si lo consiente' : 'Se usa para avisos por WhatsApp si lo consiente'" [error]="d.telefono && !valido(d.telefono) ? 'El número no está completo.' : null">
                      <gr-telefono id="d-tel-p" tam="m" [aria-label]="'Teléfono'" [invalido]="!!d.telefono && !valido(d.telefono)" [(ngModel)]="d.telefono" [disabled]="!canEdit()" />
                    </gr-field>
                  </div>
                </section>

                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Marcas previas</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">Se muestran como «total previsto»; el atleta puede actualizarlas desde su área hasta el pesaje.</p>
                  <div class="mt-4 grid grid-cols-3 gap-3">
                    @for (m of lifts; track m.k) {
                      <gr-field [label]="m.label" [for]="'p-' + m.k" [error]="marcaErr(m.k)"><input grInput type="number" inputmode="decimal" step="2.5" min="0" max="600" [id]="'p-' + m.k" [(ngModel)]="p.marcas[m.k]" [attr.aria-invalid]="!!marcaErr(m.k) || null" [disabled]="!canEdit()" /></gr-field>
                    }
                  </div>
                </section>

                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Visibilidad y consentimientos</h2>
                  <ul class="mt-2">
                    <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Mostrar en /atletas</span><span class="block text-body-xs text-text-tertiary">Ficha pública /atletas/{{ a.perfil.slug }}{{ a.menor && !p.autorizacionUrl ? ' · no se publica hasta tener la autorización del tutor' : '' }} (nombre, club y categoría siguen en participantes y resultados)</span></span><bo-toggle [(value)]="p.visible" label="Mostrar perfil público" [disabled]="!canEdit()" /></li>
                    <li class="flex items-center justify-between gap-4 border-b border-line-subtle py-2"><span><span class="block text-label-s">Mostrar marcas previas</span><span class="block text-body-xs text-text-tertiary">Si se ocultan, la ficha solo enseña categoría y horario</span></span><bo-toggle [(value)]="p.mostrarMarcas" label="Mostrar marcas previas" [disabled]="!canEdit()" /></li>
                    <li class="flex items-center justify-between gap-4 py-2"><span><span class="block text-label-s">Permitir que le sigan</span><span class="block text-body-xs text-text-tertiary">{{ a.seguidores }} {{ a.seguidores === 1 ? 'persona recibe' : 'personas reciben' }} su hora de salida</span></span><bo-toggle [(value)]="p.permiteSeguir" label="Permitir que le sigan" [disabled]="!canEdit() || a.menor" /></li>
                  </ul>
                  @if (a.menor) {
                    <div class="mt-3 rounded-md border border-info/30 bg-info/5 p-4">
                      <p class="text-label-s text-info">Autorización del tutor ({{ a.edad != null ? a.edad + ' años' : 'sin fecha de nacimiento' }})</p>
                      @if (!p.autorizacionUrl) { <p class="mt-1 text-body-xs text-text-secondary">Sin ella, su perfil público y su foto no se muestran. Sube el documento firmado (foto o PDF).</p> }
                      @if (canEdit()) {
                        @let au = a.autorizacion;
                        @let estado = p.autorizacionUrl ? 'aprobada' : (au?.estado ?? 'sin_pedir');
                        <div class="mt-3 flex flex-col gap-2 border-t border-info/20 pt-3 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
                          <p class="text-body-xs text-text-secondary">
                            @switch (estado) {
                              @case ('enviada') { Petición enviada al tutor{{ au?.enviadaAt ? ' el ' + fecha(au!.enviadaAt!) : '' }}. Aún no ha subido la autorización. }
                              @case ('revision') { Autorización recibida, en revisión.
                                @if (au?.solicitudId) { <a [routerLink]="['/', comps.current()?.slug, 'atletas', 'solicitudes', au!.solicitudId]" class="text-accent-text underline">Revisar la solicitud</a> }
                              }
                              @case ('rechazada') { Autorización rechazada{{ au?.motivo ? ': «' + au!.motivo + '»' : '' }}. Puede subir otra con el mismo enlace. }
                              @case ('aprobada') { <span class="text-success">Autorización aprobada{{ au?.aprobadaAt ? ' · ' + fecha(au!.aprobadaAt!) : '' }}</span> }
                              @default { Aún no se ha pedido la autorización al tutor. }
                            }
                          </p>
                          @if (estado !== 'revision' && estado !== 'aprobada') {
                            <button grButton size="s" icon="send" class="shrink-0" [loading]="pidiendo()" (click)="pedirAutorizacion(estado === 'enviada' || estado === 'rechazada')">{{ estado === 'enviada' || estado === 'rechazada' ? 'Reenviar petición' : 'Pedir autorización al tutor' }}</button>
                          }
                        </div>
                      } @else if (p.autorizacionUrl) {
                        <p class="mt-1 text-body-xs text-success">Autorización aprobada{{ a.autorizacion?.aprobadaAt ? ' · ' + fecha(a.autorizacion!.aprobadaAt!) : '' }}</p>
                      }
                      @if (p.autorizacionUrl) { <a [href]="p.autorizacionUrl" target="_blank" rel="noopener" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text">Ver autorización <gr-icon name="external-link" [size]="12" /></a> }
                      @if (canEdit()) {
                        <label class="mt-2 inline-flex h-9 cursor-pointer items-center gap-1 text-label-s text-text-secondary underline" [class.ml-3]="!!p.autorizacionUrl">{{ p.autorizacionUrl ? 'Sustituir' : 'Subir autorización' }}
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
                  <!-- Avisos por WhatsApp: consentimiento que el atleta dio en el alta o al organizador -->
                  <div class="mt-4 rounded-md border border-line-subtle bg-bg-surface p-4">
                    <div class="flex items-center justify-between gap-3">
                      <p class="flex items-center gap-2 text-label-s"><gr-icon name="message" [size]="16" />Avisos por WhatsApp</p>
                      <div class="flex items-center gap-3">
                        <gr-badge [tone]="a.whatsapp ? 'success' : 'warning'">{{ a.whatsapp ? 'Confirmado' : 'Sin consentimiento' }}</gr-badge>
                        <bo-toggle [(value)]="whatsapp" label="Consentimiento de avisos por WhatsApp" [disabled]="!canEdit()" />
                      </div>
                    </div>
                    @if (a.whatsapp; as wa) {
                      <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-body-xs">
                        <dt class="text-text-tertiary">Texto aceptado</dt><dd class="truncate text-right text-mono-xs">WHATSAPP {{ wa.version || '–' }}</dd>
                        <dt class="text-text-tertiary">Origen</dt><dd class="text-right text-mono-xs uppercase">{{ wa.origen }}</dd>
                        <dt class="text-text-tertiary">Fecha</dt><dd class="text-right text-mono-xs">{{ fecha(wa.at) }} (Europe/Madrid)</dd>
                      </dl>
                    } @else {
                      <p class="mt-2 text-body-xs text-text-secondary">Sin consentimiento no le llegan avisos por WhatsApp (solo email). Actívalo si el atleta te lo dio a ti.</p>
                    }
                    @if (whatsapp !== !!a.whatsapp) { <p class="mt-2 text-body-xs text-warning">{{ whatsapp ? 'Se registrará al guardar (otorgado al organizador).' : 'Se retirará al guardar: dejará de recibir avisos por WhatsApp.' }}</p> }
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
                      <div class="flex justify-between border-b border-line-subtle py-1.5"><dt class="text-text-tertiary">Horario</dt><dd>{{ a.jornada ? diaFecha(a.jornada) + (a.horaInicio ? ' · ' + hora(a.horaInicio) : '') + (a.lote ? ' · lote ' + a.lote : '') + (a.sesion ? ' · ' + a.sesion : '') + (a.sesionNivel ? ' · ' + a.sesionNivel : '') : 'Por publicar' }}</dd></div>
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
              <div class="flex min-w-0 flex-col gap-6">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <bo-padron-match [cid]="comps.current()?.id ?? ''" [atletaId]="a.id" [persona]="persona()" [canEdit]="canEdit()"
                    [atletaVersion]="a.version" (cambiado)="cargar(true)" />
                </section>
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Datos de competición</h2>
                  <p class="mt-0.5 text-body-xs text-text-tertiary">Vienen del acta de la AEP{{ a.origen === 'manual' ? ' (este atleta se añadió a mano)' : '' }}: si los cambias aquí, el acta siguiente puede volver a cambiarlos.</p>
                  <div class="mt-4 grid gap-4 md:grid-cols-2">
                    <gr-field label="Nombre" for="d-n"><input grInput id="d-n" [(ngModel)]="d.nombre" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Apellidos" for="d-a"><input grInput id="d-a" [(ngModel)]="d.apellidos" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Licencia AEP" for="d-l" [error]="errLicencia()"><input grInput id="d-l" [(ngModel)]="d.licencia" (ngModelChange)="errLicencia.set('')" [invalid]="!!errLicencia()" [attr.aria-describedby]="errLicencia() ? 'd-l-error' : null" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Fecha de nacimiento" for="d-f" [hint]="a.edad !== undefined ? a.edad + ' años el día de la competición' : null"><bo-date-picker tipo="date" id="d-f" [(ngModel)]="d.fechaNacimiento" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Sexo" for="d-s"><gr-select id="d-s" [(ngModel)]="d.sexo" [disabled]="!canEdit()"><option value="F">Femenino</option><option value="M">Masculino</option></gr-select></gr-field>
                    <gr-field label="Categoría de peso" for="d-c"><gr-select id="d-c" [(ngModel)]="d.categoria" [disabled]="!canEdit()">@if (!d.categoria) { <option value="">Sin categoría</option> }@for (c of categorias(); track c) { <option [value]="c">{{ cat(c) }} kg</option> }@if (d.categoria && !categorias().includes(d.categoria)) { <option [value]="d.categoria">{{ d.categoria }} (no válida)</option> }</gr-select></gr-field>
                    <gr-field label="División" for="d-d"><gr-select id="d-d" [(ngModel)]="d.division" [disabled]="!canEdit()">@for (v of divisiones; track v.value) { <option [value]="v.value">{{ v.label }}</option> }</gr-select></gr-field>
                    <gr-field label="Estado" for="d-e"><gr-select id="d-e" [(ngModel)]="d.estado" [disabled]="!canEdit()"><option value="confirmado">Confirmado</option><option value="reserva">Reserva</option><option value="baja">Baja</option></gr-select></gr-field>
                    <gr-field label="Competición" for="d-p"><gr-select id="d-p" aria-label="Competición" [(ngModel)]="d.prueba" [disabled]="!canEdit()"><option value="">Aún no lo sabe</option><option value="aep2">AEP-2</option><option value="aep3">AEP-3</option></gr-select></gr-field>
                    <gr-field label="Club" for="d-club"><input grInput id="d-club" [(ngModel)]="d.club" [disabled]="!canEdit()" /></gr-field>
                    <gr-field label="Ciudad" for="d-city"><input grInput id="d-city" [(ngModel)]="d.ciudad" [disabled]="!canEdit()" /></gr-field>
                  </div>
                </section>
              </div>
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
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Handling gratis</h2>
                  @if (a.handling; as h) {
                    <dl class="mt-3 text-body-s">
                      <div class="flex justify-between gap-3 border-b border-line-subtle py-2"><dt class="text-text-tertiary">Estado</dt><dd><gr-badge [tone]="HANDLING[h.estado].tone">{{ HANDLING[h.estado].l }}</gr-badge></dd></div>
                      <div class="flex justify-between gap-3 py-2" [class.border-b]="h.motivo" [class.border-line-subtle]="h.motivo"><dt class="text-text-tertiary">Solicitado</dt><dd>{{ fmtShortDate(h.fecha) }}</dd></div>
                      @if (h.motivo) { <div class="flex justify-between gap-3 py-2"><dt class="text-text-tertiary">Motivo</dt><dd class="text-right">{{ h.motivo }}</dd></div> }
                    </dl>
                    <a grButton class="mt-4" [block]="true" [routerLink]="['/', comps.current()?.slug, 'atletas', 'solicitudes', h.id]">Ver la solicitud</a>
                  } @else {
                    <p class="mt-1 text-body-xs text-text-tertiary">No ha pedido handling gratis.</p>
                  }
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
            @if (!puedeVerComs()) {
              <gr-empty icon="lock" title="Sin permiso para ver las comunicaciones" text="Necesitas el permiso «Enviar campañas (email y WhatsApp)» en esta competición." />
            } @else if (msgs() === undefined) {
              <gr-skeleton class="h-64 rounded-lg" />
            } @else if (msgs() === null) {
              <gr-empty icon="wifi-off" title="No hemos podido cargar las comunicaciones"><button grButton (click)="cargarMensajes()">Reintentar</button></gr-empty>
            } @else if (msgs()!.items.length) {
              @let s = msgs()!;
              <section class="rounded-lg border border-line-subtle bg-bg-card">
                <ul>
                  @for (m of s.items; track m.id) {
                    <li class="flex flex-wrap items-center gap-3 border-b border-line-subtle px-5 py-3 last:border-0">
                      <gr-badge [tone]="m.canal === 'whatsapp' ? 'success' : 'info'">{{ m.canal === 'whatsapp' ? 'WhatsApp' : 'Email' }}</gr-badge>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-label-s">{{ m.asunto || m.nombre || m.plantilla }}</span>
                        <span class="block text-body-xs text-text-tertiary">{{ m.nombre || m.plantilla }} · {{ fecha(m.enviadoAt || m.createdAt) }}<span class="text-text-muted">{{ m.prueba ? ' · prueba' : '' }}</span></span>
                      </span>
                      <gr-badge [tone]="estadoMsg[m.estado].tone">{{ estadoMsg[m.estado].label }}</gr-badge>
                    </li>
                  }
                </ul>
                <p class="border-t border-line-subtle px-5 py-3 text-body-xs text-text-tertiary">@if (s.total > s.items.length) { {{ s.items.length }} de {{ s.total }} mensajes. }<a [routerLink]="['/', comps.current()?.slug, 'emails', 'salida']" class="underline hover:text-text-primary">Ver la bandeja de salida</a></p>
              </section>
            } @else {
              <gr-empty icon="mail" title="Aún no hay comunicaciones con este atleta" text="Los emails de su área, los avisos y las campañas que reciba aparecerán aquí." />
            }
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
  private readonly emailsApi = inject(EmailsApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirmSvc = inject(Confirm);
  private readonly media = inject(Media);
  private readonly router = inject(Router);
  protected readonly estado = ESTADO;
  protected readonly HANDLING = HANDLING;
  protected readonly cat = cat;
  protected readonly kg = kg;
  protected readonly valido = telefonoValido;
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
  /** Comunicaciones: undefined = sin cargar, null = error. */
  protected readonly msgs = signal<Salida | null | undefined>(undefined);
  protected readonly estadoMsg = ESTADO_MSG;
  protected readonly noExiste = signal(false);
  protected readonly tab = signal<Tab>('perfil');
  private readonly tabUrl = tabEnUrl(this.tab, () => this.tabs.map((t) => t.key));
  protected readonly guardando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly pidiendo = signal(false);
  protected readonly accion = signal(false);
  protected readonly perfil = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly conflicto = signal(false);
  /** 422 of the licence from the server, shown on its field (U06-R6-1). */
  protected readonly errLicencia = signal('');
  /** Email rechazado por el servidor (409 EMAIL_EN_USO, 422 EMAIL_INVALIDO), en su campo como la licencia. */
  protected readonly errEmail = signal('');
  private readonly rev = signal(0); // bumped when the form model is replaced or changed outside a template event
  protected p: Atleta['perfil'] = this.blankPerfil();
  protected marcaErr(k: keyof Marcas): string | null {
    const v = this.p.marcas[k] as number | string | null | undefined;
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 600 ? null : 'Entre 0 y 600 kg';
  }
  protected d = this.blankDatos();
  protected registrarConsentimiento = false;
  /** Interruptor «Avisos por WhatsApp» (se guarda con «Guardar cambios»). */
  protected whatsapp = false;

  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'atletas.editar'));
  /** La coincidencia con el padrón AEP, para la etiqueta de la cabecera (la sección la lee entera). */
  protected readonly padronTag = computed(() => estadoPadron(this.atleta()?.padron ?? { estado: 'sin' }));
  protected readonly persona = computed(() => {
    const a = this.atleta();
    return a ? personaDeAtleta(a) : { nombre: '', apellidos: '', sexo: '', categoria: '', division: '', nivel: '' };
  });
  protected readonly canWeigh = computed(() => this.auth.can(this.comps.current()?.id, 'checkin.escanear') || this.canEdit());
  /** The outbox of messaging needs its own permission. */
  protected readonly puedeVerComs = computed(() => this.auth.can(this.comps.current()?.id, 'campanas.enviar'));
  protected readonly subtitulo = computed(() => {
    const a = this.atleta();
    if (!a) return '';
    return [a.categoria ? `${a.sexo} ${cat(a.categoria)} kg` : 'Sin categoría', a.divisionNombre, a.prueba ? 'Competición ' + a.prueba.toUpperCase().replace('AEP', 'AEP-') : '', a.club || 'Independiente', a.licencia ? `licencia ${a.licencia}` : '', a.jornada ? `${diaFecha(a.jornada)}${a.horaInicio ? ' ' + this.hora(a.horaInicio) : ''}${a.sesionNivel ? ' · sesión ' + a.sesionNivel : ''}` : '']
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
    // «Comunicaciones»: the outbox rows of the athlete's email and phone, loaded when the tab opens.
    effect(() => {
      if (this.tab() === 'comunicaciones' && this.atleta() && this.puedeVerComs()) untracked(() => void this.cargarMensajes());
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

  /** Emails and WhatsApps sent to this athlete: the outbox filtered by his email and phone. */
  protected async cargarMensajes(): Promise<void> {
    const cid = this.comps.current()?.id;
    const a = this.atleta();
    if (!cid || !a) return;
    const destinos = [a.email, a.telefono].filter(Boolean);
    if (!this.puedeVerComs() || !destinos.length) {
      this.msgs.set({ items: [], total: 0, pagina: 1, por: 25, estados: {} });
      return;
    }
    try {
      this.msgs.set(await this.emailsApi.salidaDe(cid, destinos));
    } catch {
      this.msgs.set(null);
    }
  }

  private set(a: Atleta): void {
    this.atleta.set(a);
    this.p = structuredClone(a.perfil);
    this.d = this.datosDe(a);
    this.errLicencia.set('');
    this.errEmail.set('');
    this.registrarConsentimiento = false;
    this.whatsapp = !!a.whatsapp;
    this.rev.update((v) => v + 1);
  }

  /** Plain method: re-evaluated on every change detection (form events trigger it in zoneless mode). */
  protected sucio(): boolean {
    this.rev();
    const a = this.atleta();
    if (!a) return false;
    return JSON.stringify(this.perfilBody()) !== JSON.stringify(this.perfilBody(a.perfil)) || this.registrarConsentimiento || this.whatsapp !== !!a.whatsapp || JSON.stringify(this.d) !== JSON.stringify(this.datosDe(a));
  }

  protected descartar(): void {
    const a = this.atleta();
    if (a) this.set(a);
  }

  protected async guardar(): Promise<void> {
    const cid = this.comps.current()?.id;
    let a = this.atleta();
    if (!cid || !a) return;
    // U31-R1-6: out-of-range marks are flagged on the field, not sent to the API.
    const mal = this.lifts.find((m) => this.marcaErr(m.k));
    if (mal) {
      document.getElementById('p-' + mal.k)?.focus();
      return;
    }
    // A half-typed phone is flagged on its field too (the API only takes complete E.164 numbers).
    if (this.d.telefono && !telefonoValido(this.d.telefono)) {
      this.toasts.error('El teléfono no está completo', 'Elige el país y escribe el número entero en «Contacto».');
      document.getElementById('d-tel-p')?.focus();
      return;
    }
    this.guardando.set(true);
    // a new attempt replaces the error of the previous one (the toast shown is always the server's latest)
    this.toasts.items.update((l) => l.filter((t) => t.title !== 'No se pudo guardar'));
    try {
      if (JSON.stringify(this.d) !== JSON.stringify(this.datosDe(a))) a = await this.guardarDatos(cid, a);
      const cambiaWa = this.whatsapp !== !!a.whatsapp;
      if (JSON.stringify(this.perfilBody()) !== JSON.stringify(this.perfilBody(a.perfil)) || this.registrarConsentimiento || cambiaWa) {
        a = await this.api.guardarPerfil(cid, a, { ...this.perfilBody(), registrarConsentimiento: this.registrarConsentimiento, whatsapp: cambiaWa ? this.whatsapp : undefined });
      }
      this.set(a);
      this.historial.set(await this.api.historial(cid, a.id));
      this.toasts.success('Ficha guardada');
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.error?.code === 'CONFLICTO_EDICION') this.conflicto.set(true);
      else {
        if (e instanceof HttpErrorResponse && (e.error?.code === 'LICENCIA_INVALIDA' || e.error?.errors?.some?.((x: { location?: string }) => x.location === 'body.licencia'))) {
          this.errLicencia.set(e.error?.detail ?? 'Licencia no válida');
          document.getElementById('d-l')?.focus();
        } else if (e instanceof HttpErrorResponse && (e.error?.code === 'EMAIL_INVALIDO' || e.error?.code === 'EMAIL_EN_USO' || e.error?.errors?.some?.((x: { location?: string }) => x.location === 'body.email'))) {
          // TELBO-05 (422 EMAIL_INVALIDO) y email de otro atleta (409 EMAIL_EN_USO): el campo se marca, no solo el aviso
          this.errEmail.set(e.error?.detail ?? errText(e));
          document.getElementById('d-mail-p')?.focus();
        }
        this.toasts.error('No se pudo guardar', errText(e));
      }
    } finally {
      this.guardando.set(false);
    }
  }

  /** PUT of the data; a full destination competition (409 CUPO_COMPLETO) asks before forcing the place. */
  private async guardarDatos(cid: string, a: Atleta): Promise<Atleta> {
    try {
      return await this.api.guardarDatos(cid, a, this.d);
    } catch (e) {
      if (!(e instanceof HttpErrorResponse && e.error?.code === 'CUPO_COMPLETO')) throw e;
      const ok = await this.confirmSvc.ask({ title: 'Cupo completo', text: `${this.d.prueba.toUpperCase().replace('AEP', 'AEP-')} ya tiene todas sus plazas ocupadas. Si la asignas, superará el cupo.`, confirm: 'Asignar igualmente' });
      if (!ok) throw e;
      return this.api.guardarDatos(cid, a, { ...this.d, forzarCupo: true });
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

  protected async pedirAutorizacion(reenviar = false): Promise<void> {
    const cid = this.comps.current()?.id;
    const a = this.atleta();
    if (!cid || !a) return;
    if (reenviar) {
      const ok = await this.confirmSvc.ask({ title: 'Reenviar la petición', text: 'Le enviaremos otro email y WhatsApp con un enlace nuevo. El enlace anterior dejará de funcionar.', confirm: 'Reenviar' });
      if (!ok) return;
    }
    this.pidiendo.set(true);
    try {
      const r = await this.api.pedirAutorizacion(cid, a.id);
      const canales = [r.email ? 'email' : '', r.whatsapp ? 'WhatsApp' : ''].filter(Boolean).join(' y ');
      this.toasts.success(canales ? `Petición enviada por ${canales}` : 'Petición creada', canales ? undefined : 'No se ha podido enviar ni por email ni por WhatsApp.');
      await this.cargar(true);
    } catch (e) {
      this.toasts.error('No se pudo enviar la petición', errText(e));
    } finally {
      this.pidiendo.set(false);
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
      : { title: '¿Marcar que no compite?', text: 'Seguirá inscrito, pero no saldrá en los horarios ni en la tarima.', confirm: 'No compite', danger: true });
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

  protected readonly diaFecha = diaFecha;
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
    return { licencia: a.licencia, nombre: a.nombre, apellidos: a.apellidos, email: a.email, telefono: a.telefono, sexo: a.sexo, fechaNacimiento: a.fechaNacimiento ?? '', categoria: a.categoria, division: a.division, club: a.club, ciudad: a.ciudad, estado: a.estado, prueba: a.prueba ?? '' };
  }
  private blankPerfil(): Atleta['perfil'] {
    return { slug: '', fotoUrl: '', focalX: 50, focalY: 50, frase: '', bio: '', instagram: '', entrenador: '', historial: '', marcas: {}, visible: true, mostrarMarcas: true, permiteSeguir: true, autorizacionUrl: '' };
  }
  private blankDatos() {
    return { licencia: '', nombre: '', apellidos: '', email: '', telefono: '', sexo: 'F' as 'F' | 'M', fechaNacimiento: '', categoria: '', division: 'open', club: '', ciudad: '', estado: 'confirmado' as Atleta['estado'], prueba: '' };
  }
}
