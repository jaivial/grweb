// Types of the platform API used by the backoffice (gateway /api, problem+json errors).

export interface Problem {
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { message: string; location?: string }[];
}

export interface Membresia {
  competitionId: string;
  rol: { slug: string; nombre: string };
  permisos: string[];
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  root: boolean;
  competiciones: Membresia[];
}

export interface Sesion {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  usuario: Usuario;
}

export interface Modulo {
  activo: boolean;
  bloqueado: boolean;
  motivo?: string;
}

export interface Competicion {
  id: string;
  slug: string;
  nombre: string;
  nombreCorto: string;
  edicion: number;
  estado: 'borrador' | 'proximamente' | 'inscripciones' | 'completas' | 'hoy' | 'finalizado' | 'archivada';
  fechaInicio?: string;
  fechaFin?: string;
  zonaHoraria: string;
  sede: { nombre: string; direccion: string; cp: string; ciudad: string; provincia: string; mapsUrl: string };
  evento: { descripcion: string; nivel: string; organizador: string; emailContacto: string; puertas: string; aforoPabellon: number };
  modulos: Record<string, Modulo>;
  inscripcion: { modo: string; url: string; estado: string };
  version: number;
}

export interface PasoChecklist {
  clave: string;
  titulo: string;
  ayuda: string;
  hecho: boolean;
  hechoAt?: string;
  automatico: boolean;
}

export interface Checklist {
  pasos: PasoChecklist[];
  hechos: number;
  total: number;
  completa: boolean;
}

export interface Actividad {
  id: string;
  tipo: string;
  actor: string;
  origen: string;
  resumen: string;
  entidad: string;
  fecha: string;
}

export interface Notificacion {
  id: string;
  titulo: string;
  cuerpo: string;
  enlace: string;
  nivel: 'info' | 'ok' | 'aviso' | 'error';
  leida: boolean;
  fecha: string;
}

export interface Dashboard {
  modo: string;
  kpis: Record<string, number>;
  hora: string;
}

export interface Integracion {
  tipo: string;
  estado: 'sin_configurar' | 'configurada' | 'ok' | 'error';
  error?: string;
}

export interface DispositivoInfo {
  userCode: string;
  cliente: string;
  estado: 'pendiente' | 'aprobado' | 'denegado' | 'caducado';
  createdAt: string;
}

export interface InvitacionInfo {
  competitionId: string;
  email: string;
  rol: string;
  expiresAt: string;
  cuentaExistente: boolean;
}

export function problemOf(err: unknown): Problem {
  const e = err as { error?: Problem; status?: number };
  if (e?.error && typeof e.error === 'object' && 'code' in e.error) return e.error;
  if (e?.status === 0) return { title: 'Sin conexión', status: 0, code: 'SIN_CONEXION', detail: 'No hay conexión con el servidor. Revisa tu red.' };
  return { title: 'Error', status: e?.status ?? 500, code: 'ERROR_INTERNO', detail: 'Algo ha fallado. Inténtalo de nuevo.' };
}
