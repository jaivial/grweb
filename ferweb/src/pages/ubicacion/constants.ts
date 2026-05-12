/**
 * Ubicacion Page — Constants
 * All venue, transport, and contact data for FER CUP location.
 */

export const VENUE_INFO = {
  name: 'GRS Club',
  fullName: 'GRS Club — GR Strength',
  address: 'Pol. Industrial Vara de Quart, Valencia',
  fullAddress: 'Pol. Industrial Vara de Quart, 46440 Valencia, España',
  coordinates: { lat: 39.3464, lng: -0.4147 },
  email: 'info@ferentrenamiento.com',
  instagram: 'https://instagram.com/ferentrenamiento',
  googleMapsUrl: 'https://maps.google.com/?q=39.3464,-0.4147',
} as const;

export const TRANSPORT_OPTIONS = [
  {
    icon: 'car' as const,
    title: 'En coche',
    description: 'Desde Valencia centro, toma la V-31 o A-7 hacia el polígono. Aproximadamente 25 minutos.',
    detail: 'Parking gratuito disponible en las inmediaciones del polígono.',
  },
  {
    icon: 'bus' as const,
    title: 'En autobús',
    description: 'Línea de bus con parada en el Polígono Industrial.',
    detail: 'Consulta horarios actualizados en Metrobús.',
  },
  {
    icon: 'train' as const,
    title: 'En tren / Metro',
    description: 'Cercanías C1 o C2 hasta la estación más cercana, a 10 minutos caminando.',
    detail: 'Desde Estación del Nord, aprox. 30 min.',
  },
] as const;

export const CONTACT_CARDS = [
  { label: 'Instagram', value: '@ferentrenamiento', href: 'https://instagram.com/ferentrenamiento' },
  { label: 'Email', value: 'info@ferentrenamiento.com', href: 'mailto:info@ferentrenamiento.com' },
] as const;

export const UBICACION_SECTION_IDS = {
  hero: 'ubicacion-hero',
  map: 'ubicacion-map',
  transport: 'ubicacion-transport',
  gallery: 'ubicacion-gallery',
  contact: 'ubicacion-contact',
  cta: 'ubicacion-cta',
} as const;
