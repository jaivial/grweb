import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Donaciones service (contrato §5). Admin: C/donaciones/* con permiso «sorteo.gestionar». */

export type EstadoDonacion = 'pendiente' | 'pagada' | 'caducada' | 'reembolsada';

export interface Donacion {
  id: string;
  dia: string;
  fanId: string;
  alias: string;
  importe: number;
  coins: number;
  mensaje?: string;
  anonimo: boolean;
  estado: EstadoDonacion;
  proveedor: string;
  motivo?: string;
  createdAt: string;
  pagadaAt?: string;
  reembolsadaAt?: string;
}

export interface KpisDonaciones {
  pagadas: number;
  recaudado: number;
  pendientes: number;
  reembolsadas: number;
  donantes: number;
}

export interface ConfigDonaciones {
  activo: boolean;
  minimo: number;
  maximo: number;
  coinsPorEuro: number;
  importesSugeridos: number[];
  version: number;
  updatedPor: string;
  updatedAt: string;
}

export interface PanelDonaciones {
  kpis: KpisDonaciones;
  config: ConfigDonaciones;
}

export interface ListaDonaciones {
  items: Donacion[];
  total: number;
  pagina: number;
  por: number;
}

export interface FilaRanking {
  puesto: number;
  alias: string;
  total: number;
  donativos: number;
}

export interface RankingDonaciones {
  dia: string;
  items: FilaRanking[];
  totalRecaudado: number;
}

export interface ConfigPublica {
  activo: boolean;
  minimo: number;
  maximo: number;
  coinsPorEuro: number;
  importesSugeridos: number[];
  pasarela: 'stripe' | 'simulado' | 'ninguna';
}

@Injectable({ providedIn: 'root' })
export class DonacionesApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/donaciones`;
  }

  panel(cid: string): Promise<PanelDonaciones> {
    return firstValueFrom(this.http.get<PanelDonaciones>(this.b(cid)));
  }

  guardarConfig(cid: string, c: Omit<ConfigDonaciones, 'version' | 'updatedPor' | 'updatedAt'>, version: number): Promise<PanelDonaciones> {
    return firstValueFrom(this.http.put<PanelDonaciones>(`${this.b(cid)}/config`, c, { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) }));
  }

  lista(cid: string, f: { estado?: string; q?: string; pagina?: number }): Promise<ListaDonaciones> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v) p = p.set(k, String(v));
    return firstValueFrom(this.http.get<ListaDonaciones>(`${this.b(cid)}/lista`, { params: p }));
  }

  reembolsar(cid: string, id: string, motivo: string): Promise<Donacion> {
    return firstValueFrom(this.http.post<Donacion>(`${this.b(cid)}/${id}/reembolso`, { motivo }));
  }

  configPublica(slug: string): Promise<ConfigPublica> {
    return firstValueFrom(this.http.get<ConfigPublica>(`/api/competiciones/${slug}/donaciones/config`));
  }

  ranking(slug: string, dia: string): Promise<RankingDonaciones> {
    return firstValueFrom(this.http.get<RankingDonaciones>(`/api/competiciones/${slug}/donaciones/ranking`, { params: new HttpParams().set('dia', dia) }));
  }
}
