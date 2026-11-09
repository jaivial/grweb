import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Juegos service (contrato §6). Admin: C/juegos/* con permiso «directo.operar». */

export type EstadoJornada = 'borrador' | 'abierta' | 'en_juego' | 'cerrada';

export interface Jornada {
  id: string;
  dia: string;
  nombre: string;
  estado: EstadoJornada;
}

export interface OpcionMercado {
  atletaId: string;
  nombre: string;
  apostado: number;
  cuota?: number;
}

export interface Mercado {
  id: string;
  tipo: 'categoria' | 'gl' | 'movimiento';
  sexo: 'F' | 'M';
  categoria?: string;
  movimiento?: string;
  titulo: string;
  estado: 'abierto' | 'cerrado' | 'liquidado';
  opciones: OpcionMercado[];
  bote: number;
  apuestas: number;
  ganador?: string[];
}

export interface FilaPorra {
  puesto: number;
  fanId: string;
  alias: string;
  saldo: number;
}

export interface FilaFantasy {
  puesto: number;
  fanId: string;
  alias: string;
  puntos: number;
  valor: number;
  saldo: number;
}

export interface Clasificaciones {
  porra: FilaPorra[];
  fantasy: FilaFantasy[];
}

export interface PuntosCfg {
  intentoValido: number;
  pleno: number;
  blanqueo: number;
  cat: number[];
  gl: number[];
  mov: number[];
}

export interface ConfigJuegos {
  porraMin: number;
  porraMax: number;
  hito5Porra: number;
  hito10Porra: number;
  hito5Fantasy: number;
  hito10Fantasy: number;
  fantasyPorEuro: number;
  maxHitos: number;
  maxClausulazos: number;
  proteccionMin: number;
  plantillaMax: number;
  titularesMax: number;
  clausulaInicial: number;
  clausulaMin: number;
  clausulaMax: number;
  pctValido: number;
  pctNulo: number;
  pctBlanqueo: number;
  pctDemanda: number;
  pctPuesto: number[];
  puntos: PuntosCfg;
  activo: boolean;
  version: number;
  updatedPor: string;
}

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
}

@Injectable({ providedIn: 'root' })
export class JuegosApi {
  private readonly http = inject(HttpClient);
  private b(cid: string): string {
    return `/api/admin/competiciones/${cid}/juegos`;
  }

  jornadas(cid: string): Promise<{ jornadas: Jornada[] }> {
    return firstValueFrom(this.http.get<{ jornadas: Jornada[] }>(`${this.b(cid)}/jornadas`));
  }

  crearJornada(cid: string, dia: string, nombre: string): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(`${this.b(cid)}/jornadas`, { dia, nombre }));
  }

  jornada(cid: string, jid: string, cambios: { nombre?: string; estado?: EstadoJornada }): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.b(cid)}/jornadas/${jid}`, cambios));
  }

  generarMercados(cid: string, jornada: string): Promise<{ creados: number }> {
    return firstValueFrom(this.http.post<{ creados: number }>(`${this.b(cid)}/mercados/generar`, { jornada }));
  }

  cerrarMercado(cid: string, mid: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.b(cid)}/mercados/${mid}/cerrar`, {}));
  }

  /**
   * Liquida el mercado a mano. `devolver` es la acción explícita de staff: el bote entero vuelve a las apuestas y
   * el mercado queda liquidado aunque el resultado todavía no sea definitivo (el backend lo audita con un evento).
   */
  liquidarMercado(cid: string, mid: string, devolver = false): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.b(cid)}/mercados/${mid}/liquidar`, { devolver }));
  }

  tituloMercado(cid: string, mid: string, titulo: string): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.b(cid)}/mercados/${mid}`, { titulo }));
  }

  sincronizarFantasy(cid: string, jornada: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.b(cid)}/fantasy/sincronizar`, { jornada }));
  }

  config(cid: string): Promise<ConfigJuegos> {
    return firstValueFrom(this.http.get<ConfigJuegos>(`${this.b(cid)}/config`));
  }

  /**
   * Guarda la configuración. La versión leída viaja en `If-Match`: si otra persona guardó antes, el backend
   * responde 409 CONFLICTO_EDICION (igual que el resto de configuraciones del backoffice).
   */
  guardarConfig(cid: string, c: ConfigJuegos): Promise<ConfigJuegos> {
    return firstValueFrom(this.http.put<ConfigJuegos>(`${this.b(cid)}/config`, c, { headers: new HttpHeaders({ 'If-Match': `"${c.version}"` }) }));
  }

  clasificaciones(cid: string, jornada: string): Promise<Clasificaciones> {
    const p = new HttpParams().set('jornada', jornada);
    return firstValueFrom(this.http.get<Clasificaciones>(`${this.b(cid)}/clasificaciones`, { params: p }));
  }

  /** Mercados con bote y cuotas: endpoint público (el admin no lo expone, §6.6). */
  mercados(slug: string, jornada: string): Promise<{ jornada?: Jornada; mercados: Mercado[] }> {
    const p = new HttpParams().set('jornada', jornada);
    return firstValueFrom(this.http.get<{ jornada?: Jornada; mercados: Mercado[] }>(`/api/competiciones/${slug}/juegos/porra/mercados`, { params: p }));
  }

  premios(cid: string, jornada = ''): Promise<{ premios: Premio[] }> {
    const p = jornada ? new HttpParams().set('jornada', jornada) : new HttpParams();
    return firstValueFrom(this.http.get<{ premios: Premio[] }>(`${this.b(cid)}/premios`, { params: p }));
  }

  crearPremio(cid: string, p: Partial<Premio> & { jornada?: string; orden?: number }): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>(`${this.b(cid)}/premios`, p));
  }

  patchPremio(cid: string, pid: string, p: Partial<Premio> & { activo?: boolean; orden?: number }): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.b(cid)}/premios/${pid}`, p));
  }

  borrarPremio(cid: string, pid: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.b(cid)}/premios/${pid}`));
  }
}
