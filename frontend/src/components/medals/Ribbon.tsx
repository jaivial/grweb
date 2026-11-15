import { useEffect, useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, DoubleSide, RepeatWrapping, SRGBColorSpace, Vector3, type Object3D, type Texture } from 'three';

export interface RibbonProps {
  texture: Texture;
  /** Strip aspect of the texture (width / height of one tile). */
  textureAspect: number;
  /** Rail point the two strands hang from (world units). */
  top: { x: number; y: number };
  /** Object that follows the medal body (unscaled); the strands end at its local `bottomY`. */
  attachRef: RefObject<Object3D>;
  bottomY: number;
  /** z of the strands, local to the medal (behind its back face). */
  z: number;
  width: number;
  spreadTop: number;
  spreadBottom: number;
}

const SIDES = [-1, 1] as const;

function createStrandGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(8), 2));
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  return geometry;
}

/**
 * Lanyard of a hanging medal (unlit fabric: the printed colours read as in the photo): two flat textured strands in a V, from the rail to the medal tab.
 * Pure visual: it is rebuilt every frame from the medal transform (the simulation is the rigid
 * pendulum in MedalRig), so it never fights the physics.
 */
export function Ribbon({ texture, textureAspect, top, attachRef, bottomY, z, width, spreadTop, spreadBottom }: RibbonProps) {
  const geometries = useMemo(() => SIDES.map(createStrandGeometry), []);
  const scratch = useMemo(() => ({ t: new Vector3(), b: new Vector3(), d: new Vector3(), p: new Vector3() }), []);

  useEffect(() => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }, [texture]);

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  useFrame(() => {
    const attach = attachRef.current;
    if (!attach) return;
    attach.updateWorldMatrix(true, false);
    const tileHeight = width / textureAspect;
    SIDES.forEach((side, index) => {
      const { t, b, d, p } = scratch;
      b.set((side * spreadBottom) / 2, bottomY, z);
      attach.localToWorld(b);
      t.set(top.x + (side * spreadTop) / 2, top.y, b.z);
      d.subVectors(b, t);
      const length = d.length();
      d.normalize();
      p.set(-d.y, d.x, 0).multiplyScalar(width / 2);
      const position = geometries[index].getAttribute('position') as BufferAttribute;
      position.setXYZ(0, t.x + p.x, t.y + p.y, t.z);
      position.setXYZ(1, t.x - p.x, t.y - p.y, t.z);
      position.setXYZ(2, b.x + p.x, b.y + p.y, b.z);
      position.setXYZ(3, b.x - p.x, b.y - p.y, b.z);
      position.needsUpdate = true;
      const uv = geometries[index].getAttribute('uv') as BufferAttribute;
      const vEnd = length / tileHeight;
      uv.setXY(0, 0, vEnd);
      uv.setXY(1, 1, vEnd);
      uv.setXY(2, 0, 0);
      uv.setXY(3, 1, 0);
      uv.needsUpdate = true;
    });
  });

  return (
    <>
      {geometries.map((geometry, index) => (
        <mesh key={SIDES[index]} geometry={geometry} frustumCulled={false}>
          <meshBasicMaterial map={texture} side={DoubleSide} color="#d9d9d9" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
