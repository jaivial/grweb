import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Tier } from '../ui';

/** Patrocinio service (contrato §7). Admin: C/patrocinio/* con permiso «web.editar». */

export interface Banner {
  id: string;
  patrocinador: string;
  imagenUrl: string;
  imagenMovilUrl?: string;
  urlDestino: string;
  tier: Tier;
  activo: boolean;
  desde?: string | null;
  hasta?: string | null;
  orden: number;
  version: number;
  createdAt: string;
}

export interface ConfigPatrocinio {
  intervaloSeg: number;
  pesoOro: number;
  pesoPlata: number;
  pesoBronce: number;
  soloEnDirecto: boolean;
  activo: boolean;
  version: number;
  updatedPor: string;
  updatedAt: string;
}

export interface InformeFila {
  id: string;
  patrocinador: string;
  tier: Tier;
  orden: number;
  activo: boolean;
  apariciones: number;
  clics: number;
}

export interface Informe {
  dia: string;
  intervaloSeg: number;
  banners: InformeFila[];
  pendientes: string[];
  rondaSeg: number;
  aviso?: string;
}

export type BannerBorrador = Omit<Banner, 'id' | 'version' | 'createdAt'>;

@Injectable({ providedIn: 'root' })
export class PatrocinioApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/patrocinio`;
  }

  banners(cid: string): Promise<{ items: Banner[] }> {
    return firstValueFrom(this.http.get<{ items: Banner[] }>(`${this.b(cid)}/banners`));
  }

  crearBanner(cid: string, b: BannerBorrador): Promise<Banner> {
    return firstValueFrom(this.http.post<Banner>(`${this.b(cid)}/banners`, b));
  }

  guardarBanner(cid: string, id: string, b: BannerBorrador, version: number): Promise<Banner> {
    return firstValueFrom(this.http.put<Banner>(`${this.b(cid)}/banners/${id}`, b, { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) }));
  }

  borrarBanner(cid: string, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/banners/${id}`));
  }

  config(cid: string): Promise<ConfigPatrocinio> {
    return firstValueFrom(this.http.get<ConfigPatrocinio>(`${this.b(cid)}/config`));
  }

  guardarConfig(cid: string, c: Omit<ConfigPatrocinio, 'version' | 'updatedPor' | 'updatedAt'>, version: number): Promise<ConfigPatrocinio> {
    return firstValueFrom(this.http.put<ConfigPatrocinio>(`${this.b(cid)}/config`, c, { headers: new HttpHeaders({ 'If-Match': `"${version}"` }) }));
  }

  informe(cid: string, dia: string, duracionMin = 0): Promise<Informe> {
    let p = new HttpParams().set('dia', dia);
    if (duracionMin > 0) p = p.set('duracionMin', String(duracionMin));
    return firstValueFrom(this.http.get<Informe>(`${this.b(cid)}/informe`, { params: p }));
  }
}
