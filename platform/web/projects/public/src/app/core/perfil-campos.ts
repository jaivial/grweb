/**
 * Campos, límites y validación compartidos por los formularios del atleta: el alta pública (/alta-atleta) y
 * «Editar mi perfil» del área (/area-atleta). Una sola regla para los dos, con los textos de cada pantalla.
 */
import { telefonoValido } from '@grcup/ui';

export const MAX_NOMBRE = 60;
export const MAX_APELLIDOS = 60;
export const MAX_BIO = 280;
export const MAX_FRASE = 80;
export const MAX_CAMPO = 80;
export const MAX_MARCA = 600;

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const RE_INSTAGRAM = /^@?[A-Za-z0-9._]{1,30}$/;

/** Los datos de la ficha, tal como los edita el atleta (las marcas llegan del <input> como texto o número). */
export interface CamposPerfil {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  sexo: '' | 'F' | 'M';
  fechaNacimiento: string;
  club: string;
  ciudad: string;
  entrenador: string;
  frase: string;
  bio: string;
  instagram: string;
  marcaSQ: string | number;
  marcaBP: string | number;
  marcaDL: string | number;
}

/** Los textos de error de la validación (cada pantalla trae los suyos, en su idioma). */
export interface TextosPerfil {
  oblig: string;
  nombreLetras: string;
  largo60: string;
  obligPl: string;
  apellidosLetras: string;
  largos60: string;
  email: string;
  waTel: string;
  opcion: string;
  anio: string;
  fecha: string;
  edad: string;
  largo: string;
  larga: string;
  larga80: string;
  largo280: string;
  ig: string;
  marca: string;
  paso: string;
  telCorto: string;
}

/** Marcas del formulario, en el orden en que se leen. */
export const MARCAS_PERFIL = [
  { k: 'marcaSQ' as const, corto: 'SQ' },
  { k: 'marcaBP' as const, corto: 'BP' },
  { k: 'marcaDL' as const, corto: 'DL' },
];

/** A real letter (not a control, format or blank-rendering filler). */
export function tieneLetra(v: string): boolean {
  return /\p{L}/u.test(v.replace(/[\p{Cc}\p{Cf}\u3164\uFFA0\u115F\u1160\u2800]/gu, ''));
}

/** Edad en años de una fecha ISO (null si no es una fecha real). */
export function edadDe(fecha: string, hoy = new Date()): number | null {
  if (!fecha) return null;
  const n = new Date(fecha + 'T00:00:00');
  if (isNaN(n.getTime())) return null;
  let edad = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--;
  return edad;
}

/** Menor de 18 años. */
export function esMenorDe(fecha: string, hoy = new Date()): boolean {
  const edad = edadDe(fecha, hoy);
  return edad !== null && edad < 18;
}

/** El valor de una marca como texto («210,5» no: el <input> da «210.5»). */
export function textoMarca(v: string | number): string {
  return (v === null || v === undefined ? '' : String(v)).trim();
}

/** Total de las tres marcas en vivo (null si no hay ninguna). */
export function totalMarcas(d: Pick<CamposPerfil, 'marcaSQ' | 'marcaBP' | 'marcaDL'>): number | null {
  let suma = 0;
  let hay = false;
  for (const m of MARCAS_PERFIL) {
    const v = textoMarca(d[m.k]);
    if (!v) continue;
    const n = Number(v);
    if (isNaN(n)) continue;
    suma += n;
    hay = true;
  }
  return hay ? suma : null;
}

/**
 * Valida los campos de la ficha (los del alta y los de «Editar mi perfil») y devuelve los errores por campo.
 * `fechaTexto` es lo que se ve en el campo de la fecha (dd/mm/aaaa), para distinguir un año a medias; `whatsapp`
 * hace obligatorio el teléfono cuando el atleta marca los avisos por WhatsApp.
 */
export function validarPerfil(
  d: CamposPerfil,
  v: TextosPerfil,
  opciones: { fechaTexto?: string; esMenor?: boolean; whatsapp?: boolean } = {},
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.nombre.trim()) e['nombre'] = v.oblig;
  else if (!tieneLetra(d.nombre)) e['nombre'] = v.nombreLetras;
  else if (d.nombre.trim().length > MAX_NOMBRE) e['nombre'] = v.largo60;
  if (!d.apellidos.trim()) e['apellidos'] = v.obligPl;
  else if (!tieneLetra(d.apellidos)) e['apellidos'] = v.apellidosLetras;
  else if (d.apellidos.trim().length > MAX_APELLIDOS) e['apellidos'] = v.largos60;
  const mail = d.email.trim();
  if (!mail) e['email'] = v.oblig;
  else if (mail.length > 254 || !EMAIL.test(mail)) e['email'] = v.email;
  if (opciones.whatsapp && !d.telefono.trim()) e['telefono'] = v.waTel;
  else if (d.telefono.trim() && !telefonoValido(d.telefono)) e['telefono'] = v.telCorto;
  if (!d.sexo) e['sexo'] = v.opcion;
  if (!d.fechaNacimiento) {
    e['fechaNacimiento'] = /^\d{2}\/\d{2}\/\d{1,3}$/.test(opciones.fechaTexto ?? '') ? v.anio : v.fecha;
  } else {
    const edad = edadDe(d.fechaNacimiento);
    if (edad === null) e['fechaNacimiento'] = v.fecha;
    else if (edad < 14 || edad > 90) e['fechaNacimiento'] = v.edad;
  }
  if (d.club.trim().length > MAX_CAMPO) e['club'] = v.largo;
  if (d.ciudad.trim().length > MAX_CAMPO) e['ciudad'] = v.larga;
  if (d.entrenador.trim().length > MAX_CAMPO) e['entrenador'] = v.largo;
  if (d.frase.length > MAX_FRASE) e['frase'] = v.larga80;
  if (d.bio.length > MAX_BIO) e['bio'] = v.largo280;
  if (!opciones.esMenor && d.instagram.trim() && !RE_INSTAGRAM.test(d.instagram.trim())) e['instagram'] = v.ig;
  for (const m of MARCAS_PERFIL) {
    const txt = textoMarca(d[m.k]);
    if (!txt) continue;
    const n = Number(txt);
    if (isNaN(n) || n < 0 || n > MAX_MARCA) e[m.k] = v.marca;
    else if (!Number.isInteger(n * 2)) e[m.k] = v.paso;
  }
  return e;
}
