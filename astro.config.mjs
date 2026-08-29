import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// The canonical origin of the deployed site. Used for canonical URLs and to
// build absolute URLs in the generated sitemap, which Search Console needs.
const site = process.env.PUBLIC_SITE_URL ?? 'https://rangephysiohurghada.com';

// https://astro.build/config
export default defineConfig({
    site,
    vite: {
        plugins: [tailwindcss()]
    },
    integrations: [react(), sitemap()],
    adapter: netlify()
});
