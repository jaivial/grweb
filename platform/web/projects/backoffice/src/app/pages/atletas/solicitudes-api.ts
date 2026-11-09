import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Estado of an «alta de atleta» request (athletes service). */
export type EstadoSolicitud = 'pendiente' | 'revision' | 'aprobada' | 'rechazada';
/** How the request was matched against the athletes' list: licence, e-mail, name suggestion or nothing. */
export type TipoMatch = '' | 'licencia' | 'email' | 'nombre';
export type TipoDiferencia = 'igual' | 'distinto' | 'nuevo';

export interface Contadores {
  todas: number;
  pendiente: number;
  revision: number;
  menor: number;
  aprobada: number;
  rechazada: number;
}
export interface Kpis {
  pendientesHoy: number;
  aprobadasHoy: number;
  rechazadasHoy: number;
}

export interface SolicitudItem {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  club: string;
  edad: number;
  esMenor: boolean;
  autorizacion: boolean;
  match: TipoMatch;
  atletaId: string;
  estado: EstadoSolicitud;
  fotoMiniatura: string;
  createdAt: string;
  version: number;
}
export interface SolicitudLista {
  items: SolicitudItem[];
  total: number;
  contadores: Contadores;
  kpis?: Kpis;
}

export interface Diferencia {
  campo: string;
  actual: string;
  nuevo: string;
  tipo: TipoDiferencia;
}
export interface Consentimiento {
  casilla: string;
  aceptado: boolean;
  version: string;
  hash: string;
  at: string;
  ip: string;
}
export interface AtletaEnlace {
  id: string;
  nombre: string;
  licencia: string;
  club: string;
  email: string;
  estado: string;
}
export interface SolicitudDetalle extends SolicitudItem {
  telefono: string;
  sexo: 'F' | 'M';
  fechaNacimiento: string;
  licencia: string;
  ciudad: string;
  entrenador: string;
  frase: string;
  bio: string;
  instagram: string;
  historial: string;
  marcaSQ: number | null;
  marcaBP: number | null;
  marcaDL: number | null;
  atleta: AtletaEnlace | null;
  diferencias: Diferencia[];
  consentimientos: Consentimiento[];
  motivoRechazo: string;
  revisadoAt: string;
  revisadoPor: string;
}
export interface Candidato {
  id: string;
  nombre: string;
  licencia: string;
  club: string;
  email: string;
  estado: string;
}
export interface AprobarIn {
  cambios: Record<string, string | number | null>;
  avisarEmail: boolean;
  avisarWhatsApp: boolean;
}
export interface RechazarIn {
  motivo: string;
  avisarEmail: boolean;
  avisarWhatsApp: boolean;
}

/** REST client of the «solicitudes de atleta» (athletes service, admin). */
@Injectable({ providedIn: 'root' })
export class SolicitudesApi {
  private readonly http = inject(HttpClient);
  private base(cid: string): string {
    return `/api/admin/competiciones/${cid}/atletas/solicitudes`;
  }
  /** If-Match with the version read on the detail (the service answers 412 CONFLICTO_EDICION). */
  private cab(version: number): HttpHeaders {
    return new HttpHeaders({ 'If-Match': `"${version}"` });
  }

  lista(cid: string, f: { estado?: string; match?: string; menor?: string; q?: string; pagina?: number }): Promise<SolicitudLista> {
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v !== '' && v !== undefined && v !== null) p[k] = String(v);
    return firstValueFrom(this.http.get<SolicitudLista>(this.base(cid), { params: p }));
  }
  detalle(cid: string, id: string): Promise<SolicitudDetalle> {
    return firstValueFrom(this.http.get<SolicitudDetalle>(`${this.base(cid)}/${id}`));
  }
  /** Private photo (the session travels in the header, so it comes as a blob). */
  foto(cid: string, id: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.base(cid)}/${id}/foto`, { responseType: 'blob' }));
  }
  marcar(cid: string, id: string, version: number, estado: 'revision'): Promise<SolicitudDetalle> {
    return firstValueFrom(this.http.post<SolicitudDetalle>(`${this.base(cid)}/${id}/estado`, { estado }, { headers: this.cab(version) }));
  }
  enlazar(cid: string, id: string, version: number, cuerpo: { atletaId?: string; nuevo?: boolean }): Promise<SolicitudDetalle> {
    return firstValueFrom(this.http.post<SolicitudDetalle>(`${this.base(cid)}/${id}/enlazar`, cuerpo, { headers: this.cab(version) }));
  }
  aprobar(cid: string, id: string, version: number, cuerpo: AprobarIn): Promise<{ atletaId: string; slug: string }> {
    return firstValueFrom(this.http.post<{ atletaId: string; slug: string }>(`${this.base(cid)}/${id}/aprobar`, cuerpo, { headers: this.cab(version) }));
  }
  rechazar(cid: string, id: string, version: number, cuerpo: RechazarIn): Promise<SolicitudDetalle> {
    return firstValueFrom(this.http.post<SolicitudDetalle>(`${this.base(cid)}/${id}/rechazar`, cuerpo, { headers: this.cab(version) }));
  }
  /** Signed authorisation of the guardian (minors): private file, never published. */
  subirAutorizacion(cid: string, id: string, file: File): Promise<unknown> {
    const fd = new FormData();
    fd.append('archivo', file);
    return firstValueFrom(this.http.post(`${this.base(cid)}/${id}/autorizacion`, fd));
  }
  autorizacion(cid: string, id: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.base(cid)}/${id}/autorizacion`, { responseType: 'blob' }));
  }
  borrar(cid: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base(cid)}/${id}`));
  }
  candidatos(cid: string, q: string): Promise<Candidato[]> {
    return firstValueFrom(this.http.get<Candidato[]>(`${this.base(cid)}/candidatos`, { params: { q } }));
  }
}

/** The 17 fields of the public form, in the order of the review panel (see the page). */
