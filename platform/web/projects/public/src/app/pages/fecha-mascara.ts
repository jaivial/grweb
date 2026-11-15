/**
 * Máscara dd/mm/aaaa. Los dígitos llenan día (2), mes (2) y año (4); un separador que escribe la
 * persona («/», «-», «.», espacio) cierra el campo y lo rellena con cero («3/1/1990» → 03/01/1990).
 * Una ISO pegada o autocompletada (AAAA-MM-DD) se da la vuelta. La ISO solo sale si la fecha existe.
 */
export function mascaraFecha(valor: string): { texto: string; iso: string } {
  const v = valor.trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const fuente = m ? m[3] + '/' + m[2] + '/' + m[1] : v;
  const f = ['', '', ''];
  let i = 0;
  for (const ch of fuente) {
    if (/\d/.test(ch)) {
      if (i < 2 && f[i].length === 2) i++;
      if (f[i].length < (i === 2 ? 4 : 2)) f[i] += ch;
    } else if (i < 2 && f[i].length) {
      f[i] = f[i].padStart(2, '0');
      i++;
    }
  }
  const texto = f[0] + (i >= 1 ? '/' + f[1] : '') + (i >= 2 ? '/' + f[2] : '');
  let iso = '';
  if (f[0].length === 2 && f[1].length === 2 && f[2].length === 4) {
    const [dd, mm, aa] = [+f[0], +f[1], +f[2]];
    const d = new Date(aa, mm - 1, dd);
    if (d.getFullYear() === aa && d.getMonth() === mm - 1 && d.getDate() === dd) iso = f[2] + '-' + f[1] + '-' + f[0];
  }
  return { texto, iso };
}
