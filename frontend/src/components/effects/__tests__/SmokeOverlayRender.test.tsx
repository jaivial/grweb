/**
 * SmokeOverlay version compatibility test.
 *
 * @react-three/fiber@9.x requires React 19 but this project uses React 18.
 * This causes "can't access property S, x is undefined" at runtime.
 *
 * @see https://github.com/pmndrs/react-three-fiber/releases/tag/v9.0.0
 */
import { describe, it, expect } from '@jest/globals';

function extractMinMajor(peerDep: string): number {
  // peer dep is like ">=19 <19.3" — extract the first numeric version
  const match = peerDep.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

describe('r3f / React version compatibility', () => {
  it('@react-three/fiber peer dep matches installed react version', () => {
    const r3fPkg = require('@react-three/fiber/package.json');
    const reactPkg = require('react/package.json');

    const minReactMajor = extractMinMajor(r3fPkg.peerDependencies?.react ?? '');
    const installedReactMajor = parseInt(reactPkg.version.split('.')[0], 10);

    expect(installedReactMajor).toBeGreaterThanOrEqual(minReactMajor);
  });

  it('@react-three/drei peer dep matches installed react version', () => {
    const dreiPkg = require('@react-three/drei/package.json');
    const reactPkg = require('react/package.json');

    const minReactMajor = extractMinMajor(dreiPkg.peerDependencies?.react ?? '');
    const installedReactMajor = parseInt(reactPkg.version.split('.')[0], 10);

    expect(installedReactMajor).toBeGreaterThanOrEqual(minReactMajor);
  });
});
