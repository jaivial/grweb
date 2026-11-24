export interface PageMeta {
  title: string;
  description: string;
  ogImage?: string;
  canonicalPath?: string;
}

export const pageMetaConfig: Record<string, PageMeta> = {
  '/': {
    title: 'GRS Cup 2 · Campeonato de powerlifting en Almussafes',
    description: 'GR Cup 2026: la mayor competición de powerlifting en España. Participa en el sorteo de cinturones SBD y A7. Información sobre categorías, horarios e inscripciones.',
    canonicalPath: '/',
  },
  '/inscripcion': {
    title: 'Inscripción · GRS Cup 2',
    description: 'Inscríbete en el GR Cup 2026. Copa de powerlifting en España. Participa y opta a los sorteos de material SBD, A7 y cinturones de Nico GR.',
    canonicalPath: '/inscripcion',
  },
  '/horarios': {
    title: 'Horarios · GRS Cup 2',
    description: 'Consulta los horarios completos del GR Cup 2026. Competición de powerlifting con categorías por peso y movimientos. Sábado y domingo.',
    canonicalPath: '/horarios',
  },
  '/como-llegar': {
    title: 'Cómo llegar · GRS Cup 2',
    description: 'Cómo llegar al GR Cup 2026. Ubicación de la sede de la competición de powerlifting en Madrid, España.',
    canonicalPath: '/como-llegar',
  },
  '/raffle': {
    title: 'Sorteo · GRS Cup 2',
    description: 'Sorteo del GR Cup 2026. Descubre el ganador del sorteo del cinturón de powerlifting. Puedes verificar el resultado del sorteo aquí.',
    canonicalPath: '/raffle',
  },
  '/privacy': {
    title: 'Política de privacidad · GRS Cup 2',
    description: 'Política de privacidad de GR Cup 2026. Cómo tratamos tus datos personales en la inscripción y participación.',
    canonicalPath: '/privacy',
  },
  '/terms': {
    title: 'Términos y condiciones · GRS Cup 2',
    description: 'Términos y condiciones del GR Cup 2026. Normas del sorteo, participación y competición de powerlifting.',
    canonicalPath: '/terms',
  },
  '/consentimiento-datos': {
    title: 'Consentimiento de datos · GRS Cup 2',
    description: 'Consentimiento para el tratamiento de datos personales. GR Cup 2026, competición de powerlifting en España.',
    canonicalPath: '/consentimiento-datos',
  },
  '/politica-concurso': {
    title: 'Política del concurso · GRS Cup 2',
    description: 'Política del concurso GR Cup 2026. Normas, categorías de powerlifting y reglas de la competición.',
    canonicalPath: '/politica-concurso',
  },
  '/checkout': {
    title: 'Pago · GRS Cup 2',
    description: 'Completa tu inscripción en el GR Cup 2026. Powerlifting España.',
    canonicalPath: '/checkout',
  },
  '/success': {
    title: 'Inscripción confirmada · GRS Cup 2',
    description: 'Tu inscripción en el GR Cup 2026 ha sido confirmada. Competición de powerlifting en España.',
    canonicalPath: '/success',
  },
};
