import { ACESFilmicToneMapping, Box3, Object3D, OrthographicCamera, PMREMGenerator, SRGBColorSpace, Scene, Vector3, WebGLRenderer, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * 3D medal disc (GLB of the medals of Figma page 79, metal lit by a room environment). Lazy chunk: only imported by
 * MedallaFisica once a medal is in view. ONE WebGL context for the whole home: every medal renders into a region of
 * the shared offscreen renderer and copies it to its own 2D canvas (no context per medal).
 */
const LADO = 512;
let gl: { r: WebGLRenderer; env: Texture } | null = null;
const glbs = new Map<string, Promise<Object3D>>();

function contexto() {
  if (!gl) {
    const r = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    r.setSize(LADO, LADO, false);
    r.setClearColor(0, 0);
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = ACESFilmicToneMapping;
    const pm = new PMREMGenerator(r);
    gl = { r, env: pm.fromScene(new RoomEnvironment(), 0.04).texture };
    pm.dispose();
  }
  return gl;
}

export async function medalla3d(url: string) {
  const { r, env } = contexto();
  if (!glbs.has(url)) glbs.set(url, new GLTFLoader().loadAsync(url).then((g) => g.scene));
  const modelo = (await glbs.get(url)!).clone(true);
  const caja = new Box3().setFromObject(modelo);
  const tam = caja.getSize(new Vector3());
  modelo.position.sub(caja.getCenter(new Vector3()));
  const giro = new Object3D();
  giro.add(modelo);
  const escena = new Scene();
  escena.environment = env;
  escena.add(giro);
  const prof = Math.max(tam.x, tam.y) * 4;
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.001, prof * 2);
  cam.position.z = prof;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  return {
    canvas,
    /** Draws the disc at w × h CSS px, turned `y` rad around its vertical axis. */
    pintar(w: number, h: number, y: number) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const ancho = Math.max(1, Math.min(LADO, Math.round(w * dpr)));
      const alto = Math.max(1, Math.min(LADO, Math.round(h * dpr)));
      if (canvas.width !== ancho || canvas.height !== alto) {
        canvas.width = ancho;
        canvas.height = alto;
      }
      const k = Math.min(ancho / tam.x, alto / tam.y);
      cam.left = -ancho / 2 / k;
      cam.right = ancho / 2 / k;
      cam.top = alto / 2 / k;
      cam.bottom = -alto / 2 / k;
      cam.updateProjectionMatrix();
      giro.rotation.y = y;
      r.setViewport(0, 0, ancho, alto);
      r.setScissor(0, 0, ancho, alto);
      r.setScissorTest(true);
      r.render(escena, cam);
      ctx.clearRect(0, 0, ancho, alto);
      ctx.drawImage(r.domElement, 0, LADO - alto, ancho, alto, 0, 0, ancho, alto);
    },
  };
}
