/**
 * Ubicacion Page — Type definitions
 */

export type TransportIcon = 'car' | 'bus' | 'train';

export interface TransportOption {
  readonly icon: TransportIcon;
  readonly title: string;
  readonly description: string;
  readonly detail: string;
}

export interface ContactCard {
  readonly label: string;
  readonly value: string;
  readonly href: string;
}

export interface VenueInfo {
  readonly name: string;
  readonly fullName: string;
  readonly address: string;
  readonly fullAddress: string;
  readonly coordinates: { lat: number; lng: number };
  readonly email: string;
  readonly instagram: string;
  readonly googleMapsUrl: string;
}
