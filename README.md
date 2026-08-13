# Astro on Netlify Platform Starter

[Live Demo](https://astro-platform-starter.netlify.app/)

A modern starter based on Astro.js, Tailwind, and [Netlify Core Primitives](https://docs.netlify.com/core/overview/#develop) (Edge Functions, Image CDN, Blob Store).

## Astro Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## JARVIS HUD design system

A mission-control design system ported from the `jarvis-hermes-dashboard` UI. Run the dev server and open
[`/jarvis`](http://localhost:4321/jarvis) for a live specimen sheet of every token and component.

| File                          | Contains                                                                                                                                                           |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/jarvis.css`       | `@theme` tokens (colour, font, radius, shadow, animation) and the `.hud-*` component classes                                                                       |
| `src/components/jarvis/`      | Astro wrappers: `Panel`, `PanelHeading`, `Pill`, `CommandButton`, `Chip`, `StatGrid` / `Stat`, `TelemetryLog` / `LogEntry` / `JsonBlock`, `Reactor`, `HudBackdrop` |
| `src/layouts/HudLayout.astro` | Page shell — HUD ground, fonts and atmospherics                                                                                                                    |

Tokens are namespaced (`--color-hud-*`, `--font-hud-*`, `--radius-hud-*`), so they extend the starter's theme
rather than replacing it and the existing pages are unaffected. They surface as ordinary Tailwind utilities:

```astro
<div class="border-hud-edge text-hud-cyan font-hud-mono rounded-hud-panel">…</div>
```

Every component is a thin wrapper over a plain CSS class, so React islands and hand-written markup can use the
same styling without importing anything:

```astro
---
import Panel from '../components/jarvis/Panel.astro';
import Reactor from '../components/jarvis/Reactor.astro';
---

<Panel class="p-6">
    <Reactor state="running" word="RUNNING" caption="thinking… 2.4s" />
</Panel>

<!-- or, with no imports at all -->
<section class="hud-panel">
    <button class="hud-command is-armed"><b class="hud-command__key">/goal</b></button>
</section>
```

`Reactor` sizes its readout from its own width, so one `size` prop scales the whole core. Telemetry accents are
driven by a single `--hud-tone` custom property — a new `LogEntry` kind is one entry in
`src/components/jarvis/tones.ts` and one rule in `jarvis.css`. All animation is disabled under
`prefers-reduced-motion`.

## Deploying to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/astro-platform-starter)

## Developing Locally

| Prerequisites                                                                |
| :--------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/) v18.14+.                                      |
| (optional) [nvm](https://github.com/nvm-sh/nvm) for Node version management. |

1. Clone this repository, then run `npm install` in its root directory.

2. For the starter to have full functionality locally (e.g. edge functions, blob store), please ensure you have an up-to-date version of Netlify CLI. Run:

```
npm install netlify-cli@latest -g
```

3. Link your local repository to the deployed Netlify site. This will ensure you're using the same runtime version for both local development and your deployed site.

```
netlify link
```

4. Then, run the Astro.js development server via Netlify CLI:

```
netlify dev
```

If your browser doesn't navigate to the site automatically, visit [localhost:8888](http://localhost:8888).
