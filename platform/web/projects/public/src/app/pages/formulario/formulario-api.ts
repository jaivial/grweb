import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { sinTimeout } from '@grcup/ui';
import { Observable, filter, firstValueFrom, map } from 'rxjs';

/** Tipos de campo del esquema (docs/FORMULARIOS.md §2). */
export type TipoCampo =
  | 'titulo' | 'parrafo' | 'imagen' | 'separador'
  | 'texto_corto' | 'texto_largo' | 'email' | 'telefono' | 'numero' | 'fecha'
  | 'opcion_unica' | 'desplegable' | 'casillas' | 'seleccion_multiple' | 'casilla' | 'si_no'
  | 'deslizador' | 'escala' | 'valoracion' | 'archivo';

export interface Opcion { id: string; texto: string }

export interface ArchivoConfig { tipos: string[]; maxMb: number; maxArchivos: number }

export interface Estilo {
  alinear: 'izquierda' | 'centro' | 'derecha';
  tamano: 's' | 'm' | 'l';
  color: string;
  negrita: boolean;
  fondo: string;
  borde: boolean;
}

export interface Campo {
  id: string;
  tipo: TipoCampo;
  etiqueta: string;
  ayuda: string;
  obligatorio: boolean;
  placeholder: string;
  ancho: 'completo' | 'mitad';
  opciones: Opcion[];
  min: number | null;
  max: number | null;
  paso: number | null;
  minEtiqueta: string;
  maxEtiqueta: string;
  validacion: { minLargo: number | null; maxLargo: number | null; patron: string };
  archivo: ArchivoConfig | null;
  estilo: Estilo;
  imagen: string;
  alt: string;
}

export interface Tema {
  acento: string;
  fondo: string;
  superficie: string;
  texto: string;
  radio: number;
  fuente: 'sistema' | 'serif' | 'mono';
  densidad: 'compacta' | 'normal' | 'amplia';
}

export interface Ajustes {
  titulo: string;
  descripcion: string;
  botonEnviar: string;
  mensajeGracias: string;
  permiteEditar: boolean;
  cierreAt: string | null;
  tema: Tema;
}

export interface Esquema {
  ajustes: Ajustes;
  campos: Campo[];
}

/** Archivo guardado de un campo `archivo` (BunnyCDN). */
export interface ArchivoSubido {
  url: string;
  nombre: string;
  tamano: number;
  tipo: string;
}

export type Datos = Record<string, unknown>;
export type Errores = Record<string, string>;

export interface RespuestaPublica {
  estado: 'parcial' | 'completa';
  datos: Datos;
  /** Archivos por campo, si el backend los envía aparte de `datos`. */
  archivos?: (ArchivoSubido & { campoId: string })[];
  enviadoAt: string | null;
}

export interface FormularioPublico {
  competicion: { nombre: string; slug: string };
  formulario: { titulo: string; esquema: Esquema; soloWeb: boolean };
  atleta: { nombre: string };
  respuesta: RespuestaPublica | null;
  cerrado: boolean;
  puedeEditar: boolean;
}

export interface ResultadoGuardado {
  estado: 'parcial' | 'completa';
  porcentaje: number;
  errores: Errores;
}

export type EventoSubida = { tipo: 'progreso'; pct: number } | { tipo: 'fin'; archivo: ArchivoSubido };

/** API pública de formularios por token (docs/FORMULARIOS.md §5). Sin sesión: el token va en la ruta. */
@Injectable({ providedIn: 'root' })
export class FormulariosPublic {
  private readonly http = inject(HttpClient);

  private base(token: string): string {
    return '/api/formularios/' + encodeURIComponent(token);
  }

  obtener(token: string): Promise<FormularioPublico> {
    return firstValueFrom(this.http.get<FormularioPublico>(this.base(token)));
  }

  /** `enviar=false` es el autoguardado (sin validar obligatorios); `enviar=true` valida y completa la respuesta. */
  guardar(token: string, datos: Datos, enviar: boolean): Promise<ResultadoGuardado> {
    return firstValueFrom(this.http.put<ResultadoGuardado>(this.base(token), { datos, enviar }));
  }

  subirArchivo(token: string, campoId: string, archivo: File): Observable<EventoSubida> {
    const fd = new FormData();
    fd.append('campoId', campoId);
    fd.append('archivo', archivo);
    return this.http.post<ArchivoSubido>(this.base(token) + '/archivos', fd, { reportProgress: true, observe: 'events', context: sinTimeout() }).pipe(
      map((ev): EventoSubida | null => {
        if (ev.type === HttpEventType.UploadProgress) return { tipo: 'progreso', pct: Math.round((100 * ev.loaded) / (ev.total || archivo.size)) };
        if (ev.type === HttpEventType.Response && ev.body) return { tipo: 'fin', archivo: ev.body };
        return null;
      }),
      filter((ev): ev is EventoSubida => ev !== null),
    );
  }
}
