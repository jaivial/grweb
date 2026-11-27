import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrField, GrIcon, GrInput, GrSegmented, GrSwitch } from '@grcup/ui';
import type { Borrador, Tema } from './api';
import { DENSIDADES, TEMA_FUENTES, VARIABLES_TEXTO } from './catalogo';
import { FormularioStore } from './store';

const COLORES: { k: 'acento' | 'fondo' | 'superficie' | 'texto'; l: string }[] = [
  { k: 'acento', l: 'Acento' },
  { k: 'fondo', l: 'Fondo' },
  { k: 'superficie', l: 'Superficie de los campos' },
  { k: 'texto', l: 'Texto' },
];

/** ISO → value of a `datetime-local` input (local time); empty when null. */
function aLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Inspector shown when no field is selected: form settings (texts, close date), theme (colours, radius, font, density),
 * email texts and the WhatsApp text. Variables ({{nombre}}…) are listed where they are used.
 */
@Component({
  selector: 'bo-inspector-ajustes',
  imports: [FormsModule, GrField, GrIcon, GrInput, GrSegmented, GrSwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = borrador();
    @if (b) {
      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-4" aria-labelledby="fz-aj-t">
          <h2 id="fz-aj-t" class="text-ui-h5">Formulario</h2>
          <gr-field label="Título"><input grInput [ngModel]="b.esquema.ajustes.titulo" (ngModelChange)="ajustes({ titulo: $event }, 'titulo')" maxlength="300" /></gr-field>
          <gr-field label="Descripción" hint="Texto de introducción. **negrita** y saltos de línea"><textarea grInput rows="3" [ngModel]="b.esquema.ajustes.descripcion" (ngModelChange)="ajustes({ descripcion: $event }, 'descripcion')" maxlength="2000"></textarea></gr-field>
          <gr-field label="Texto del botón"><input grInput [ngModel]="b.esquema.ajustes.botonEnviar" (ngModelChange)="ajustes({ botonEnviar: $event }, 'boton')" maxlength="60" /></gr-field>
          <gr-field label="Mensaje al enviar"><textarea grInput rows="2" [ngModel]="b.esquema.ajustes.mensajeGracias" (ngModelChange)="ajustes({ mensajeGracias: $event }, 'gracias')" maxlength="500"></textarea></gr-field>
          <div class="flex items-center justify-between gap-3"><span class="text-label-s">Permitir cambiar la respuesta</span><gr-switch [checked]="b.esquema.ajustes.permiteEditar" (checkedChange)="ajustes({ permiteEditar: $event })" label="Permitir cambiar la respuesta" /></div>
          <gr-field label="Cierre" hint="Pasada esta fecha ya no se recogen respuestas. Vacío = sin fecha">
            <div class="flex items-center gap-2">
              <input grInput type="datetime-local" class="min-w-0 flex-1" [ngModel]="cierre(b.esquema.ajustes.cierreAt)" (ngModelChange)="cerrarEn($event)" aria-label="Fecha de cierre" />
              <button type="button" class="h-10 shrink-0 rounded-sm px-2 text-label-s text-text-secondary hover:bg-bg-raised disabled:opacity-40" [disabled]="!b.esquema.ajustes.cierreAt" (click)="cerrarEn('')">Quitar</button>
            </div>
          </gr-field>
        </section>

        <section class="flex flex-col gap-4 border-t border-line-subtle pt-5" aria-labelledby="fz-tema-t">
          <h2 id="fz-tema-t" class="text-ui-h5">Tema</h2>
          <div class="grid grid-cols-2 gap-3">
            @for (c of colores; track c.k) {
              <label class="flex flex-col gap-1.5">
                <span class="text-label-s">{{ c.l }}</span>
                <span class="flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-bg-field px-2">
                  <input type="color" class="size-6 shrink-0 cursor-pointer rounded-xs border-0 bg-transparent p-0" [value]="b.esquema.ajustes.tema[c.k]" (input)="colorTema(c.k, $any($event.target).value)" />
                  <span class="font-mono text-[13px] text-text-secondary">{{ b.esquema.ajustes.tema[c.k] }}</span>
                </span>
              </label>
            }
          </div>
          <div>
            <div class="mb-1.5 flex items-center justify-between"><label for="fz-radio" class="text-label-s">Radio de las esquinas</label><span class="font-mono text-mono-xs text-text-tertiary">{{ b.esquema.ajustes.tema.radio }} px</span></div>
            <input id="fz-radio" type="range" min="0" max="24" step="1" class="w-full accent-[#7c5cff]" [value]="b.esquema.ajustes.tema.radio" (input)="tema({ radio: +$any($event.target).value })" />
          </div>
          <div><p class="mb-1.5 text-label-s">Fuente</p><gr-segmented [options]="fuentes" [value]="b.esquema.ajustes.tema.fuente" (valueChange)="tema({ fuente: $any($event) })" label="Fuente" /></div>
          <div><p class="mb-1.5 text-label-s">Densidad</p><gr-segmented [options]="densidades" [value]="b.esquema.ajustes.tema.densidad" (valueChange)="tema({ densidad: $any($event) })" label="Densidad" /></div>
        </section>

        <section class="flex flex-col gap-4 border-t border-line-subtle pt-5" aria-labelledby="fz-email-t">
          <h2 id="fz-email-t" class="text-ui-h5">Email</h2>
          <gr-field label="Asunto"><input grInput [ngModel]="b.email.asunto" (ngModelChange)="email({ asunto: $event }, 'asunto')" maxlength="200" /></gr-field>
          <gr-field label="Texto de vista previa" hint="Lo que se ve junto al asunto en la bandeja"><input grInput [ngModel]="b.email.preheader" (ngModelChange)="email({ preheader: $event }, 'preheader')" maxlength="200" /></gr-field>
          <gr-field label="Introducción" [hint]="variables"><textarea grInput rows="3" [ngModel]="b.email.intro" (ngModelChange)="email({ intro: $event }, 'intro')" maxlength="1000"></textarea></gr-field>
        </section>

        <section class="flex flex-col gap-4 border-t border-line-subtle pt-5" aria-labelledby="fz-wa-t">
          <h2 id="fz-wa-t" class="text-ui-h5">WhatsApp</h2>
          <gr-field label="Mensaje" [hint]="variables"><textarea grInput rows="4" [ngModel]="b.whatsapp.texto" (ngModelChange)="whatsapp($event)" maxlength="1000"></textarea></gr-field>
          <p class="flex items-start gap-2 text-body-xs text-text-tertiary"><gr-icon name="info" [size]="14" class="mt-0.5 shrink-0" />El mensaje lleva el enlace a la web. Por WhatsApp nunca se envía el formulario entero.</p>
        </section>
      </div>
    }
  `,
})
export class BoInspectorAjustes {
  protected readonly store = inject(FormularioStore);
  /** The draft (the owner passes it so the template re-renders with it). */
  readonly borrador = input.required<Borrador | null>();
  protected readonly variables = `Variables: ${VARIABLES_TEXTO}`;
  protected readonly colores = COLORES;
  protected readonly fuentes = (Object.keys(TEMA_FUENTES) as (keyof typeof TEMA_FUENTES)[]).map((k) => ({ value: k, label: TEMA_FUENTES[k].l }));
  protected readonly densidades = (Object.keys(DENSIDADES) as (keyof typeof DENSIDADES)[]).map((k) => ({ value: k, label: DENSIDADES[k].l }));

  protected ajustes(p: Partial<Borrador['esquema']['ajustes']>, clave?: string): void {
    this.store.editarAjustes(p, clave ? `ajustes:${clave}` : null);
  }

  protected tema(p: Partial<Tema>): void {
    this.store.editarTema(p, null);
  }

  /** Colour pickers fire on every drag step: coalesced into one undo step per colour. */
  protected colorTema(k: 'acento' | 'fondo' | 'superficie' | 'texto', valor: string): void {
    this.store.editarTema({ [k]: valor }, `tema:${k}`);
  }

  protected email(p: Partial<Borrador['email']>, clave: string): void {
    this.store.editarEmail(p, `email:${clave}`);
  }

  protected whatsapp(texto: string): void {
    this.store.editarWhatsApp(texto, 'whatsapp');
  }

  protected cierre(iso: string | null): string {
    return aLocal(iso);
  }

  protected cerrarEn(v: string): void {
    const iso = v ? new Date(v).toISOString() : null;
    this.store.editarAjustes({ cierreAt: iso }, null);
  }
}
