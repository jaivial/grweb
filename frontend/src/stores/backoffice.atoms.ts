import { atom } from 'jotai';

export const backofficeAtoms = {
  isMobileMenuOpen: atom<boolean>(false),
} as const;

export const isMobileMenuOpenAtom = backofficeAtoms.isMobileMenuOpen;
