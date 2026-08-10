import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
    // The diagnostic page moved from /public to a route; keep the old URL
    // working so links already handed out do not 404.
    redirects: {
        '/camera-test.html': '/camera-test'
    },
    vite: {
        plugins: [tailwindcss()]
    },
    integrations: [react()],
    adapter: netlify()
});
