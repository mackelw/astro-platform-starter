# Google Search Console setup

The property is a **domain property** — `sc-domain:rangephysiohurghada.com` — which
covers every subdomain and both `http://` and `https://`. Domain properties are
verified over DNS only; an HTML file or meta tag will not verify one.

## 1. Verify the domain (DNS)

1. In Search Console, open the property and go to **Settings → Ownership verification → Domain name provider**.
2. Copy the `TXT` record Google shows (`google-site-verification=…`).
3. Add it at whoever hosts the DNS for `rangephysiohurghada.com` — Netlify DNS if the
   domain is delegated to Netlify (**Domains → rangephysiohurghada.com → DNS records → Add record**,
   type `TXT`, name blank/`@`), otherwise the registrar's DNS panel.
4. Wait for propagation, then press **Verify**. Check the record has landed with:

   ```sh
   dig +short TXT rangephysiohurghada.com
   ```

If a _URL-prefix_ property is used instead (`https://rangephysiohurghada.com/`), the
HTML-tag method works and this repo supports it: set `PUBLIC_GOOGLE_SITE_VERIFICATION`
to the token in the Netlify site's environment variables and redeploy. `Layout.astro`
emits the `<meta name="google-site-verification">` tag only when that variable is set.

## 2. Submit the sitemap

`@astrojs/sitemap` generates the sitemap at build time from the site's static routes:

- Index: `https://rangephysiohurghada.com/sitemap-index.xml`
- Pages: `https://rangephysiohurghada.com/sitemap-0.xml`

Submit the **index** URL under **Indexing → Sitemaps**. `public/robots.txt` also
points crawlers at it.

Only prerendered routes appear. A route rendered on demand (`export const prerender = false`)
is absent from the sitemap and has to be listed manually via the integration's
`customPages` option.

## 3. Site URL configuration

`site` in `astro.config.mjs` is what makes canonical URLs and sitemap entries
absolute. It defaults to `https://rangephysiohurghada.com` and can be overridden per
environment with `PUBLIC_SITE_URL` — useful so that staging deploys do not advertise
production URLs.

| Variable                          | Required | Purpose                                                       |
| :-------------------------------- | :------- | :------------------------------------------------------------ |
| `PUBLIC_SITE_URL`                 | no       | Overrides the canonical origin at build time.                 |
| `PUBLIC_GOOGLE_SITE_VERIFICATION` | no       | Emits the verification meta tag (URL-prefix properties only). |

## 4. After verification

- **Indexing → Pages** — confirm pages are indexed and read the reasons for any
  excluded ones ("Discovered – currently not indexed", "Duplicate without user-selected
  canonical", …).
- **URL Inspection** — request indexing for the homepage to prime the first crawl.
- **Experience → Core Web Vitals** and **Mobile usability** — populate once the property
  has field data (28 days).
- Pages that must stay out of the index should pass `noindex` to `Layout`, which emits
  `<meta name="robots" content="noindex, nofollow">`. Do not block them in `robots.txt`
  as well — a page Google cannot crawl is one whose `noindex` it cannot see.
