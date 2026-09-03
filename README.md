# tcg-manager-sim

A bare [Vite](https://vite.dev) + React scaffold.

The game code — the simulation (`src/game/`), the UI (`src/components/`,
`src/styles/`), the headless harnesses (`tools/`) and the design notes
(`docs/`) — has been removed. What is left is the shell: `index.html`,
`vite.config.js`, and a `src/` holding an entry point, a placeholder
component and a stylesheet.

The full history is still in git, so anything deleted here can be recovered
from an earlier commit.

## Running it

```bash
npm install
npm run dev      # dev server
npm run build    # production build into dist/
npm run preview  # serve the build
```

## iOS shell

`ios/` still holds the native WKWebView wrapper and its XcodeGen project.
`npm run ios:build` builds the web app and regenerates the Xcode project.
The helper scripts that lived in `tools/ios/` (icon generation, simulator and
device launchers) were removed along with the rest of `tools/`.
