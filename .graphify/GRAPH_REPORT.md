# Graph Report - .  (2026-08-11)

## Corpus Check
- label mode - file stats not available

## Summary
- 85 nodes · 115 edges · 7 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output
- Edge kinds: imports_from: 42 · references: 28 · contains: 21 · conceptually_related_to: 13 · imports: 6 · calls: 3 · semantically_similar_to: 2


## Graph Freshness
- Built from Git commit: `fe90396`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Astro on Netlify Platform Starter` - 7 edges
2. `generateBlob()` - 5 edges
3. `Astro npm Commands` - 5 edges
4. `netlify dev (localhost:8888)` - 5 edges
5. `BlobProps` - 4 edges
6. `randomInt()` - 4 edges
7. `Netlify Core Primitives` - 4 edges
8. `Developing Locally Workflow` - 4 edges
9. `Center Dot Element (.favicon-center-dot)` - 4 edges
10. `Corgi Photo (corgi.jpg)` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Corgi Photo (src/assets)` --semantically_similar_to--> `Corgi Photo (corgi.jpg)`  [INFERRED] [semantically similar]
  src/assets/corgi.jpg → public/images/corgi.jpg

## Hyperedges (group relationships)
- **Netlify Core Primitives powering the starter** — readme_astro_platform_starter, readme_edge_functions, readme_image_cdn, readme_blob_store [EXTRACTED 1.00]
- **Local development setup flow** — readme_nodejs_prereq, readme_netlify_cli, readme_netlify_link, readme_netlify_dev [EXTRACTED 1.00]
- **Favicon mark composition: center dot plus radiating lines in the two-color palette** — favicon_svg, favicon_center_dot, favicon_lines_group, favicon_color_dark_teal, favicon_color_teal [EXTRACTED 1.00]

## Communities

### Community 0 - "Astro Pages and UI Components"
Cohesion: 0.15
Nodes (1): highlighterPromise

### Community 1 - "Blob Shape Editor UI"
Cohesion: 0.19
Nodes (7): Props, Props, BlobParameterProps, BlobProps, generateBlob(), randomInt(), uniqueName()

### Community 2 - "Netlify Platform Primitives Docs"
Cohesion: 0.15
Nodes (18): Astro npm Commands, Astro.js, Astro on Netlify Platform Starter, Netlify Blob Store, Local Dev Server (localhost:4321), Developing Locally Workflow, Netlify Edge Functions, Netlify Image CDN (+10 more)

### Community 3 - "Favicon Brand Mark"
Cohesion: 0.36
Nodes (7): Browser Tab Icon Role, Center Dot Element (.favicon-center-dot), Dark Teal #014847, Netlify Teal #05BDBA, Dark Mode Color Scheme Adaptation, Radiating Lines Group (.favicon-lines), Netlify Logo Mark

### Community 4 - "Corgi Demo Image Assets"
Cohesion: 0.33
Nodes (7): Astro Image Pipeline, Corgi Photo (corgi.jpg), Pembroke Welsh Corgi (Dog Subject), public/images directory, Demo Static Image Asset, Corgi Photo (src/assets), Pembroke Welsh Corgi (subject)

### Community 6 - "Noise Background Texture"
Cohesion: 1.00
Nodes (3): Grain Overlay Background Texture, public/images Static Asset, Noise Texture Image (noise.png)

### Community 9 - "Geolocation Edge Function"
Cohesion: 1.00
Nodes (1): config

## Knowledge Gaps
- **16 isolated node(s):** `config`, `Props`, `Props`, `BlobParameterProps`, `highlighterPromise` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Astro Pages and UI Components`** (1 nodes): `highlighterPromise`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Geolocation Edge Function`** (1 nodes): `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 2 inferred relationships involving `netlify dev (localhost:8888)` (e.g. with `Astro npm Commands` and `Local Dev Server (localhost:4321)`) actually correct?**
  _`netlify dev (localhost:8888)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `config`, `Props`, `Props` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._