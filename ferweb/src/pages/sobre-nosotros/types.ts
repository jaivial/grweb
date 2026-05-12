/**
 * Sobre Nosotros Page — Type definitions
 */

export type ValueIcon = 'users' | 'flame' | 'shield' | 'heart';

export interface CoreValue {
  readonly title: string;
  readonly description: string;
  readonly icon: ValueIcon;
}

export interface TeamMember {
  readonly name: string;
  readonly role: string;
  readonly description: string;
  readonly photoIndex: number;
}
