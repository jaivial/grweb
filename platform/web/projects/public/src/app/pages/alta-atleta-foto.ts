import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, inject, input, output, signal, viewChild } from '@angular/core';
import { GrButton, GrIcon } from '@grcup/ui';

/** La foto que se envía: el fichero ya precomprimido y el encuadre (focal) elegido. */
export interface FotoAlta {
  /** JPEG de 960 × 1200 (4:5) en blanco y negro, listo para subir. */
  archivo: File;
  focalX: number;
  focalY: number;
}

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_MP = 48;
const MAX_PRECOMPRESION_MP = 2;
const LADO = { w: 960, h: 1200 };
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * «Tu foto» del alta de atleta: arrastrar o elegir el fichero, previsualización en blanco y negro
 * (canvas) con el encuadre 4:5 arrastrable y los errores de tipo, tamaño y megapíxeles.
 * El navegador precomprime a ≤ 2 MP; el servidor vuelve a procesar la imagen siempre.
 */
@Component({
  selector: 'gr-alta-foto',
  imports: [GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      @if (!foto()) {
        <!-- Figma «Tu foto»: zona de arrastre -->
        <label
          class="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-2 border-dashed px-5 py-8 text-center transition-colors has-[:focus-visible]:[outline:2px_solid_var(--color-accent-text)] has-[:focus-visible]:outline-offset-2"
          [class]="arrastrando() ? 'border-accent-text bg-accent/8' : 'border-line-strong hover:border-text-muted'"
          (dragover)="arrastrando.set(true); $event.preventDefault()" (dragleave)="arrastrando.set(false)" (drop)="soltar($event)">
          <input #entrada type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" [attr.aria-label]="'Foto de perfil (opcional). JPG, PNG o WebP, máximo 8 MB y 48 megapíxeles'"
            (change)="elegir($event)" />
          <span class="flex size-10 items-center justify-center rounded-md bg-accent/14 text-accent-text"><gr-icon name="arrow-up" [size]="18" /></span>
          @if (arrastrando()) {
            <span class="text-label-m">Suelta la foto aquí</span>
            <span class="text-body-xs text-text-tertiary">JPG, PNG o WebP · máx. 8 MB · máx. 48 MP</span>
          } @else {
            <span class="text-label-m">Arrastra tu foto o pulsa para elegirla</span>
            <span class="text-body-xs text-text-tertiary">JPG, PNG o WebP · máx. 8 MB · máx. 48 MP</span>
            <span class="max-w-[420px] text-body-xs text-text-muted">Opcional pero recomendada. La publicamos en blanco y negro, recortada a 4:5 para que todas las fichas sean uniformes.</span>
          }
        </label>
      }
      <!-- Figma «Tu foto»: vista previa con el encuadre (el lienzo siempre en la página para poder pintarlo) -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start" [class.hidden]="!foto()">
        <div class="relative w-full max-w-[240px] shrink-0">
          <span class="absolute top-2 left-2 z-10 rounded-[4px] bg-black/60 px-2 py-0.5 text-mono-xs text-white">4:5</span>
          <div #marco class="relative aspect-[4/5] w-full touch-none overflow-hidden rounded-md border border-line-subtle bg-bg-raised select-none"
            (pointerdown)="arrastrar($event)" (pointermove)="mover($event)" (pointerup)="soltarEncuadre()" (pointercancel)="soltarEncuadre()">
            <canvas #lienzo width="960" height="1200" class="absolute inset-0 size-full"></canvas>
            @if (foto() && !subiendo() && !procesando()) {
              <button type="button" class="absolute z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white shadow-glow active:cursor-grabbing"
                [style.left.%]="focal().x" [style.top.%]="focal().y" [attr.aria-label]="'Encuadre de la foto: arrástralo o usa las flechas del teclado'"
                (keydown)="teclado($event)" (pointerdown)="$event.stopPropagation()">
                <span class="size-2.5 rounded-full bg-accent-text"></span>
              </button>
            }
          </div>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <p class="text-label-m">Vista previa en blanco y negro</p>
          <p class="text-body-s text-text-secondary">Arrastra la imagen para recentrar el encuadre.</p>
          <p class="text-body-s text-text-tertiary">La recortamos a 4:5 (960 × 1200 px) y la publicamos en blanco y negro para que todas las fichas se vean igual.</p>
          <div class="mt-1 flex flex-wrap items-center gap-3">
            <button grButton variant="outline" type="button" (click)="cambiar()">Cambiar foto</button>
            <button type="button" class="text-label-s text-accent-text hover:underline" (click)="quitar()">Quitar foto</button>
          </div>
          @if (subiendo() || procesando()) {
            <div class="mt-2 flex flex-col gap-2 rounded-md border border-line-subtle bg-bg-surface p-3">
              <p class="flex items-center gap-2 text-body-xs text-text-secondary">
                <gr-icon name="loader" [size]="14" [spin]="true" class="text-accent-text" />{{ procesando() ? 'Estamos preparando tu foto…' : 'Subiendo la foto…' }}
              </p>
              <div class="h-1.5 overflow-hidden rounded-pill bg-line-strong"><div class="h-full rounded-pill bg-accent transition-[width] duration-200" [style.width.%]="progreso()"></div></div>
              <p class="text-body-xs text-text-muted">Ajustamos el contraste, el blanco y negro y el encuadre 4:5.</p>
            </div>
          }
        </div>
      </div>
      @if (error()) {
        <p class="flex items-start gap-2 rounded-md border border-accent bg-accent/8 p-3 text-body-s text-accent-text" role="alert">
          <gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0" />{{ error() }}
        </p>
      }
    </div>
  `,
})
export class AltaFoto {
  /** Fichero listo para enviar (o null si no hay foto). */
  readonly cambio = output<FotoAlta | null>();
  /** Error visible de la foto (tipo, tamaño o megapíxeles). */
  readonly errorFoto = output<string>();
  /** Estado de envío de la foto (barra de progreso y «procesando»). */
  readonly subiendo = input(false);
  readonly procesando = input(false);
  readonly progreso = input(0);

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly lienzo = viewChild<ElementRef<HTMLCanvasElement>>('lienzo');
  private readonly marco = viewChild<ElementRef<HTMLElement>>('marco');
  private readonly entrada = viewChild<ElementRef<HTMLInputElement>>('entrada');

  /** La foto ya precomprimida (canvas con la imagen en blanco y negro) y el encuadre. */
  protected readonly foto = signal<FotoAlta | null>(null);
  protected readonly error = signal('');
  protected readonly arrastrando = signal(false);
  protected readonly focal = signal({ x: 50, y: 35 });
  /** Lienzo con la imagen completa (ya reducida y en blanco y negro) para recortar. */
  private base: HTMLCanvasElement | null = null;
  private arrastrandoEncuadre = false;

  protected readonly mb = (n: number): string => (n / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 });

  /** Elige el fichero desde el explorador. */
  protected elegir(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void this.procesar(f);
    input.value = '';
  }

  /** Suelta el fichero sobre la zona de arrastre. */
  protected soltar(e: DragEvent): void {
    e.preventDefault();
    this.arrastrando.set(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) void this.procesar(f);
  }

  /** Abre el explorador para cambiar la foto. */
  protected cambiar(): void {
    this.entrada()?.nativeElement.click();
  }

  /** Quita la foto. */
  protected quitar(): void {
    this.base = null;
    this.foto.set(null);
    this.focal.set({ x: 50, y: 35 });
    this.error.set('');
    this.errorFoto.emit('');
    this.cambio.emit(null);
  }

  /** Valida el fichero, lo reduce a ≤ 2 MP y lo pasa a blanco y negro. */
  private async procesar(f: File): Promise<void> {
    this.error.set('');
    this.errorFoto.emit('');
    if (f.size > MAX_BYTES) {
      return this.fallar(`La foto pesa ${this.mb(f.size)} MB y el máximo son 8 MB. Comprime la imagen o sube otra.`);
    }
    if (f.type && !TIPOS.includes(f.type) && !/\.(jpe?g|png|webp)$/i.test(f.name)) {
      return this.fallar('Ese archivo no es una imagen. Sube un JPG, PNG o WebP.');
    }
    const img = await this.decodificar(f);
    if (!img) return this.fallar('Ese archivo no es una imagen. Sube un JPG, PNG o WebP.');
    const megapixeles = (img.naturalWidth * img.naturalHeight) / 1e6;
    if (megapixeles > MAX_MP) {
      return this.fallar(`La foto tiene ${Math.round(megapixeles)} megapíxeles y el máximo son 48. Redimensiona la imagen y vuelve a subirla.`);
    }
    // Reducción a ≤ 2 MP antes de subirla (el servidor vuelve a procesar la imagen).
    const escala = Math.min(1, Math.sqrt((MAX_PRECOMPRESION_MP * 1e6) / (img.naturalWidth * img.naturalHeight)));
    const base = document.createElement('canvas');
    base.width = Math.max(1, Math.round(img.naturalWidth * escala));
    base.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const bctx = base.getContext('2d');
    if (!bctx) return this.fallar('No hemos podido preparar la foto. Prueba con otra imagen.');
    bctx.drawImage(img, 0, 0, base.width, base.height);
    this.base = base;
    this.gris(base);
    await this.exportar();
  }

  /** Pasa el lienzo a blanco y negro (luminancia BT.601). */
  private gris(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      px[i] = px[i + 1] = px[i + 2] = y;
    }
    ctx.putImageData(d, 0, 0);
  }

  /** Recorta la imagen alrededor del encuadre y la pinta en un lienzo 960 × 1200. */
  private pintar(base: HTMLCanvasElement, destino: HTMLCanvasElement, f: { x: number; y: number }): void {
    const ctx = destino.getContext('2d');
    if (!ctx) return;
    const ratio = 4 / 5;
    let cw = base.width;
    let ch = base.width / ratio;
    if (ch > base.height) {
      ch = base.height;
      cw = base.height * ratio;
    }
    const cx = Math.min(Math.max((f.x / 100) * base.width - cw / 2, 0), base.width - cw);
    const cy = Math.min(Math.max((f.y / 100) * base.height - ch / 2, 0), base.height - ch);
    ctx.drawImage(base, cx, cy, cw, ch, 0, 0, LADO.w, LADO.h);
  }

  /** Pinta la vista previa (el lienzo está siempre en la página). */
  private dibujar(): void {
    const base = this.base;
    const c = this.lienzo()?.nativeElement;
    if (!base || !c) return;
    this.pintar(base, c, this.focal());
  }

  /** Exporta el recorte como JPEG (lo que se sube) y avisa al formulario. */
  private async exportar(): Promise<void> {
    const base = this.base;
    if (!base) return;
    const c = document.createElement('canvas');
    c.width = LADO.w;
    c.height = LADO.h;
    this.pintar(base, c, this.focal());
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return this.fallar('No hemos podido preparar la foto. Prueba con otra imagen.');
    const f = this.focal();
    const archivo = new File([blob], 'foto-atleta.jpg', { type: 'image/jpeg' });
    this.foto.set({ archivo, focalX: f.x, focalY: f.y });
    this.cambio.emit({ archivo, focalX: f.x, focalY: f.y });
    this.dibujar();
  }

  /** Arranca el arrastre del encuadre. */
  protected arrastrar(e: PointerEvent): void {
    this.arrastrandoEncuadre = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.mover(e);
  }

  /** Mueve el punto de encuadre con el puntero. */
  protected mover(e: PointerEvent): void {
    if (!this.arrastrandoEncuadre && e.type !== 'pointerdown') return;
    const marco = this.marco()?.nativeElement;
    if (!marco) return;
    const r = marco.getBoundingClientRect();
    const x = Math.min(Math.max(((e.clientX - r.left) / r.width) * 100, 0), 100);
    const y = Math.min(Math.max(((e.clientY - r.top) / r.height) * 100, 0), 100);
    this.focal.set({ x: Math.round(x), y: Math.round(y) });
    this.dibujar();
  }

  /** Suelta el encuadre: se vuelve a exportar el recorte. */
  protected soltarEncuadre(): void {
    if (!this.arrastrandoEncuadre) return;
    this.arrastrandoEncuadre = false;
    void this.exportar();
  }

  /** Teclado: las flechas mueven el encuadre. */
  protected teclado(e: KeyboardEvent): void {
    const paso = e.shiftKey ? 5 : 1;
    const f = this.focal();
    let { x, y } = f;
    if (e.key === 'ArrowLeft') x -= paso;
    else if (e.key === 'ArrowRight') x += paso;
    else if (e.key === 'ArrowUp') y -= paso;
    else if (e.key === 'ArrowDown') y += paso;
    else return;
    e.preventDefault();
    this.focal.set({ x: Math.min(Math.max(x, 0), 100), y: Math.min(Math.max(y, 0), 100) });
    this.dibujar();
    void this.exportar();
  }

  /** Decodifica el fichero en una imagen. */
  private decodificar(f: File): Promise<HTMLImageElement | null> {
    if (!this.browser) return Promise.resolve(null);
    return new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  private fallar(msg: string): void {
    this.error.set(msg);
    this.errorFoto.emit(msg);
    this.base = null;
    this.foto.set(null);
    this.cambio.emit(null);
  }
}
