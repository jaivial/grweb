import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type CanalCola = 'whatsapp' | 'email';
export type FiltroCola = 'pendientes' | 'fallidos' | 'enviados';

/** A message of «Sistema › Cola de envío» (messaging outbox). */
export interface ColaItem {
  id: string;
  canal: CanalCola;
  destino: string;
  atleta: string;
  titulo: string;
  resumen: string;
  estado: string;
  intentos: number;
  detalle: string;
  prueba: boolean;
  proximoAt?: string;
  /** Estimated departure: its place in the queue against the number's turn, caps and quiet hours. */
  salidaAt?: string;
  enviadoAt?: string;
  createdAt: string;
  updatedAt: string;
}
/** The channel cannot send now (number unlinked or blocked, server down): next try at `hasta`. */
export interface ColaPausa { motivo: string; hasta: string }
export interface ColaCuentas { pendientes: number; fallidos: number; enviados: number }
export interface ColaPagina {
  items: ColaItem[];
  total: number;
  pagina: number;
  por: number;
  cuentas: Record<CanalCola, ColaCuentas>;
  /** Server time: the countdown does not trust the browser clock. */
  ahora: string;
  pausa?: ColaPausa;
}
export interface IntentoCola { at: string; intento: number; estado: string; detalle: string; tecnico?: string }

/** REST client of «Cola de envío» (messaging, permission campanas.enviar). */
@Injectable({ providedIn: 'root' })
export class ColaApi {
  private readonly http = inject(HttpClient);
  private base(cid: string): string {
    return `/api/admin/competiciones/${cid}/emails/cola`;
  }
  lista(cid: string, canal: CanalCola, filtro: FiltroCola, pagina: number): Promise<ColaPagina> {
    return firstValueFrom(this.http.get<ColaPagina>(this.base(cid), { params: { canal, filtro, pagina } }));
  }
  intentos(cid: string, id: string): Promise<IntentoCola[]> {
    return firstValueFrom(this.http.get<IntentoCola[]>(`${this.base(cid)}/${id}/intentos`));
  }
}
