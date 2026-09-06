import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// وجهة النشر:
//   CLINIC_TARGET=node   → سيرفر يعمل على جهاز داخل المركز (شبكة محلية)
//   CLINIC_TARGET=vercel أو بيئة Vercel → النشر على Vercel
//   غير ذلك             → النشر على Netlify
function resolveAdapter() {
    if (process.env.CLINIC_TARGET === 'node') return node({ mode: 'standalone' });
    if (process.env.CLINIC_TARGET === 'vercel' || process.env.VERCEL) return vercel();
    return netlify();
}

const target = resolveAdapter();

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
