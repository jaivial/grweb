/**
 * raffleEquity — pure equity-aware random picker
 *
 * Used as the BACKUP client-side split logic for the Sorteo Inscritos
 * modal. The backend is the source of truth — this function lets the UI
 * pre-compute and surface a "Con N ganadores: X + Y" helper text and
 * also allows fallback to random when the pool cannot support equity.
 *
 * No React, no Jotai, no api. Fully testable in isolation.
 *
 * Contract:
 *  - equitySplit(pool, N, sexOf, rng?) -> { winners, fallback } | null
 *  - null when N < 1 or N > pool.length
 *  - When equityMode is "sex" and N >= 2, attempt a split:
 *      - targetBig = ceil(N/2) for the dominant sex
 *      - targetSmall = N - targetBig
 *      - If the dominant pool has fewer than targetBig, return a
 *        fully-random pick of N from the whole pool with fallback=true.
 *      - Else pick targetBig from dominant and targetSmall from the
 *        other, returning fallback=false.
 *  - When equityMode is anything other than "sex" (or N < 2), pick N
 *    at random with fallback=false.
 *
 * The sexOf callback is intentionally loose (returns string | null |
 * undefined) so callers don't have to normalize their domain objects
 * up front. Items whose sexOf(...) is null/undefined fall through to
 * the fully-random branch with fallback=true (we cannot honor equity
 * without sex data).
 */

export type EquityMode = 'none' | 'sex';

export interface EquitySplitResult<T> {
  winners: T[];
  fallback: boolean;
}

/**
 * Fisher-Yates partial shuffle: returns N distinct items drawn uniformly
 * at random from `pool` (or the full pool shuffled, if pool.length < N).
 * The input is never mutated.
 */
export function randomPickN<T>(pool: readonly T[], count: number, rng: () => number = Math.random): T[] {
  // Defensive copy so we never mutate caller-owned arrays.
  const arr = pool.slice();
  const take = Math.min(count, arr.length);
  const result: T[] = [];
  for (let i = 0; i < take; i++) {
    // Pick a uniform index in [i, arr.length - 1] and swap with position i.
    const j = i + Math.floor(rng() * (arr.length - i));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    result.push(arr[i]);
  }
  return result;
}

/**
 * Equity-aware random pick. See the file header for the full contract.
 *
 * @param pool      Candidate items.
 * @param numWinners  Desired number of winners.
 * @param sexOf     Maps an item to its sex (e.g. "masculino" | "femenino").
 * @param rng       Optional injectable RNG. Defaults to Math.random.
 * @param equityMode 'sex' to split by sex, 'none' for a plain random pick.
 */
export function equitySplit<T>(
  pool: readonly T[],
  numWinners: number,
  sexOf: (item: T) => string | null | undefined,
  rng: () => number = Math.random,
  equityMode: EquityMode = 'sex'
): EquitySplitResult<T> | null {
  if (numWinners < 1) return null;
  if (numWinners > pool.length) return null;

  // Equity only meaningful with N >= 2. Below that, it's just a random pick.
  if (equityMode !== 'sex' || numWinners < 2) {
    return { winners: randomPickN(pool, numWinners, rng), fallback: false };
  }

  const males: T[] = [];
  const females: T[] = [];
  const unknown: T[] = [];

  for (const item of pool) {
    const sex = sexOf(item);
    if (sex === 'masculino') males.push(item);
    else if (sex === 'femenino') females.push(item);
    else unknown.push(item);
  }

  // Any item with missing/unknown sex breaks the equity guarantee —
  // fall back to fully-random across the whole pool.
  if (unknown.length > 0) {
    return { winners: randomPickN(pool, numWinners, rng), fallback: true };
  }

  // Determine the dominant sex (larger pool) and the target breakdown.
  const dominantIsMales = males.length >= females.length;
  const dominant: T[] = dominantIsMales ? males : females;
  const other: T[] = dominantIsMales ? females : males;

  const targetBig = Math.ceil(numWinners / 2);
  const targetSmall = numWinners - targetBig;

  // Insufficient pool on the dominant side — fall back to random.
  if (dominant.length < targetBig || other.length < targetSmall) {
    return { winners: randomPickN(pool, numWinners, rng), fallback: true };
  }

  const drawnDominant = randomPickN(dominant, targetBig, rng);
  const drawnOther = randomPickN(other, targetSmall, rng);

  return {
    winners: drawnDominant.concat(drawnOther),
    fallback: false,
  };
}
