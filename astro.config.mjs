import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
    vite: {
        plugins: [tailwindcss()]
    },
    integrations: [react()],
    adapter: netlify(),
    env: {
        schema: {
            // `secret` keeps the value out of the bundle — it is read from the
            // runtime environment, so it can be set in the Netlify UI after a build.
            ELEVENLABS_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
            ELEVENLABS_VOICE_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
            ELEVENLABS_MODEL: envField.string({ context: 'server', access: 'secret', optional: true })
        }
    }
});
