# Contributing

Thanks for taking an interest in Free World 2D. It's a small hobby project, so this guide
is short. Bug reports, ideas and pull requests are all welcome.

## Running it locally

You need Node.js (the GitHub workflows use Node 24).

```bash
npm install
npm run dev      # start the dev server; Vite prints the address to open
npm test         # run the unit tests
npm run build    # type-check and produce a production build in dist/
```

## How the code is laid out

| Where | What it holds |
| --- | --- |
| `src/scene.ts` | The objects (ball, box, planks, goals and so on), materials, the physics rules, and the save/load file format |
| `src/main.ts` | The page itself: toolbar, mouse/touch input, Play and Stop, drawing overlays |
| `src/examples.ts` and `examples/` | The example gallery. Each design is a plain scene file in `examples/` |
| `src/demo.ts` | The auto-playing walkthrough |
| `src/history.ts`, `src/storage.ts` | Undo/redo and autosave |
| `src/*.test.ts` | Tests, next to the code they cover |

Physics runs on [Matter.js](https://brm.io/matter-js/). The tests simulate it directly,
without a browser, so a change to how things move can be tested by stepping the engine.

## Making a change

1. Fork the repo (or create a branch) and make your change.
2. Run `npm test` and `npm run build`. Pull requests only run the security checks
   automatically (CodeQL and a dependency audit), so the tests are on you.
3. For anything you can see on screen, try it in a browser, including a phone-sized window
   (about 375px wide). The layout changes a lot at that size.
4. Open a pull request. The template has a short checklist.

Small, focused pull requests are easiest to review. If you're planning something big, open
an issue first so we can talk about it before you spend the time.

### Habits that keep the project healthy

- **Add a test with a behaviour change.** Physics rules, the file format and the example
  designs are all covered by tests, and the aim is for that to stay true.
- **TypeScript is strict.** `erasableSyntaxOnly` is on, so no enums or constructor
  parameter properties.
- **Build the page with DOM methods**, not `innerHTML`. Scene files are untrusted input, so
  anything read from one is validated before it is used.
- **Update the docs** when behaviour changes: the README, and the in-app Help panel in
  `index.html`.
- **GitHub Actions are pinned to commits.** Dependabot keeps them up to date.

## Adding an example design

Build it in the app, press Play to check it works, click **Export**, add a `meta` block and
save the file in `examples/`. [`examples/README.md`](examples/README.md) has the details.
The tests then check that the design is valid and that its goal really lights up.

## Reporting bugs and ideas

Open an issue with what you did, what you expected, what happened, and your browser. A
screenshot, or a scene file from **Export**, helps a lot.

For anything security-related, please follow [`SECURITY.md`](SECURITY.md) instead of opening
a public issue.

## License

By contributing you agree that your contribution is released under the project's
[MIT License](LICENSE).
