import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, inject, input, signal, viewChild } from '@angular/core';

/** Trophy GLB (ported from frontend/public/models/trophy; meshopt + webp textures). */
const GLB = '/models/trophy.glb';
/** One full turn every 12 s (as the previous web). */
const VUELTA_S = 12;

/**
 * Rotating 3D trophy of «Premios v2 · Ganadores absolutos» (Figma 80, zone «modelo 3D giratorio»). The static render
 * is the LCP-safe fallback and stays when: server render, reduced motion, no WebGL, or the model fails. three.js is
 * a lazy chunk loaded only when the card comes near the viewport; the loop pauses off-screen and on hidden tabs.
 */
@Component({
  selector: 'gr-trofeo-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <img [src]="fallback()" [alt]="alt()" class="absolute inset-0 size-full object-contain mix-blend-lighten transition-opacity duration-500" [class.opacity-0]="listo()" loading="lazy" decoding="async" />
    <canvas #lienzo class="absolute inset-0 size-full transition-opacity duration-500" [class.opacity-0]="!listo()" aria-hidden="true"></canvas>
  `,
})
export class Trofeo3d {
  readonly fallback = input('/img/home/trofeo-gl.webp');
  readonly alt = input('');
  /** Starting angle (radians), so the two cards do not turn in lockstep. */
  readonly fase = input(0);
  protected readonly listo = signal(false);
  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private readonly host = inject(ElementRef<HTMLElement>);
  private limpiar: (() => void) | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    inject(DestroyRef).onDestroy(() => this.limpiar?.());
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver((e) => {
        if (!e.some((x) => x.isIntersecting)) return;
        io.disconnect();
        void this.cargar().catch(() => this.listo.set(false));
      }, { rootMargin: '300px' });
      io.observe(this.host.nativeElement);
      this.limpiar = () => io.disconnect();
    });
  }

  private async cargar(): Promise<void> {
    const [THREE, { GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
      import('three'),
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      import('three/examples/jsm/environments/RoomEnvironment.js'),
    ]);
    const canvas = this.lienzo().nativeElement;
    let renderer: InstanceType<typeof THREE.WebGLRenderer>;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the static render stays
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sol = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sol.position.set(-3, 5, 4);
    scene.add(sol);
    const rojo = new THREE.PointLight(0xdc143c, 0.6, 0, 0);
    rojo.position.set(3, 1, -3);
    scene.add(rojo);
    const camara = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    camara.position.set(0, 0.15, 7.5);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(GLB);
    const modelo = gltf.scene;
    const caja = new THREE.Box3().setFromObject(modelo);
    const escala = 2.6 / (caja.getSize(new THREE.Vector3()).y || 1);
    modelo.position.copy(caja.getCenter(new THREE.Vector3()).multiplyScalar(-escala));
    modelo.scale.setScalar(escala);
    const frente = new THREE.Group();
    frente.rotation.y = Math.PI / 2; // the handles span Z: wide side to the camera
    frente.add(modelo);
    const giro = new THREE.Group();
    giro.rotation.y = this.fase();
    giro.add(frente);
    scene.add(giro);

    const ajustar = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
      renderer.render(scene, camara); // a resize clears the canvas: repaint even while paused
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(canvas);
    let visible = true;
    const io = new IntersectionObserver((e) => (visible = e.some((x) => x.isIntersecting)));
    io.observe(canvas);
    let antes = performance.now(); // THREE.Clock is deprecated (r1xx): plain timestamps
    renderer.setAnimationLoop(() => {
      const t = performance.now();
      const dt = (t - antes) / 1000;
      antes = t;
      if (!visible || document.hidden) return;
      giro.rotation.y += (dt * Math.PI * 2) / VUELTA_S;
      renderer.render(scene, camara);
    });
    renderer.render(scene, camara);
    this.listo.set(true);
    this.limpiar = () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      pmrem.dispose();
      renderer.dispose();
    };
  }
}

