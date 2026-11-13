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
      { label: 'Directo', path: 'directo', icon: 'radio', perm: 'directo.operar', mobileTab: true },
      { label: 'Check-in y taquilla', path: 'checkin', icon: 'scan', perm: 'checkin.escanear', mobileTab: true },
    ],
  },
  {
    label: 'Evento',
    items: [
      { label: 'Evento y módulos', path: 'evento', icon: 'trophy', perm: 'evento.editar' },
      { label: 'Web y contenidos', path: 'web', icon: 'layout', perm: 'web.editar' },
      { label: 'Atletas', path: 'atletas', icon: 'user', perm: 'atletas.editar', contador: 'solicitudes' },
      { label: 'Horarios y flights', path: 'horarios', icon: 'clock', perm: 'horarios.publicar' },
      { label: 'Resultados', path: 'resultados', icon: 'award', perm: 'resultados.publicar' },
    ],
  },
  {
    // Figma 73 · «Directo social»: chat, sponsors, games, donations, prizes and fan accounts
    label: 'Directo social',
    items: [
      { label: 'Chat', path: 'chat', icon: 'send', perm: 'directo.operar', lectura: true },
      { label: 'Patrocinio', path: 'patrocinio', icon: 'image', perm: 'web.editar', lectura: true },
      { label: 'Juegos', path: 'juegos', icon: 'trophy', perm: 'directo.operar', lectura: true },
      { label: 'Donaciones', path: 'donaciones', icon: 'heart', perm: 'sorteo.gestionar', lectura: true },
      { label: 'Premios', path: 'premios', icon: 'gift', perm: 'directo.operar', lectura: true },
      { label: 'Fans', path: 'fans', icon: 'users', perm: 'directo.operar', lectura: true },
    ],
  },
  {
    label: 'Público',
    items: [
      { label: 'Entradas y aforo', path: 'entradas', icon: 'ticket', perm: 'entradas.gestionar', mobileTab: true },
      { label: 'Sorteo', path: 'sorteo', icon: 'gift', perm: 'sorteo.gestionar' },
      { label: 'Contactos', path: 'contactos', icon: 'users', perm: 'contactos.ver' },
      { label: 'Campañas', path: 'campanas', icon: 'send', perm: 'campanas.enviar' },
      { label: 'Emails y avisos', path: 'emails', icon: 'mail', perm: 'campanas.enviar' },
      { label: 'Clubs', path: 'clubs', icon: 'building', perm: 'web.editar', contador: 'clubs' },
      { label: 'Voluntarios', path: 'voluntarios', icon: 'heart', perm: 'web.editar', contador: 'voluntarios' },
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

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
