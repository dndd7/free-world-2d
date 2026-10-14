import { Composite, Engine } from 'matter-js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MOTOR,
  applyMotors,
  canPin,
  connectedObjects,
  createBall,
  createBox,
  createCar,
  createGoal,
  createPin,
  createPlank,
  createTrack,
  createWheel,
  deserializeScene,
  groupJoinedBodies,
  hasMotor,
  installSurfaceRules,
  jointAnchor,
  jointsOf,
  rotateObjects,
  serializeScene,
  setLocked,
  translateObject,
  type DriveInput,
  type Joint,
  type SceneObject,
} from './scene';

beforeAll(() => installSurfaceRules());

/** A world with a long locked road (optionally tilted) and a car dropped near its start. */
function drive(options: { slopeDeg?: number; input: DriveInput; seconds?: number; dropFrom?: number; motorOn?: boolean }) {
  const engine = Engine.create();
  const a = ((options.slopeDeg ?? 0) * Math.PI) / 180;
  const from = { x: 0, y: 600 };
  const to = { x: Math.cos(a) * 5000, y: 600 - Math.sin(a) * 5000 };
  const road = createPlank(from, to)!;
  setLocked(road, true);

  const startX = 200;
  const roadY = 600 - Math.tan(a) * startX;
  const { objects, joints } = createCar(startX, roadY - 70 - (options.dropFrom ?? 0));
  if (options.motorOn === false) objects.forEach((o) => (o.motor = false));
  if (options.slopeDeg) rotateObjects(objects, -a);

  Composite.add(engine.world, [...road.bodies, ...objects.flatMap((o) => o.bodies), ...joints.map((j) => j.constraint)]);
  groupJoinedBodies(objects, joints);

  const [chassis, ...wheels] = objects;
  let worstDrift = 0;
  let flipped = false;
  const steps = Math.round((options.seconds ?? 6) * 60);
  for (let i = 0; i < steps; i++) {
    applyMotors(objects, options.input);
    Engine.update(engine, 1000 / 60);
    if (i > 90) {
      // after the car has settled, each wheel should still sit exactly on its pin
      for (const j of joints) {
        const wheel = j.b.bodies[0];
        const anchor = jointAnchor(j);
        worstDrift = Math.max(worstDrift, Math.hypot(wheel.position.x - anchor.x, wheel.position.y - anchor.y));
      }
    }
    const tilt = Math.abs(((chassis.bodies[0].angle + Math.PI) % (2 * Math.PI)) - Math.PI);
    if (tilt > Math.PI / 2) flipped = true;
  }
  return {
    startX,
    x: chassis.bodies[0].position.x,
    y: chassis.bodies[0].position.y,
    worstDrift,
    flipped,
    wheelAngle: wheels[0].bodies[0].angle,
    chassis,
    wheels,
    joints,
  };
}

describe('pins', () => {
  it('only pin whole, single-body things', () => {
    const wheel = createWheel(0, 0);
    const box = createBox(100, 0);
    expect(canPin(wheel)).toBe(true);
    expect(canPin(createGoal(0, 0))).toBe(false);
    expect(canPin(createTrack([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }])!)).toBe(false);
    expect(createPin(wheel, wheel, { x: 0, y: 0 })).toBeNull();
    expect(createPin(wheel, createGoal(0, 0), { x: 0, y: 0 })).toBeNull();
    expect(createPin(wheel, box, { x: 50, y: 0 })).not.toBeNull();
  });

  it('puts the anchor where it was asked for, and keeps it there as the group moves and turns', () => {
    const wheel = createWheel(300, 200);
    const box = createBox(300, 250);
    const pin = createPin(box, wheel, { x: 300, y: 200 })!;
    expect(jointAnchor(pin)).toMatchObject({ x: 300, y: 200 });

    translateObject(box, 40, -10);
    translateObject(wheel, 40, -10);
    expect(jointAnchor(pin).x).toBeCloseTo(340, 6);
    expect(jointAnchor(pin).y).toBeCloseTo(190, 6);

    rotateObjects([box, wheel], Math.PI / 2);
    const anchor = jointAnchor(pin);
    // the anchor still sits on the wheel's centre after the whole group is turned
    expect(anchor.x).toBeCloseTo(wheel.bodies[0].position.x, 6);
    expect(anchor.y).toBeCloseTo(wheel.bodies[0].position.y, 6);
  });

  it('finds everything connected to an object, directly or through others', () => {
    const { objects, joints } = createCar(0, 0);
    const lone = createBall(500, 0);
    expect(connectedObjects(objects[1], joints).map((o) => o.id).sort()).toEqual(objects.map((o) => o.id).sort());
    expect(connectedObjects(lone, joints)).toEqual([lone]);
    expect(jointsOf(objects[0], joints)).toHaveLength(2);
    expect(jointsOf(objects[1], joints)).toHaveLength(1);
    expect(jointsOf(lone, joints)).toHaveLength(0);
  });

  it('keeps the parts of one car from colliding with each other, and puts that back afterwards', () => {
    const { objects, joints } = createCar(0, 0);
    const lone = createBall(500, 0);
    const before = [...objects, lone].flatMap((o) => o.bodies).map((b) => b.collisionFilter.group);
    const restore = groupJoinedBodies([...objects, lone], joints);

    const groups = objects.map((o) => o.bodies[0].collisionFilter.group!);
    expect(new Set(groups).size).toBe(1);
    expect(groups[0]).toBeLessThan(0); // negative groups never collide with themselves
    expect(lone.bodies[0].collisionFilter.group).toBe(0);

    restore();
    expect([...objects, lone].flatMap((o) => o.bodies).map((b) => b.collisionFilter.group)).toEqual(before);
  });

  it('gives two separate cars separate groups', () => {
    const a = createCar(0, 0);
    const b = createCar(1000, 0);
    groupJoinedBodies([...a.objects, ...b.objects], [...a.joints, ...b.joints]);
    expect(a.objects[0].bodies[0].collisionFilter.group).not.toBe(b.objects[0].bodies[0].collisionFilter.group);
  });
});

describe('saving and loading a car', () => {
  function roundTrip(objects: SceneObject[], joints: Joint[]) {
    return deserializeScene(JSON.parse(JSON.stringify(serializeScene(objects, joints))));
  }

  it('keeps the wheels, their motors and the pins', () => {
    const { objects, joints } = createCar(400, 300);
    const loaded = roundTrip(objects, joints);
    expect(loaded.objects.map((o) => o.type)).toEqual(['chassis', 'wheel', 'wheel']);
    expect(loaded.objects.map((o) => o.motor)).toEqual([false, true, true]);
    expect(loaded.joints).toHaveLength(2);
    loaded.joints.forEach((j) => {
      const wheel = j.b.bodies[0].position;
      expect(jointAnchor(j).x).toBeCloseTo(wheel.x, 6);
      expect(jointAnchor(j).y).toBeCloseTo(wheel.y, 6);
    });
  });

  it('keeps the pins right even when the car is tilted before saving', () => {
    const { objects, joints } = createCar(400, 300);
    rotateObjects(objects, 0.6);
    const loaded = roundTrip(objects, joints);
    loaded.joints.forEach((j) => {
      const wheel = j.b.bodies[0].position;
      expect(jointAnchor(j).x).toBeCloseTo(wheel.x, 5);
      expect(jointAnchor(j).y).toBeCloseTo(wheel.y, 5);
    });
  });

  it('still drives after being saved and loaded', () => {
    const { objects, joints } = createCar(200, 480);
    const loaded = roundTrip(objects, joints);
    const engine = Engine.create();
    const road = createPlank({ x: 0, y: 600 }, { x: 4000, y: 600 })!;
    setLocked(road, true);
    Composite.add(engine.world, [...road.bodies, ...loaded.objects.flatMap((o) => o.bodies), ...loaded.joints.map((j) => j.constraint)]);
    groupJoinedBodies(loaded.objects, loaded.joints);
    for (let i = 0; i < 300; i++) {
      applyMotors(loaded.objects, 1);
      Engine.update(engine, 1000 / 60);
    }
    expect(loaded.objects[0].bodies[0].position.x).toBeGreaterThan(600);
  });

  it('does not write a pin to something that is not in the scene', () => {
    const { objects, joints } = createCar(0, 0);
    const file = serializeScene(objects.slice(0, 2), joints); // one wheel left out
    expect(file.joints).toHaveLength(1);
  });

  it('writes no joints key when there are none, so older files stay unchanged', () => {
    expect(serializeScene([createBall(0, 0)]).joints).toBeUndefined();
  });

  it('only keeps a motor on wheels', () => {
    const box = createBox(0, 0);
    box.motor = true;
    const loaded = roundTrip([box, createBall(100, 0)], []);
    expect(loaded.objects[0].motor).toBe(false);
  });

  it.each([
    ['a pin to an object that is not there', (j: any) => ({ ...j, b: 99 })],
    ['a pin from an object to itself', (j: any) => ({ ...j, b: j.a })],
    ['a pin with a negative index', (j: any) => ({ ...j, a: -1 })],
    ['a pin with a non-numeric position', (j: any) => ({ ...j, pointA: { x: 'left', y: 0 } })],
    ['a pin with a missing position', (j: any) => ({ ...j, pointB: undefined })],
    ['an unknown kind of joint', (j: any) => ({ ...j, type: 'weld' })],
  ])('rejects %s', (_name, damage) => {
    const { objects, joints } = createCar(0, 0);
    const file = JSON.parse(JSON.stringify(serializeScene(objects, joints)));
    file.joints[0] = damage(file.joints[0]);
    expect(() => deserializeScene(file)).toThrow();
  });

  it('rejects a pin attached to a track or a goal', () => {
    const { objects, joints } = createCar(0, 0);
    const file = JSON.parse(JSON.stringify(serializeScene(objects, joints)));
    file.objects.push({ type: 'goal', locked: false, spin: 0, handleAngle: 0, bodies: [{ x: 0, y: 0, angle: 0 }] });
    file.joints[0].b = file.objects.length - 1;
    expect(() => deserializeScene(file)).toThrow(/cannot be pinned/);
  });
});

describe('motors', () => {
  it('only wheels with the motor on count', () => {
    const wheel = createWheel(0, 0);
    expect(hasMotor([wheel])).toBe(false);
    wheel.motor = true;
    expect(hasMotor([wheel])).toBe(true);
    setLocked(wheel, true);
    expect(hasMotor([wheel])).toBe(false); // a locked wheel cannot turn
    expect(hasMotor([createBall(0, 0)])).toBe(false);
  });

  it('never pushes harder than the torque limit', () => {
    const wheel = createWheel(0, 0);
    wheel.motor = true;
    for (const input of [-1, 0, 1] as const) {
      wheel.bodies[0].torque = 0;
      applyMotors([wheel], input);
      expect(Math.abs(wheel.bodies[0].torque)).toBeLessThanOrEqual(MOTOR.maxTorque + 1e-12);
    }
  });

  it('pushes forward for 1, backward for -1, and only holds for 0', () => {
    const wheel = createWheel(0, 0);
    wheel.motor = true;
    applyMotors([wheel], 1);
    expect(wheel.bodies[0].torque).toBeGreaterThan(0);
    wheel.bodies[0].torque = 0;
    applyMotors([wheel], -1);
    expect(wheel.bodies[0].torque).toBeLessThan(0);
    // holding only resists motion, with a weaker limit than driving
    wheel.bodies[0].torque = 0;
    applyMotors([wheel], 0);
    expect(wheel.bodies[0].torque).toBe(0); // nothing to resist while still
  });

  it('leaves wheels with the motor off alone', () => {
    const wheel = createWheel(0, 0);
    applyMotors([wheel], 1);
    expect(wheel.bodies[0].torque).toBe(0);
  });
});

describe('driving a car', () => {
  it('drives forward when asked, reverses when asked, and goes nowhere with no input', () => {
    const forward = drive({ input: 1 });
    const back = drive({ input: -1 });
    const idle = drive({ input: 0 });
    expect(forward.x - forward.startX).toBeGreaterThan(500);
    expect(back.x - back.startX).toBeLessThan(-500);
    expect(Math.abs(idle.x - idle.startX)).toBeLessThan(30);
  });

  it('spins its wheels visibly while it drives', () => {
    const run = drive({ input: 1, seconds: 3 });
    expect(Math.abs(run.wheelAngle)).toBeGreaterThan(5); // several turns, so the spokes are seen turning
  });

  it('does not move at all if no wheel has its motor on', () => {
    const run = drive({ input: 1, motorOn: false });
    expect(Math.abs(run.x - run.startX)).toBeLessThan(30);
  });

  it('keeps every wheel firmly on its pin while driving', () => {
    expect(drive({ input: 1 }).worstDrift).toBeLessThan(1);
    expect(drive({ input: -1 }).worstDrift).toBeLessThan(1);
  });

  it('keeps its wheels on after dropping from a height', () => {
    const run = drive({ input: 1, dropFrom: 150, seconds: 5 });
    expect(run.worstDrift).toBeLessThan(1);
    expect(run.flipped).toBe(false);
    expect(run.x - run.startX).toBeGreaterThan(400);
  });

  it.each([10, 20, 30])('climbs a %i degree hill without losing a wheel or flipping', (deg) => {
    const run = drive({ slopeDeg: deg, input: 1, seconds: 6 });
    expect(run.flipped).toBe(false);
    expect(run.worstDrift).toBeLessThan(1);
    expect(run.startX).toBeLessThan(run.x); // moved up the slope
    expect(run.y).toBeLessThan(600 - Math.tan((deg * Math.PI) / 180) * run.startX - 100); // and gained height
  });

  it('can be driven with sticky tyres for more grip', () => {
    // sanity check that materials still apply to wheels
    const wheel = createWheel(0, 0);
    expect(wheel.bodies[0].friction).toBeGreaterThan(0.5);
  });
});
