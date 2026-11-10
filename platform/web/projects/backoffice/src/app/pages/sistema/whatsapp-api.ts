import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** State of the WhatsApp service of the competition (messaging). */
export type EstadoWa = 'sin_instancia' | 'conectando' | 'conectado' | 'desconectado' | 'error';

export interface EstadoWaInfo {
  servicio: 'ok' | 'caido' | 'sin_configurar';
  /** Legible name of the instance (the one that is shown). */
  instancia: string;
  /** Technical id of the instance (never shown). */
  instanciaId?: string;
  estado: EstadoWa;
  numero: string;
  conectadoDesde: string;
  modo: string;
}
export interface TelefonoAviso {
  numero: string;
  nombre: string;
}
export interface AvisosWa {
  telefonos: TelefonoAviso[];
  alAtleta: boolean;
  aOrganizadores: boolean;
}
export interface PruebaWa {
  enviados: number;
  errores: { numero: string; error: string }[];
}

/** REST client of the WhatsApp section of the messaging service (admin). */
@Injectable({ providedIn: 'root' })
export class WhatsAppApi {
  private readonly http = inject(HttpClient);
  private base(cid: string): string {
    return `/api/admin/competiciones/${cid}/whatsapp`;
  }

  estado(cid: string): Promise<EstadoWaInfo> {
    return firstValueFrom(this.http.get<EstadoWaInfo>(`${this.base(cid)}/estado`));
  }
  /** Creates the instance of the competition (idempotent). */
  crearInstancia(cid: string): Promise<EstadoWaInfo> {
    return firstValueFrom(this.http.post<EstadoWaInfo>(`${this.base(cid)}/instancia`, {}));
  }
  /** With no number it returns the QR to scan; with a number it returns the pairing code. */
  conectar(cid: string, numero: string): Promise<{ qr?: string; codigo?: string }> {
    return firstValueFrom(this.http.post<{ qr?: string; codigo?: string }>(`${this.base(cid)}/conectar`, { numero }));
  }
  /** Pull of the current QR (the page repaints it when the bus says there is a new one). */
  qr(cid: string): Promise<{ qr: string }> {
    return firstValueFrom(this.http.get<{ qr: string }>(`${this.base(cid)}/qr`));
  }
  reiniciar(cid: string): Promise<EstadoWaInfo> {
    return firstValueFrom(this.http.post<EstadoWaInfo>(`${this.base(cid)}/reiniciar`, {}));
  }
  desconectar(cid: string): Promise<EstadoWaInfo> {
    return firstValueFrom(this.http.post<EstadoWaInfo>(`${this.base(cid)}/desconectar`, {}));
  }
  avisos(cid: string): Promise<AvisosWa> {
    return firstValueFrom(this.http.get<AvisosWa>(`${this.base(cid)}/avisos`));
  }
  guardarAvisos(cid: string, body: AvisosWa): Promise<AvisosWa> {
    return firstValueFrom(this.http.put<AvisosWa>(`${this.base(cid)}/avisos`, body));
  }
  prueba(cid: string): Promise<PruebaWa> {
    return firstValueFrom(this.http.post<PruebaWa>(`${this.base(cid)}/avisos/prueba`, {}));
  }
}
