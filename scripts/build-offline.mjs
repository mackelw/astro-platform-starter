/**
 * يبني نسخة تعمل بالنقر المزدوج: ملف HTML واحد يحتوي على كل شيء
 * (React + التطبيق + تنسيقات Tailwind) بلا أي ملفات خارجية أو إنترنت.
 *
 * التشغيل: npm run build:offline   (بعد npm run build مرة واحدة على الأقل)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'offline';
const OUT_FILE = join(OUT_DIR, 'clinic.html');
const TMP_JS = join(OUT_DIR, '.bundle.js');

if (!existsSync('dist/_astro')) {
    console.error('لم يتم العثور على مجلد dist. شغّل "npm run build" أولًا.');
    process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// 1) تجميع التطبيق في ملف JavaScript واحد
execFileSync(
    'npx',
    [
        'esbuild',
        'src/clinic/offline-entry.tsx',
        '--bundle',
        '--format=iife',
        '--minify',
        '--target=es2019',
        '--loader:.tsx=tsx',
        '--jsx=automatic',
        '--define:process.env.NODE_ENV="production"',
        '--define:__CLINIC_MODE__="local"',
        `--outfile=${TMP_JS}`
    ],
    { stdio: 'inherit' }
);

// 2) تنسيقات Tailwind المُولَّدة أثناء البناء
const cssFile = readdirSync('dist/_astro').find((f) => f.endsWith('.css'));
if (!cssFile) {
    console.error('لم يتم العثور على ملف CSS داخل dist/_astro.');
    process.exit(1);
}

const css = readFileSync(join('dist/_astro', cssFile), 'utf8');
const js = readFileSync(TMP_JS, 'utf8');

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>مركز رينج للعلاج الطبيعي والتأهيل</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0d9488" />
<style>${css}</style>
<style>
body { font-family: 'Segoe UI', Tahoma, 'Noto Naskh Arabic', 'Dubai', 'Cairo', Arial, sans-serif; margin: 0; }
input[type='date'], input[type='time'] { direction: ltr; text-align: right; }
</style>
</head>
<body class="bg-slate-100 text-slate-800 antialiased">
<div id="root"></div>
<noscript><div style="padding:32px;text-align:center">هذا البرنامج يحتاج تفعيل JavaScript في المتصفح.</div></noscript>
<script>${js}</script>
</body>
</html>
`;

writeFileSync(OUT_FILE, html, 'utf8');
console.log(`تم إنشاء ${OUT_FILE} (${Math.round(Buffer.byteLength(html) / 1024)} كيلوبايت)`);
