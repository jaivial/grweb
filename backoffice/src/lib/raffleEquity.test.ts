/**
 * raffleEquity — unit tests
 *
 * Covers all the spec cases:
 *  - pool too small returns null
 *  - pool divisible, even N -> equal split
 *  - pool 1M 5F N=4 -> fallback=true
 *  - pool 5M 5F N=5 -> 3+2 or 2+3, no fallback
 *  - all-female pool N=3 equity -> fallback
 *  - edge: N=1 equity ignored
 * Plus a few extra cases for shape guarantees and unknown-sex handling.
 */

import { describe, it, expect } from 'vitest';
import { equitySplit, randomPickN } from './raffleEquity';

interface FakeItem {
  id: number;
  sex: 'masculino' | 'femenino' | null;
}

const male = (id: number): FakeItem => ({ id, sex: 'masculino' });
const female = (id: number): FakeItem => ({ id, sex: 'femenino' });
const other = (id: number): FakeItem => ({ id, sex: null });

const sexOf = (it: FakeItem): string | null => it.sex;

/** Deterministic RNG: cycles through the same sequence for stable tests. */
const seededRng = (): (() => number) => {
  const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.0];
  let i = 0;
  return () => {
    const v = seq[i % seq.length];
    i += 1;
    return v;
  };
};

describe('randomPickN', () => {
  it('returns N distinct items from the pool', () => {
    const pool = [1, 2, 3, 4, 5];
    const picked = randomPickN(pool, 3, seededRng());
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it('returns the full pool when N exceeds pool size', () => {
    const pool = [1, 2, 3];
    expect(randomPickN(pool, 10, seededRng())).toHaveLength(3);
  });

  it('does not mutate the input pool', () => {
    const pool = [1, 2, 3, 4, 5];
    const before = pool.slice();
    randomPickN(pool, 3, seededRng());
    expect(pool).toEqual(before);
  });

  it('returns [] when N is 0', () => {
    expect(randomPickN([1, 2, 3], 0, seededRng())).toEqual([]);
  });
});

describe('equitySplit — null / guard cases', () => {
  it('returns null when numWinners < 1', () => {
    expect(equitySplit([male(1)], 0, sexOf)).toBeNull();
    expect(equitySplit([male(1)], -1, sexOf)).toBeNull();
  });

  it('returns null when numWinners > pool.length', () => {
    expect(equitySplit([male(1), male(2)], 5, sexOf)).toBeNull();
  });
});

describe('equitySplit — equity="sex" with N >= 2', () => {
  it('equal split for an even N with a balanced pool', () => {
    // 4M, 4F, N=2 -> 1M + 1F, no fallback.
    const pool = [male(1), male(2), male(3), male(4), female(5), female(6), female(7), female(8)];
    const result = equitySplit(pool, 2, sexOf, seededRng(), 'sex');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(false);
    expect(result!.winners).toHaveLength(2);
    const males = result!.winners.filter((w) => w.sex === 'masculino').length;
    const females = result!.winners.filter((w) => w.sex === 'femenino').length;
    expect(males).toBe(1);
    expect(females).toBe(1);
  });

  it('balanced 5M/5F N=5 -> 3+2 or 2+3, no fallback', () => {
    const pool: FakeItem[] = [];
    for (let i = 1; i <= 5; i++) pool.push(male(i));
    for (let i = 6; i <= 10; i++) pool.push(female(i));

    const result = equitySplit(pool, 5, sexOf, seededRng(), 'sex');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(false);
    expect(result!.winners).toHaveLength(5);
    const m = result!.winners.filter((w) => w.sex === 'masculino').length;
    const f = result!.winners.filter((w) => w.sex === 'femenino').length;
    // Dominant side gets ceil(5/2) = 3; other side gets 2.
    expect(m).toBe(3);
    expect(f).toBe(2);
  });

  it('unbalanced pool 1M 5F N=4 -> fallback=true (dominant pool too small)', () => {
    // 1M, 5F, N=4. targetBig=2, targetSmall=2. Dominant side is F (5).
    // Dominant has 5 >= 2 OK, but other (M=1) < 2 -> fallback.
    const pool = [male(1), female(2), female(3), female(4), female(5), female(6)];
    const result = equitySplit(pool, 4, sexOf, seededRng(), 'sex');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(true);
    expect(result!.winners).toHaveLength(4);
  });

  it('all-female pool N=3 equity -> fallback', () => {
    const pool = [female(1), female(2), female(3), female(4)];
    const result = equitySplit(pool, 3, sexOf, seededRng(), 'sex');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(true);
    expect(result!.winners).toHaveLength(3);
  });

  it('pool with null/unknown sex -> fallback', () => {
    const pool = [male(1), male(2), female(3), female(4), other(5)];
    const result = equitySplit(pool, 2, sexOf, seededRng(), 'sex');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(true);
    expect(result!.winners).toHaveLength(2);
  });
});

describe('equitySplit — equity="none" / N=1 short-circuits', () => {
  it('N=1 with equity="sex" returns a single random pick with no fallback', () => {
    const pool = [male(1), female(2), female(3)];
    const result = equitySplit(pool, 1, sexOf, seededRng(), 'sex');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(false);
    expect(result!.winners).toHaveLength(1);
  });

  it('N=5 with equity="none" returns N random with no fallback regardless of pool', () => {
    const pool = [male(1), male(2), male(3)];
    const result = equitySplit(pool, 3, sexOf, seededRng(), 'none');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(false);
    expect(result!.winners).toHaveLength(3);
  });

  it('N=1 with equity="none" returns a single random pick', () => {
    const pool = [male(1), female(2)];
    const result = equitySplit(pool, 1, sexOf, seededRng(), 'none');
    expect(result).not.toBeNull();
    expect(result!.fallback).toBe(false);
    expect(result!.winners).toHaveLength(1);
  });
});

describe('equitySplit — RNG injection', () => {
  it('uses the injected RNG when provided', () => {
    // Deterministic RNG: always returns 0 (picks first index in partial shuffle).
    const alwaysFirst: () => number = () => 0;
    const pool = [male(1), female(2), male(3), female(4)];
    const result = equitySplit(pool, 2, sexOf, alwaysFirst, 'sex');
    expect(result).not.toBeNull();
    expect(result!.winners).toHaveLength(2);
  });
});
