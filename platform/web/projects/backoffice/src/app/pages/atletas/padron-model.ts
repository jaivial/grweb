import { cat, type Atleta } from './api';
import type { SolicitudDetalle } from './solicitudes-api';
import type { GrTone } from '@grcup/ui';

/** Estado de la coincidencia de un atleta con el padrón de la AEP (lo que guarda el emparejamiento). */
export type EstadoPadron = 'sin' | 'auto' | 'parcial' | 'manual' | 'confirmada' | 'descartada' | 'duplicado';

/** Una fila del padrón AEP (inscripciones_aep). */
export interface FilaPadron {
  id: string;
  nombre: string;
  apellidos: string;
  sexo: 'F' | 'M';
  anio: number;
  club?: string;
  division: string;
  equipamiento: 'raw' | 'equipado';
  categoria: string;
  totalAnterior?: number;
  openlifterLifterId?: number;
  atletaId?: string;
  estadoEnlace: 'pendiente' | 'auto' | 'sugerido' | 'manual' | 'rechazado';
  nivel: string;
}

/** Diferencia entre lo declarado y la fila del padrón (la calcula el servidor, en código). */
export interface DiscrepanciaPadron {
  campo: 'sexo' | 'anio' | 'categoria' | 'division' | 'nivel';
  solicitud: string;
  padron: string;
}

export interface DetallePadron {
  coincide: Record<string, boolean>;
  discrepancias: DiscrepanciaPadron[];
  nivelAep: string[];
  notasIa: string[];
  motivo: string;
  /** La otra ficha que ya tiene una fila del padrón con este nombre (estado «duplicado»). */
  duplicado?: OtraFicha;
}

/** Otra ficha del atleta, para nombrarla y enlazarla desde el panel. */
export interface OtraFicha {
  id: string;
  nombre: string;
}

/** Una decisión del registro de emparejamientos. */
export interface LogPadron {
  id: string;
  inscripcionId?: string;
  decision: string;
  origen: string;
  confianza?: number;
  modelo: string;
  aplicadoPor: string;
  createdAt: string;
}

/** La coincidencia de una solicitud (o de un atleta) con el padrón. */
export interface EmparejamientoPadron {
  estado: EstadoPadron;
  origen: string;
  confianza?: number;
  inscripcion?: FilaPadron;
  detalle: DetallePadron;
  log: LogPadron[];
  /** El alta de la que salió el atleta (la ficha la usa para reintentar y para el registro). */
  solicitudId?: string;
}

/** Los datos de la persona tal como los compara el emparejamiento. */
export interface PersonaPadron {
  nombre: string;
  apellidos: string;
  sexo: string;
  anio?: number;
  club?: string;
  categoria: string;
  division: string;
  nivel: string;
}

/** Estado compacto de la coincidencia, como lo devuelven la lista y la cabecera de la ficha. */
export interface PadronEstado {
  estado: EstadoPadron;
  origen?: string;
  confianza?: number;
  /** Campos que difieren con la fila del padrón (los mismos que marca la tabla del panel). */
  campos?: string[];
  /** La otra ficha con una fila del padrón de este nombre (estado «duplicado»). */
  duplicado?: OtraFicha;
}

/** Texto y color de cada estado: verde enlazado, ámbar parcial, ámbar «duplicado», gris sin coincidencia, rojo error de la IA. */
export const PADRON: Record<EstadoPadron, { l: string; tone: GrTone }> = {
  auto: { l: 'Enlazado', tone: 'success' },
  confirmada: { l: 'Confirmado', tone: 'success' },
  parcial: { l: 'Parcial · revisar', tone: 'warning' },
  duplicado: { l: 'Posible duplicado', tone: 'warning' },
  manual: { l: 'Sin coincidencia', tone: 'neutral' },
  descartada: { l: 'Descartada', tone: 'neutral' },
  sin: { l: 'Sin comparar', tone: 'neutral' },
};

/** Cómo se nombra cada campo en las diferencias («la categoría», «el año»). */
const CAMPOS: Record<string, string> = {
  categoria: 'la categoría', division: 'la división', anio: 'el año', sexo: 'el sexo', nivel: 'el nivel',
};

/**
 * Etiqueta del estado. Un «parcial» no lleva un porcentaje suelto: dice qué hay que mirar (las diferencias que ha visto
 * el código, o la confianza baja de la IA), que es lo que explica por qué no se enlazó solo.
 */
export function estadoPadron(e: {
  estado: EstadoPadron;
  origen?: string;
  confianza?: number;
  discrepancias?: { campo: string }[];
  /** La misma información ya resumida a nombres de campo (la que trae la ficha y la lista). */
  campos?: string[];
}): { l: string; tone: GrTone } {
  const p = PADRON[e.estado] ?? PADRON.sin;
  if (e.origen === 'error_ia' && (e.estado === 'parcial' || e.estado === 'manual')) return { l: 'Error IA · revisar', tone: 'danger' };
  const pct = e.confianza ? Math.round(e.confianza * 100) : 0;
  if (e.estado === 'parcial') {
    // Una sola fuente de verdad: los campos que difieren, vengan del detalle del panel o del resumen de la ficha.
    const distintos = [...new Set(e.campos ?? (e.discrepancias ?? []).map((d) => d.campo))];
    const campos = distintos.map((c) => CAMPOS[c] ?? c);
    if (campos.length === 1) return { l: `Parcial · revisa ${campos[0]}`, tone: 'warning' };
    if (campos.length > 1 && campos.length <= 2) return { l: `Parcial · revisa ${campos.join(' y ')}`, tone: 'warning' };
    if (campos.length > 2) return { l: `Parcial · revisa ${campos.length} diferencias`, tone: 'warning' };
    // «Confianza baja» solo si de verdad está por debajo del umbral automático (0,80).
    if (pct && pct < 80) return { l: `Parcial · confianza baja (${pct} %)`, tone: 'warning' };
    return p;
  }
  if (!pct || (e.estado !== 'auto' && e.estado !== 'confirmada')) return p;
  return { l: `${p.l} · ${pct} %`, tone: p.tone };
}

/** La misma etiqueta, corta, para la columna de la lista de atletas. */
export function estadoCorto(e: { estado: EstadoPadron; origen?: string }): { l: string; tone: GrTone } {
  const p = PADRON[e.estado] ?? PADRON.sin;
  if (e.origen === 'error_ia') return { l: 'Error IA', tone: 'danger' };
  const corto: Record<EstadoPadron, string> = {
    auto: 'Auto', confirmada: 'Staff', parcial: 'Parcial', duplicado: 'Duplicado', manual: 'Sin coincidencia', descartada: 'Sin coincidencia', sin: 'Sin comparar',
  };
  return { l: corto[e.estado ?? 'sin'] ?? 'Sin comparar', tone: p.tone };
}

/** Etiqueta de una decisión del registro. */
export const DECISION: Record<string, string> = {
  auto: 'Enlazado solo', parcial: 'Parcial', confirmada: 'Confirmada', descartada: 'Descartada', manual: 'Sin candidato',
  duplicado: 'Posible duplicado',
  sugerido: 'Propuesta', aceptado: 'Aceptada', corregido: 'Corregida', rechazado: 'Rechazada',
};
export const ORIGEN: Record<string, string> = {
  exacto: 'sin IA', ia: 'IA', error_ia: 'error de la IA', sin_candidatos: 'sin candidatos', staff: 'equipo', revision: 'revisión',
  duplicado: 'otra ficha del padrón',
};

const anio = (f?: string) => (f ? Number(String(f).slice(0, 4)) || undefined : undefined);

/** La persona de una solicitud de alta (los datos que se comparan con el padrón). */
export function personaDeSolicitud(d: SolicitudDetalle): PersonaPadron {
  return { nombre: d.nombre, apellidos: d.apellidos, sexo: d.sexo, anio: anio(d.fechaNacimiento), club: d.club,
    categoria: d.categoria, division: '', nivel: d.prueba };
}

/** La persona de un atleta (su ficha) para compararla con el padrón. */
export function personaDeAtleta(a: Atleta): PersonaPadron {
  return { nombre: a.nombre, apellidos: a.apellidos, sexo: a.sexo, anio: anio(a.fechaNacimiento), club: a.club,
    categoria: a.categoria, division: a.division, nivel: a.prueba };
}

/** Texto para comparar: sin tildes, sin mayúsculas y sin espacios de más («Lucía» es «lucia»). */
export const normTexto = (v: string) => v.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** «−63» o «AEP-2» listos para leer. */
export const nivelTexto = (n: string) => (n ? n.toUpperCase().replace('AEP', 'AEP-') : '—');
export const categoriaTexto = (c: string) => (c ? `${cat(c)} kg` : '—');
