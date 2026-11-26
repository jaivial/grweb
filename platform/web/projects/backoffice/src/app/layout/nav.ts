import type { GrIconName } from '@grcup/ui';

export interface NavItem {
  label: string;
  path: string; // segment under /:comp/
  icon: GrIconName;
  perm?: string; // permission required (Root always sees everything)
  mobileTab?: boolean;
  /** Live badge of the section (athlete requests waiting for a review). */
  contador?: 'solicitudes' | 'clubs' | 'voluntarios';
  /**
   * Without the permission the screen still opens in read-only mode (Figma 73 «Cualquier pantalla · sin
   * permiso»): the page explains it and disables the actions.
   */
  lectura?: boolean;
  /** Not in the sidebar (reached from another page) but still a section: its permission and title still apply. */
  oculto?: boolean;
  /**
   * BO module of the edition (Evento y módulos › Módulos) that switches the section on: when the competition has it
   * switched off the section leaves the menu and its routes go back to Inicio. Code and data stay.
   */
  modulo?: string;
  /** Name of that module as the team sees it in Evento y módulos › Módulos (when it differs from the section). */
  moduloLabel?: string;
  /** Sub-pages shown as an accordion under the item (the item itself is their overview page). */
  hijos?: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar of the v7 backoffice (Figma page 47 · information architecture; page 49 · «BO / Nav item»). */
export const NAV: NavGroup[] = [
  {
    label: 'Hoy',
    items: [
      { label: 'Inicio', path: 'inicio', icon: 'home', mobileTab: true },
      { label: 'Directo', path: 'directo', icon: 'radio', perm: 'directo.operar', mobileTab: true, modulo: 'mesa-directo', moduloLabel: 'Mesa del directo' },
      { label: 'Pantalla del pabellón', path: 'directo/pantalla', icon: 'radio', perm: 'directo.operar', oculto: true, modulo: 'mesa-directo' },
      { label: 'Check-in y taquilla', path: 'checkin', icon: 'scan', perm: 'checkin.escanear', mobileTab: true },
    ],
  },
  {
    label: 'Evento',
    items: [
      // reached from Sistema e integraciones (and Web y contenidos is one of its tabs)
      { label: 'Evento y módulos', path: 'evento', icon: 'trophy', perm: 'evento.editar', oculto: true },
      { label: 'Web y contenidos', path: 'evento/web', icon: 'layout', perm: 'web.editar', oculto: true },
      { label: 'Atletas', path: 'atletas', icon: 'user', perm: 'atletas.editar', contador: 'solicitudes' },
      { label: 'Horarios', path: 'horarios', icon: 'clock', perm: 'horarios.publicar' },
      { label: 'Resultados', path: 'resultados', icon: 'award', perm: 'resultados.publicar' },
    ],
  },
  {
    // Figma 73 · «Directo social»: chat, sponsors, games, donations, prizes and fan accounts
    label: 'Directo social',
    items: [
      { label: 'Chat', path: 'chat', icon: 'send', perm: 'directo.operar', lectura: true },
      { label: 'Patrocinio', path: 'patrocinio', icon: 'image', perm: 'web.editar', lectura: true },
      { label: 'Retransmisión', path: 'directo/retransmision', icon: 'play', perm: 'directo.operar', lectura: true },
      { label: 'Juegos', path: 'juegos', icon: 'trophy', perm: 'directo.operar', lectura: true },
      { label: 'Donaciones', path: 'donaciones', icon: 'heart', perm: 'sorteo.gestionar', lectura: true },
      { label: 'Premios', path: 'premios', icon: 'gift', perm: 'directo.operar', lectura: true, oculto: true }, // tab of Sorteo
      { label: 'Fans', path: 'fans', icon: 'users', perm: 'directo.operar', lectura: true },
    ],
  },
  {
    label: 'Público',
    items: [
      { label: 'Entradas y aforo', path: 'entradas', icon: 'ticket', perm: 'entradas.gestionar', mobileTab: true },
      { label: 'Sorteo', path: 'sorteo', icon: 'gift', perm: 'sorteo.gestionar' },
      { label: 'Contactos', path: 'contactos', icon: 'users', perm: 'contactos.ver', oculto: true }, // tab of Emails y avisos
      { label: 'Campañas', path: 'campanas', icon: 'send', perm: 'campanas.enviar', oculto: true }, // tab of Emails y avisos
      { label: 'Emails y avisos', path: 'emails', icon: 'mail', perm: 'campanas.enviar' },
      { label: 'Clubs', path: 'clubs', icon: 'building', perm: 'web.editar', contador: 'clubs', modulo: 'clubs' },
      { label: 'Voluntarios', path: 'voluntarios', icon: 'heart', perm: 'web.editar', contador: 'voluntarios' },
      // hotels, restaurants and gyms of /donde-dormir-y-comer and /como-llegar
      { label: 'Colaboradores Refugio', path: 'refugio', icon: 'star', perm: 'web.editar', hijos: [
        { label: 'Dónde dormir y comer', path: 'refugio/donde-dormir-y-comer', icon: 'building', perm: 'web.editar' },
        { label: 'Gimnasios de powerlifting', path: 'refugio/gimnasios', icon: 'dumbbell', perm: 'web.editar' },
      ] },
    ],
  },
  {
    label: 'Equipo y sistema',
    items: [
      { label: 'Equipo y permisos', path: 'equipo', icon: 'shield', perm: 'equipo.gestionar' },
      { label: 'Auditoría', path: 'auditoria', icon: 'history', perm: 'auditoria.ver' },
      { label: 'Sistema e integraciones', path: 'sistema', icon: 'plug', perm: 'integraciones.config' },
    ],
  },
];

/** Every section, sub-pages first (the page title matches the most specific path of the URL). */
export const ALL_ITEMS = NAV.flatMap((g) => g.items.flatMap((i) => [...(i.hijos ?? []), i]));

/** A BO module is off only when the edition says so: editions without the key keep the section (old data). */
export function moduloActivo(modulos: Record<string, { activo: boolean }> | undefined, clave?: string): boolean {
  return !clave || modulos?.[clave]?.activo !== false;
}
