/**
 * Inscripcion (FER) Raffle Store
 *
 * FER variant of the raffle store. Wraps a `createRaffleStore()` instance
 * so FER and GR Cup each have isolated state. Adapter logic for
 * Inscripcion -> RaffleWinner is colocated here (not in the modal)
 * to keep the modal component shape-agnostic.
 */

import { createRaffleStore, type RaffleStore } from './raffleStoreFactory';
import type { Inscripcion } from '../types/api';
import type { RaffleWinner } from '../utils/api';
import { api } from '../utils/api';

/**
 * Map an Inscripcion (FER schema) to a RaffleWinner for the wheel.
 * The wheel only needs an id and a displayable name.
 */
export function inscripcionToRaffleWinner(inscripcion: Inscripcion): RaffleWinner {
  return {
    id: inscripcion.id,
    nombre: inscripcion.nombre,
    email: inscripcion.email,
    // Pass through useful fields so the WinnersCard can render them.
    club: undefined,
    categoria: inscripcion.categoriaPeso,
    totalPagado: inscripcion.totalPagado,
    sexo: inscripcion.sexo,
  };
}

export const ferRaffleStore: RaffleStore = createRaffleStore();
export { api };
