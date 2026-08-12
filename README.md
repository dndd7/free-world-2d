# Free World 2D

A 2D physics simulation sandbox built with [Matter.js](https://brm.io/matter-js/).

This repo is a starting point — the exact scope of the simulation (what
bodies, forces, and interactions it models) is still being decided. Right now
it's a bare Matter.js scene: a ground plane, a handful of draggable boxes, and
mouse-drag interaction, rendered on a single full-window `<canvas>`.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and produce a production build in dist/
```

This is a static site — `npm run build` output can be hosted anywhere.

## License

MIT — see [LICENSE](LICENSE).
