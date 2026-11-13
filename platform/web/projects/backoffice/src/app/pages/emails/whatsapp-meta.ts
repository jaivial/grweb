import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts, type GrIconName } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoDrawer, errText } from '../../shared/ui';
import { EmailsApi, type EstadoWA, type WAPlantilla } from './api';

const ESTADO: Record<EstadoWA, { l: string; i: GrIconName; c: string }> = {
  APPROVED: { l: 'Aprobada por Meta', i: 'circle-check', c: 'border-success/30 bg-success/15 text-success' },
  PAUSED: { l: 'Pausada por calidad', i: 'pause', c: 'border-warning/30 bg-warning/15 text-warning' },
  REJECTED: { l: 'Rechazada · ver motivo', i: 'circle-x', c: 'border-accent/30 bg-accent-deep/40 text-accent-text' },
  PENDING: { l: 'En revisión (≤ 24 h)', i: 'clock', c: 'border-info/30 bg-info/15 text-info' },
};
interface Form { nombre: string; categoria: 'utilidad' | 'marketing'; cuerpo: string; variables: string; boton: string; url: string; uso: string; nueva: boolean }

/** «WhatsApp · plantillas Meta» (Figma 62): templates with review state, quality and use; detail with the bubble and its variables. */
@Component({
  selector: 'bo-whatsapp-meta',
  imports: [FormsModule, BoDrawer, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let ls = items();
    @if (ls === null) {
      <gr-empty icon="lock" title="No puedes ver las plantillas de WhatsApp">Hace falta el permiso de integraciones, o no hemos podido cargarlas. <button grButton class="mt-3" (click)="recargar.emit()">Reintentar</button></gr-empty>
    } @else if (ls === undefined) { <gr-skeleton class="h-96 rounded-lg" /> }
    @else {
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="flex min-w-0 flex-col gap-4">
          <ul class="flex flex-col gap-2 md:hidden">
            @for (w of ls; track w.nombre) {
              <li><button type="button" class="flex w-full flex-col gap-2 rounded-lg border bg-bg-card p-3 text-left" [class]="w.estado === 'REJECTED' ? 'border-accent/40' : selNombre() === w.nombre ? 'border-line-strong' : 'border-line-subtle'" [attr.aria-pressed]="selNombre() === w.nombre" (click)="elegir(w)">
                <span class="flex w-full items-center gap-2"><span class="min-w-0 flex-1 truncate font-mono text-mono-s">{{ w.nombre }}</span><span class="inline-flex h-6 items-center rounded-2xs border px-2 text-mono-xs uppercase" [class]="w.categoria === 'utilidad' ? 'border-info/30 bg-info/15 text-info' : 'border-accent/30 bg-accent-deep/40 text-accent-text'">{{ w.categoria }}</span></span>
                <span class="inline-flex h-8 w-fit items-center gap-1.5 rounded-pill border px-3 text-label-s" [class]="est[w.estado].c"><gr-icon [name]="est[w.estado].i" [size]="14" />{{ est[w.estado].l }}</span>
                <span class="line-clamp-2 text-body-s text-text-secondary">{{ w.uso || '—' }}</span>
              </button></li>
            } @empty { <li class="rounded-lg border border-line-subtle bg-bg-card px-4 py-10 text-center text-body-s text-text-tertiary">Sin plantillas de WhatsApp todavía.</li> }
          </ul>
          <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card max-md:hidden">
            <table class="w-full min-w-[680px] text-left text-body-m">
              <thead class="border-b border-line-subtle text-label-xs text-text-tertiary uppercase"><tr><th class="px-4 py-3 font-medium">Plantilla</th><th class="px-3 py-3 font-medium">Categoría</th><th class="px-3 py-3 font-medium">Estado</th><th class="px-3 py-3 font-medium">Uso</th></tr></thead>
              <tbody>
                @for (w of ls; track w.nombre) {
                  <tr class="cursor-pointer border-b border-line-subtle last:border-0 hover:bg-bg-raised/60" [class]="w.estado === 'REJECTED' ? 'bg-accent-deep/15' : selNombre() === w.nombre ? 'bg-bg-raised/60' : ''" (click)="elegir(w)">
                    <td class="px-4 py-3"><button type="button" class="text-left font-mono text-mono-s focus-visible:outline-none focus-visible:underline" [attr.aria-pressed]="selNombre() === w.nombre">{{ w.nombre }}</button></td>
                    <td class="px-3 py-3"><span class="inline-flex h-6 items-center rounded-2xs border px-2 text-mono-xs uppercase" [class]="w.categoria === 'utilidad' ? 'border-info/30 bg-info/15 text-info' : 'border-accent/30 bg-accent-deep/40 text-accent-text'">{{ w.categoria }}</span></td>
                    <td class="px-3 py-3"><span class="inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-label-s whitespace-nowrap" [class]="est[w.estado].c"><gr-icon [name]="est[w.estado].i" [size]="14" />{{ est[w.estado].l }}</span></td>
                    <td class="px-3 py-3 text-text-secondary"><p class="line-clamp-2">{{ w.uso || '—' }}</p>@if (w.usos30d) { <p class="text-body-xs text-text-tertiary">{{ w.usos30d }} envíos · 30 días</p> }</td>
                  </tr>
                } @empty { <tr><td colspan="4" class="px-4 py-12 text-center text-text-tertiary">Sin plantillas de WhatsApp todavía.</td></tr> }
              </tbody>
            </table>
          </section>
          @for (w of pausadas(); track w.nombre) {
            <section class="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-4" role="status">
              <gr-icon name="triangle-alert" [size]="20" class="mt-0.5 shrink-0 text-warning" />
              <div class="text-body-m"><p class="text-label-m text-warning">«{{ w.nombre }}» pausada por calidad baja</p>
                <p class="text-text-secondary">Meta la pausó tras muchos bloqueos/reportes. Revisa el texto y quién la recibe (solo seguidores que aceptaron WhatsApp).</p>
                <button type="button" class="mt-1 inline-flex min-h-9 items-center gap-1 text-label-m text-warning hover:underline" (click)="elegir(w)">Ver calidad <gr-icon name="arrow-right" [size]="14" /></button></div>
            </section>
          }
        </div>
        <div class="flex flex-col gap-4">
          @if (sel(); as w) {
            <section id="wa-detalle" class="scroll-mt-20 rounded-lg border border-line-subtle bg-bg-card p-6" aria-live="polite">
              <h2 class="text-ui-h4 break-all">{{ w.nombre }}</h2>
              <p class="mt-1 text-body-xs text-text-tertiary">{{ w.categoria === 'utilidad' ? 'Utilidad' : 'Marketing' }} · {{ w.idioma.slice(0, 2) }} · {{ sub(w) }}</p>
              <div class="mt-4 rounded-md bg-white px-3 pt-2.5 pb-2 text-[15px] leading-[21px] text-[#141011] shadow-card">
                <p class="whitespace-pre-line break-words">{{ w.cuerpo }}</p>
                @for (b of w.botones; track $index) { <p class="mt-2 border-t border-[#e6e1e2] pt-2 text-center text-[14px] font-semibold text-[#0a7cff]">{{ b.texto }}</p> }
                <p class="mt-1 flex items-center justify-end gap-1 text-[12px] text-[#8a8183]">{{ horaAhora }} <gr-icon name="check-check" [size]="14" class="text-[#53bdeb]" /></p>
              </div>
              @if (w.variables.length) {
                <dl class="mt-3">
                  @for (v of w.variables; track $index) { <div class="flex items-center justify-between gap-3 border-b border-line-subtle py-2.5 text-body-s"><dt class="font-mono text-text-tertiary">{{ '{{' + ($index + 1) + '}}' }}</dt><dd class="font-mono text-mono-s text-text-secondary">{{ v }}</dd></div> }
                </dl>
              }
              @if (w.estado === 'REJECTED') { <p class="mt-3 rounded-md border border-accent/40 bg-accent-deep/20 p-3 text-body-s"><span class="text-label-s text-accent-text">Motivo de Meta:</span> {{ w.motivo || 'Sin motivo indicado' }}</p> }
              @if (w.calidad) { <p class="mt-3 text-body-xs text-text-tertiary">Calidad: <span [class]="w.calidad === 'LOW' ? 'text-warning' : w.calidad === 'HIGH' ? 'text-success' : 'text-text-secondary'">{{ calidad(w.calidad) }}</span> · {{ w.usos30d }} envíos en 30 días · versión {{ w.version }}</p> }
              @if (w.estado !== 'PENDING') { <button grButton class="mt-4 w-full" icon="send" (click)="editar(w)">{{ w.estado === 'APPROVED' ? 'Editar y enviar a revisión' : 'Corregir y reenviar' }}</button> }
            </section>
          }
          <section class="flex items-start gap-3 rounded-lg border border-[#6e5bd6]/50 bg-[#6e5bd6]/10 p-4">
            <gr-icon name="scale" [size]="18" class="mt-0.5 shrink-0 text-[#a99bf2]" />
            <div class="text-body-s"><p class="text-label-m text-[#a99bf2]">WhatsApp solo con opt-in del canal</p>
              <p class="mt-1 text-text-secondary">Incluso las plantillas de utilidad exigen que la persona haya aceptado recibir WhatsApp. Coste por conversación según categoría (Meta).</p></div>
          </section>
        </div>
      </div>
    }

    <bo-drawer [(open)]="formOpen" [title]="f().nueva ? 'Nueva plantilla de WhatsApp' : 'Enviar a revisión'" [sub]="f().nueva ? '' : f().nombre">
      <form id="wa-form" class="flex flex-col gap-4" (ngSubmit)="enviar()">
        @if (f().nueva) {
          <gr-field label="Nombre" for="wa-n" hint="Minúsculas, números y _ (así la ve Meta)"><input grInput id="wa-n" name="n" required pattern="[a-z0-9_]{3,60}" maxlength="60" [ngModel]="f().nombre" (ngModelChange)="set('nombre', $event)" /></gr-field>
        }
        <fieldset class="flex flex-col gap-2"><legend class="mb-2 text-label-s">Categoría</legend>
          <div class="flex gap-2">
            @for (c of ['utilidad', 'marketing']; track c) {
              <label class="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border text-label-s has-[:checked]:border-accent-text has-[:checked]:bg-accent-deep/40 has-[:focus-visible]:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" [class]="f().categoria === c ? '' : 'border-line-strong text-text-secondary'">
                <input type="radio" class="sr-only" name="cat" [value]="c" [ngModel]="f().categoria" (ngModelChange)="set('categoria', $event)" />{{ c === 'utilidad' ? 'Utilidad' : 'Marketing' }}</label>
            }
          </div>
        </fieldset>
        <gr-field label="Texto" for="wa-c" hint="Variables posicionales: {{ '{{1}}' }}, {{ '{{2}}' }}…"><textarea grInput id="wa-c" name="c" rows="6" required maxlength="1024" [ngModel]="f().cuerpo" (ngModelChange)="set('cuerpo', $event)"></textarea></gr-field>
        <gr-field label="Qué es cada variable" for="wa-v" hint="En orden, separadas por comas: nombre, flight · hora"><input grInput id="wa-v" name="v" maxlength="300" [ngModel]="f().variables" (ngModelChange)="set('variables', $event)" /></gr-field>
        <div class="grid grid-cols-2 gap-2">
          <gr-field label="Botón (opcional)" for="wa-b"><input grInput id="wa-b" name="b" maxlength="25" [ngModel]="f().boton" (ngModelChange)="set('boton', $event)" /></gr-field>
          <gr-field label="Enlace del botón" for="wa-u"><input grInput id="wa-u" name="u" type="url" maxlength="300" placeholder="https://" [ngModel]="f().url" (ngModelChange)="set('url', $event)" /></gr-field>
        </div>
        <gr-field label="Uso" for="wa-us" hint="Cuándo se envía (para el equipo)"><input grInput id="wa-us" name="us" maxlength="80" [ngModel]="f().uso" (ngModelChange)="set('uso', $event)" /></gr-field>
        @if (error()) { <p class="text-body-s text-accent-text" role="alert">{{ error() }}</p> }
        <p class="text-body-xs text-text-tertiary">Meta la revisa (normalmente en menos de 24 h). Mientras tanto no se puede usar; la versión aprobada anterior deja de enviarse.</p>
      </form>
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="formOpen.set(false)">Cancelar</button>
        <button grButton variant="primary" type="submit" form="wa-form" [loading]="enviando()">Enviar a revisión</button>
      </ng-container>
    </bo-drawer>
  `,
})
export class WhatsAppMeta {
  private readonly api = inject(EmailsApi);
  private readonly toasts = inject(GrToasts);
  private readonly comps = inject(Competitions);
  readonly items = input<WAPlantilla[] | null | undefined>(undefined);
  readonly cambio = output<WAPlantilla[]>();
  readonly recargar = output<void>();
  protected readonly est = ESTADO;
  protected readonly horaAhora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  private readonly elegida = signal<string | null>(null);
  protected readonly sel = computed(() => {
    const l = this.items() ?? [];
    return l.find((w) => w.nombre === this.elegida()) ?? l.find((w) => w.estado === 'PAUSED') ?? l[0] ?? null;
  });
  protected readonly selNombre = computed(() => this.sel()?.nombre ?? '');
  protected readonly pausadas = computed(() => (this.items() ?? []).filter((w) => w.estado === 'PAUSED'));
  protected readonly formOpen = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly f = signal<Form>({ nombre: '', categoria: 'marketing', cuerpo: '', variables: '', boton: '', url: '', uso: '', nueva: true });

  protected elegir(w: WAPlantilla): void {
    this.elegida.set(w.nombre);
    // below lg the detail sits under the list
    if (window.innerWidth < 1024) setTimeout(() => document.getElementById('wa-detalle')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  protected sub(w: WAPlantilla): string {
    const d = (iso: string) => new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' }).format(new Date(iso));
    if (w.estado === 'APPROVED') return 'aprobada ' + d(w.aprobadaAt ?? w.updatedAt);
    if (w.estado === 'PENDING') return 'enviada ' + d(w.updatedAt);
    return (w.estado === 'PAUSED' ? 'pausada ' : 'rechazada ') + d(w.updatedAt);
  }
  protected calidad(c: string): string {
    return { HIGH: 'alta', MEDIUM: 'media', LOW: 'baja' }[c] ?? c.toLowerCase();
  }
  protected set<K extends keyof Form>(k: K, v: Form[K]): void {
    this.f.update((f) => ({ ...f, [k]: v }));
  }
  nueva(): void {
    this.error.set('');
    this.f.set({ nombre: '', categoria: 'marketing', cuerpo: '', variables: '', boton: '', url: '', uso: '', nueva: true });
    this.formOpen.set(true);
  }
  protected editar(w: WAPlantilla): void {
    this.error.set('');
    const b = w.botones[0];
    this.f.set({ nombre: w.nombre, categoria: w.categoria, cuerpo: w.cuerpo, variables: w.variables.join(', '), boton: b?.texto ?? '', url: b?.url ?? '', uso: w.uso, nueva: false });
    this.formOpen.set(true);
  }
  protected async enviar(): Promise<void> {
    const f = this.f();
    if (!/^[a-z0-9_]{3,60}$/.test(f.nombre)) return this.error.set('El nombre solo admite minúsculas, números y _ (3–60).');
    if (!f.cuerpo.trim()) return this.error.set('Escribe el texto del mensaje.');
    if (f.boton && !f.url.startsWith('https://')) return this.error.set('El enlace del botón debe empezar por https://');
    if (f.nueva && (this.items() ?? []).some((w) => w.nombre === f.nombre)) return this.error.set('Ya hay una plantilla con ese nombre.');
    this.error.set('');
    this.enviando.set(true);
    try {
      const cid = this.comps.current()?.id ?? '';
      const w = await this.api.waRevision(cid, f.nombre, {
        categoria: f.categoria, cuerpo: f.cuerpo.trim(), uso: f.uso.trim(),
        variables: f.variables.split(',').map((v) => v.trim()).filter(Boolean),
        botones: f.boton ? [{ tipo: 'url', texto: f.boton.trim(), url: f.url.trim() }] : [],
      });
      const l = (this.items() ?? []).filter((x) => x.nombre !== w.nombre);
      this.cambio.emit([...l, w]);
      this.elegida.set(w.nombre);
      this.formOpen.set(false);
      this.toasts.success('Enviada a revisión', 'Te avisamos aquí cuando Meta responda.');
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
