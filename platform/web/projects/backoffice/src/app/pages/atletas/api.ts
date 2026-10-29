import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Marcas {
  sq?: number;
  bp?: number;
  dl?: number;
}
export interface Incidencia {
  tipo: 'menor_sin_autorizacion' | 'categoria_invalida' | 'pesaje_fuera' | 'foto_sin_consentimiento';
  texto: string;
}
export interface ItemLista {
  id: string;
  nombreCompleto: string;
  licencia: string;
  club: string;
  sexo: 'F' | 'M';
  categoria: string;
  divisionNombre: string;
  flight: string;
  estado: 'confirmado' | 'reserva' | 'baja';
  ordenReserva?: number;
  completo: number;
  imagen: 'si' | 'pendiente' | 'menor' | 'no';
  fotoUrl: string;
  seguidores: number;
  incidencias: number;
  avisos: Incidencia[];
  edad?: number;
  pesaje: string;
}
export interface Lista {
  items: ItemLista[];
  total: number;
  pagina: number;
  por: number;
  pestanas: Record<'todos' | 'confirmados' | 'reserva' | 'bajas' | 'incidencias', number>;
  kpis: { perfilesCompletos: number; pctCompletos: number; sinFoto: number; conImagen: number; imagenPendiente: number; menoresPendientes: number; seguimientos: number; seguimientosSemana: number };
  categorias: string[];
  flights: string[];
  importado?: string;
}
export interface Perfil {
  slug: string;
  fotoUrl: string;
  focalX: number;
  focalY: number;
  frase: string;
  bio: string;
  instagram: string;
  entrenador: string;
  historial: string;
  marcas: Marcas;
  visible: boolean;
  mostrarMarcas: boolean;
  permiteSeguir: boolean;
  autorizacionUrl: string;
  imagen?: { at: string; version: string; hash: string; origen: string; ip: string };
}
export interface Atleta {
  id: string;
  licencia: string;
  nombre: string;
  apellidos: string;
  nombreCompleto: string;
  email: string;
  telefono: string;
  sexo: 'F' | 'M';
  fechaNacimiento?: string;
  edad?: number;
  menor: boolean;
  categoria: string;
  division: string;
  divisionNombre: string;
  club: string;
  ciudad: string;
  estado: 'confirmado' | 'reserva' | 'baja';
  ordenReserva?: number;
  origen: string;
  flight: string;
  plataforma?: number;
  horaInicio?: string;
  pesajeInicio?: string;
  pesajeFin?: string;
  pesaje: { peso?: number; rackSq?: number; rackBp: string; segurosBp?: number; intentos: Marcas; estado: 'pendiente' | 'ok' | 'fuera' | 'no_compite'; sugerencia: string; at?: string; por: string };
  perfil: Perfil;
  totalPrevisto?: number;
  completo: number;
  seguidores: number;
  incidencias: Incidencia[];
  version: number;
  updatedAt: string;
  area: { ultimoAcceso?: string; enlaceEnvio?: string; enlaceUsado: boolean };
}
export interface Historial {
  actor: string;
  accion: string;
  detalle: string;
  at: string;
}
export interface Campo {
  clave: string;
  etiqueta: string;
  obligatorio: boolean;
}
export interface FilaDiff {
  fila: number;
  nombre: string;
  licencia: string;
  accion: 'crear' | 'actualizar' | 'igual' | 'error';
  cambios: string[];
  error: string;
}
export interface Importacion {
  id: string;
  archivo: string;
  estado: 'subida' | 'revisada' | 'importando' | 'confirmada' | 'fallida';
  columnas: string[];
  mapeo: Record<string, string>;
  resumen: { nuevos: number; cambios: number; bajas: number; errores: number; iguales: number; listaBajas: { atletaId: string; nombre: string; licencia: string }[] };
  total: number;
  hechas: number;
  muestra?: string[][];
  campos: Campo[];
  filas: FilaDiff[];
}

export const DIVISIONES = [
  { value: 'subjunior', label: 'Subjúnior' }, { value: 'junior', label: 'Júnior' }, { value: 'open', label: 'Open' },
  { value: 'master1', label: 'Máster 1' }, { value: 'master2', label: 'Máster 2' }, { value: 'master3', label: 'Máster 3' }, { value: 'master4', label: 'Máster 4' },
];
export const CATEGORIAS: Record<'F' | 'M', string[]> = {
  F: ['-43', '-47', '-52', '-57', '-63', '-69', '-76', '-84', '+84'],
  M: ['-53', '-59', '-66', '-74', '-83', '-93', '-105', '-120', '+120'],
};

/** «−63» with a real minus sign, as in the design. */
export const cat = (c: string) => c.replace('-', '−');
export const kg = (n?: number | null) => (n === undefined || n === null ? '–' : n.toLocaleString('es-ES', { maximumFractionDigits: 2 }));

/** Class a body weight falls in (same rule as the API, for the live hint while typing). */
export function categoriaPorPeso(sexo: 'F' | 'M', peso: number, juvenil: boolean): string {
  const list = juvenil ? CATEGORIAS[sexo] : CATEGORIAS[sexo].slice(1);
  for (const c of list) {
    if (c.startsWith('+')) return c;
    if (peso <= Number(c.slice(1))) return c;
  }
  return '';
}

/** REST client of the athletes service. */
@Injectable({ providedIn: 'root' })
export class AtletasApi {
  private readonly http = inject(HttpClient);
  private base = (cid: string) => `/api/admin/competiciones/${cid}/atletas`;

  lista(cid: string, params: Record<string, string | number>): Promise<Lista> {
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v !== '' && v !== undefined) p[k] = String(v);
    return firstValueFrom(this.http.get<Lista>(this.base(cid), { params: p }));
  }
  ficha(cid: string, id: string): Promise<Atleta> { return firstValueFrom(this.http.get<Atleta>(`${this.base(cid)}/${id}`)); }
  historial(cid: string, id: string): Promise<Historial[]> { return firstValueFrom(this.http.get<Historial[]>(`${this.base(cid)}/${id}/historial`)); }
  guardarDatos(cid: string, a: Atleta, body: unknown): Promise<Atleta> {
    return firstValueFrom(this.http.put<Atleta>(`${this.base(cid)}/${a.id}`, body, { headers: new HttpHeaders({ 'If-Match': `W/"${a.version}"` }) }));
  }
  guardarPerfil(cid: string, a: Atleta, body: unknown): Promise<Atleta> {
    return firstValueFrom(this.http.put<Atleta>(`${this.base(cid)}/${a.id}/perfil`, body, { headers: new HttpHeaders({ 'If-Match': `W/"${a.version}"` }) }));
  }
  crear(cid: string, body: unknown): Promise<Atleta> { return firstValueFrom(this.http.post<Atleta>(this.base(cid), body)); }
  promocionar(cid: string, id: string, avisar: boolean): Promise<Atleta> { return firstValueFrom(this.http.post<Atleta>(`${this.base(cid)}/${id}/promocionar`, { avisar })); }
  pesaje(cid: string, id: string, body: unknown): Promise<{ categoriaOk: boolean; sugerencia: string; atleta: Atleta }> {
    return firstValueFrom(this.http.post<{ categoriaOk: boolean; sugerencia: string; atleta: Atleta }>(`${this.base(cid)}/${id}/pesaje`, body));
  }
  decidir(cid: string, id: string, accion: 'cambiar_categoria' | 'no_compite'): Promise<Atleta> { return firstValueFrom(this.http.post<Atleta>(`${this.base(cid)}/${id}/pesaje/decision`, { accion })); }
  enlace(cid: string, id: string): Promise<{ enviado: boolean; caduca: string }> { return firstValueFrom(this.http.post<{ enviado: boolean; caduca: string }>(`${this.base(cid)}/${id}/enlace-area`, {})); }
  borrar(cid: string, id: string): Promise<unknown> { return firstValueFrom(this.http.delete(`${this.base(cid)}/${id}`)); }

  subirActa(cid: string, file: File): Promise<Importacion> {
    const fd = new FormData();
    fd.append('file', file);
    return firstValueFrom(this.http.post<Importacion>(`${this.base(cid)}/importaciones`, fd));
  }
  importacion(cid: string, id: string): Promise<Importacion> { return firstValueFrom(this.http.get<Importacion>(`${this.base(cid)}/importaciones/${id}/estado`)); }
  mapear(cid: string, id: string, mapeo: Record<string, string>): Promise<Importacion> {
    return firstValueFrom(this.http.put<Importacion>(`${this.base(cid)}/importaciones/${id}/mapeo`, { mapeo }));
  }
  confirmar(cid: string, id: string): Promise<Importacion> { return firstValueFrom(this.http.post<Importacion>(`${this.base(cid)}/importaciones/${id}/confirmar`, {})); }

  /** Downloads a protected file (CSV export, list template) with the bearer token. */
  async descargar(url: string, nombre: string): Promise<void> {
    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  exportar(cid: string): Promise<void> { return this.descargar(`${this.base(cid)}/exportar.csv`, 'atletas.csv'); }
  plantilla(cid: string): Promise<void> { return this.descargar(`${this.base(cid)}/importaciones/plantilla.xlsx`, 'plantilla-acta-aep.xlsx'); }
}
