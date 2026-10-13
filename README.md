# Free World 2D

A freeform 2D physics sandbox built with [Matter.js](https://brm.io/matter-js/).
Draw a track, drop in a ball or a box, lock down whatever should stay fixed,
give the ball a spin, and hit Play to watch real rigid-body physics take over.

## Controls

Tools live in the palette on the left; **Play/Stop**, Undo/Redo, Clear, Export,
Import, Grid and Help are in the panel at the top right. On narrow screens both
collapse to icons. Mouse, touch and pen all work.

| Tool | What it does |
| --- | --- |
| **Select** | Click an object to select it; drag to move it |
| **Draw** | Click-drag to freehand a track/line — becomes a chain of thin rigid segments (open path, not filled) |
| **Plank** | Click-drag to lay down a straight plank — quick ramps, shelves and walls |
| **Ball** | Click the canvas to place a ball |
| **Box** | Click the canvas to place a box |
| **Triangle** | Click the canvas to place a right-angled wedge (rotate it from the bottom bar) |
| **Goal** | Click the canvas to place a goal zone; it lights up when anything free-moving (not locked) touches it during Play, and resets on Stop |
| **Bottom bar** | Appears when an object is selected: pick its **Surface**, **Lock**/Unlock it, rotate it in 15° steps, or delete it (the Delete key works too) |
| **Right-click** | Toggle lock on the object under the cursor (locked objects show a padlock while editing and stay fixed during simulation). On a touch screen use the Lock button in the bottom bar |
| **Undo / Redo** | Step back and forward through your edits (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z; Cmd on a Mac). History lasts for the current visit |
| **Demo** | An automatic walkthrough (about 40 seconds): a cursor builds a slide, locks it, drops a ball, spins it, adds a goal and presses Play, with captions at every step. Esc or Skip stops it. Your own scene is set aside and put back afterwards, or you can **Keep this scene** (Undo brings yours back). New visitors with an empty canvas are offered it once |
| **Grid** | Show or hide a background grid (40px squares, brighter every 200px) as a guide for lining things up; the setting is remembered |
| **? Help** | Opens a panel describing what each button does |
| Drag a selected ball's blue handle | Set its initial spin direction/speed |
| **Play / Stop** | Play captures the current layout, applies each ball's spin, and runs the simulation; Stop restores everything back to how you left it |
| **Clear** | Remove everything from the canvas |
| **Export** | Download the current scene as `free-world-2d-scene.json` (shapes, positions, locks, ball spin) |
| **Import** | Load a previously exported scene file, replacing whatever is on the canvas |

Everything is paused (no gravity/motion) while editing — objects only start
moving once you press Play.

### Autosave

Your scene is saved in the browser after every change and restored when you reopen
the page. It is stored per browser and per device (`localStorage`), so clearing site
data removes it and another device starts empty — use **Export**/**Import** to keep a
copy or move a scene. Nothing is sent to a server.

### Surfaces

Every object except a goal zone has a surface material, set from the bottom bar:

| Surface | Effect |
| --- | --- |
| Normal | Default friction and bounce for that shape |
| Ice | Frictionless — anything touching it slides |
| Rubber | Very bouncy |
| Sticky | Grips hard, braking sliding things quickly |

A material works whether the object is locked or free, and applies to contacts
with any other object (Ice beats Sticky; the bouncier surface of a pair always wins).

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and produce a production build in dist/
npm test         # run the unit tests (scene model, physics rules, demo layout, undo history, storage)
```

This is a static site — `npm run build` output can be hosted anywhere. A
GitHub Actions workflow (`.github/workflows/deploy.yml`) is included to
auto-deploy `dist/` to GitHub Pages on every push to `master` (running the tests
first, so a failing test blocks the deploy); enable Pages for the repo
(Settings → Pages → Source: GitHub Actions) to use it.

## Security checks

- **Dependency audit** — `npm audit --audit-level=high` runs on every push, on pull
  requests and weekly (`.github/workflows/security.yml`); run it locally with `npm audit`.
- **Code scanning** — CodeQL analyses the TypeScript on the same schedule.
- **Dependency updates** — Dependabot opens weekly pull requests for npm packages and
  GitHub Actions (`.github/dependabot.yml`), and GitHub's secret scanning and push
  protection are enabled for the repo.
- **Pinned actions** — every GitHub Action in the workflows is pinned to an exact
  commit (with its version in a comment), so a moved or compromised tag can't change
  what runs. Dependabot keeps the pins current through its weekly pull requests.
- The app is fully client-side: it makes no network requests and keeps its data in
  the browser. Imported scene files are validated before use.

## License

MIT — see [LICENSE](LICENSE).
