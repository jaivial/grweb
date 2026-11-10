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

/** Un concepto del desglose de la nota de un atleta (A intentos, B puesto, C bonus, nulos y blanqueo). */
export type ConceptoNota = 'intentos' | 'puesto' | 'pleno' | 'record_personal' | 'record_competicion' | 'total' | 'nulos' | 'blanqueo';

/** La nota 0,0–10,0 de un atleta con su desglose (`tieneNota` = ya ha hecho algún intento). */
export interface Nota {
  valor: number;
  tieneNota: boolean;
  blanqueo: boolean;
  validos: number;
  nulos: number;
  desglose: { concepto: ConceptoNota; valor: number }[];
}

/** Un atleta del mercado de fantasy (el dueño es el de MI sala o el de la sala pedida). */
export interface AtletaMercado {
  atletaId: string;
  nombre: string;
  fotoUrl?: string;
  sexo: Sexo;
  categoria: string;
  clausula: number;
  duenoAlias?: string;
  protegido: boolean;
  /** Hasta cuándo está protegido (RFC3339); lo devuelve el backend para la cuenta atrás. */
  protegidoHasta?: string;
  libre: boolean;
  esMio: boolean;
  flightEnCurso: boolean;
  nota: Nota;
}

/** Un atleta de una alineación (popover del lobby, sala y palmarés). */
export interface AtletaAlineado {
  atletaId: string;
  nombre: string;
  fotoUrl?: string;
  categoria: string;
  clausula: number;
  nota: Nota;
}

/** Una fila de la clasificación de una sala: la nota es la media de la alineación y `conNota` los atletas que ya puntúan. */
export interface FilaSala {
  puesto: number;
  miembroId: string;
  alias: string;
  nota: number;
  conNota: number;
  valor: number;
  saldo: number;
  esAnfitrion: boolean;
  esYo: boolean;
  alineacion: AtletaAlineado[];
}

export type EstadoSala = 'esperando' | 'lista' | 'llena' | 'en_juego' | 'cancelada' | 'cerrada' | 'finalizada';
export type EstadoSolicitud = 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada' | 'caducada' | 'sala_llena' | 'expulsada';

/** Una sala del lobby con su líder y, si la hay, mi solicitud. */
export interface SalaVista {
  id: string;
  nombre: string;
  anfitrion: string;
  plazas: number;
  miembros: number;
  publica: boolean;
  esMia: boolean;
  estado: EstadoSala;
  lider?: FilaSala;
  miSolicitud?: EstadoSolicitud;
}

/** La sala en la que se juega (mercado, mi equipo y clasificación van por sala). */
export interface SalaResumen {
  id: string;
  nombre: string;
  estado: 'abierta' | 'en_juego' | 'cancelada' | 'cerrada' | 'finalizada';
}

/** El estado de los clausulazos: se cierran al empezar la última sesión del día (o si no hay horario). */
export interface Clausulazo {
  abierto: boolean;
  cierre?: string;
  motivo?: 'sin_horario' | 'ultima_sesion';
}

/** `GET /fantasy/salas`: el lobby del día. */
export interface Lobby {
  jornada?: Jornada;
  salas: SalaVista[];
  miSala?: string;
  atletas: number;
  plazasMax: number;
  puedeCrear: boolean;
  empezada: boolean;
  solicitudesMax: number;
  solicitudesPendientes: number;
}

/** `GET /fantasy/salas/{id}`: la sala con sus jugadores; el código solo lo ven los miembros y las solicitudes, el anfitrión. */
export interface SalaDetalle {
  jornada?: Jornada;
  sala: SalaVista;
  filas: FilaSala[];
  codigo?: string;
  solicitudes: { id: string; alias: string; createdAt: string }[];
  clausulazo: Clausulazo;
  empezada: boolean;
  plazasMax: number;
}

export type EstadoInvitacion = 'disponible' | 'sin_sesion' | 'ya_miembro' | 'otra_sala' | 'llena' | 'empezada' | 'cerrada' | 'expulsado';

/** `GET /fantasy/invitaciones/{codigo}`: la sala a la que lleva el enlace del anfitrión y si se puede entrar. */
export interface Invitacion {
  jornada?: Jornada;
  sala: SalaVista;
  estado: EstadoInvitacion;
  solicitudesPendientes: number;
}

/** Una fila del palmarés (nota final de la alineación). */
export interface FilaPalmares {
  puesto: number;
  alias: string;
  nota: number;
  valor: number;
  saldo: number;
  alineacion: AtletaAlineado[];
}

/** Una sala del palmarés de un día con sus ganadores (varios si comparten puesto). */
export interface SalaPalmares {
  salaId: string;
  nombre: string;
  estado: 'finalizada' | 'cancelada';
  jugadores: number;
  ganadores: FilaPalmares[];
}

/** Un día del palmarés (jornada cerrada). */
export interface DiaPalmares {
  jornadaId: string;
  dia: string;
  nombre: string;
  salas: SalaPalmares[];
}

/** Mi alineación en mi sala del día: exactamente 5 atletas, sin suplentes. `sala` ausente = no estoy en ninguna sala. */
export interface MiEquipo {
  jornada?: Jornada;
  sala?: SalaResumen;
  atletas: AtletaMercado[];
  alineacion: number;
  nota: number;
  conNota: number;
  valor: number;
  saldo: number;
  clausulazos: number;
  clausulazo?: Clausulazo;
}

/** Un cambio de cláusula (para la gráfica y la flecha de tendencia). */
export interface HistorialClausula {
  clausula: number;
  delta: number;
  motivo: string;
  createdAt: string;
}

/** Un intento de un atleta en un movimiento. */
export interface Intento {
  n: number;
  peso: number;
  resultado: string;
}

/** La ficha de un atleta: cláusula actual, nota con desglose, intentos e historial de la cláusula. */
export interface AtletaDetalle {
  atleta?: AtletaMercado;
  intentos?: Partial<Record<Mov, Intento[]>>;
  clausulas: HistorialClausula[];
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
  salaId?: string;
}

/** La tabla de la nota 0–10 de la configuración pública (`puntos` en el backend). */
export interface NotaConfig {
  intentos?: number;
  puesto?: number[];
  pleno?: number;
  recordPersonal?: number;
  recordCompeticion?: number;
  total?: number;
  nulo?: number;
  pctClausula?: number;
}

/** `GET /juegos/config`: solo los valores públicos (los internos no se exponen). */
export interface ConfigJuegos {
  porraMin?: number;
  porraMax?: number;
  maxClausulazos?: number;
  proteccionMin?: number;
  plantillaMax?: number;
  titularesMax?: number;
  clausulaInicial?: number;
  clausulaMin?: number;
  clausulaMax?: number;
  puntos?: NotaConfig;
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

const nf1c = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** La tabla de la nota (Figma «Tabla de la nota») con los valores de la configuración pública. */
export function tablaNota(cfg: ConfigJuegos | null): { concepto: string; detalle: string; valor: string; tono: '' | 'rojo'; fondo: boolean }[] {
  const p = cfg?.puntos ?? {};
  const d = (n: number) => nf1c.format(n);
  const puesto = p.puesto?.length ? p.puesto : [3, 2.4, 1.8, 1.2, 0.6];
  const intentos = p.intentos ?? 5;
  return [
    { concepto: 'A · Intentos válidos', detalle: `Cada intento válido suma ≈ ${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Math.round((intentos / 9) * 100) / 100)}.`, valor: `${d(intentos)} × válidos ÷ 9`, tono: '', fondo: false },
    { concepto: 'Intento nulo (no lift)', detalle: 'Cada intento nulo resta nota.', valor: `−${d(p.nulo ?? 0.3)} por nulo`, tono: 'rojo', fondo: false },
    { concepto: 'B · Puesto en su categoría', detalle: '1.º a 5.º; provisional en directo, definitivo al publicarse la categoría.', valor: puesto.map(d).join(' · '), tono: '', fondo: false },
    { concepto: 'C · Pleno 9/9', detalle: '9 intentos válidos.', valor: '+' + d(p.pleno ?? 0.5), tono: '', fondo: false },
    { concepto: 'C · Récord personal', detalle: 'Supera su mejor marca registrada.', valor: '+' + d(p.recordPersonal ?? 0.6), tono: '', fondo: false },
    { concepto: 'C · Récord de la competición', detalle: 'Sustituye al récord personal; no se acumulan.', valor: '+' + d(p.recordCompeticion ?? 1), tono: '', fondo: false },
    { concepto: 'C · Total completado', detalle: 'Al menos 1 intento válido en cada movimiento.', valor: '+' + d(p.total ?? 0.3), tono: '', fondo: false },
    { concepto: 'Tope y redondeo', detalle: 'Nota = A + B + C − nulos, 1 decimal; C máx. 2,0.', valor: '0,0 – 10,0', tono: '', fondo: false },
    { concepto: 'Blanqueo / descalificación', detalle: '3 nulos en un mismo movimiento (bomb-out) o DQ: 0,0 absoluto que anula todo.', valor: 'nota = 0,0', tono: 'rojo', fondo: true },
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
  PLANTILLA_LLENA: 'Tu alineación está completa: vende a alguien antes.',
  YA_CON_DUENO: 'Otro usuario ya tiene a ese atleta. Puedes pagar su cláusula.',
  ATLETA_LIBRE: 'Ese atleta está libre: cómpralo, no hace falta clausulazo.',
  ATLETA_AJENO: 'Ese atleta no es tuyo.',
  ATLETA_PROPIO: 'El atleta ya es tuyo.',
  SIN_SALA: 'Aún no estás en ninguna sala hoy: únete a una o crea la tuya.',
  CLAUSULAZO_CERRADO: 'Los clausulazos están cerrados: ya empezó la última sesión del día.',
  NOMBRE_NO_VALIDO: 'Este nombre contiene palabras no permitidas o ya existe hoy. Elige otro (3–32 caracteres).',
  NOMBRE_OCUPADO: 'Este nombre contiene palabras no permitidas o ya existe hoy. Elige otro (3–32 caracteres).',
  PLAZAS_NO_VALIDAS: 'Ese número de plazas supera el cupo de atletas del día.',
  YA_EN_SALA: 'Ya estás en otra sala hoy. Solo puedes estar en una sala por día.',
  YA_MIEMBRO: 'Ya eres miembro de esta sala.',
  ATLETAS_INSUFICIENTES: 'Hoy no hay atletas suficientes para crear una sala.',
  SALA_EMPEZADA: 'La sala ya ha empezado: no admite cambios ni jugadores.',
  SALA_LLENA: 'La sala está llena.',
  SALA_NO_DISPONIBLE: 'La sala ya no está disponible.',
  MAX_SOLICITUDES: 'Ya tienes 3 solicitudes pendientes. Cancela una para solicitar otra sala.',
  SOLICITUD_RECHAZADA: 'El anfitrión no ha aceptado tu solicitud. No puedes volver a solicitar esta sala hoy.',
  SOLICITUD_NO_PENDIENTE: 'Esa solicitud ya no está pendiente.',
  SIN_PERMISO: 'Solo el anfitrión puede hacer eso.',
  ANFITRION: 'El anfitrión no se puede expulsar.',
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
/** «8,6» (nota de un atleta en tarjetas: 1 decimal). */
export const nota1 = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : nf1.format(v));
/** «7,90» (medias de alineación y eventos: 2 decimales). */
export const nota2 = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : nf2.format(v));
/** «+0,56» · «−0,30» (cambio de nota de un evento). */
export const deltaNota = (v: number): string => (v > 0 ? '+' : v < 0 ? '−' : '') + nf2.format(Math.abs(v));
/** El tramo de color de una nota (Figma «Nota»: gris < 1 o sin nota · rojo < 5 · ámbar < 6 · azul < 8 · verde < 9 · morado). */
export type TramoNota = 'gris' | 'rojo' | 'ambar' | 'azul' | 'verde' | 'morado';
export function tramoNota(valor: number, tieneNota = true): TramoNota {
  if (!tieneNota || valor < 1) return 'gris';
  if (valor < 5) return 'rojo';
  if (valor < 6) return 'ambar';
  if (valor < 8) return 'azul';
  if (valor < 9) return 'verde';
  return 'morado';
}
/** «17:30» (hora local de un instante ISO). */
export const horaTxt = (iso: string | undefined): string => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '');
/** «128.400» (monedas, sin decimales). */
export const monedas = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : nf.format(v));
/** «×2,4» (cuota orientativa). */
export const cuota = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : '×' + nf1.format(v));
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

  // ---- fantasy (todo va por sala: sin `sala` es la mía del día) ----
  fantasyMercado(jornadaId?: string, sala?: string): Promise<{ jornada?: Jornada; sala?: SalaResumen; atletas: AtletaMercado[]; clausulazo?: Clausulazo }> {
    return this.get(`${this.base}/fantasy/mercado${this.qs({ jornada: jornadaId, sala })}`);
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

  fantasyClasificacion(jornadaId?: string, sala?: string): Promise<{ jornada?: Jornada; sala?: SalaResumen; filas: FilaSala[]; miPuesto: number; miNota: number }> {
    return this.get(`${this.base}/fantasy/clasificacion${this.qs({ jornada: jornadaId, sala })}`);
  }

  fantasyAtleta(atletaId: string, jornadaId?: string): Promise<AtletaDetalle> {
    return this.get(`${this.base}/fantasy/atletas/${atletaId}${this.q(jornadaId)}`);
  }

  // ---- salas ----
  salas(q?: string, jornadaId?: string): Promise<Lobby> {
    return this.get(`${this.base}/fantasy/salas${this.qs({ q, jornada: jornadaId })}`);
  }
  crearSala(nombre: string, publica: boolean, jornadaId?: string): Promise<{ salaId: string }> {
    return this.post(`${this.base}/fantasy/salas`, { nombre, publica, jornada: jornadaId || undefined });
  }
  sala(id: string): Promise<SalaDetalle> {
    return this.get(`${this.base}/fantasy/salas/${id}`);
  }
  editarSala(id: string, cambios: { nombre?: string; plazas?: number; publica?: boolean; regenerarEnlace?: boolean }): Promise<{ codigo: string }> {
    return firstValueFrom(this.http.patch<{ codigo: string }>(`${this.base}/fantasy/salas/${id}`, cambios));
  }
  salirSala(id: string): Promise<void> {
    return this.post<void>(`${this.base}/fantasy/salas/${id}/salir`, {});
  }
  cerrarSala(id: string): Promise<void> {
    return this.post<void>(`${this.base}/fantasy/salas/${id}/cerrar`, {});
  }
  expulsar(id: string, miembroId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/fantasy/salas/${id}/miembros/${miembroId}`));
  }
  solicitar(id: string): Promise<{ solicitudId: string }> {
    return this.post(`${this.base}/fantasy/salas/${id}/solicitudes`, {});
  }
  cancelarSolicitud(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/fantasy/salas/${id}/solicitudes/mia`));
  }
  responderSolicitud(id: string, solicitudId: string, aceptar: boolean): Promise<void> {
    return this.post<void>(`${this.base}/fantasy/salas/${id}/solicitudes/${solicitudId}`, { aceptar });
  }
  invitacion(codigo: string): Promise<Invitacion> {
    return this.get(`${this.base}/fantasy/invitaciones/${encodeURIComponent(codigo)}`);
  }
  entrarConInvitacion(codigo: string): Promise<{ salaId: string }> {
    return this.post(`${this.base}/fantasy/invitaciones/${encodeURIComponent(codigo)}/entrar`, {});
  }
  palmares(): Promise<{ dias: DiaPalmares[] }> {
    return this.get(`${this.base}/fantasy/palmares`);
  }
  palmaresSala(id: string): Promise<{ jornada?: Jornada; sala: SalaResumen; filas: FilaPalmares[] }> {
    return this.get(`${this.base}/fantasy/palmares/${id}`);
  }

  // ---- premios ----
  premios(jornadaId?: string): Promise<{ premios: Premio[] }> {
    return this.get(`${this.base}/premios${this.q(jornadaId)}`);
  }

  /**
   * Los últimos fichajes del mercado (y de un atleta si se filtra). Tolera las dos formas de respuesta
   * (`{fichajes: […]}` o un array suelto) y los dos nombres de los alias (`aliasDe`/`deAlias`).
   */
  async fichajes(jornadaId?: string, atletaId?: string, sala?: string): Promise<{ fichajes: Fichaje[] }> {
    const q = new URLSearchParams();
    if (jornadaId) q.set('jornada', jornadaId);
    if (atletaId) q.set('atleta', atletaId);
    if (sala) q.set('sala', sala);
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
      salaId: str(x['salaId']) || undefined,
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
        intentos: num(p['intentos']),
        puesto: arr(p['puesto']),
        pleno: num(p['pleno']),
        recordPersonal: num(p['recordPersonal']),
        recordCompeticion: num(p['recordCompeticion']),
        total: num(p['total']),
        nulo: num(p['nulo']),
        pctClausula: num(p['pctClausula']),
      },
      activo: typeof c['activo'] === 'boolean' ? c['activo'] : undefined,
      version: num(c['version']),
    };
  }

  private q(jornadaId?: string): string {
    return jornadaId ? `?jornada=${encodeURIComponent(jornadaId)}` : '';
  }
  private qs(o: Record<string, string | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? '?' + s : '';
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
  /** La alineación: exactamente 5 atletas, sin suplentes. */
  readonly plantillaMax = computed(() => this.config()?.plantillaMax ?? 5);
  readonly clausulaInicial = computed(() => this.config()?.clausulaInicial ?? 200000);
  readonly clausulaMin = computed(() => this.config()?.clausulaMin ?? 50000);
  readonly clausulaMax = computed(() => this.config()?.clausulaMax ?? 5000000);
  /** La tabla de la nota con los valores configurados. */
  readonly tablaNota = computed(() => tablaNota(this.config()));
  /** Lo que resta cada intento nulo. */
  readonly nulo = computed(() => this.config()?.puntos?.nulo ?? 0.3);

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
    return this.jornadaId() || this.jornadaDeUrl() || undefined;
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
  salaId?: string;
}

/** Un cambio de sala en vivo (`fantasy.sala`). */
export interface EventoSala {
  jornadaId: string;
  salaId: string;
  tipo: 'creada' | 'miembros' | 'editada' | 'en_juego' | 'cancelada' | 'cerrada' | 'finalizada';
}
/** Una solicitud de unión en vivo (`fantasy.solicitud`). */
export interface EventoSolicitud {
  jornadaId: string;
  salaId: string;
  solicitudId: string;
  alias: string;
  tipo: EstadoSolicitud;
}
/** Un cambio de nota en vivo (`fantasy.nota`). */
export interface EventoNota {
  jornadaId: string;
  atletaId: string;
  nota: number;
  delta: number;
  validos: number;
  nulos: number;
  blanqueo: boolean;
  fecha: string;
}

/** Une los fichajes cargados del API con los que llegan por SSE, sin repetir y del más nuevo al más viejo. */
export function fusionaFichajes(cargados: MovimientoFeed[], enVivo: MovimientoFeed[], salaId?: string): MovimientoFeed[] {
  const vistos = new Set<string>();
  const out: MovimientoFeed[] = [];
  for (const f of [...enVivo, ...cargados]) {
    // los fichajes de otras salas no cuentan en esta
    if (salaId && f.salaId && f.salaId !== salaId) continue;
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
 * `fantasy.clausula`, `fantasy.fichaje`, `fantasy.sala`, `fantasy.solicitud`, `fantasy.nota`, `porra.mercado` y
 * `juegos.clasificacion`) y los deja en signals.
 * Solo en el navegador: con SSR no hay EventSource.
 */
@Injectable({ providedIn: 'root' })
export class JuegosEnVivo {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private es: EventSource | null = null;
  private usos = 0;

  readonly conectado = signal(false);
  /** La conexión en vivo se ha perdido (el navegador reintenta solo): las pantallas avisan «Sin conexión en tiempo real». */
  readonly caida = signal(false);
  /** El último evento de sala, de solicitud y de nota (para avisos y recargas). */
  readonly sala = signal<EventoSala | null>(null);
  readonly solicitud = signal<EventoSolicitud | null>(null);
  readonly nota = signal<EventoNota | null>(null);
  /** Cambian con cada evento de sala/solicitud y de nota (para recargar el lobby, la sala y las medias). */
  readonly versionSalas = signal(0);
  readonly versionNotas = signal(0);
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
    es.onopen = () => {
      this.conectado.set(true);
      this.caida.set(false);
    };
    es.onerror = () => {
      this.conectado.set(false);
      this.caida.set(true);
    };
    es.addEventListener('fantasy.clausula', (e) => this.clausula(e));
    es.addEventListener('fantasy.fichaje', (e) => this.fichaje(e));
    es.addEventListener('fantasy.sala', (e) => this.eventoSala(e));
    es.addEventListener('fantasy.solicitud', (e) => this.eventoSolicitud(e));
    es.addEventListener('fantasy.nota', (e) => this.eventoNota(e));
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
    this.caida.set(false);
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
      salaId: typeof d['salaId'] === 'string' ? (d['salaId'] as string) : undefined,
    };
    this.feed.update((l) => [mov, ...l].slice(0, 30));
    this.version.update((v) => v + 1);
  }

  private eventoSala(e: Event): void {
    const d = this.datos(e);
    if (!d) return;
    this.sala.set({ jornadaId: String(d['jornadaId'] ?? ''), salaId: String(d['salaId'] ?? ''), tipo: String(d['tipo'] ?? 'editada') as EventoSala['tipo'] });
    this.versionSalas.update((v) => v + 1);
  }

  private eventoSolicitud(e: Event): void {
    const d = this.datos(e);
    if (!d) return;
    this.solicitud.set({
      jornadaId: String(d['jornadaId'] ?? ''),
      salaId: String(d['salaId'] ?? ''),
      solicitudId: String(d['solicitudId'] ?? ''),
      alias: String(d['alias'] ?? ''),
      tipo: String(d['tipo'] ?? 'pendiente') as EstadoSolicitud,
    });
    this.versionSalas.update((v) => v + 1);
  }

  private eventoNota(e: Event): void {
    const d = this.datos(e);
    const atletaId = typeof d?.['atletaId'] === 'string' ? (d['atletaId'] as string) : '';
    if (!d || !atletaId) return;
    this.nota.set({
      jornadaId: String(d['jornadaId'] ?? ''),
      atletaId,
      nota: Number(d['nota'] ?? 0),
      delta: Number(d['delta'] ?? 0),
      validos: Number(d['validos'] ?? 0),
      nulos: Number(d['nulos'] ?? 0),
      blanqueo: d['blanqueo'] === true,
      fecha: new Date().toISOString(),
    });
    this.versionNotas.update((v) => v + 1);
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

/** Datos de GRS Fantasy compartidos por /fantasy, /fantasy/mercado y /fantasy/clasificacion (todo por sala). */
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
  /** La sala pedida por la URL (/fantasy/salas/:id/…); vacío = mi sala del día. */
  readonly salaPedida = signal('');
  /** La sala en la que se juega (null = no estoy en ninguna y no se pidió otra). */
  readonly sala = signal<SalaResumen | null>(null);
  /** Si los clausulazos siguen abiertos y a qué hora se cierran. */
  readonly clausulazo = signal<Clausulazo | null>(null);

  readonly cargandoEquipo = signal(false);
  readonly equipo = signal<MiEquipo | null>(null);
  readonly errorEquipo = signal<string | null>(null);

  readonly cargandoDetalle = signal(false);
  readonly detalle = signal<AtletaDetalle | null>(null);

  readonly cargandoClas = signal(false);
  readonly clas = signal<{ filas: FilaSala[]; miPuesto: number; miNota: number } | null>(null);
  /** Los últimos fichajes del mercado (los del API; el SSE los añade encima). */
  readonly fichajes = signal<MovimientoFeed[]>([]);
  /** Los fichajes de un atleta (para el historial de su ficha). */
  readonly fichajesAtleta = signal<MovimientoFeed[]>([]);

  /** El mercado de atletas de la sala (la pedida o la mía) en la jornada elegida. */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    const jid = this.estado.jornadaActual();
    try {
      const m = await this.juegos.fantasyMercado(jid, this.salaPedida() || undefined);
      this.atletas.set(m.atletas ?? []);
      this.jornada.set(m.jornada ?? null);
      this.sala.set(m.sala ?? null);
      this.clausulazo.set(m.clausulazo ?? null);
      this.error.set(null);
      // la serie de cláusulas del sparkline arranca con el valor actual
      for (const a of m.atletas ?? []) this.vivo.fijarClausula(a.atletaId, a.clausula);
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Recarga el mercado sin esqueleto (notas y dueños cambian en vivo). */
  async recargar(): Promise<void> {
    try {
      const m = await this.juegos.fantasyMercado(this.estado.jornadaActual(), this.salaPedida() || undefined);
      this.atletas.set(m.atletas ?? []);
      this.sala.set(m.sala ?? null);
      this.clausulazo.set(m.clausulazo ?? null);
    } catch {
      /* se mantiene lo anterior */
    }
  }

  /** Mi alineación (solo con sesión). */
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

  /** La ficha de un atleta: historial de la cláusula, intentos y desglose de la nota. */
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

  /** Los últimos fichajes del mercado (si el backend todavía no expone el endpoint, se queda vacío). */
  async cargarFichajes(atletaId?: string): Promise<void> {
    try {
      const r = await this.juegos.fichajes(this.estado.jornadaActual(), atletaId, this.salaPedida() || this.sala()?.id);
      const lista = (r.fichajes ?? []).map((f) => ({ ...f, fecha: f.createdAt })) as MovimientoFeed[];
      if (atletaId) this.fichajesAtleta.set(lista);
      else this.fichajes.set(lista);
    } catch {
      /* el endpoint puede no existir todavía: el feed sigue con lo que llega por SSE */
      if (atletaId) this.fichajesAtleta.set([]);
    }
  }

  /** La clasificación de la sala (pública; «mi puesto» si hay sesión). */
  async cargarClasificacion(): Promise<void> {
    this.cargandoClas.set(true);
    try {
      const c = await this.juegos.fantasyClasificacion(this.estado.jornadaActual(), this.salaPedida() || undefined);
      this.clas.set({ filas: c.filas ?? [], miPuesto: c.miPuesto ?? 0, miNota: c.miNota ?? 0 });
      if (c.sala) this.sala.set(c.sala);
    } catch {
      this.clas.set(null);
    } finally {
      this.cargandoClas.set(false);
    }
  }
}

