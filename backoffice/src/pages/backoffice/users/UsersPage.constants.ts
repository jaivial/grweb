import type { UserRole, RoleSlug } from '../../../types/api';
import type { SelectOption } from '../../../components/ui/CustomSelector/CustomSelector';

export const MEMBER_ROLE_ORDER: UserRole[] = ['root', 'admin', 'staff', 'registrador'];

export const MEMBER_ROLE_LABELS: Record<string, string> = {
  root: 'Root',
  admin: 'Admins',
  staff: 'Staff',
  registrador: 'Registradores',
  manager: 'Staff',
  empleado: 'Staff',
  checkin: 'Registradores',
  operator: 'Staff',
};

export const MEMBER_ROLE_DESCRIPTIONS: Record<string, string> = {
  root: 'Acceso total a todas las competiciones y secciones.',
  admin: 'Control completo dentro de esta competicion.',
  staff: 'Acceso operativo sin configuracion ni miembros.',
  registrador: 'Acceso limitado al lector QR.',
};

export const MEMBER_ROLE_CAPABILITIES: Record<string, string[]> = {
  root: [
    'Accede a todas las competiciones sin asignacion manual.',
    'Puede ver y administrar todas las secciones del backoffice.',
    'Puede crear admins y cambiar cualquier rol.',
  ],
  admin: [
    'Accede a todas las secciones de esta competicion.',
    'Puede invitar, editar y eliminar staff y registradores.',
    'No puede cambiar ni eliminar otros admins.',
  ],
  staff: [
    'Puede operar inscripciones, horarios, sorteo y lector QR.',
    'No accede a configuracion.',
    'No accede a gestion de miembros.',
  ],
  registrador: [
    'Solo accede al lector QR de la competicion.',
    'No puede ver inscripciones, horarios, sorteo ni configuracion.',
    'No puede gestionar miembros.',
  ],
};

export const MEMBER_ROLE_BADGE_CLASSES: Record<string, string> = {
  root: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
  admin: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  staff: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  registrador: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
};

export const DEFAULT_MEMBER_FORM = {
  nombre: '',
  email: '',
  password: '',
  role: 'staff' as UserRole,
};

/** Role options for CustomSelector - all roles */
export const ROLE_SELECT_OPTIONS: SelectOption<RoleSlug>[] = [
  { value: 'root', label: 'Root' },
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'registrador', label: 'Registrador' },
];

/** Role options filtered by current user role - for admin users who cannot assign root/admin */
export function getRoleSelectOptionsForAdmin(currentUserRole: UserRole): SelectOption<RoleSlug>[] {
  if (currentUserRole === 'root') {
    return ROLE_SELECT_OPTIONS;
  }
  // Admin can only assign staff and registrador
  return ROLE_SELECT_OPTIONS.filter(opt => opt.value === 'staff' || opt.value === 'registrador');
}
