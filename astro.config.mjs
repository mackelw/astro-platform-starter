import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// CLINIC_TARGET=node يبني سيرفر يعمل على جهاز داخل المركز (شبكة محلية)،
// والافتراضي هو النشر على Netlify.
const target = process.env.CLINIC_TARGET === 'node' ? node({ mode: 'standalone' }) : netlify();

// https://astro.build/config
export default defineConfig({
    vite: {
        plugins: [tailwindcss()],
        // نسخة السيرفر: تسجيل دخول وبيانات مشتركة (النسخة المحلية تُبنى بـ npm run build:offline)
        define: { __CLINIC_MODE__: JSON.stringify('server') }
    },
    integrations: [react()],
    adapter: target
});
