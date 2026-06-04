/**
 * Athlete (GR Cup) Raffle Store
 *
 * GR Cup variant of the raffle store. Wraps a `createRaffleStore()` instance
 * so FER and GR Cup each have isolated state. Adapter logic for
 * Athlete -> RaffleWinner is colocated here.
 */

import { createRaffleStore, type RaffleStore } from './raffleStoreFactory';
import type { Athlete } from '../types/athlete';
import type { RaffleWinner } from '../utils/api';
import { api } from '../utils/api';

/**
 * Map an Athlete (GR Cup schema) to a RaffleWinner for the wheel.
 * Note: the GR Cup raffle endpoint returns Inscripcion[] too, so this
 * adapter is here for parity / future migration. Today the backend
 * is Inscripcion-shaped regardless of competicion kind.
 */
export function athleteToRaffleWinner(athlete: Athlete): RaffleWinner {
  const fullName = `${athlete.firstName} ${athlete.surname}`.trim();
  return {
    id: athlete.id,
    nombre: fullName,
    email: athlete.email,
    club: athlete.club ?? undefined,
    categoria: athlete.weightCategory,
    totalPagado: 0, // Athletes don't carry totalPagado — filled by API in practice.
    sexo: athlete.sex,
  };
}

export const grCupRaffleStore: RaffleStore = createRaffleStore();
export { api };
