import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Athlete area (área de atleta): the panel the API returns and the session shared by the route guard and the page.
 * One request feeds both: the guard asks «is there a session?» and the page then reads the same answer.
 */
export interface Marcas {
  sq?: number;
  bp?: number;
  dl?: number;
}
export interface PruebaArea {
  elegida: '' | 'aep2' | 'aep3';
  opciones: { codigo: string; nombre: string; fecha: string; plazas: number; ocupadas: number }[];
  limite?: string;
  cerrada: boolean;
  cambioOrg?: string;
}
export interface Panel {
  competicion: { slug: string; nombre: string };
  atleta: {
    id: string; nombre: string; apellidos: string; nombreCompleto: string; sexo: 'F' | 'M'; categoria: string; divisionNombre: string; club: string; ciudad: string; menor: boolean; licencia: string;
    estado: 'confirmado' | 'reserva' | 'baja'; origen: string; jornada: string; lote?: number; horaInicio?: string; pesajeInicio?: string; pesajeFin?: string; completo: number;
    sesion?: string; sesionNivel?: string;
    pesaje: { rackSq?: number; rackBp: string; segurosBp?: number; intentos: Marcas; estado: string; at?: string };
    perfil: { slug: string; fotoUrl: string; focalX: number; focalY: number; frase: string; bio: string; instagram: string; marcas: Marcas; visible: boolean; imagen?: { at: string; version: string } };
  };
  acreditacion: string;
  /** The PNG of the QR on the CDN; empty until it has been generated (the web then draws it from `acreditacion`). */
  acreditacionUrl?: string;
  tienePassword?: boolean;
  /** The password is the initial one the organisers sent: the area asks for a new one. */
  passwordTemporal?: boolean;
  checklist: { clave: string; texto: string; hecho: boolean; accion?: 'pesaje' | 'perfil' }[];
  pesajeAbierto: boolean;
  avisos: string[];
  referido?: { codigo: string; invitados: number; maxUsos: number; devuelto: number; pendiente: number; pagado: number; descuento: string; recompensa: string; tope: boolean };
  prueba?: PruebaArea;
}

/** Subpáginas del área: `/area-atleta?vista=…` (sin `vista`, el panel con los accesos rápidos). */
export type AreaVista = 'perfil' | 'horarios' | 'post' | 'acreditacion' | 'pesaje' | 'handling';
export const AREA_VISTAS: readonly AreaVista[] = ['perfil', 'horarios', 'post', 'acreditacion', 'pesaje', 'handling'];
export const esVista = (v: string | null | undefined): v is AreaVista => !!v && (AREA_VISTAS as readonly string[]).includes(v);

export const AREA_API = '/api/area-atleta';

type Respuesta = { panel: Panel | null; estado: 'ok' | 'sin-sesion' | 'error' };

/** Athlete area session: one cached GET /yo (5 s) shared by the guard and the page, so navigating never doubles it. */
@Injectable({ providedIn: 'root' })
export class AreaSesion {
  private readonly http = inject(HttpClient);
  private readonly actual = signal<Panel | null>(null);
  private ultima?: { at: number; respuesta: Promise<Respuesta> };

  /** Last panel known (null: none yet, or no session). */
  readonly panel = this.actual.asReadonly();
  /** First name of the athlete with an area session (navbar), null without one. */
  readonly nombre = signal<string | null>(null);

  /** Navbar check on every page: GET /sesion answers 204 without a session (no 401 for anonymous visitors). */
  async comprobar(): Promise<void> {
    const r = await firstValueFrom(this.http.get<{ nombre: string } | null>(`${AREA_API}/sesion`)).catch(() => undefined);
    if (r !== undefined) this.nombre.set(r?.nombre ?? null);
  }

  /** Panel of the area, or null without a session (or when the API does not answer). */
  async cargar(fresca = false): Promise<Panel | null> {
    return (await this.consultar(fresca)).panel;
  }

  /** false only when the API says there is no session: a backend hiccup never sends the athlete to the login. */
  async haySesion(): Promise<boolean> {
    return (await this.consultar()).estado !== 'sin-sesion';
  }

  /** The page already has a panel (login, save): the next reads use it instead of asking again. */
  poner(p: Panel | null): void {
    this.actual.set(p);
    this.nombre.set(p?.atleta.nombre ?? null);
    this.ultima = { at: Date.now(), respuesta: Promise.resolve({ panel: p, estado: p ? 'ok' : 'sin-sesion' }) };
  }

  private consultar(fresca = false): Promise<Respuesta> {
    const ahora = Date.now();
    if (!fresca && this.ultima && ahora - this.ultima.at < 5000) return this.ultima.respuesta;
    const respuesta = firstValueFrom(this.http.get<Panel>(`${AREA_API}/yo`))
      .then((panel): Respuesta => ({ panel, estado: 'ok' }))
      .catch((e): Respuesta => ({ panel: null, estado: e instanceof HttpErrorResponse && e.status === 401 ? 'sin-sesion' : 'error' }))
      .then((r) => {
        this.actual.set(r.panel);
        if (r.estado !== 'error') this.nombre.set(r.panel?.atleta.nombre ?? null);
        return r;
      });
    this.ultima = { at: ahora, respuesta };
    return respuesta;
  }
}
