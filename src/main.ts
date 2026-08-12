import {
  Bodies,
  Composite,
  Engine,
  Mouse,
  MouseConstraint,
  Render,
  Runner,
  World,
} from 'matter-js';
import './style.css';

const canvas = document.getElementById('sim') as HTMLCanvasElement;

const engine = Engine.create();
const world = engine.world;

const render = Render.create({
  canvas,
  engine,
  options: {
    width: window.innerWidth,
    height: window.innerHeight,
    wireframes: false,
    background: '#1a1a1f',
  },
});

const ground = Bodies.rectangle(
  window.innerWidth / 2,
  window.innerHeight - 20,
  window.innerWidth * 2,
  40,
  { isStatic: true, render: { fillStyle: '#3a3a42' } },
);

const boxes = Array.from({ length: 6 }, (_, i) =>
  Bodies.rectangle(200 + i * 90, 100 + i * 40, 60, 60, {
    render: { fillStyle: '#e0a13a' },
  }),
);

World.add(world, [ground, ...boxes]);

const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
  mouse,
  constraint: { stiffness: 0.2, render: { visible: false } },
});
Composite.add(world, mouseConstraint);
render.mouse = mouse;

window.addEventListener('resize', () => {
  render.canvas.width = window.innerWidth;
  render.canvas.height = window.innerHeight;
  render.options.width = window.innerWidth;
  render.options.height = window.innerHeight;
});

Render.run(render);
Runner.run(Runner.create(), engine);
