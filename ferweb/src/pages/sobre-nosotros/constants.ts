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
  'GR Strength nació como un grupo de atletas que veían el powerlifting como algo mucho más profundo que levantar muchos kilos. Desde el principio teníamos una idea clara: convertir GRS en el hogar de todo atleta que quisiera vivir este deporte en equipo.',
  'Lo que empezó como un pequeño proyecto personal ha crecido hasta convertirse en el club más grande de España, con una sede increíble: FER Entrenamiento, el mejor centro especializado en powerlifting de toda Valencia.',
  'Hoy, con esta FER CUP, damos un paso más: crear un evento donde tanto principiantes como atletas experimentados puedan vivir la emoción de una competición real en un entorno acogedor y seguro.',
] as const;

export const CORE_VALUES = [
  {
    title: 'Respeto',
    description: 'No importa tu nivel, edad o experiencia. En FER hay sitio para todo el mundo que quiera mejorar y disfrutar del powerlifting.',
    icon: 'heart' as const,
  },
  {
    title: 'Equipo',
    description: 'Creemos en la fuerza del grupo. En GRS, cada levantamiento se celebra entre todos, porque el éxito de uno es el éxito del equipo.',
    icon: 'users' as const,
  },
  {
    title: 'Superación',
    description: 'Nos gusta ganar como al que más. Te apoyaremos en todo lo necesario para que cumplas tus objetivos. Fomentamos la mejora constante, tanto dentro como fuera de la plataforma.',
    icon: 'flame' as const,
  },
  {
    title: 'Profesionalidad',
    description: 'Jueces certificados, spotters experimentados, equipamiento homologado. Cada detalle importa para que tu experiencia sea perfecta.',
    icon: 'shield' as const,
  },
] as const;

export const TEAM_MEMBERS = [
  {
    name: 'GRS',
    role: 'Mejor club español',
    description: 'Directiva formada por un equipo experimentado en gestionar el club más grande y más laureado del país.',
    photoIndex: 0,
  },
  {
    name: 'Jueces & Spotters',
    role: 'Equipo técnico',
    description: 'Profesionales certificados internacionalmente que garantizan la calidad de cada competición.',
    photoIndex: 1,
  },
  {
    name: 'Comunidad',
    role: 'Atletas & Staff',
    description: 'Más de 100 atletas forman GRS. Cada uno aporta algo único al grupo.',
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
