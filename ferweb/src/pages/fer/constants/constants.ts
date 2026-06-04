/**
 * FER Landing - Silver/Mate design system
 * Luxury watch brand aesthetic: dark background + mate silver + subtle shimmer
 *
 * FER_COLORS: Keep in sync with tailwind.config.js and src/styles/globals.css
 */

import { FER_CUP_LOGO_IMAGE } from './mediaCdnUrls';

export const FER_COLORS = {
  bgDark: '#0B0F1A',
  bgCard: '#161B26',
  accent: '#8B95A5',
  glow: '#CBD5E1',
  text: '#F1F5F9',
  textMuted: '#8494A7',
  gold: '#C9CDD4',
  purple: '#7C8DA4',
  green: '#10B981',
  red: '#EF4444',
  silver: '#A8B2C1',
  shimmer: '#E2E8F0',
} as const;

export const FER_EVENT = {
  name: 'FER CUP II',
  date: '25 Julio 2026',
  location: 'Valencia',
  instagramUrl: 'https://instagram.com/ferentrenamiento',
  instagramHandle: '@ferentrenamiento',
} as const;

export const PARTICLE_COUNT = 25;
export const CONFETTI_COUNT = 60;

export const CANVAS_PARTICLE_COUNT = 200;
export const CANVAS_CONFETTI_COUNT = 400;

export const FER_VIDEO_CONFIG = {
  heroSrc: 'https://jaimedigitalstudio.b-cdn.net/fer/media/hero-background.webm',
  heroPoster: 'https://jaimedigitalstudio.b-cdn.net/fer/media/hero-poster.webp',
} as const;

export const HERO_SLIDESHOW_IMAGES = [
  'https://jaimedigitalstudio.b-cdn.net/fer/media/test-upload.webp',
  'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/DSCF1509.webp',
  'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/IMG_4135.webp',
  'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/Reme/Remedios%20Martinez%20Iborra-28.webp',
  'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/DSC02287-3132.webp',
  'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/FOTOS%20AEP%202/SR309804.webp',
  'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/Rodrigo%20Tello/JUAN-12.webp',
] as const;

export const HERO_BRAND_ICONS = {
  ferLogo: FER_CUP_LOGO_IMAGE,
} as const;

export const HERO_CAMISETA_BG = 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/IMG_3008.webp' as const;

export const EXPERIENCE_LEVELS = ['rookie', 'principiante', 'intermedio', 'avanzado'] as const;

export type Experiencia = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_DESCRIPTIONS: Record<Experiencia, string> = {
  rookie: 'Es mi primera competición y nunca he hecho una toma de marcas',
  principiante: 'He hecho alguna toma de marcas y he competido en al menos un AEP3',
  intermedio: 'He competido en varios AEP3 o he competido en al menos un AEP3 y en al menos un AEP2',
  avanzado: 'He competido en más de 10 AEP2 y al menos un AEP1',
};

export const EXPERIENCE_LABELS: Record<Experiencia, string> = {
  rookie: 'Rookie',
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

export const MODALIDAD_VALUES = ['completa', 'solo_banca', 'solo_peso_muerto'] as const;

export type Modalidad = (typeof MODALIDAD_VALUES)[number];

export const MODALIDAD_LABELS: Record<Modalidad, string> = {
  completa: 'Competición completa',
  solo_banca: 'Solo banca',
  solo_peso_muerto: 'Solo peso muerto',
};

export const MODALIDAD_DESCRIPTIONS: Record<Modalidad, string> = {
  completa: 'Sentadilla, press de banca y peso muerto en una misma jornada.',
  solo_banca: 'Ideal si quieres competir únicamente en press de banca.',
  solo_peso_muerto: 'Entra directamente al peso muerto y céntrate en tu mejor tirón.',
};

export const MODALIDAD_LIFTS: Record<Modalidad, string> = {
  completa: 'Sentadilla + Banca + Peso muerto',
  solo_banca: 'Press de banca',
  solo_peso_muerto: 'Peso muerto',
};

export const SECTION_IDS = {
  hero: 'fer-hero',
  queEs: 'fer-que-es',
  queIncluye: 'fer-que-incluye',
  quienPuede: 'fer-quien-puede',
  inscripcion: 'fer-inscripcion',
} as const;

export const SCROLL_OFFSET = 80;

export const POLAROID_PHOTOS = [
  { src: 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/IMG_1287.webp', caption: 'Sentadilla', rotation: -3 },
  { src: 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/FOTOS%20AEP%202/SR309420.webp', caption: 'Press de banca', rotation: 2.5 },
  { src: 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/Rodrigo%20Tello/JUAN-14.webp', caption: 'Peso muerto', rotation: -2 },
  { src: 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/General/DSCF1592.webp', caption: 'La plataforma', rotation: 3.5 },
  { src: 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/Reme/Remedios%20Martinez%20Iborra-30.webp', caption: 'El ambiente', rotation: -4 },
  { src: 'https://jaimedigitalstudio.b-cdn.net/fer/media/GRS%20-%20FOTOS%20_%20CLUB/FOTOS%20AEP%202/SR309268.webp', caption: 'Los premios', rotation: 2 },
] as const;

export const POLAROID_START_OFFSET_X = 300;
export const POLAROID_START_ROTATION = 20;

export const NAV_LINKS = [
  {
    label: 'Inscripción',
    path: '/inscripcion',
    icon: 'PenLine',
    description: 'Reserva tu plaza y completa el registro.',
  },
  {
    label: 'Modalidades',
    path: '/modalidades',
    icon: 'Layers',
    description: 'Elige la división que mejor encaja contigo.',
  },
  {
    label: 'Horarios',
    path: '/horarios',
    icon: 'Calendar',
    description: 'Consulta el planning de la competición.',
  },
  {
    label: 'Ubicación',
    path: '/ubicacion',
    icon: 'MapPin',
    description: 'Encuentra el pabellón y cómo llegar.',
  },
  {
    label: 'Galería',
    path: '/galeria',
    icon: 'Image',
    description: 'Explora imágenes y recuerdos del evento.',
  },
  {
    label: 'Tutoriales',
    path: '/tutoriales',
    icon: 'BookOpen',
    description: 'Aprende cómo funciona la competición.',
  },
  {
    label: 'FAQ',
    path: '/faq',
    icon: 'HelpCircle',
    description: 'Resuelve las dudas más frecuentes.',
  },
  {
    label: 'Sobre Nosotros',
    path: '/sobre-nosotros',
    icon: 'Users',
    description: 'Conoce el equipo detrás de FER CUP.',
  },
] as const;
