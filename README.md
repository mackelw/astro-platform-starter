# Astro on Netlify Platform Starter

[Live Demo](https://astro-platform-starter.netlify.app/)

A modern starter based on Astro.js, Tailwind, and [Netlify Core Primitives](https://docs.netlify.com/core/overview/#develop) (Edge Functions, Image CDN, Blob Store).

## Second Brain (`/brain`)

A personal knowledge base built on the Blob Store, with an Arabic (RTL) interface.

- **Notes** — write Markdown, tag it, and search across titles, tags, and note bodies.
- **Links between notes** — `[[note title]]` links two notes together, and each note lists
  the notes pointing back at it. A link to a note you haven't written yet stays clickable and
  opens the new-note form with the title filled in.
- **Inbox** — paste a link (or use the bookmarklet on `/brain/inbox`) to save it with the
  page's title and description, tagged `inbox`, to read later.

### Setting a password

Without a password the brain is readable and writable by anyone with the URL, and the UI
shows a warning saying so. To lock it down, set an environment variable — locally in `.env`,
and on Netlify under **Site configuration → Environment variables**:

```
SECOND_BRAIN_PASSWORD=your-password-here
```

`/brain/*`, `/api/notes*`, and `/api/capture` then require a login (a signed, HttpOnly session
cookie that lasts 30 days). Changing the password invalidates existing sessions.

### Where the data lives

Notes are stored in the `second-brain` blob store: each note under `notes/<id>`, plus an
`index` blob holding the summaries that drive listing, search, and backlinks. The index is
derived data — if a write is ever interrupted, `POST /api/notes/reindex` rebuilds it from
the notes themselves.

Note that Netlify Blobs need `netlify dev` rather than `npm run dev` (see
[Developing Locally](#developing-locally) below).

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
