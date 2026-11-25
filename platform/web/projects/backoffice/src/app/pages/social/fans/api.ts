import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Fans service (contrato §3). Admin: C/fans/* con permiso «directo.operar». */

export interface Fan {
  id: string;
  email: string;
  tipo: 'atleta' | 'publico';
  alias: string;
  atletaId?: string;
  baneadoHasta?: string;
  baneadoMotivo?: string;
  version: number;
  createdAt: string;
  telefono?: string;
  /** The account has a password. */
  contrasena: boolean;
}

/** Editable data of an account (create: email, alias and tipo required; password empty = unchanged). */
export interface CuentaFan {
  email?: string;
  alias?: string;
  tipo?: 'atleta' | 'publico';
  telefono?: string;
  password?: string;
}

export interface ListaFans {
  items: Fan[];
  total: number;
  pagina: number;
  por: number;
}

@Injectable({ providedIn: 'root' })
export class FansApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/fans`;
  }

  lista(cid: string, f: { estado?: string; q?: string; pagina?: number }): Promise<ListaFans> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v) p = p.set(k, String(v));
    return firstValueFrom(this.http.get<ListaFans>(this.b(cid), { params: p }));
  }

  banear(cid: string, fanId: string, hasta: string, motivo: string): Promise<Fan> {
    return firstValueFrom(this.http.post<Fan>(`${this.b(cid)}/${fanId}/banear`, { hasta, motivo }));
  }

  crear(cid: string, c: CuentaFan): Promise<Fan> {
    return firstValueFrom(this.http.post<Fan>(this.b(cid), c));
  }

  editar(cid: string, fanId: string, c: CuentaFan): Promise<Fan> {
    return firstValueFrom(this.http.patch<Fan>(`${this.b(cid)}/${fanId}`, c));
  }

  borrar(cid: string, fanId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/${fanId}`));
  }

  resetContrasena(cid: string, fanId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.b(cid)}/${fanId}/reset-contrasena`, {}));
  }

  desbanear(cid: string, fanId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.b(cid)}/${fanId}/desbanear`, {}));
  }
}
