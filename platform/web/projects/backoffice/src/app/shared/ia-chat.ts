import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrIcon, GrSelect } from '@grcup/ui';

export interface ChatMensaje { rol: 'usuario' | 'asistente'; texto: string }
export interface ChatModelo { id: string; nombre: string }
/** Result of the last change the assistant applied: what it changed and when (shown as a receipt). */
export interface ChatAplicada { cambios: string[]; hora: string }

/**
 * Side panel of an AI editing assistant (history, prompt bar, model choice, receipt with «Deshacer»). Generic: the
 * owner decides what a prompt does (the campaign editor has its own copy of this layout; migrate it when touched).
 * Enter sends, Shift+Enter adds a line. Nothing is saved here: the owner applies the result.
 */
@Component({
  selector: 'bo-ia-chat',
  imports: [FormsModule, GrIcon, GrSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex items-start gap-2">
      <span class="flex size-7 shrink-0 items-center justify-center rounded-pill bg-bg-raised text-text-secondary"><gr-icon name="sparkles" [size]="14" /></span>
      <div class="min-w-0 flex-1"><h2 class="text-ui-h5">{{ titulo() }}</h2><p class="text-body-xs text-text-tertiary">{{ descripcion() }}</p></div>
      <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="cerrar.emit()" aria-label="Cerrar el asistente"><gr-icon name="x" [size]="16" /></button>
    </header>
    <div class="mt-3 flex max-h-[420px] min-h-32 flex-col gap-3 overflow-y-auto" aria-live="polite">
      @for (m of mensajes(); track $index) {
        @if (m.rol === 'usuario') { <p class="max-w-[88%] self-end rounded-[14px] rounded-br-[4px] bg-bg-raised px-3 py-2 text-body-s text-text-primary [overflow-wrap:anywhere]">{{ m.texto }}</p> }
        @else { <p class="text-body-s text-text-secondary [overflow-wrap:anywhere]">{{ m.texto }}</p> }
      } @empty {
        <div class="flex flex-col gap-1.5">
          @for (e of ejemplos(); track e) {
            <button type="button" class="rounded-[10px] border border-line-subtle px-3 py-2 text-left text-body-xs text-text-secondary transition-colors hover:border-line-strong hover:bg-bg-raised hover:text-text-primary" (click)="texto.set(e)">{{ e }}</button>
          }
        </div>
      }
      @if (aplicada(); as x) {
        <div class="flex items-center gap-2 rounded-[10px] border border-line-subtle bg-bg-raised/60 px-3 py-2 text-body-xs">
          <gr-icon name="circle-check" [size]="14" class="shrink-0 text-success" />
          <span class="min-w-0 flex-1">Aplicado{{ x.cambios.length ? ' · ' + x.cambios.join(', ') : '' }} · {{ x.hora }}</span>
          <button type="button" class="shrink-0 text-label-s hover:underline" (click)="deshacer.emit()">Deshacer</button>
        </div>
      }
      @if (cargando()) { <p class="flex items-center gap-2 text-body-xs text-text-tertiary" role="status"><gr-icon name="loader" [size]="14" class="animate-spin" />Pensando y editando · {{ segundos() }} s</p> }
    </div>
    <form class="mt-3 rounded-[14px] border border-line-strong bg-bg-raised p-2 shadow-card transition-colors focus-within:border-text-tertiary" (ngSubmit)="enviarTexto()">
      <textarea name="ia" rows="1" class="block max-h-[120px] min-h-[44px] w-full resize-none bg-transparent px-1.5 py-1 text-[16px] leading-6 text-text-primary outline-none [field-sizing:content] placeholder:text-text-tertiary" [ngModel]="texto()" (ngModelChange)="texto.set($event)" [placeholder]="placeholder()" aria-label="Petición a la IA" (keydown.enter)="enter($event)"></textarea>
      <div class="mt-1 flex items-center gap-1">
        @if (modelos().length > 1) {
          <gr-select tipo="filtro" name="modelo" aria-label="Modelo de IA" [ngModel]="modelo()" (ngModelChange)="modelo.set($event)">@for (m of modelos(); track m.id) { <option [value]="m.id">{{ m.nombre }}</option> }</gr-select>
        } @else {
          <span class="flex h-7 items-center gap-1 px-1.5 text-[12px] font-medium text-text-tertiary">{{ modelos()[0]?.nombre ?? 'IA no disponible' }}</span>
        }
        <span class="flex-1"></span>
        <button type="submit" class="flex size-8 shrink-0 items-center justify-center rounded-pill transition-[background-color,transform] duration-150 enabled:active:scale-[0.94]" [class]="puede() ? 'bg-text-primary text-bg-base' : 'bg-line-strong text-text-tertiary'" [disabled]="!puede()" aria-label="Enviar a la IA"><gr-icon name="arrow-up" [size]="16" /></button>
      </div>
    </form>
    <p class="mt-2 text-body-xs text-text-muted">Enter envía · Mayús+Enter salto de línea. Los cambios no se guardan hasta que pulses «Guardar».</p>
  `,
})
export class BoIaChat {
  readonly titulo = input('Asistente IA');
  readonly descripcion = input('');
  readonly placeholder = input('Pide un cambio…');
  readonly mensajes = input<ChatMensaje[]>([]);
  readonly ejemplos = input<string[]>([]);
  readonly cargando = input(false);
  readonly segundos = input(0);
  readonly modelos = input<ChatModelo[]>([]);
  readonly aplicada = input<ChatAplicada | null>(null);
  /** Model id chosen in the panel (the owner sends it with the prompt). */
  readonly modelo = model('');
  readonly enviar = output<string>();
  readonly cerrar = output<void>();
  readonly deshacer = output<void>();

  protected readonly texto = signal('');
  protected readonly puede = computed(() => !this.cargando() && this.texto().trim().length > 0);

  protected enter(e: Event): void {
    const ke = e as KeyboardEvent;
    if (ke.shiftKey) return;
    ke.preventDefault();
    this.enviarTexto();
  }

  protected enviarTexto(): void {
    const t = this.texto().trim();
    if (!t || this.cargando()) return;
    this.texto.set('');
    this.enviar.emit(t);
  }
}
