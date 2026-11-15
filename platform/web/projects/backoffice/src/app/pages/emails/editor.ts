import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts, type GrIconName } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { BoDrawer, BoPageHeader, Confirm, errText } from '../../shared/ui';
import { EmailsApi, type Contenido, type PlantillaDetalle, type Render } from './api';

type Campo = keyof Contenido;
type Vista = 'diseno' | 'previa' | 'html' | 'texto';
const LOGO = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo-2026.png';
const CAPAS: { k: Campo; l: string; tipo: string; i: GrIconName }[] = [
  { k: 'asunto', l: 'Asunto', tipo: 'Asunto', i: 'mail' }, { k: 'preheader', l: 'Texto de previsualización', tipo: 'Preheader', i: 'eye' },
  { k: 'titulo', l: 'Título', tipo: 'Título', i: 'heading' }, { k: 'imagen', l: 'Imagen', tipo: 'Imagen', i: 'image' }, { k: 'cuerpo', l: 'Texto', tipo: 'Texto', i: 'type' },
  { k: 'botonTexto', l: 'Botón', tipo: 'Botón', i: 'pointer' }, { k: 'pie', l: 'Pie', tipo: 'Pie', i: 'file-text' }, { k: 'nota', l: 'Nota del pie', tipo: 'Nota', i: 'info' },
];
const MAX: Record<Campo, number> = { asunto: 160, preheader: 160, titulo: 120, cuerpo: 4000, botonTexto: 40, botonUrl: 300, pie: 400, nota: 300, imagen: 500 };
const ENLACES = ['/entradas', '/horarios', '/atletas', '/mi-entrada', '/area-atleta'];
const RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function distancia(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** Template editor (Figma 62 · «Emails · editor»): same visual editor as campaigns with the transactional profile (variables, no marketing blocks). */
@Component({
  selector: 'bo-plantilla-editor',
  imports: [FormsModule, RouterLink, BoPageHeader, BoDrawer, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`.lienzo p { margin: 0 } .lienzo strong { color: #141011 }`],
  template: `
    @let p = plantilla();
    <div class="mx-auto flex max-w-[1400px] flex-col gap-5 pb-24">
      @if (p === undefined) { <gr-skeleton class="h-16 rounded-md" /><gr-skeleton class="h-[600px] rounded-lg" /> }
      @else if (p === null) { <gr-empty icon="mail" title="Esta plantilla no existe"><a grButton [routerLink]="['/', comps.current()?.slug, 'emails']">Volver a las plantillas</a></gr-empty> }
      @else {
        <bo-page-header [title]="p.info.nombre" [subtitle]="p.info.disparador + (p.updatedPor ? ' · editada por ' + p.updatedPor : '')" [crumbs]="[comps.current()?.nombreCorto || '', 'Público', 'Emails y avisos', 'Plantillas']"
          [badge]="desconocidas().length || p.info.estado === 'error' ? 'Error' : p.info.estado === 'pausada' ? 'Pausada' : sucio() ? 'Sin guardar' : ''" [badgeTone]="desconocidas().length || p.info.estado === 'error' ? 'danger' : 'warning'">
          <ng-container actions>
            @if (p.info.personalizada) { <button grButton variant="ghost" icon="undo" (click)="restaurar()">Diseño original</button> }
            @if (!p.info.esencial) { <button grButton variant="ghost" [icon]="p.info.estado === 'pausada' ? 'play' : 'pause'" (click)="pausar()">{{ p.info.estado === 'pausada' ? 'Reactivar' : 'Pausar' }}</button> }
            <button grButton (click)="pruebaOpen.set(true)">Enviar prueba</button>
            <button grButton variant="primary" [loading]="guardando()" [disabled]="desconocidas().length > 0 || (!sucio() && p.info.estado !== 'error')" (click)="guardar()">Guardar y activar</button>
          </ng-container>
        </bo-page-header>

        @if (desconocidas()[0]; as v) {
          <section class="flex items-start gap-3 rounded-lg border border-accent/50 bg-accent-deep/25 p-4" role="alert">
            <gr-icon name="circle-x" [size]="20" class="mt-0.5 shrink-0 text-accent-text" />
            <div class="text-body-m"><p class="text-label-m text-accent-text">La variable {{ llaves(v) }} no existe</p>
              <p class="text-text-secondary">@if (sugerencia(v); as s) { ¿Querías decir {{ llaves(s) }}? }{{ p.info.estado === 'error' ? 'La plantilla está pausada hasta corregirlo; las demás siguen enviándose.' : 'Corrígela antes de guardar: la versión guardada sigue activa.' }}</p>
              @if (sugerencia(v); as s) { <button type="button" class="mt-1 inline-flex min-h-9 items-center gap-1 text-label-m text-accent-text hover:underline" (click)="sustituir(v, s)">Sustituir <gr-icon name="arrow-right" [size]="14" /></button> }</div>
          </section>
        } @else if (p.info.estado === 'error' || errorVar()) {
          <section class="flex items-start gap-3 rounded-lg border border-accent/50 bg-accent-deep/25 p-4" role="alert">
            <gr-icon name="circle-x" [size]="20" class="mt-0.5 shrink-0 text-accent-text" />
            <div class="text-body-m"><p class="text-label-m text-accent-text">{{ errorVar() || p.info.error || 'La plantilla tiene un error' }}</p>
              <p class="text-text-secondary">La plantilla está pausada hasta corregirlo; las demás siguen enviándose. Sus mensajes esperan en la cola.</p></div>
          </section>
        }

        <section class="flex min-w-0 flex-col rounded-lg border border-line-subtle bg-bg-card">
          <header class="flex flex-wrap items-center gap-2 border-b border-line-subtle p-3">
            <button type="button" class="hidden size-10 items-center justify-center rounded-md border xl:flex" [class]="panel() ? 'border-accent/40 bg-accent-deep/40 text-accent-text' : 'border-line-strong text-text-tertiary'" [attr.aria-pressed]="panel()" aria-label="Panel de capas y variables" (click)="panel.set(!panel())"><gr-icon name="panel-left" [size]="16" /></button>
            <div class="flex gap-1 rounded-md border border-line-subtle bg-bg-deep p-1" role="group" aria-label="Vista">
              @for (v of vistas; track v.v) { <button type="button" class="flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-label-s whitespace-nowrap sm:px-3" [class]="vista() === v.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="vista() === v.v" [attr.aria-label]="v.l" (click)="cambiarVista(v.v)"><gr-icon [name]="v.i" [size]="14" /><span class="max-sm:hidden">{{ v.l }}</span></button> }
            </div>
            <div class="flex gap-1 rounded-md border border-line-subtle bg-bg-deep p-1" role="group" aria-label="Dispositivo">
              @for (d of dispositivos; track d.w) { <button type="button" class="flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-label-s" [class]="ancho() === d.w ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-pressed]="ancho() === d.w" [attr.aria-label]="d.l" (click)="ancho.set(d.w)"><gr-icon [name]="d.i" [size]="15" />@if (d.w === 600) { <span class="max-sm:hidden">{{ d.l }}</span> }</button> }
            </div>
            <span class="ml-auto flex">
            <button type="button" class="flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-bg-raised disabled:opacity-40" [disabled]="!atras.length" aria-label="Deshacer" (click)="deshacer()"><gr-icon name="undo" [size]="16" /></button>
            <button type="button" class="flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-bg-raised disabled:opacity-40" [disabled]="!adelante.length" aria-label="Rehacer" (click)="rehacer()"><gr-icon name="redo" [size]="16" /></button>
            </span>
          </header>

          <div class="grid grid-cols-1" [class]="panel() ? 'xl:grid-cols-[240px_minmax(0,1fr)_300px]' : 'xl:grid-cols-[minmax(0,1fr)_300px]'">
            @if (panel()) {
              <aside class="border-b border-line-subtle xl:border-r xl:border-b-0">
                <div class="flex gap-1 border-b border-line-subtle p-2" role="tablist">
                  @for (t of [{ v: 'capas', l: 'Capas', i: 'list' }, { v: 'variables', l: 'Variables', i: 'code' }]; track t.v) {
                    <button type="button" role="tab" class="flex h-9 items-center gap-1.5 rounded-sm px-3 text-label-s" [class]="izq() === t.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-selected]="izq() === t.v" (click)="izq.set($any(t.v))"><gr-icon [name]="$any(t.i)" [size]="14" />{{ t.l }}</button>
                  }
                </div>
                <div class="p-3">
                  @if (izq() === 'variables') {
                    <p class="text-label-xs text-text-tertiary uppercase">Variables</p>
                    <ul class="mt-2 flex flex-wrap gap-1.5 xl:flex-col">
                      @for (v of p.variables; track v) {
                        <li><button type="button" class="w-full rounded-sm bg-bg-raised px-3 py-2 text-left font-mono text-mono-s hover:bg-line-subtle" (click)="insertar(v)" [title]="'Insertar en ' + nombreCampo() + ' · ejemplo: ' + (p.ejemplo[v] ?? '')">{{ llaves(v) }}</button></li>
                      }
                    </ul>
                    <p class="mt-3 text-body-xs text-text-tertiary">Pulsa para insertarla en «{{ nombreCampo() }}». Un párrafo con una variable vacía no se muestra.</p>
                  } @else {
                    <p class="text-label-xs text-text-tertiary uppercase">Capas</p>
                    <ul class="mt-2 flex flex-col gap-0.5">
                      @for (c of capas; track c.k) {
                        <li><button type="button" class="flex h-10 w-full items-center gap-2 rounded-sm px-2 text-left text-body-s" [class]="campo() === c.k || (c.k === 'botonTexto' && campo() === 'botonUrl') ? 'bg-accent-deep/40 text-text-primary' : 'text-text-secondary hover:bg-bg-raised'" (click)="elegir(c.k)">
                          <gr-icon [name]="c.i" [size]="14" /><span class="flex-1 truncate">{{ c.l }}</span>@if (malos(c.k)) { <gr-icon name="circle-alert" [size]="14" class="text-accent-text" /> }</button></li>
                      }
                    </ul>
                  }
                </div>
              </aside>
            }

            <div class="flex min-w-0 flex-col items-center gap-3 bg-bg-deep px-3 py-6 md:px-6">
              <p class="font-mono text-mono-xs tracking-[0.12em] text-text-tertiary uppercase">{{ etiquetaAncho() }} · email {{ ancho() }} px</p>
              @switch (vista()) {
                @case ('diseno') {
                  <div class="lienzo w-full overflow-hidden rounded-md bg-white text-[#141011] shadow-card transition-[max-width] motion-reduce:transition-none" [style.max-width.px]="ancho()">
                    <button type="button" class="relative block w-full border-b border-[#e6e1e2] bg-[#f6f3f3] px-4 py-2 text-left outline-offset-[-2px]" [class]="marco('asunto')" (click)="elegir('asunto')">
                      <span class="block truncate text-[13px] font-semibold" [innerHTML]="vis(c().asunto)"></span><span class="block truncate text-[12px] text-[#6b6264]" [innerHTML]="vis(c().preheader) || '—'"></span>
                    </button>
                    <div class="flex justify-center bg-[#141011] py-4"><img [src]="p.logo || logo" alt="GR Cup" class="h-9 w-auto" /></div>
                    <div class="flex flex-col gap-3 px-6 py-6 text-center">
                      <button type="button" class="relative rounded-xs text-[22px] leading-7 font-bold outline-offset-2" [class]="marco('titulo')" (click)="elegir('titulo')"><span [innerHTML]="vis(c().titulo)"></span>@if (malos('titulo')) { <span class="absolute -bottom-5 left-0 bg-[#e6606b] px-1.5 font-mono text-[10px] text-white">TÍTULO · VARIABLE DESCONOCIDA</span> }</button>
                      @if (c().imagen || campo() === 'imagen') {
                        <button type="button" class="relative mx-auto flex min-h-24 w-full items-center justify-center rounded-xs bg-[#f2eeee] text-[12px] text-[#6b6264] outline-offset-2" [class]="marco('imagen')" (click)="elegir('imagen')">{{ c().imagen ? 'Imagen · ' + c().imagen : 'Sin imagen' }}</button>
                      }
                      <button type="button" class="relative flex flex-col gap-2 rounded-xs text-[15px] leading-[22px] text-[#3d3537] outline-offset-2" [class]="marco('cuerpo')" (click)="elegir('cuerpo')">
                        @for (par of parrafos(); track $index) { <p [innerHTML]="par"></p> }
                        @if (malos('cuerpo')) { <span class="absolute -bottom-5 left-0 bg-[#e6606b] px-1.5 font-mono text-[10px] text-white">TEXTO · VARIABLE DESCONOCIDA</span> }
                      </button>
                      @if (c().botonTexto) {
                        <button type="button" class="relative mx-auto mt-2 rounded-xs outline-offset-4" [class]="marco('botonTexto')" (click)="elegir('botonTexto')"><span class="inline-block rounded-[8px] bg-[#c42b3e] px-5 py-3 text-[15px] font-semibold text-white" [innerHTML]="vis(c().botonTexto)"></span></button>
                      }
                      <button type="button" class="relative mt-2 rounded-xs text-[13px] leading-5 text-[#6b6264] outline-offset-2" [class]="marco('pie')" (click)="elegir('pie')"><span [innerHTML]="vis(c().pie) || 'Pie'"></span></button>
                    </div>
                    <button type="button" class="block w-full bg-[#f2eeee] px-6 py-3 text-center text-[12px] text-[#6b6264] outline-offset-[-2px]" [class]="marco('nota')" (click)="elegir('nota')"><span [innerHTML]="vis(c().nota) || (p.info.esencial ? 'Email operativo · no lleva baja de marketing' : 'Nota del pie (la de la plataforma)')"></span></button>
                  </div>
                }
                @case ('previa') { @if (html(); as h) { <iframe title="Vista previa" sandbox="" class="h-[640px] w-full rounded-md bg-white" [style.max-width.px]="ancho()" [srcdoc]="h"></iframe> } @else { <gr-skeleton class="h-[640px] w-full rounded-md" /> } }
                @case ('html') { <pre class="h-[640px] w-full overflow-auto rounded-md bg-bg-card p-3 font-mono text-mono-xs whitespace-pre-wrap text-text-secondary">{{ render()?.html }}</pre> }
                @case ('texto') { <pre class="h-[640px] w-full overflow-auto rounded-md bg-bg-card p-4 font-mono text-body-s whitespace-pre-wrap text-text-secondary">{{ render()?.texto }}</pre> }
              }
              <p class="text-body-xs text-text-tertiary">Con datos de ejemplo · pulsa un elemento para editarlo</p>
            </div>

            <aside class="flex flex-col border-t border-line-subtle xl:border-t-0 xl:border-l">
              <div class="border-b border-line-subtle p-4">
                <p class="text-label-xs text-accent-text uppercase">{{ capa().tipo }}</p>
                <p class="mt-1 line-clamp-3 text-label-m">{{ resumenCampo() }}</p>
              </div>
              <div class="flex flex-col gap-3 p-4">
                <p class="text-label-xs text-text-tertiary uppercase">Contenido</p>
                @if (campo() === 'botonTexto' || campo() === 'botonUrl') {
                  <gr-field label="Texto" for="e-bt"><input grInput id="e-bt" [maxlength]="max.botonTexto" [ngModel]="c().botonTexto" (ngModelChange)="editar('botonTexto', $event)" (focus)="campo.set('botonTexto')" [class.!border-accent]="malos('botonTexto')" /></gr-field>
                  <gr-field label="Enlace (URL)" for="e-bu"><input grInput id="e-bu" [maxlength]="max.botonUrl" [ngModel]="c().botonUrl" (ngModelChange)="editar('botonUrl', $event)" (focus)="campo.set('botonUrl')" [class.!border-accent]="malos('botonUrl')" /></gr-field>
                  @if (malos('botonTexto') || malos('botonUrl')) { <p class="-mt-1 text-body-xs text-accent-text">Variable desconocida: {{ llaves(malosDe('botonTexto')[0] || malosDe('botonUrl')[0]) }}</p> }
                  <div class="flex flex-wrap gap-1.5">@for (l of enlaces; track l) { <button type="button" class="h-7 rounded-2xs border border-line-strong px-2 font-mono text-mono-xs text-text-secondary uppercase hover:text-text-primary" (click)="editar('botonUrl', l)">{{ l }}</button> }</div>
                } @else {
                  @let k = campo();
                  <gr-field [label]="capa().l" for="e-campo" [hint]="k === 'cuerpo' ? 'Una línea en blanco separa párrafos · **negrita**' : k === 'imagen' ? 'Una URL, normalmente una variable · opcional' : k === 'nota' ? 'Por qué recibe este email · opcional' : ''">
                    @if (k === 'cuerpo' || k === 'pie' || k === 'nota') { <textarea grInput id="e-campo" [rows]="k === 'cuerpo' ? 10 : 3" [maxlength]="max[k]" [ngModel]="c()[k]" (ngModelChange)="editar(k, $event)" [class.!border-accent]="malos(k)"></textarea> }
                    @else { <input grInput id="e-campo" [maxlength]="max[k]" [ngModel]="c()[k]" (ngModelChange)="editar(k, $event)" [class.!border-accent]="malos(k)" /> }
                  </gr-field>
                  @if (malos(k)) { <p class="-mt-1 text-body-xs text-accent-text">Variable desconocida: {{ llaves(malosDe(k)[0]) }}</p> }
                }
                @if (p.wa; as wa) {
                  <div class="mt-2 rounded-md border border-line-subtle bg-bg-raised p-3">
                    <p class="text-label-xs text-text-muted uppercase">Versión de WhatsApp</p>
                    <p class="mt-1 text-body-xs whitespace-pre-line text-text-secondary">{{ wa.texto }}</p>
                    @if (wa.imagen) { <p class="mt-1 text-body-xs text-text-tertiary">El mensaje lleva la imagen (la foto de la solicitud).</p> }
                  </div>
                }
              </div>
            </aside>
          </div>
        </section>
      }
    </div>
    <bo-drawer [(open)]="pruebaOpen" title="Enviar prueba">
      <div class="flex flex-col gap-3">
        <gr-field label="Enviar a" for="pr-d"><input grInput id="pr-d" type="email" [(ngModel)]="destino" /></gr-field>
        <p class="text-body-xs text-text-tertiary">Con los datos de ejemplo y el asunto marcado como «[Prueba]». Se envía el diseño guardado{{ sucio() ? ' (tus cambios sin guardar no van)' : '' }}.</p>
      </div>
      <ng-container drawerActions><button grButton variant="ghost" (click)="pruebaOpen.set(false)">Cancelar</button><button grButton variant="primary" [loading]="enviando()" (click)="prueba()">Enviar</button></ng-container>
    </bo-drawer>
  `,
})
export class PlantillaEditorPage {
  private readonly api = inject(EmailsApi);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly route = inject(ActivatedRoute);
  private readonly san = inject(DomSanitizer);
  protected readonly comps = inject(Competitions);
  protected readonly logo = LOGO;
  protected readonly capas = CAPAS;
  protected readonly max = MAX;
  protected readonly enlaces = ENLACES;
  protected readonly vistas: { v: Vista; l: string; i: GrIconName }[] = [{ v: 'diseno', l: 'Diseño', i: 'pen-tool' }, { v: 'previa', l: 'Vista previa', i: 'eye' }, { v: 'html', l: 'HTML', i: 'code' }, { v: 'texto', l: 'Texto', i: 'file-text' }];
  protected readonly dispositivos: { w: number; l: string; i: GrIconName }[] = [{ w: 600, l: 'Escritorio', i: 'monitor' }, { w: 480, l: 'Tablet', i: 'tablet' }, { w: 375, l: 'Móvil', i: 'smartphone' }];
  protected readonly plantilla = signal<PlantillaDetalle | null | undefined>(undefined);
  protected readonly c = signal<Contenido>({ asunto: '', preheader: '', titulo: '', cuerpo: '', botonTexto: '', botonUrl: '', pie: '', nota: '', imagen: '' });
  protected readonly render = signal<Render | null>(null);
  protected readonly html = signal<SafeHtml | null>(null);
  protected readonly vista = signal<Vista>('diseno');
  protected readonly ancho = signal(600);
  protected readonly panel = signal(true);
  protected readonly izq = signal<'capas' | 'variables'>('variables');
  protected readonly campo = signal<Campo>('cuerpo');
  protected readonly sucio = signal(false);
  protected readonly errorVar = signal('');
  protected readonly guardando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly pruebaOpen = signal(false);
  protected atras: Contenido[] = [];
  protected adelante: Contenido[] = [];
  protected destino = '';
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  private readonly vars = computed(() => new Set(this.plantilla()?.variables ?? []));
  protected readonly desconocidas = computed(() => [...new Set(Object.keys(this.c()).flatMap((k) => this.malosDe(k as Campo)))]);
  protected readonly capa = computed(() => CAPAS.find((x) => x.k === (this.campo() === 'botonUrl' ? 'botonTexto' : this.campo())) ?? CAPAS[4]);
  protected readonly parrafos = computed(() => this.c().cuerpo.split(/\n\s*\n/).filter((s) => s.trim()).map((s) => this.vis(s)));
  private t?: ReturnType<typeof setTimeout>;
  private tHist?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destino = this.auth.user()?.email ?? '';
    effect(() => {
      if (this.cid()) untracked(() => void this.cargar());
    });
  }
  private async cargar(): Promise<void> {
    try {
      this.set(await this.api.plantilla(this.cid(), this.route.snapshot.paramMap.get('clave') ?? ''));
    } catch {
      this.plantilla.set(null);
    }
  }
  private set(p: PlantillaDetalle): void {
    this.plantilla.set(p);
    this.c.set({ asunto: p.asunto, preheader: p.preheader, titulo: p.titulo, cuerpo: p.cuerpo, botonTexto: p.botonTexto, botonUrl: p.botonUrl, pie: p.pie, nota: p.nota ?? '', imagen: p.imagen ?? '' });
    this.atras = [];
    this.adelante = [];
    this.sucio.set(false);
    const malo = this.desconocidas()[0];
    if (malo) this.campo.set((Object.keys(this.c()) as Campo[]).find((k) => this.malosDe(k).includes(malo)) ?? 'cuerpo');
    void this.previsualizar();
  }
  protected llaves(v: string): string {
    return `{{${v}}}`;
  }
  protected malosDe(k: Campo): string[] {
    return [...(this.c()[k] ?? '').matchAll(RE)].map((m) => m[1]).filter((v) => !this.vars().has(v));
  }
  protected malos(k: Campo): boolean {
    return this.malosDe(k).length > 0;
  }
  protected marco(k: Campo): string {
    if (this.malos(k)) return 'outline outline-2 outline-[#e6606b]';
    return this.campo() === k || (k === 'botonTexto' && this.campo() === 'botonUrl') ? 'outline outline-2 outline-[#3b82f6]' : 'hover:outline hover:outline-1 hover:outline-[#3b82f6]/60';
  }
  /** Text with sample values; unknown variables stay visible in red. */
  protected vis(s = ''): string {
    const ej = this.plantilla()?.ejemplo ?? {};
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(RE, (m, v: string) => (this.vars().has(v) ? esc(ej[v] ?? v) : `<span class="text-[#e6606b] underline">${m}</span>`)).replace(/\n/g, '<br>');
  }
  protected sugerencia(v: string): string | null {
    const vs = [...this.vars()];
    const fin = v.split('.').pop() ?? v;
    const mismo = vs.find((x) => x.split('.').pop() === fin || x.endsWith(fin));
    if (mismo) return mismo;
    const best = vs.map((x) => ({ x, d: distancia(v, x) })).sort((a, b) => a.d - b.d)[0];
    return best && best.d <= 3 ? best.x : null;
  }
  protected sustituir(v: string, s: string): void {
    const re = new RegExp(`\\{\\{\\s*${v.replace(/\./g, '\\.')}\\s*\\}\\}`, 'g');
    this.snapshot();
    this.c.update((c) => Object.fromEntries(Object.entries(c).map(([k, x]) => [k, (x ?? '').replace(re, `{{${s}}}`)])) as unknown as Contenido);
    this.tras();
  }
  protected nombreCampo(): string {
    return this.campo() === 'botonUrl' ? 'Enlace del botón' : this.capa().l;
  }
  protected resumenCampo(): string {
    const k = this.campo() === 'botonUrl' ? 'botonTexto' : this.campo();
    return (this.c()[k] ?? '').trim() || 'Vacío';
  }
  protected etiquetaAncho(): string {
    return this.dispositivos.find((d) => d.w === this.ancho())?.l ?? '';
  }
  protected elegir(k: Campo): void {
    this.campo.set(k);
    if (this.vista() !== 'diseno') this.vista.set('diseno');
  }
  protected cambiarVista(v: Vista): void {
    this.vista.set(v);
    if (v !== 'diseno') void this.previsualizar();
  }
  private snapshot(): void {
    this.atras = [...this.atras.slice(-49), { ...this.c() }];
    this.adelante = [];
  }
  protected editar(k: Campo, v: string): void {
    // one undo step per burst of typing
    if (!this.tHist) this.snapshot();
    clearTimeout(this.tHist);
    this.tHist = setTimeout(() => (this.tHist = undefined), 800);
    this.c.update((c) => ({ ...c, [k]: v }));
    this.tras();
  }
  private tras(): void {
    this.sucio.set(true);
    clearTimeout(this.t);
    this.t = setTimeout(() => void this.previsualizar(), 350);
  }
  protected deshacer(): void {
    const prev = this.atras.pop();
    if (!prev) return;
    this.adelante.push({ ...this.c() });
    this.c.set(prev);
    this.tras();
  }
  protected rehacer(): void {
    const sig = this.adelante.pop();
    if (!sig) return;
    this.atras.push({ ...this.c() });
    this.c.set(sig);
    this.tras();
  }
  private async previsualizar(): Promise<void> {
    const p = this.plantilla();
    if (!p || this.desconocidas().length) return;
    try {
      const r = await this.api.previsualizar(this.cid(), p.info.clave, this.c());
      this.render.set(r);
      this.html.set(this.san.bypassSecurityTrustHtml(r.html));
      this.errorVar.set('');
    } catch (e) {
      this.errorVar.set(errText(e, 'La plantilla tiene un error.'));
    }
  }
  protected insertar(v: string): void {
    const k = this.campo();
    this.snapshot();
    this.c.update((c) => ({ ...c, [k]: (c[k] ?? '') + `{{${v}}}` }));
    this.tras();
  }
  protected async guardar(): Promise<void> {
    const p = this.plantilla();
    if (!p) return;
    this.guardando.set(true);
    try {
      this.set(await this.api.guardar(this.cid(), p, this.c()));
      this.toasts.success('Plantilla guardada y activa', 'Los próximos emails salen con este diseño.');
    } catch (e) {
      this.toasts.error('No se pudo guardar', errText(e));
    } finally {
      this.guardando.set(false);
    }
  }
  protected async restaurar(): Promise<void> {
    const p = this.plantilla();
    if (!p || !(await this.confirm.ask({ title: 'Volver al diseño original', text: 'Se pierden tus cambios en esta plantilla.', confirm: 'Restaurar' }))) return;
    try {
      this.set(await this.api.restaurar(this.cid(), p.info.clave));
      this.toasts.success('Diseño original restaurado');
    } catch (e) {
      this.toasts.error('No se pudo restaurar', errText(e));
    }
  }
  protected async pausar(): Promise<void> {
    const p = this.plantilla();
    if (!p) return;
    const pausar = p.info.estado !== 'pausada';
    try {
      const d = await this.api.estado(this.cid(), p.info.clave, pausar ? 'pausada' : 'activa');
      this.plantilla.set({ ...p, info: d.info, version: d.version });
      this.toasts.success(pausar ? 'Plantilla pausada' : 'Plantilla reactivada', pausar ? 'Sus mensajes esperan en la cola hasta reactivarla.' : undefined);
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
    }
  }
  protected async prueba(): Promise<void> {
    const p = this.plantilla();
    if (!p) return;
    this.enviando.set(true);
    try {
      await this.api.prueba(this.cid(), p.info.clave, this.destino);
      this.pruebaOpen.set(false);
      this.toasts.success('Prueba en cola', 'Llegará en unos segundos. Puedes seguirla en la bandeja de salida.');
    } catch (e) {
      this.toasts.error('No se pudo enviar', errText(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
