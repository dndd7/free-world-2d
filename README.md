# Free World 2D

A freeform 2D physics sandbox built with [Matter.js](https://brm.io/matter-js/).
Draw a track, drop in a ball or a box, lock down whatever should stay fixed,
give the ball a spin, and hit Play to watch real rigid-body physics take over.

## Controls

| Tool | What it does |
| --- | --- |
| **Select** | Click an object to select it; drag to move it |
| **Draw** | Click-drag to freehand a track/line — becomes a chain of thin rigid segments (open path, not filled) |
| **Ball** | Click the canvas to place a ball |
| **Box** | Click the canvas to place a box |
| **Right-click** | Toggle lock on the object under the cursor (locked objects show a padlock while editing and stay fixed during simulation) |
| **? Help** | Opens a panel describing what each button does |
| Drag a selected ball's blue handle | Set its initial spin direction/speed |
| **Play / Stop** | Play captures the current layout, applies each ball's spin, and runs the simulation; Stop restores everything back to how you left it |
| **Clear** | Remove everything from the canvas |
| **Export** | Download the current scene as `free-world-2d-scene.json` (shapes, positions, locks, ball spin) |
| **Import** | Load a previously exported scene file, replacing whatever is on the canvas |

Everything is paused (no gravity/motion) while editing — objects only start
moving once you press Play.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and produce a production build in dist/
```

This is a static site — `npm run build` output can be hosted anywhere. A
GitHub Actions workflow (`.github/workflows/deploy.yml`) is included to
auto-deploy `dist/` to GitHub Pages on every push to `master`; enable Pages
for the repo (Settings → Pages → Source: GitHub Actions) to use it.

## License

MIT — see [LICENSE](LICENSE).
