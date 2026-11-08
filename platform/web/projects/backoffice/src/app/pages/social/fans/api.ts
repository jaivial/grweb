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

  desbanear(cid: string, fanId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.b(cid)}/${fanId}/desbanear`, {}));
  }
}
