import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { sinTimeout } from '@grcup/ui';

// Contract: platform/docs/FORMULARIOS.md §2 (esquema), §4 (admin API), §7 (asistente IA). camelCase JSON.

/** Corte de la petición de crear un envío (el resto de POST usan el corte global de 12 s, que aquí no aplica). */
export const ENVIO_TIMEOUT_MS = 30_000;

export type TipoCampo =
  | 'titulo' | 'parrafo' | 'imagen' | 'separador'
  | 'texto_corto' | 'texto_largo' | 'email' | 'telefono' | 'numero' | 'fecha'
  | 'opcion_unica' | 'desplegable' | 'casillas' | 'seleccion_multiple' | 'casilla' | 'si_no'
  | 'deslizador' | 'escala' | 'valoracion'
  | 'archivo';
export type Ancho = 'completo' | 'mitad';
export type Alinear = 'izquierda' | 'centro' | 'derecha';
export type Tamano = 's' | 'm' | 'l';
export type Fuente = 'sistema' | 'serif' | 'mono';
export type Densidad = 'compacta' | 'normal' | 'amplia';
export type EstadoFormulario = 'borrador' | 'activo' | 'cerrado';
export type CanalFormulario = 'email' | 'whatsapp';

export interface Opcion { id: string; texto: string }
export interface Validacion { minLargo: number | null; maxLargo: number | null; patron: string }
export interface ConfigArchivo { tipos: string[]; maxMb: number; maxArchivos: number }
export interface EstiloCampo { alinear: Alinear; tamano: Tamano; color: string; negrita: boolean; fondo: string; borde: boolean }

export interface Campo {
  id: string;
  tipo: TipoCampo;
  etiqueta: string;
  ayuda: string;
  obligatorio: boolean;
  placeholder: string;
  ancho: Ancho;
  opciones: Opcion[];
  min: number | null;
  max: number | null;
  paso: number | null;
  minEtiqueta: string;
  maxEtiqueta: string;
  validacion: Validacion;
  archivo: ConfigArchivo | null;
  estilo: EstiloCampo;
  imagen: string;
  alt: string;
}

export interface Tema {
  acento: string;
  fondo: string;
  superficie: string;
  texto: string;
  radio: number;
  fuente: Fuente;
  densidad: Densidad;
}

export interface Ajustes {
  titulo: string;
  descripcion: string;
  botonEnviar: string;
  mensajeGracias: string;
  permiteEditar: boolean;
  /** ISO 8601 or null (never closes). */
  cierreAt: string | null;
  tema: Tema;
}

export interface Esquema { ajustes: Ajustes; campos: Campo[] }
export interface TextosEmail { asunto: string; preheader: string; intro: string }
export interface TextosWhatsApp { texto: string }

/** What the editor edits and saves (PUT body without `version`). */
export interface Borrador {
  nombre: string;
  esquema: Esquema;
  email: TextosEmail;
  whatsapp: TextosWhatsApp;
}

export interface FormularioResumen {
  id: string;
  nombre: string;
  estado: EstadoFormulario;
  titulo: string;
  soloWeb: boolean;
  destinatarios: number;
  respuestas: number;
  completas: number;
  actualizadoAt: string;
}

export interface Formulario extends Borrador {
  id: string;
  estado: EstadoFormulario;
  version: number;
  soloWeb: boolean;
  actualizadoAt: string;
}

export interface CanalEstado { total: number; enCola: number; enviados: number; fallidos: number; omitidos: number }

export interface Envio {
  id: string;
  canales: CanalFormulario[];
  filtro: Filtro;
  total: number;
  omitidos: number;
  creadoPor: string;
  createdAt: string;
  email: CanalEstado;
  whatsapp: CanalEstado;
  version: number;
}

export interface Filtro {
  estados?: ('confirmado' | 'reserva')[];
  atletas?: string[];
  soloSinResponder?: boolean;
}

export interface Audiencia {
  total: number;
  email: number;
  whatsapp: number;
  /** False when the server cannot send WhatsApp now (channel off, no consent setup…): the dialog disables the channel. */
  whatsappDisponible: boolean;
  /** Why WhatsApp is not available (shown in the dialog); empty when it is. */
  whatsappMotivo: string;
}

/** Athlete found by the «Atletas concretos» search of the send dialog, with the channels each one can receive. */
export interface AtletaCandidato { id: string; nombre: string; apellidos: string; club: string; email: boolean; whatsapp: boolean }

export interface AtletaResumen { id: string; nombre: string; apellidos: string; club: string; categoria: string }
export type EstadoRespuesta = 'parcial' | 'completa' | 'sin_respuesta';
export type OrigenRespuesta = 'web' | 'email';

export interface RespuestaFila {
  id: string | null;
  atleta: AtletaResumen;
  estado: EstadoRespuesta;
  porcentaje: number;
  origen: OrigenRespuesta | null;
  abiertoAt: string | null;
  enviadoAt: string | null;
  actualizadoAt: string | null;
}

export interface ArchivoRespuesta { campoId: string; url: string; nombre: string; tamano: number; tipo: string }

export interface RespuestaDetalle extends RespuestaFila {
  version: number;
  esquema: Esquema;
  datos: Record<string, unknown>;
  archivos: ArchivoRespuesta[];
}

export interface DiaRespuestas { fecha: string; respuestas: number; completas: number }
export interface OpcionEstadistica { id: string; texto: string; n: number }
export interface CampoEstadistica {
  campoId: string;
  etiqueta: string;
  tipo: TipoCampo;
  respondidas: number;
  opciones?: OpcionEstadistica[];
  media?: number;
}

export interface Estadisticas {
  destinatarios: number;
  abiertos: number;
  respuestas: number;
  completas: number;
  parciales: number;
  porcentajeCompletas: number;
  porcentajeRespuesta: number;
  porCanal: { email: CanalEstado; whatsapp: CanalEstado };
  porOrigen: { web: number; email: number };
  diario: DiaRespuestas[];
  porCampo: CampoEstadistica[];
}

export interface Previsualizacion { emailHtml: string; asunto: string; soloWeb: boolean; whatsappTexto: string }

export interface MensajeIA { rol: 'usuario' | 'asistente'; texto: string }
export interface Modelo { id: string; nombre: string; recomendado: boolean }
export interface EntradaIA {
  instruccion: string;
  historial: MensajeIA[];
  borrador: Borrador;
  seleccion?: string;
  modelo?: string;
}
export interface RespuestaIA { borrador: Borrador; respuesta: string; cambios: string[] }

export interface RespuestasQuery { estado?: EstadoRespuesta | ''; q?: string; page?: number; size?: number }
export interface Pagina<T> { items: T[]; total: number }

/** Admin API of formularios (athletes) plus the AI endpoint (ai). Errors reach callers as HttpErrorResponse (see problemOf). */
@Injectable({ providedIn: 'root' })
export class FormulariosApi {
  private readonly http = inject(HttpClient);

  private base(cid: string): string {
    return `/api/admin/competiciones/${cid}/formularios`;
  }

  lista(cid: string): Promise<FormularioResumen[]> {
    return firstValueFrom(this.http.get<FormularioResumen[]>(this.base(cid)));
  }
  crear(cid: string, nombre: string): Promise<Formulario> {
    return firstValueFrom(this.http.post<Formulario>(this.base(cid), { nombre }));
  }
  get(cid: string, id: string): Promise<Formulario> {
    return firstValueFrom(this.http.get<Formulario>(`${this.base(cid)}/${id}`));
  }
  /** 409 when `version` is stale; 422 with `errors` when the schema is not valid. */
  guardar(cid: string, id: string, b: Borrador & { version: number }): Promise<Formulario> {
    return firstValueFrom(this.http.put<Formulario>(`${this.base(cid)}/${id}`, b));
  }
  borrar(cid: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base(cid)}/${id}`));
  }
  duplicar(cid: string, id: string): Promise<Formulario> {
    return firstValueFrom(this.http.post<Formulario>(`${this.base(cid)}/${id}/duplicar`, {}));
  }
  cambiarEstado(cid: string, id: string, estado: EstadoFormulario): Promise<Formulario> {
    return firstValueFrom(this.http.post<Formulario>(`${this.base(cid)}/${id}/estado`, { estado }));
  }
  previsualizar(cid: string, b: { esquema: Esquema; email: TextosEmail }): Promise<Previsualizacion> {
    return firstValueFrom(this.http.post<Previsualizacion>(`${this.base(cid)}/previsualizar`, b));
  }
  audiencia(cid: string, id: string, f: Filtro = {}): Promise<Audiencia> {
    let p = new HttpParams();
    if (f.estados?.length) p = p.set('estados', f.estados.join(','));
    if (f.atletas?.length) p = p.set('atletas', f.atletas.join(','));
    if (f.soloSinResponder) p = p.set('soloSinResponder', 'true');
    return firstValueFrom(this.http.get<Audiencia>(`${this.base(cid)}/${id}/audiencia`, { params: p }));
  }
  /** Athletes matching `q` (name, surname or club) for the «Atletas concretos» picker of a send. */
  candidatos(cid: string, id: string, q: string, size = 20): Promise<AtletaCandidato[]> {
    let p = new HttpParams().set('size', size);
    if (q) p = p.set('q', q);
    return firstValueFrom(this.http.get<AtletaCandidato[]>(`${this.base(cid)}/${id}/candidatos`, { params: p }));
  }
  /**
   * Crea el envío. `clave` es la Idempotency-Key del diálogo: con la misma clave y los mismos canales y filtro, un
   * reintento recibe 200 con el envío ya creado (sin encolar nada); con otros, 422 CLAVE_REUTILIZADA. Sin
   * `confirmarDuplicado`, 409 ENVIO_DUPLICADO (con `createdAt`) si hay un envío igual hace menos de 2 minutos.
   * Corta a los 30 s (TimeoutError): repetir con la misma clave no duplica el envío.
   */
  crearEnvio(cid: string, id: string, b: { canales: CanalFormulario[]; filtro: Filtro; confirmarDuplicado?: boolean }, clave: string): Promise<Envio> {
    return firstValueFrom(
      this.http.post<Envio>(`${this.base(cid)}/${id}/envios`, b, { headers: { 'Idempotency-Key': clave }, context: sinTimeout() })
        .pipe(timeout(ENVIO_TIMEOUT_MS)),
    );
  }
  envios(cid: string, id: string): Promise<Envio[]> {
    return firstValueFrom(this.http.get<Envio[]>(`${this.base(cid)}/${id}/envios`));
  }
  estadisticas(cid: string, id: string): Promise<Estadisticas> {
    return firstValueFrom(this.http.get<Estadisticas>(`${this.base(cid)}/${id}/estadisticas`));
  }
  respuestas(cid: string, id: string, q: RespuestasQuery = {}): Promise<Pagina<RespuestaFila>> {
    let p = new HttpParams();
    if (q.estado) p = p.set('estado', q.estado);
    if (q.q) p = p.set('q', q.q);
    if (q.page) p = p.set('page', q.page);
    if (q.size) p = p.set('size', q.size);
    return firstValueFrom(this.http.get<Pagina<RespuestaFila>>(`${this.base(cid)}/${id}/respuestas`, { params: p }));
  }
  respuesta(cid: string, id: string, rid: string): Promise<RespuestaDetalle> {
    return firstValueFrom(this.http.get<RespuestaDetalle>(`${this.base(cid)}/${id}/respuestas/${rid}`));
  }
  /** Link for a download (CSV, one column per answered field). */
  csvUrl(cid: string, id: string): string {
    return `${this.base(cid)}/${id}/respuestas.csv`;
  }
  modelos(cid: string): Promise<Modelo[]> {
    return firstValueFrom(this.http.get<Modelo[]>(`/api/admin/competiciones/${cid}/ia/modelos`));
  }
  /** Assistant: edits a working copy with tools and returns it; nothing is saved (the editor applies it as one undoable change). */
  ia(cid: string, b: EntradaIA): Promise<RespuestaIA> {
    return firstValueFrom(this.http.post<RespuestaIA>(`/api/admin/competiciones/${cid}/ia/formulario`, b, { context: sinTimeout() }));
  }
  /** Authenticated CSV download (bearer token via the HTTP interceptor), saved as `formulario-<slug>.csv`. */
  async descargarCsv(cid: string, id: string, nombre: string): Promise<void> {
    const blob = await firstValueFrom(this.http.get(this.csvUrl(cid, id), { responseType: 'blob', context: sinTimeout() }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'formulario'}-respuestas.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
