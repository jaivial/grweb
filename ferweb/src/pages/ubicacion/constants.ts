/**
 * Ubicacion Page — Constants
 * All venue, transport, and contact data for FER CUP location.
 */

export const VENUE_INFO = {
  name: 'Pabellón de Almussafes',
  fullName: 'Pabellón de Almussafes',
  address: 'Almussafes, Valencia',
  fullAddress: 'Pabellón de Almussafes, 46440 Almussafes, Valencia, España',
  coordinates: { lat: 39.2893, lng: -0.4135 },
  email: 'info@ferentrenamiento.com',
  instagram: 'https://instagram.com/ferentrenamiento',
  googleMapsUrl: 'https://share.google/xNIU0yhc4Gck5jFpt',
} as const;

export const TRANSPORT_OPTIONS = [
  {
    icon: 'car' as const,
    title: 'En coche',
    description: 'Desde Valencia centro, toma la V-31 o A-7 en dirección Almussafes.',
    detail: 'Consulta la ruta exacta al Pabellón de Almussafes en Google Maps.',
  },
  {
    icon: 'bus' as const,
    title: 'En autobús',
    description: 'Revisa las conexiones disponibles hasta Almussafes antes del evento.',
    detail: 'Consulta horarios actualizados y combina la ruta con Google Maps.',
  },
  {
    icon: 'train' as const,
    title: 'En tren / Metro',
    description: 'Busca la conexión más conveniente hasta Almussafes o alrededores.',
    detail: 'Planifica el último tramo hasta el pabellón con el enlace del mapa.',
  },
] as const;

export const CONTACT_CARDS = [
  { label: 'Instagram', value: '@grstrengthclub', href: 'https://www.instagram.com/grstrengthclub?igsh=ZGwzY2JrdWhteXZo' },
  { label: 'Instagram', value: '@nicogr_', href: 'https://www.instagram.com/nicogr_?igsh=MXA2emd4ZTUxcGxxNg==' },
] as const;

export const UBICACION_SECTION_IDS = {
  hero: 'ubicacion-hero',
  map: 'ubicacion-map',
  transport: 'ubicacion-transport',
  gallery: 'ubicacion-gallery',
  contact: 'ubicacion-contact',
  cta: 'ubicacion-cta',
} as const;
