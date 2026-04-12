/**
 * SmokeOverlay version compatibility test.
 *
 * @react-three/fiber@9.x requires React 19 but this project uses React 18.
 * This causes "can't access property S, x is undefined" at runtime.
 *
 * @see https://github.com/pmndrs/react-three-fiber/releases/tag/v9.0.0
 */
import { describe, it, expect } from 'vitest';

function extractMinMajor(peerDep: string): number {
  // peer dep is like ">=19 <19.3" — extract the first numeric version
  const match = peerDep.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getPeerDeps(pkg: Record<string, unknown>): Record<string, string> {
  return (pkg.default as Record<string, Record<string, string>> | undefined)?.peerDependencies
    ?? pkg.peerDependencies as Record<string, string>
    ?? {};
}

function getVersion(pkg: Record<string, unknown>): string {
  return (pkg.default as { version?: string } | undefined)?.version
    ?? pkg.version as string
    ?? '0';
}

describe('r3f / React version compatibility', () => {
  it('@react-three/fiber peer dep matches installed react version', async () => {
    const r3fPkg = await import('@react-three/fiber/package.json') as Record<string, unknown>;
    const reactPkg = await import('react/package.json') as Record<string, unknown>;

    const minReactMajor = extractMinMajor(getPeerDeps(r3fPkg).react ?? '');
    const installedReactMajor = parseInt(getVersion(reactPkg).split('.')[0], 10);

    expect(installedReactMajor).toBeGreaterThanOrEqual(minReactMajor);
  });

  it('@react-three/drei peer dep matches installed react version', async () => {
    const dreiPkg = await import('@react-three/drei/package.json') as Record<string, unknown>;
    const reactPkg = await import('react/package.json') as Record<string, unknown>;

    const minReactMajor = extractMinMajor(getPeerDeps(dreiPkg).react ?? '');
    const installedReactMajor = parseInt(getVersion(reactPkg).split('.')[0], 10);

    expect(installedReactMajor).toBeGreaterThanOrEqual(minReactMajor);
  });
});
