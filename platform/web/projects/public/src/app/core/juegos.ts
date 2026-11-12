/**
 * juegos.ts — tipos y llamadas de TODO el servicio `juegos` (contrato §6): jornadas, carteras, porra, GRS Fantasy y
 * premios. Lo comparten /porra, /fantasy y las pestañas de juegos de /en-directo.
 *
 * Nada de esto maneja tokens: la sesión de fan es la cookie httpOnly `grcup_fan` (Path=/api) y el navegador la
 * manda sola en cada llamada a /api.
 */
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from './competition';
import { FanSession, codigoError, detalleError } from './fan';

// ---------------------------------------------------------------------------------------------
// Tipos (las etiquetas json del backend: internal/juegos/http.go, porra.go, fantasy.go, ranking.go)
// ---------------------------------------------------------------------------------------------

/** Monedas de la cartera: dos saldos separados e intransferibles. */
export type Moneda = 'porra' | 'fantasy';
export type EstadoJornada = 'borrador' | 'abierta' | 'en_juego' | 'cerrada';
export type TipoMercado = 'categoria' | 'gl' | 'movimiento';
export type EstadoMercado = 'abierto' | 'cerrado' | 'liquidado';
export type Sexo = 'F' | 'M';
export type Mov = 'sq' | 'bp' | 'dl';
export type TipoFichaje = 'compra' | 'venta' | 'clausulazo';
export type RankingPremio = 'porra' | 'fantasy' | 'donantes';

/** Una jornada de juegos (AEP-2, AEP-3…). */
export interface Jornada {
  id: string;
  dia: string;
  nombre: string;
  estado: EstadoJornada;
  /** Instante de cierre de las apuestas (hora de cierre del backoffice), si lo hay. */
  cierreAt?: string;
}

/** Una opción de mercado de porra: el atleta, lo apostado y su cuota orientativa en vivo. */
export interface OpcionMercado {
  atletaId: string;
  nombre: string;
  apostado: number;
  cuota?: number;
}

/** Un mercado de porra con su bote y sus cuotas. */
export interface Mercado {
  id: string;
  tipo: TipoMercado;
  sexo: Sexo;
  categoria?: string;
  movimiento?: Mov;
  titulo: string;
  estado: EstadoMercado;
  opciones: OpcionMercado[];
  bote: number;
  apuestas: number;
  ganador?: string[];
  /** El bote volvió a las apuestas (nadie acertó al ganador o el staff anuló el mercado): cada apuesta recupera su importe. */
  devuelto?: boolean;
}

/** Una apuesta propia. */
export interface Apuesta {
  id: string;
  mercadoId: string;
  mercado: string;
  atletaId: string;
  atleta: string;
  importe: number;
  /** Estado del mercado en el que se juega: abierto | cerrado | liquidado. */
  estado: EstadoMercado;
  /** El bote del mercado volvió a las apuestas: esta apuesta recuperó su importe. */
  devuelto?: boolean;
  createdAt: string;
}

/** Una fila de la clasificación de la porra (saldo de porra de la jornada). El backend no publica el id del fan. */
export interface FilaPorra {
  puesto: number;
  alias: string;
  saldo: number;
}

/** Una fila de la clasificación de fantasy (puntos, valor de la plantilla y saldo). */
export interface FilaFantasy {
  puesto: number;
  alias: string;
  puntos: number;
  valor: number;
  saldo: number;
}

/** Un atleta del mercado de fantasy. */
export interface AtletaMercado {
  atletaId: string;
  nombre: string;
  sexo: Sexo;
  categoria: string;
  clausula: number;
  dueno?: string;
  duenoAlias?: string;
  titular: boolean;
  protegido: boolean;
  /** Hasta cuándo está protegido (RFC3339); lo devuelve el backend para la cuenta atrás. */
  protegidoHasta?: string;
  libre: boolean;
  esMio: boolean;
  flightEnCurso: boolean;
}

/** Mi plantilla: atletas, valor, saldo y clausulazos gastados. */
export interface MiEquipo {
  jornada?: Jornada;
  atletas: AtletaMercado[];
  titulares: number;
  valor: number;
  saldo: number;
  clausulazos: number;
}

/** Un cambio de cláusula (para la gráfica y la flecha de tendencia). */
export interface HistorialClausula {
  clausula: number;
  delta: number;
  motivo: string;
  createdAt: string;
}

/** Un concepto de puntos de un atleta. */
export interface Punto {
  concepto: string;
  puntos: number;
  ref: string;
}

/** La ficha de un atleta: cláusula actual, historial y desglose de puntos. */
export interface AtletaDetalle {
  atleta?: AtletaMercado;
  clausulas: HistorialClausula[];
  puntos: Punto[];
}

/** Un movimiento del libro (cartera). */
export interface Movimiento {
  importe: number;
  motivo: string;
  moneda: Moneda;
  createdAt: string;
}

/** Mi cartera: los dos saldos y los últimos movimientos. */
export interface Cartera {
  porra: number;
  fantasy: number;
  /** Deuda pendiente: lo que un reembolso no pudo retirar del saldo (queda anotado, contrato §5). */
  pendienteFantasy: number;
  movimientos: Movimiento[];
}

/** Un fichaje del mercado de fantasy (compra, venta o clausulazo). */
export interface Fichaje {
  id?: string;
  atletaId: string;
  tipo: TipoFichaje;
  aliasDe: string;
  aliasA: string;
  precio: number;
  createdAt: string;
}

/** La configuración pública de los juegos (mín./máx. de apuesta, clausulazos, protección y tabla de puntos). */
export interface PuntosConfig {
  intentoValido?: number;
  pleno?: number;
  blanqueo?: number;
  cat?: number[];
  gl?: number[];
  mov?: number[];
}

/** `GET /juegos/config`: solo los valores públicos (los internos no se exponen). */
export interface ConfigJuegos {
  porraMin?: number;
  porraMax?: number;
  hito5Porra?: number;
  hito10Porra?: number;
  maxClausulazos?: number;
  proteccionMin?: number;
  plantillaMax?: number;
  titularesMax?: number;
  clausulaInicial?: number;
  clausulaMin?: number;
  clausulaMax?: number;
  puntos?: PuntosConfig;
  activo?: boolean;
  version?: number;
}

/** Un premio de la jornada (gancho de las clasificaciones). */
export interface Premio {
  id: string;
  ranking: RankingPremio;
  puestoDesde: number;
  puestoHasta: number;
  titulo: string;
  descripcion: string;
  imagenUrl?: string;
  valorTexto?: string;
  patrocinador?: string;
}

/** Puntos de la tabla por defecto del contrato §6.3 (respaldo si no llega la config pública). */
export const TABLA_PUNTOS: { concepto: string; detalle: string; puntos: string }[] = [
  { concepto: 'Intento válido (máx. 9)', detalle: '+3 cada uno', puntos: '+3' },
  { concepto: 'Pleno 9/9 (bonus)', detalle: '', puntos: '+5' },
  { concepto: 'Blanqueo (3 nulos en un movimiento)', detalle: '', puntos: '−15' },
  { concepto: 'Puesto en su categoría', detalle: '1.º +20 · 2.º +14 · 3.º +10 · 4.º–5.º +5 · resto que acaba +2', puntos: '' },
  { concepto: 'Puesto IPF GL de su sexo', detalle: '1.º +25 · 2.º +18 · 3.º +12 · 4.º–10.º +4', puntos: '' },
  { concepto: 'Puesto por movimiento (sexo)', detalle: '1.º +10 · 2.º +6 · 3.º +3', puntos: '' },
];

const signo = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

/** La tabla de puntos con los valores de la configuración pública (si no, la del contrato §6.3). */
export function tablaPuntos(cfg: ConfigJuegos | null): { concepto: string; detalle: string; puntos: string }[] {
  const p = cfg?.puntos;
  if (!p) return TABLA_PUNTOS;
  const cat = p.cat ?? [];
  const gl = p.gl ?? [];
  const mov = p.mov ?? [];
  return [
    { concepto: 'Intento válido (máx. 9)', detalle: `${signo(p.intentoValido ?? 3)} cada uno`, puntos: signo(p.intentoValido ?? 3) },
    { concepto: 'Pleno 9/9 (bonus)', detalle: '', puntos: signo(p.pleno ?? 5) },
    { concepto: 'Blanqueo (3 nulos en un movimiento)', detalle: '', puntos: signo(p.blanqueo ?? -15) },
    {
      concepto: 'Puesto en su categoría',
      detalle: `1.º ${signo(cat[0] ?? 20)} · 2.º ${signo(cat[1] ?? 14)} · 3.º ${signo(cat[2] ?? 10)} · 4.º–5.º ${signo(cat[3] ?? 5)} · resto que acaba ${signo(cat[4] ?? 2)}`,
      puntos: '',
    },
    {
      concepto: 'Puesto IPF GL de su sexo',
      detalle: `1.º ${signo(gl[0] ?? 25)} · 2.º ${signo(gl[1] ?? 18)} · 3.º ${signo(gl[2] ?? 12)} · 4.º–10.º ${signo(gl[3] ?? 4)}`,
      puntos: '',
    },
    {
      concepto: 'Puesto por movimiento (sexo)',
      detalle: `1.º ${signo(mov[0] ?? 10)} · 2.º ${signo(mov[1] ?? 6)} · 3.º ${signo(mov[2] ?? 3)}`,
      puntos: '',
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------------------------

/** Mensajes claros para los códigos del API (problem+json `code`). */
const MENSAJES: Record<string, string> = {
  SALDO_INSUFICIENTE: 'No tienes monedas suficientes en la cartera.',
  MERCADO_CERRADO: 'El mercado está cerrado: no se aceptan más apuestas.',
  JORNADA_NO_JUGABLE: 'La jornada ya no está abierta para jugar.',
  IMPORTE_NO_VALIDO: 'Cada apuesta va de 100 a 50.000 monedas.',
  ATLETA_NO_EN_MERCADO: 'Ese atleta no participa en este mercado.',
  ATLETA_PROTEGIDO: 'El atleta está protegido un rato después de su último fichaje.',
  MAX_CLAUSULAZOS: 'Ya has usado todos los clausulazos de la jornada.',
  PLANTILLA_LLENA: 'Tu plantilla está completa: vende a alguien antes.',
  YA_CON_DUENO: 'Otro usuario ya tiene a ese atleta. Puedes pagar su cláusula.',
  ATLETA_LIBRE: 'Ese atleta está libre: cómpralo, no hace falta clausulazo.',
  ATLETA_AJENO: 'Ese atleta no es tuyo.',
  ATLETA_PROPIO: 'El atleta ya es tuyo.',
  ALINEACION_BLOQUEADA: 'Hay un atleta tuyo levantando ahora: no puedes moverlo de titular.',
  NO_TUYOS: 'Solo puedes alinear atletas de tu plantilla.',
  MUCHOS_TITULARES: 'Solo puedes alinear 5 titulares.',
  MARCADOR_NO_DISPONIBLE: 'No se pudo leer el marcador del directo. Reintenta en unos segundos.',
  SESION_FAN_REQUERIDA: 'Entra con tu cuenta de atleta o público para participar.',
  SESION_FAN_REVOCADA: 'Tu sesión ha caducado. Entra de nuevo.',
  SESION_FAN_INVALIDA: 'Tu sesión no es válida. Entra de nuevo.',
};

/** Traduce el error del API a un mensaje claro (usa el código; si no lo conoce, el detalle del backend). */
export function mensajeError(e: unknown): string {
  const codigo = codigoError(e);
  return MENSAJES[codigo] ?? detalleError(e);
}

// ---------------------------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------------------------

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «128.400» (monedas, sin decimales). */
export const monedas = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : nf.format(v));
/** «×2,4» (cuota orientativa). */
export const cuota = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : '×' + nf2.format(v));
/** «Femenino» / «Masculino». */
export const sexoTxt = (s: Sexo | string): string => (s === 'F' ? 'Femenino' : 'Masculino');
/** «−63 kg» (la categoría del backend viene como «-63»). */
export const categoriaTxt = (c: string | undefined): string => (c ? c.replace('-', '−') + ' kg' : '');
/** Etiqueta del movimiento de porra. */
export const MOV_PORRA: Record<Mov, string> = { sq: 'Sentadilla', bp: 'Press banca', dl: 'Peso muerto' };
/** Etiqueta del tipo de mercado. */
export const TIPO_MERCADO: Record<TipoMercado, string> = { categoria: 'Categoría de peso', gl: 'IPF GL', movimiento: 'Movimiento' };

// ---------------------------------------------------------------------------------------------
// Cliente del servicio
// ---------------------------------------------------------------------------------------------

/** Llamadas al servicio `juegos` (contrato §6.6). Los errores se propagan como HttpErrorResponse. */
@Injectable({ providedIn: 'root' })
export class Juegos {
  private readonly http = inject(HttpClient);
  readonly base = `/api/competiciones/${COMPETITION_SLUG}/juegos`;

  // ---- jornadas ----
  jornadas(): Promise<Jornada[]> {
    return this.get<{ jornadas: Jornada[] }>(`${this.base}/jornadas`).then((r) => r.jornadas ?? []);
  }

  // ---- cartera ----
  cartera(jornadaId?: string): Promise<Cartera> {
    return this.get<Cartera>(`${this.base}/cartera${this.q(jornadaId)}`);
  }

  // ---- porra ----
  porraMercados(jornadaId?: string): Promise<{ jornada?: Jornada; mercados: Mercado[] }> {
    return this.get(`${this.base}/porra/mercados${this.q(jornadaId)}`);
  }

  porraApostar(mercadoId: string, atletaId: string, importe: number, jornadaId?: string): Promise<{ apuestaId: string; saldo: number }> {
    return this.post(`${this.base}/porra/apuestas`, { mercadoId, atletaId, importe, jornada: jornadaId || undefined });
  }

  porraMisApuestas(jornadaId?: string): Promise<{ apuestas: Apuesta[] }> {
    return this.get(`${this.base}/porra/mis-apuestas${this.q(jornadaId)}`);
  }

  porraClasificacion(jornadaId?: string): Promise<{ jornada?: Jornada; top: FilaPorra[]; miPuesto: number; miSaldo: number }> {
    return this.get(`${this.base}/porra/clasificacion${this.q(jornadaId)}`);
  }

  // ---- fantasy ----
  fantasyMercado(jornadaId?: string): Promise<{ jornada?: Jornada; atletas: AtletaMercado[] }> {
    return this.get(`${this.base}/fantasy/mercado${this.q(jornadaId)}`);
  }

  fantasyMiEquipo(jornadaId?: string): Promise<MiEquipo> {
    return this.get(`${this.base}/fantasy/mi-equipo${this.q(jornadaId)}`);
  }

  fantasyComprar(atletaId: string, jornadaId?: string): Promise<{ ok: boolean; saldo: number }> {
    return this.post(`${this.base}/fantasy/comprar`, { atletaId, jornada: jornadaId || undefined });
  }

  fantasyVender(atletaId: string, jornadaId?: string): Promise<{ ok: boolean; saldo: number }> {
    return this.post(`${this.base}/fantasy/vender`, { atletaId, jornada: jornadaId || undefined });
  }

  fantasyClausulazo(atletaId: string, jornadaId?: string): Promise<{ ok: boolean; saldo: number }> {
    return this.post(`${this.base}/fantasy/clausulazo`, { atletaId, jornada: jornadaId || undefined });
  }

  /** Cambia la alineación: la lista completa de titulares (el backend la ignora en los que ya lo son). */
  fantasyAlineacion(titulares: string[], jornadaId?: string): Promise<void> {
    return this.post<void>(`${this.base}/fantasy/alineacion`, { titulares, jornada: jornadaId || undefined });
  }

  fantasyClasificacion(jornadaId?: string): Promise<{ jornada?: Jornada; top: FilaFantasy[]; miPuesto: number; miPuntos: number }> {
    return this.get(`${this.base}/fantasy/clasificacion${this.q(jornadaId)}`);
  }

  fantasyAtleta(atletaId: string, jornadaId?: string): Promise<AtletaDetalle> {
    return this.get(`${this.base}/fantasy/atletas/${atletaId}${this.q(jornadaId)}`);
  }

  // ---- premios ----
  premios(jornadaId?: string): Promise<{ premios: Premio[] }> {
    return this.get(`${this.base}/premios${this.q(jornadaId)}`);
  }

  /**
   * Los últimos fichajes del mercado (y de un atleta si se filtra). Tolera las dos formas de respuesta
   * (`{fichajes: […]}` o un array suelto) y los dos nombres de los alias (`aliasDe`/`deAlias`).
   */
  async fichajes(jornadaId?: string, atletaId?: string): Promise<{ fichajes: Fichaje[] }> {
    const q = new URLSearchParams();
    if (jornadaId) q.set('jornada', jornadaId);
    if (atletaId) q.set('atleta', atletaId);
    const s = q.toString();
    const r = await this.get<{ fichajes?: unknown } | unknown[]>(`${this.base}/fantasy/fichajes${s ? '?' + s : ''}`);
    const lista = Array.isArray(r) ? r : ((r as { fichajes?: unknown[] })?.fichajes ?? []);
    return { fichajes: lista.map((x) => this.fichajeDe(x as Record<string, unknown>)) };
  }

  private fichajeDe(x: Record<string, unknown>): Fichaje {
    const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
    return {
      id: str(x['id']) || undefined,
      atletaId: str(x['atletaId']),
      tipo: (str(x['tipo']) || 'compra') as TipoFichaje,
      aliasDe: str(x['aliasDe']) || str(x['deAlias']),
      aliasA: str(x['aliasA']) || str(x['aAlias']),
      precio: Number(x['precio'] ?? 0),
      createdAt: str(x['createdAt']) || str(x['fecha']),
    };
  }

  /** La configuración pública de los juegos (mín./máx. de apuesta, clausulazos, protección y puntos). */
  async config(): Promise<ConfigJuegos> {
    const c = (await this.get<Record<string, unknown>>(`${this.base}/config`)) ?? {};
    const num = (...v: unknown[]): number | undefined => {
      for (const x of v) if (typeof x === 'number' && Number.isFinite(x)) return x;
      return undefined;
    };
    const arr = (v: unknown): number[] | undefined => (Array.isArray(v) ? v.filter((x) => typeof x === 'number') : undefined);
    const p = (c['puntos'] ?? {}) as Record<string, unknown>;
    return {
      porraMin: num(c['porraMin'], c['minApuesta'], c['minimo']),
      porraMax: num(c['porraMax'], c['maxApuesta'], c['maximo']),
      maxClausulazos: num(c['maxClausulazos'], c['maxClausulazosPorJornada']),
      proteccionMin: num(c['proteccionMin'], c['minutosProteccion']),
      plantillaMax: num(c['plantillaMax']),
      titularesMax: num(c['titularesMax']),
      clausulaInicial: num(c['clausulaInicial']),
      clausulaMin: num(c['clausulaMin']),
      clausulaMax: num(c['clausulaMax']),
      puntos: {
        intentoValido: num(p['intentoValido']),
        pleno: num(p['pleno']),
        blanqueo: num(p['blanqueo']),
        cat: arr(p['cat']),
        gl: arr(p['gl']),
        mov: arr(p['mov']),
      },
      activo: typeof c['activo'] === 'boolean' ? c['activo'] : undefined,
      version: num(c['version']),
    };
  }

  private q(jornadaId?: string): string {
    return jornadaId ? `?jornada=${encodeURIComponent(jornadaId)}` : '';
  }
  private get<T>(url: string): Promise<T> {
    return firstValueFrom(this.http.get<T>(url));
  }
  private post<T>(url: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(url, body));
  }
}

// ---------------------------------------------------------------------------------------------
// Estado compartido (jornada elegida, cartera) y tiempo real
// ---------------------------------------------------------------------------------------------

/** Estado compartido de los juegos: la lista de jornadas, la jornada elegida y la cartera del fan. */
@Injectable({ providedIn: 'root' })
export class JuegosEstado {
  private readonly juegos = inject(Juegos);
  private readonly fan = inject(FanSession);
  private readonly router = inject(Router);

  /** Las jornadas de la competición (pasadas, activa y futuras), de la más reciente a la más antigua. */
  readonly jornadas = signal<Jornada[]>([]);
  /** La jornada elegida; '' = la activa (la de hoy). */
  readonly jornadaId = signal<string>('');
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  /** Cartera del fan (los dos saldos); null hasta que se pide con sesión. */
  readonly cartera = signal<Cartera | null>(null);
  readonly carteraCargando = signal(false);
  /** Los premios de la jornada (gancho de las clasificaciones); los de porra y los de fantasy. */
  readonly premios = signal<Premio[]>([]);
  /** La configuración pública de los juegos (null si el endpoint no está disponible). */
  readonly config = signal<ConfigJuegos | null>(null);
  /** Los límites que se muestran al usuario, con los valores del contrato como respaldo. */
  readonly porraMin = computed(() => this.config()?.porraMin ?? 100);
  readonly porraMax = computed(() => this.config()?.porraMax ?? 50000);
  readonly maxClausulazos = computed(() => this.config()?.maxClausulazos ?? 3);
  readonly proteccionMin = computed(() => this.config()?.proteccionMin ?? 10);
  readonly plantillaMax = computed(() => this.config()?.plantillaMax ?? 8);
  readonly titularesMax = computed(() => this.config()?.titularesMax ?? 5);
  readonly clausulaInicial = computed(() => this.config()?.clausulaInicial ?? 200000);
  readonly clausulaMin = computed(() => this.config()?.clausulaMin ?? 50000);
  readonly clausulaMax = computed(() => this.config()?.clausulaMax ?? 5000000);
  /** La tabla de puntos con los valores configurados. */
  readonly tablaPuntos = computed(() => tablaPuntos(this.config()));

  /** La jornada mostrada (la elegida o, si no, la activa). */
  readonly jornada = computed<Jornada | null>(() => {
    const id = this.jornadaId();
    const lista = this.jornadas();
    if (id) return lista.find((j) => j.id === id) ?? null;
    return lista.find((j) => j.estado === 'abierta' || j.estado === 'en_juego') ?? lista[0] ?? null;
  });
  /** ¿La jornada mostrada es de solo lectura (cerrada)? */
  readonly soloLectura = computed(() => this.jornada()?.estado === 'cerrada');
  readonly saldoPorra = computed(() => this.cartera()?.porra ?? 0);
  readonly saldoFantasy = computed(() => this.cartera()?.fantasy ?? 0);

  /** Carga las jornadas una vez (el servidor las trae; el navegador las refresca) y los premios de la jornada. */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const lista = await this.juegos.jornadas();
      this.jornadas.set(lista);
      this.error.set(null);
      const jid = this.jornadaActual();
      this.premios.set(await this.juegos.premios(jid).then((r) => r.premios ?? []).catch(() => [] as Premio[]));
      await this.cargarConfig();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** La configuración pública de los juegos (si el endpoint no existe, se queda null). */
  async cargarConfig(): Promise<void> {
    if (this.config()) return;
    this.config.set(await this.juegos.config().catch(() => null));
  }

  /** Elige la jornada (vacío = la activa). */
  elegir(id: string): void {
    this.jornadaId.set(id);
  }

  /** La jornada con la que se llaman al API: la elegida, la de la URL o la activa. */
  jornadaActual(): string | undefined {
    return this.jornadaId() || this.jornadaDeUrl() || this.jornada()?.id || undefined;
  }

  /** La jornada que pide la URL (`?jornada=<id>`): permite abrir una jornada concreta (la de ayer, por ejemplo). */
  jornadaDeUrl(): string {
    const q = this.router.parseUrl(this.router.url).queryParams['jornada'];
    return typeof q === 'string' ? q : '';
  }

  /** Pide la cartera: el backend la crea sola al entrar (con o sin monedas) (contrato §6.1). */
  async cargarCartera(): Promise<void> {
    if (!this.fan.conSesion() || this.carteraCargando()) return;
    this.carteraCargando.set(true);
    try {
      this.cartera.set(await this.juegos.cartera(this.jornadaActual()));
    } catch {
      this.cartera.set(null);
    } finally {
      this.carteraCargando.set(false);
    }
  }
}

/** Un movimiento del mercado (feed): llega por SSE o se carga del API. */
export interface MovimientoFeed {
  tipo: TipoFichaje;
  atletaId: string;
  aliasDe: string;
  aliasA: string;
  precio: number;
  fecha: string;
  id?: string;
}

/** Une los fichajes cargados del API con los que llegan por SSE, sin repetir y del más nuevo al más viejo. */
export function fusionaFichajes(cargados: MovimientoFeed[], enVivo: MovimientoFeed[]): MovimientoFeed[] {
  const vistos = new Set<string>();
  const out: MovimientoFeed[] = [];
  for (const f of [...enVivo, ...cargados]) {
    const k = `${f.tipo}|${f.atletaId}|${f.fecha}|${f.precio}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(f);
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 30);
}

/** Un cambio de cláusula en vivo. */
export interface CambioClausula {
  atletaId: string;
  clausula: number;
  /** La diferencia en monedas (así lo envía el backend). */
  delta: number;
  /** La diferencia en porcentaje (la muestra el chip de tendencia). */
  pct: number;
  fecha: string;
}

/** El cambio de la cláusula en porcentaje: el backend envía la diferencia en monedas. */
export function pctClausula(clausula: number, delta: number): number {
  const previo = clausula - delta;
  if (!previo) return 0;
  return Math.round((delta / previo) * 100);
}

/**
 * Tiempo real de los juegos: se suscribe al SSE público de la competición (realtime reenvía los eventos
 * `fantasy.clausula`, `fantasy.fichaje`, `porra.mercado` y `juegos.clasificacion`) y los deja en signals.
 * Solo en el navegador: con SSR no hay EventSource.
 */
@Injectable({ providedIn: 'root' })
export class JuegosEnVivo {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private es: EventSource | null = null;
  private usos = 0;

  readonly conectado = signal(false);
  /** Último valor de la cláusula por atleta (para la flecha y la sparkline). */
  readonly clausulas = signal<Map<string, CambioClausula>>(new Map());
  /** Serie de valores de la cláusula por atleta (para la sparkline). */
  readonly series = signal<Map<string, number[]>>(new Map());
  /** Feed de movimientos del mercado (los últimos, del más nuevo al más viejo). */
  readonly feed = signal<MovimientoFeed[]>([]);
  /** Estado de los mercados de porra que cambian en vivo. */
  readonly mercados = signal<Map<string, string>>(new Map());
  /** Podios de la última clasificación emitida (alias). */
  readonly podios = signal<{ porra: string[]; fantasy: string[] } | null>(null);
  /** Si algo cambió (para recargar la vista sin perder el scroll). */
  readonly version = signal(0);

  /** Abre la suscripción (refcount: la comparten varias páginas). */
  conectar(): void {
    if (!this.browser) return;
    this.usos++;
    if (this.es) return;
    const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
    this.es = es;
    es.onopen = () => this.conectado.set(true);
    es.onerror = () => this.conectado.set(false);
    es.addEventListener('fantasy.clausula', (e) => this.clausula(e));
    es.addEventListener('fantasy.fichaje', (e) => this.fichaje(e));
    es.addEventListener('porra.mercado', (e) => this.mercado(e));
    es.addEventListener('juegos.clasificacion', (e) => this.clasificacion(e));
  }

  /** Cierra la suscripción cuando la última página que la usa se destruye. */
  desconectar(): void {
    if (!this.browser) return;
    this.usos = Math.max(0, this.usos - 1);
    if (this.usos > 0) return;
    this.es?.close();
    this.es = null;
    this.conectado.set(false);
  }

  /** Registra un valor de cláusula (para la serie y la flecha). */
  fijarClausula(atletaId: string, clausula: number): void {
    const serie = this.series().get(atletaId);
    if (!serie || serie[serie.length - 1] !== clausula) {
      const copia = new Map(this.series());
      copia.set(atletaId, [...(serie ?? []), clausula].slice(-24));
      this.series.set(copia);
    }
  }

  private datos(e: Event): Record<string, unknown> | null {
    try {
      const env = JSON.parse((e as MessageEvent).data as string) as { datos?: Record<string, unknown> };
      return env?.datos ?? null;
    } catch {
      return null;
    }
  }

  private clausula(e: Event): void {
    const d = this.datos(e);
    const atletaId = typeof d?.['atletaId'] === 'string' ? (d['atletaId'] as string) : '';
    const clausula = typeof d?.['clausula'] === 'number' ? (d['clausula'] as number) : 0;
    if (!atletaId || !clausula) return;
    const delta = typeof d?.['delta'] === 'number' ? (d['delta'] as number) : 0;
    const copia = new Map(this.clausulas());
    copia.set(atletaId, { atletaId, clausula, delta, pct: pctClausula(clausula, delta), fecha: new Date().toISOString() });
    this.clausulas.set(copia);
    this.fijarClausula(atletaId, clausula);
    this.version.update((v) => v + 1);
  }

  private fichaje(e: Event): void {
    const d = this.datos(e);
    if (!d) return;
    const tipo = (d['tipo'] as TipoFichaje) ?? 'compra';
    const mov: MovimientoFeed = {
      tipo,
      atletaId: String(d['atletaId'] ?? ''),
      aliasDe: String(d['aliasDe'] ?? ''),
      aliasA: String(d['aliasA'] ?? ''),
      precio: Number(d['precio'] ?? 0),
      fecha: new Date().toISOString(),
    };
    this.feed.update((l) => [mov, ...l].slice(0, 30));
    this.version.update((v) => v + 1);
  }

  private mercado(e: Event): void {
    const d = this.datos(e);
    const id = typeof d?.['mercadoId'] === 'string' ? (d['mercadoId'] as string) : '';
    const estado = typeof d?.['estado'] === 'string' ? (d['estado'] as string) : '';
    if (!id || !estado) return;
    const copia = new Map(this.mercados());
    copia.set(id, estado);
    this.mercados.set(copia);
    this.version.update((v) => v + 1);
  }

  private clasificacion(e: Event): void {
    const d = this.datos(e);
    if (!d) return;
    const porra = Array.isArray(d['porra']) ? (d['porra'] as string[]) : [];
    const fantasy = Array.isArray(d['fantasy']) ? (d['fantasy'] as string[]) : [];
    this.podios.set({ porra, fantasy });
    this.version.update((v) => v + 1);
  }
}

// ---------------------------------------------------------------------------------------------
// Estado de las pantallas
// ---------------------------------------------------------------------------------------------

/** Datos de la porra compartidos por /porra, /porra/mis-apuestas y /porra/clasificacion. */
@Injectable({ providedIn: 'root' })
export class PorraStore {
  private readonly juegos = inject(Juegos);
  readonly estado = inject(JuegosEstado);
  private readonly fan = inject(FanSession);
  private readonly vivo = inject(JuegosEnVivo);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly mercados = signal<Mercado[]>([]);
  readonly jornada = signal<Jornada | null>(null);
  readonly premios = computed(() => this.estado.premios());

  readonly cargandoApuestas = signal(false);
  readonly apuestas = signal<Apuesta[]>([]);
  readonly errorApuestas = signal<string | null>(null);

  readonly cargandoClas = signal(false);
  readonly clas = signal<{ top: FilaPorra[]; miPuesto: number; miSaldo: number } | null>(null);

  /** Mercados y premios de la jornada elegida. */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    const jid = this.estado.jornadaActual();
    try {
      const m = await this.juegos.porraMercados(jid);
      this.mercados.set(m.mercados ?? []);
      this.jornada.set(m.jornada ?? null);
      this.error.set(null);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Recarga solo los mercados (las cuotas cambian en vivo). */
  async recargarMercados(): Promise<void> {
    try {
      const m = await this.juegos.porraMercados(this.estado.jornadaActual());
      this.mercados.set(m.mercados ?? []);
      this.error.set(null);
    } catch {
      /* se mantiene lo anterior */
    }
  }

  /** Mis apuestas (solo con sesión). */
  async cargarApuestas(): Promise<void> {
    if (!this.fan.conSesion()) {
      this.apuestas.set([]);
      return;
    }
    this.cargandoApuestas.set(true);
    try {
      const r = await this.juegos.porraMisApuestas(this.estado.jornadaActual());
      this.apuestas.set(r.apuestas ?? []);
      this.errorApuestas.set(null);
    } catch (e) {
      this.errorApuestas.set(mensajeError(e));
    } finally {
      this.cargandoApuestas.set(false);
    }
  }

  /** La clasificación de la porra (público; «mi puesto» si hay sesión). */
  async cargarClasificacion(): Promise<void> {
    this.cargandoClas.set(true);
    try {
      const c = await this.juegos.porraClasificacion(this.estado.jornadaActual());
      this.clas.set({ top: c.top ?? [], miPuesto: c.miPuesto ?? 0, miSaldo: c.miSaldo ?? 0 });
    } catch {
      this.clas.set(null);
    } finally {
      this.cargandoClas.set(false);
    }
  }

  /** La versión del stream: cambia con los eventos de porra (para recargar cuando llega uno). */
  get version(): number {
    return this.vivo.version();
  }
}

/** Datos de GRS Fantasy compartidos por /fantasy, /fantasy/mercado y /fantasy/clasificacion. */
@Injectable({ providedIn: 'root' })
export class FantasyStore {
  private readonly juegos = inject(Juegos);
  readonly estado = inject(JuegosEstado);
  private readonly fan = inject(FanSession);
  private readonly vivo = inject(JuegosEnVivo);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly atletas = signal<AtletaMercado[]>([]);
  readonly jornada = signal<Jornada | null>(null);
  /** Cuándo se cargó el mercado por última vez (para el «actualizado hace X s»). */
  readonly cargadoEn = signal<number | null>(null);

  readonly cargandoEquipo = signal(false);
  readonly equipo = signal<MiEquipo | null>(null);
  readonly errorEquipo = signal<string | null>(null);

  readonly cargandoDetalle = signal(false);
  readonly detalle = signal<AtletaDetalle | null>(null);

  readonly cargandoClas = signal(false);
  readonly clas = signal<{ top: FilaFantasy[]; miPuesto: number; miPuntos: number } | null>(null);
  /** Las fichas ya cargadas por atleta (para los puntos en vivo de la plantilla). */
  readonly detalles = signal<Map<string, AtletaDetalle>>(new Map());
  /** Los últimos fichajes del mercado (los del API; el SSE los añade encima). */
  readonly fichajes = signal<MovimientoFeed[]>([]);
  /** Los fichajes de un atleta (para el historial de su ficha). */
  readonly fichajesAtleta = signal<MovimientoFeed[]>([]);

  /** El mercado de atletas de la jornada elegida. */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    const jid = this.estado.jornadaActual();
    try {
      const m = await this.juegos.fantasyMercado(jid);
      this.atletas.set(m.atletas ?? []);
      this.jornada.set(m.jornada ?? null);
      this.cargadoEn.set(Date.now());
      this.error.set(null);
      // la serie de cláusulas del sparkline arranca con el valor actual
      for (const a of m.atletas ?? []) this.vivo.fijarClausula(a.atletaId, a.clausula);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Mi plantilla (solo con sesión). */
  async cargarEquipo(): Promise<void> {
    if (!this.fan.conSesion()) {
      this.equipo.set(null);
      return;
    }
    this.cargandoEquipo.set(true);
    try {
      this.equipo.set(await this.juegos.fantasyMiEquipo(this.estado.jornadaActual()));
      this.errorEquipo.set(null);
    } catch (e) {
      this.errorEquipo.set(mensajeError(e));
    } finally {
      this.cargandoEquipo.set(false);
    }
  }

  /** La ficha de un atleta: historial de la cláusula y desglose de puntos. */
  async cargarDetalle(atletaId: string): Promise<void> {
    this.cargandoDetalle.set(true);
    this.detalle.set(null);
    try {
      this.detalle.set(await this.juegos.fantasyAtleta(atletaId, this.estado.jornadaActual()));
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargandoDetalle.set(false);
    }
  }

  /** Las fichas de varios atletas a la vez (los titulares de la plantilla). */
  async cargarDetalles(atletaIds: string[]): Promise<void> {
    const ids = atletaIds.filter((id) => !this.detalles().has(id));
    if (!ids.length) return;
    const fichas = await Promise.all(
      ids.map(async (id) => {
        try {
          return { id, d: await this.juegos.fantasyAtleta(id, this.estado.jornadaActual()) };
        } catch {
          return null;
        }
      }),
    );
    const copia = new Map(this.detalles());
    for (const f of fichas) if (f) copia.set(f.id, f.d);
    this.detalles.set(copia);
  }

  /** Los últimos fichajes del mercado (si el backend todavía no expone el endpoint, se queda vacío). */
  async cargarFichajes(atletaId?: string): Promise<void> {
    try {
      const r = await this.juegos.fichajes(this.estado.jornadaActual(), atletaId);
      const lista = (r.fichajes ?? []).map((f) => ({ ...f, fecha: f.createdAt })) as MovimientoFeed[];
      if (atletaId) this.fichajesAtleta.set(lista);
      else this.fichajes.set(lista);
    } catch {
      /* el endpoint puede no existir todavía: el feed sigue con lo que llega por SSE */
      if (atletaId) this.fichajesAtleta.set([]);
    }
  }

  /** La clasificación de fantasy (público; «mi puesto» si hay sesión). */
  async cargarClasificacion(): Promise<void> {
    this.cargandoClas.set(true);
    try {
      const c = await this.juegos.fantasyClasificacion(this.estado.jornadaActual());
      this.clas.set({ top: c.top ?? [], miPuesto: c.miPuesto ?? 0, miPuntos: c.miPuntos ?? 0 });
    } catch {
      this.clas.set(null);
    } finally {
      this.cargandoClas.set(false);
    }
  }
}

