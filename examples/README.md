# Example designs

Each `.json` file here is a normal Free World 2D scene file, the same format the
**Export** button writes. That means you can use them in two ways:

- **In the app:** open **Examples** in the top bar, pick one, and press Play.
- **As files:** click **Import** and choose any file from this folder. It loads onto
  the canvas like a scene you exported yourself.

The gallery reads this folder when the app is built, so adding a file here adds a
card to the gallery. No code changes are needed.

| File | What it shows |
| --- | --- |
| `first-slide.json` | A spinning ball rolls down a locked slide into the goal |
| `zig-zag.json` | Two opposing slides send the ball one way, then back |
| `ice-run.json` | An icy ramp and floor let a box glide into the goal |
| `bounce-pad.json` | A rubber pad flings a ball across to the goal |
| `funnel.json` | Three balls squeeze through a funnel into the goal |
| `knock-down.json` | A ball sends a stack of icy boxes off the edge |
| `roller-coaster.json` | A hand-drawn track with a bump between two drops |
| `peg-board.json` | A ball ricochets down diamond pegs into a funnel |

## Adding your own

1. Build the design in the app, and press Play to check it works.
2. Click **Export** to download the scene file.
3. Add a `meta` block next to `objects`, and save the file in this folder:

   ```json
   "meta": {
     "title": "My design",
     "description": "One sentence on what happens when you press Play.",
     "tip": "Something to change and what to expect.",
     "order": 9
   }
   ```

   `order` sets where it appears in the gallery; every design needs its own number.

4. Run `npm test`. For every file in this folder the tests check that it is valid and
   importable and that it has a title, description, tip and order. They also play each
   design from its starting layout and require its **goal to light up within 8 seconds**
   (and not instantly), so a design that doesn't work can't be added by accident.

Two things worth knowing when designing:

- Matter.js applies air resistance, so a ball loses speed over a long, gentle run. Short
  and steep works better than long and shallow.
- Positions in the file are only used for the layout; the gallery re-centres every design
  on screen, so it doesn't matter where on the canvas you built it.
