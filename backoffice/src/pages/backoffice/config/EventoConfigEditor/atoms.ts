import { atom } from 'jotai';
import type { EventoConfigFormData } from './types';
import { DEFAULT_EVENTO_CONFIG } from './constants';

export const eventoConfigFormAtom = atom<EventoConfigFormData>(DEFAULT_EVENTO_CONFIG);

export const eventoConfigLoadingAtom = atom<boolean>(true);

export const eventoConfigSavingAtom = atom<boolean>(false);

export const eventoConfigErrorAtom = atom<string | null>(null);

export const eventoConfigSuccessAtom = atom<boolean>(false);
