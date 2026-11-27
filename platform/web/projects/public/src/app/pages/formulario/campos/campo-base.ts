import type { Campo } from '../formulario-api';

/** Estilos compartidos de los campos: colores y radio llegan del tema por variables CSS `--f-*` (ver estiloTema). */
export const CLS_CONTROL =
  'w-full min-w-0 rounded-[var(--f-radio)] border bg-[var(--f-superficie)] px-3.5 text-[16px] text-[var(--f-texto)] ' +
  'placeholder:text-[color-mix(in_srgb,var(--f-texto)_45%,transparent)] transition-colors duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-acento)] disabled:opacity-50 motion-reduce:transition-none';

export const CLS_OPCION =
  'flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--f-radio)] border bg-[var(--f-superficie)] px-4 py-3 text-[16px] text-[var(--f-texto)] ' +
  'transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--f-acento)] ' +
  'has-[:checked]:border-[var(--f-acento)] has-[:checked]:bg-[color-mix(in_srgb,var(--f-acento)_10%,var(--f-superficie))] motion-reduce:transition-none';

/** Borde de un control: el de error (site) o el neutro del tema. */
export const claseBorde = (error: boolean): string =>
  error ? 'border-accent-text' : 'border-[color-mix(in_srgb,var(--f-texto)_22%,transparent)]';

export const claseControl = (error: boolean, extra = ''): string => `${CLS_CONTROL} ${claseBorde(error)} ${extra}`.trim();

/** Id del control principal del campo: el que recibe el foco al encontrar un error. */
export const ctrlId = (c: Campo): string => 'f-' + c.id;

/** `aria-describedby` con la ayuda y el error del campo (los ids los pinta el contenedor de campo). */
export const descrito = (c: Campo, error: string | null): string | null => {
  const ids = [c.ayuda ? `f-${c.id}-ayuda` : '', error ? `f-${c.id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : null;
};
