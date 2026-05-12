/**
 * Sobre Nosotros Page — Constants
 * Club history, values, team, and mission data.
 */

export const MISSION_STATEMENT = {
  title: 'Nuestra Misión',
  text: 'En GR Strength creemos que el powerlifting es mucho más que levantar peso. Es un camino de superación personal, disciplina y comunidad. Nuestro objetivo es hacer accesible la competición de powerlifting a cualquier persona, independientemente de su nivel de experiencia.',
} as const;

export const VISION_STATEMENT = {
  title: 'Nuestra Visión',
  text: 'Ser el referente del powerlifting en la Comunidad Valenciana, creando un espacio donde cada atleta pueda descubrir su potencial, rodeado de profesionales apasionados y una comunidad que le respalda.',
} as const;

export const HISTORY_TEXT = [
  'GR Strength nació en Valencia con una idea clara: crear un espacio donde la pasión por el powerlifting y el entrenamiento de fuerza se combinara con un ambiente cercano y profesional.',
  'Lo que empezó como un pequeño proyecto personal ha crecido hasta convertirse en una referencia del powerlifting en Valencia. Nuestro club, el GRS Club, ha sido testigo de cientos de primeras competiciones, marcas personales superadas y amistades forjadas sobre la plataforma.',
  'Hoy, con el FER CUP, damos un paso más: crear un evento donde tanto principiantes como experimentados puedan vivir la emoción de una competición real en un entorno acogedor y seguro.',
] as const;

export const CORE_VALUES = [
  {
    title: 'Camaradería',
    description: 'Creemos en la fuerza del grupo. En FER, cada levantamiento se celebra entre todos, porque el éxito de uno es el éxito del equipo.',
    icon: 'users' as const,
  },
  {
    title: 'Superación',
    description: 'Cada día es una oportunidad para ser mejor que ayer. Fomentamos la mejora constante, tanto dentro como fuera de la plataforma.',
    icon: 'flame' as const,
  },
  {
    title: 'Profesionalidad',
    description: 'Jueces certificados, spotters experimentados, equipamiento homologado. Cada detalle importa para que tu experiencia sea perfecta.',
    icon: 'shield' as const,
  },
  {
    title: 'Inclusión',
    description: 'No importa tu nivel, edad o experiencia. En FER hay sitio para todo el mundo que quiera mejorar y disfrutar del powerlifting.',
    icon: 'heart' as const,
  },
] as const;

export const TEAM_MEMBERS = [
  {
    name: 'FER',
    role: 'Fundador & Head Coach',
    description: 'Apasionado del powerlifting con más de 10 años de experiencia formando atletas.',
    photoIndex: 0,
  },
  {
    name: 'Equipo Técnico',
    role: 'Jueces & Spotters',
    description: 'Profesionales certificados FEDDF que garantizan la calidad de cada competición.',
    photoIndex: 1,
  },
  {
    name: 'Comunidad',
    role: 'Atletas & Voluntarios',
    description: 'Más de 100 atletas forman la familia FER. Cada uno aporta algo único al grupo.',
    photoIndex: 2,
  },
] as const;

export const SOBRE_SECTION_IDS = {
  hero: 'sobre-hero',
  mission: 'sobre-mission',
  history: 'sobre-history',
  values: 'sobre-values',
  team: 'sobre-team',
  facilities: 'sobre-facilities',
  cta: 'sobre-cta',
} as const;
