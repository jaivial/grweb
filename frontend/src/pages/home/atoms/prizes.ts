import { atom } from 'jotai';
import type { MovementId, WeightClassSex } from '../components/prizes/medals.config';

/** Movement whose hanging medal is hovered: its movement card shows the hover state. */
export const hoveredPrizeMovementAtom = atom<MovementId | null>(null);

/** Active tab (Hombres/Mujeres) of the weight classes on mobile. */
export const weightClassTabAtom = atom<WeightClassSex>('men');
