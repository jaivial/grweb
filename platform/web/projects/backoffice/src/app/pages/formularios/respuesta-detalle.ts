import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GrAlert, GrIcon } from '@grcup/ui';
import type { RespuestaDetalle } from './api';
import { tamanoArchivo } from './formato';
import { admiteRespuesta, etiquetaCampo, valorRespuesta, type ValorRespuesta } from './valor-respuesta';

interface Linea { id: string; etiqueta: string; valor: ValorRespuesta }

/**
 * Body of an answer («Atletas» detail): a note when the answer was given on another version of the form, then each
 * question of the answered version with its answer («Sin responder» when empty). Files open in a new tab.
 */
@Component({
  selector: 'bo-respuesta-campos',
  imports: [GrAlert, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (versionDistinta(); as v) {
      <gr-alert tone="info" icon="history" title="Respondió con otra versión del formulario">
        Respondió con la versión {{ v.respondida }}; el formulario está en la versión {{ v.actual }}. Se muestran las preguntas tal como estaban al responder.
      </gr-alert>
    }

    <dl class="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle bg-bg-card">
      @for (l of lineas(); track l.id) {
        <div class="grid gap-2 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-6">
          <dt class="text-label-s text-text-secondary">{{ l.etiqueta }}</dt>
          <dd class="min-w-0 text-body-s text-text-primary">
            @switch (l.valor.kind) {
              @case ('texto') {
                @if (l.valor.largo) { <p class="break-words whitespace-pre-line">{{ l.valor.texto }}</p> }
                @else { <span class="break-words">{{ l.valor.texto }}</span> }
              }
              @case ('lista') {
                <ul class="flex flex-wrap gap-1.5">
                  @for (i of l.valor.items; track $index) { <li class="rounded-2xs border border-line-strong bg-bg-raised px-2 py-0.5 text-body-xs">{{ i }}</li> }
                </ul>
              }
              @case ('estrellas') {
                <span class="inline-flex items-center gap-2"><span class="text-accent-text tracking-wide" aria-hidden="true">{{ estrellas(l.valor.valor ?? 0, l.valor.max ?? 5) }}</span><span class="font-mono text-mono-xs text-text-tertiary">{{ l.valor.valor }} / {{ l.valor.max }}</span><span class="sr-only">{{ l.valor.valor }} de {{ l.valor.max }} estrellas</span></span>
              }
              @case ('archivos') {
                <ul class="flex flex-col gap-2">
                  @for (a of l.valor.archivos; track a.url) {
                    <li>
                      <a [href]="a.url" target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center gap-2 break-all text-accent-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] md:min-h-0">
                        <gr-icon name="download" [size]="14" />{{ a.nombre }}<span class="text-text-tertiary">({{ tamano(a.tamano) }})</span><span class="sr-only">(se abre en una pestaña nueva)</span>
                      </a>
                    </li>
                  }
                </ul>
              }
              @default { <span class="text-text-muted">Sin responder</span> }
            }
          </dd>
        </div>
      } @empty {
        <div class="px-4 py-6 text-body-s text-text-tertiary">Este formulario no tiene preguntas que responder.</div>
      }
    </dl>
  `,
})
export class BoRespuestaCampos {
  readonly detalle = input.required<RespuestaDetalle>();
  /** Current version of the form (to flag an answer given on another one). */
  readonly versionActual = input.required<number>();
  protected readonly tamano = tamanoArchivo;

  /** One line per question that takes an answer, in the form's order. */
  protected readonly lineas = computed<Linea[]>(() => {
    const d = this.detalle();
    return d.esquema.campos.filter(admiteRespuesta).map((c) => ({
      id: c.id,
      etiqueta: etiquetaCampo(c),
      valor: valorRespuesta(c, d.datos, d.archivos),
    }));
  });

  protected readonly versionDistinta = computed(() => {
    const respondida = this.detalle().version;
    const actual = this.versionActual();
    return respondida !== actual ? { respondida, actual } : null;
  });

  protected estrellas(valor: number, max: number): string {
    return '★'.repeat(Math.max(0, Math.min(valor, max))) + '☆'.repeat(Math.max(0, max - valor));
  }
}
