import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  CuboidCollider,
  RigidBody,
  interactionGroups,
  useBeforePhysicsStep,
  useSphericalJoint,
  type RapierRigidBody,
} from '@react-three/rapier';
import { Euler, MathUtils, Plane, Quaternion, Vector3, type Group } from 'three';
import { Ribbon } from './Ribbon';
import { useMedalModel } from './useMedalModel';
import type { HangingLayout, MedalCollisions, MedalPhysics, ResolvedMedal } from './types';

export interface MedalRigProps {
  medal: ResolvedMedal;
  /** Rail point in world units (x = anchor, y = top edge of the canvas). */
  railX: number;
  railY: number;
  layout: HangingLayout;
  physics: MedalPhysics;
  /** Contact material when medals may hit each other; null = this medal collides with nothing. */
  collisions: MedalCollisions | null;
  /** False while the canvas is out of the viewport. */
  active: boolean;
  /** Shared flag: a pointer is dragging a medal (blocks touch scrolling). */
  grabbingRef: MutableRefObject<boolean>;
  onHover?: (id: string | null) => void;
}

type Mode = 'idle' | 'drag' | 'released';

const GRAVITY = 9.81;
/** Without `collisions`, a medal is in group 15 and filters out every group: it hits nothing. */
const NO_COLLISIONS = interactionGroups(15, []);
/** World z per stacking step (`geometry.z`): small enough that podium boxes still overlap in depth. */
const Z_STEP = 0.02;
/** Strip aspect (width / height) of /images/medals/ribbon.png. */
const RIBBON_TEXTURE_ASPECT = 96 / 256;
/** PD gains of the idle twist around the vertical axis (per unit of inertia). */
const TWIST_KP = 25;
const TWIST_KD = 6;
/** Bounds of the per-cycle correction of the adaptive wind amplitude. */
const WIND_ADAPT_MIN = 0.8;
const WIND_ADAPT_MAX = 1.25;

/**
 * One hanging medal: a fixed rail body and the medal body joined by a spherical joint at the
 * rail (rigid pendulum of length ribbon + tab). Forces are applied once per physics step:
 * idle wind (periodic force whose amplitude adapts to the target angle), idle twist, and the
 * drag spring towards the pointer. The ribbon is drawn from the medal transform. The collider is a
 * box (the GLB mesh is not watertight); it only touches other medals when `collisions` is set.
 */
export function MedalRig({ medal, railX, railY, layout, physics, collisions, active, grabbingRef, onHover }: MedalRigProps) {
  const { assets, geometry: geo } = medal;
  const ppu = physics.pxPerUnit;
  const model = useMedalModel(assets.glb, geo.medalWidth / ppu);
  const ribbonTexture = useTexture(assets.ribbon);
  const gl = useThree((state) => state.gl);

  const railRef = useRef<RapierRigidBody>(null);
  const bodyRef = useRef<RapierRigidBody>(null);
  const attachRef = useRef<Group>(null);
  const scaleRef = useRef<Group>(null);

  const rig = useMemo(() => {
    const ribbonLength = geo.ribbonLength / ppu;
    const rod = ribbonLength + model.pivotY;
    const omega0 = Math.sqrt(GRAVITY / rod);
    const omega = (2 * Math.PI) / geo.wind.periodS;
    const ampRad = MathUtils.degToRad(geo.wind.ampDeg);
    // Driven damped oscillator: force amplitude that gives `ampRad` in steady state.
    const gamma = physics.linearDamping;
    const forceAmp = physics.mass * rod * ampRad * Math.hypot(omega0 ** 2 - omega ** 2, gamma * omega);
    const [hx, hy, hz] = model.halfExtents;
    return {
      rod,
      omega0,
      ampRad,
      forceAmp,
      twistRad: MathUtils.degToRad(geo.wind.twistDeg),
      z: geo.z * Z_STEP,
      inertiaY: (physics.mass * ((2 * hx) ** 2 + (2 * hz) ** 2)) / 12,
      maxSwing: MathUtils.degToRad(physics.maxSwingDeg),
      ribbonZ: -(hz + 0.004),
      halfExtents: [hx, hy, hz] as [number, number, number],
    };
  }, [geo, physics, model, ppu]);

  useSphericalJoint(railRef, bodyRef, [
    [0, 0, 0],
    [0, rig.rod, 0],
  ]);

  const sim = useRef({
    mode: 'idle' as Mode,
    time: 0,
    windWeight: 1,
    forceAmp: rig.forceAmp,
    peak: 0,
    cycle: 0,
    restTime: 0,
    grabLocal: new Vector3(),
    target: new Vector3(),
    plane: new Plane(new Vector3(0, 0, 1), 0),
    down: { x: 0, y: 0, time: 0 },
    hovered: false,
    scale: 1,
    scaleVelocity: 0,
  });

  const scratch = useMemo(
    () => ({ q: new Quaternion(), euler: new Euler(0, 0, 0, 'YXZ'), v: new Vector3(), w: new Vector3(), r: new Vector3(), p: new Vector3() }),
    [],
  );

  // Anchor moved (resize / column re-measure): move the rail and re-hang the medal below it.
  useEffect(() => {
    const rail = railRef.current;
    const body = bodyRef.current;
    if (!rail || !body) return;
    rail.setTranslation({ x: railX, y: railY, z: rig.z }, true);
    body.setTranslation({ x: railX, y: railY - rig.rod, z: rig.z }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [railX, railY, rig.rod, rig.z]);

  // Entering the viewport: a ~2° nudge so the wind is noticed at once.
  useEffect(() => {
    const body = bodyRef.current;
    if (!active || !body) return;
    const speed = MathUtils.degToRad(physics.entryImpulseDeg) * rig.omega0 * rig.rod;
    body.applyImpulse({ x: physics.mass * speed * (medal.phase < 0.5 ? 1 : -1), y: 0, z: 0 }, true);
  }, [active, physics, rig, medal.phase]);

  useBeforePhysicsStep((world) => {
    const body = bodyRef.current;
    if (!body) return;
    const s = sim.current;
    const dt = world.timestep;
    s.time += dt;
    body.resetForces(false);
    body.resetTorques(false);

    const p = body.translation();
    const w = body.angvel();
    const theta = Math.atan2(p.x - railX, railY - p.y);

    if (s.mode === 'released') {
      s.restTime = Math.hypot(w.x, w.y, w.z) < physics.restAngularSpeed ? s.restTime + dt : 0;
      if (s.restTime >= physics.restHoldS) s.mode = 'idle';
    }
    const windTarget = s.mode === 'idle' ? 1 : 0;
    s.windWeight = s.mode === 'drag' ? 0 : MathUtils.clamp(s.windWeight + Math.sign(windTarget - s.windWeight) * (dt / physics.windBlendS), 0, 1);

    // Idle wind: F = A·sin(2πt/T + φ); A adapts once per period towards the target amplitude.
    const cyclePos = s.time / geo.wind.periodS + medal.phase;
    const cycle = Math.floor(cyclePos);
    s.peak = Math.max(s.peak, Math.abs(theta));
    if (cycle !== s.cycle) {
      if (s.windWeight >= 1 && s.peak > rig.ampRad * 0.2) {
        s.forceAmp *= MathUtils.clamp(rig.ampRad / s.peak, WIND_ADAPT_MIN, WIND_ADAPT_MAX);
      }
      s.peak = 0;
      s.cycle = cycle;
    }
    if (s.windWeight > 0) {
      body.addForce({ x: s.windWeight * s.forceAmp * Math.sin(2 * Math.PI * cyclePos), y: 0, z: 0 }, true);
      const { q, euler } = scratch;
      const r = body.rotation();
      euler.setFromQuaternion(q.set(r.x, r.y, r.z, r.w));
      const twistTarget = rig.twistRad * Math.sin(2 * Math.PI * (s.time / geo.wind.twistPeriodS + medal.phase));
      const torque = s.windWeight * rig.inertiaY * (TWIST_KP * (twistTarget - euler.y) - TWIST_KD * w.y);
      body.addTorque({ x: 0, y: torque, z: 0 }, true);
    }

    // Drag: spring-damper between the grabbed point and the pointer, applied at that point.
    if (s.mode === 'drag') {
      const { q, v, r, p: grab } = scratch;
      const rot = body.rotation();
      r.copy(s.grabLocal).applyQuaternion(q.set(rot.x, rot.y, rot.z, rot.w));
      grab.set(p.x + r.x, p.y + r.y, p.z + r.z);
      const lin = body.linvel();
      v.set(lin.x, lin.y, lin.z).add(scratch.w.set(w.x, w.y, w.z).cross(r));
      const k = physics.dragStiffness;
      const c = physics.dragDamping;
      body.addForceAtPoint(
        {
          x: k * (s.target.x - grab.x) - c * v.x,
          y: k * (s.target.y - grab.y) - c * v.y,
          z: k * (s.target.z - grab.z) - c * v.z,
        },
        { x: grab.x, y: grab.y, z: grab.z },
        true,
      );
    }
  });

  // Hover scale spring (stiffness/damping from the spec) and env-map boost; visual only.
  useFrame((_, delta) => {
    const s = sim.current;
    const dt = Math.min(delta, 1 / 30);
    const target = s.hovered || s.mode === 'drag' ? physics.hoverScale : 1;
    s.scaleVelocity += (physics.hoverStiffness * (target - s.scale) - physics.hoverDamping * s.scaleVelocity) * dt;
    s.scale += s.scaleVelocity * dt;
    scaleRef.current?.scale.setScalar(model.scale * s.scale);
    const boost = 1 + (physics.hoverEnvBoost - 1) * MathUtils.clamp((s.scale - 1) / (physics.hoverScale - 1), 0, 1);
    model.materials.forEach((material, index) => {
      material.envMapIntensity = model.baseEnvIntensity[index] * boost;
    });
  });

  const setCursor = useCallback((cursor: string) => {
    gl.domElement.style.cursor = cursor;
  }, [gl]);

  /** Clamp the drag target to `maxSwing` from the vertical below the rail. */
  const setTarget = useCallback((point: Vector3) => {
    const dx = point.x - railX;
    const dy = railY - point.y;
    const angle = Math.atan2(dx, dy);
    if (Math.abs(angle) <= rig.maxSwing) {
      sim.current.target.copy(point);
      return;
    }
    const length = Math.hypot(dx, dy);
    const clamped = Math.sign(angle) * rig.maxSwing;
    sim.current.target.set(railX + length * Math.sin(clamped), railY - length * Math.cos(clamped), point.z);
  }, [railX, railY, rig.maxSwing]);

  const handlePointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (event.pointerType !== 'mouse' || sim.current.hovered) return;
    sim.current.hovered = true;
    setCursor(sim.current.mode === 'drag' ? 'grabbing' : 'grab');
    onHover?.(medal.id);
    const direction = Math.sign(event.nativeEvent.movementX) || 1;
    bodyRef.current?.applyImpulse({ x: physics.mass * physics.hoverImpulse * direction, y: 0, z: 0 }, true);
  }, [medal.id, onHover, physics, setCursor]);

  const handlePointerOut = useCallback(() => {
    if (!sim.current.hovered) return;
    sim.current.hovered = false;
    if (sim.current.mode !== 'drag') setCursor('');
    onHover?.(null);
  }, [onHover, setCursor]);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    const body = bodyRef.current;
    if (!body) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    const s = sim.current;
    const t = body.translation();
    const r = body.rotation();
    s.grabLocal
      .set(event.point.x - t.x, event.point.y - t.y, event.point.z - t.z)
      .applyQuaternion(scratch.q.set(r.x, r.y, r.z, r.w).invert());
    s.plane.constant = -event.point.z;
    s.target.copy(event.point);
    s.down = { x: event.clientX, y: event.clientY, time: performance.now() };
    s.mode = 'drag';
    grabbingRef.current = true;
    setCursor('grabbing');
  }, [grabbingRef, scratch, setCursor]);

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (sim.current.mode !== 'drag') return;
    if (event.ray.intersectPlane(sim.current.plane, scratch.p)) setTarget(scratch.p);
  }, [scratch, setTarget]);

  const release = useCallback((event: ThreeEvent<PointerEvent>) => {
    const s = sim.current;
    const body = bodyRef.current;
    if (s.mode !== 'drag' || !body) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    grabbingRef.current = false;
    s.mode = 'released';
    s.restTime = 0;
    setCursor(s.hovered ? 'grab' : '');
    const moved = Math.hypot(event.clientX - s.down.x, event.clientY - s.down.y);
    const isTap = moved < physics.tapMaxMovePx && performance.now() - s.down.time < physics.tapMaxMs;
    if (isTap) {
      const t = body.translation();
      const direction = -(Math.sign(s.target.x - t.x) || 1);
      body.applyImpulseAtPoint({ x: physics.mass * layout.tapImpulse * direction, y: 0, z: 0 }, s.target, true);
      return;
    }
    // Keep the gesture velocity, clamped.
    const v = body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed > physics.releaseMaxSpeed) {
      const k = physics.releaseMaxSpeed / speed;
      const w = body.angvel();
      body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
      body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
    }
  }, [grabbingRef, layout.tapImpulse, physics, setCursor]);

  // After a hit between podium medals: more angular damping for a moment, so they do not rattle.
  const hitTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleHit = useCallback(() => {
    const body = bodyRef.current;
    if (!body || !collisions) return;
    body.setAngularDamping(collisions.hitAngularDamping);
    clearTimeout(hitTimer.current);
    hitTimer.current = setTimeout(() => bodyRef.current?.setAngularDamping(physics.angularDamping), collisions.hitDampingMs);
  }, [collisions, physics.angularDamping]);
  useEffect(() => () => clearTimeout(hitTimer.current), []);

  return (
    <>
      <RigidBody ref={railRef} type="fixed" colliders={false} position={[railX, railY, rig.z]} />
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={[railX, railY - rig.rod, rig.z]}
        linearDamping={physics.linearDamping}
        angularDamping={physics.angularDamping}
        onCollisionEnter={collisions ? handleHit : undefined}
      >
        <CuboidCollider
          args={rig.halfExtents}
          mass={physics.mass}
          collisionGroups={collisions ? interactionGroups(collisions.group, [collisions.group]) : NO_COLLISIONS}
          restitution={collisions?.restitution ?? 0}
          friction={collisions?.friction ?? 0}
        />
        <group ref={attachRef}>
          <group ref={scaleRef} scale={model.scale}>
            <primitive object={model.object} />
          </group>
          <mesh
            visible={false}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={release}
            onPointerCancel={release}
          >
            <boxGeometry args={[rig.halfExtents[0] * 2, rig.halfExtents[1] * 2, rig.halfExtents[2] * 2 + 0.1]} />
          </mesh>
        </group>
      </RigidBody>
      <Ribbon
        texture={ribbonTexture}
        textureAspect={RIBBON_TEXTURE_ASPECT}
        top={{ x: railX, y: railY + 0.1 }}
        attachRef={attachRef}
        bottomY={model.pivotY}
        z={rig.ribbonZ}
        width={layout.ribbonWidth / ppu}
        spreadTop={layout.ribbonSpreadTop / ppu}
        spreadBottom={layout.ribbonSpreadBottom / ppu}
      />
    </>
  );
}
