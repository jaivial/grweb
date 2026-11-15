import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Premios de los juegos (contrato §6.5): C/juegos/premios con permiso «directo.operar». */

export type RankingPremio = 'porra' | 'fantasy' | 'donantes';

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
  /** Vacío o null: premio común a todas las jornadas. */
  jornadaId?: string | null;
  orden?: number;
  /** El servicio puede servir una versión anterior sin este campo (por eso es opcional). */
  activo?: boolean;
}

export interface Jornada {
  id: string;
  dia: string;
  nombre: string;
  estado: 'borrador' | 'abierta' | 'en_juego' | 'cerrada';
}

export interface PremioBorrador {
  ranking: RankingPremio;
  puestoDesde: number;
  puestoHasta: number;
  titulo: string;
  descripcion: string;
  imagenUrl: string;
  valorTexto: string;
  patrocinador: string;
  orden: number;
  jornada?: string;
}

@Injectable({ providedIn: 'root' })
export class PremiosApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/juegos`;
  }

  premios(cid: string, jornada = ''): Promise<{ premios: Premio[] }> {
    const p = jornada ? new HttpParams().set('jornada', jornada) : new HttpParams();
    return firstValueFrom(this.http.get<{ premios: Premio[] }>(`${this.b(cid)}/premios`, { params: p }));
  }

  crear(cid: string, p: PremioBorrador): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(`${this.b(cid)}/premios`, p));
  }

  editar(cid: string, pid: string, p: Partial<PremioBorrador> & { activo?: boolean; jornadaId?: string }): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.b(cid)}/premios/${pid}`, p));
  }

  borrar(cid: string, pid: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/premios/${pid}`));
  }

  jornadas(cid: string): Promise<{ jornadas: Jornada[] }> {
    return firstValueFrom(this.http.get<{ jornadas: Jornada[] }>(`${this.b(cid)}/jornadas`));
  }
}
