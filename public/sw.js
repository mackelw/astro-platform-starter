/**
 * يجعل تطبيق المريض يعمل بدون إنترنت.
 *
 * ملفات التطبيق تُخزَّن على الجهاز، وكذلك آخر نسخة من بيانات المريض،
 * فيفتح برنامج تماريه ومواعيده في الجيم أو أي مكان بلا شبكة.
 *
 * قاعدتان مهمتان للخصوصية:
 *   1. لا تُخزَّن إلا بيانات دور «مريض» — بيانات المركز الكاملة لا تُترك
 *      أبدًا على هاتف موظف أو جهاز مشترك.
 *   2. كل ما يُخزَّن يُمحى فور تسجيل الخروج أو انتهاء الجلسة.
 */
const VERSION = 'range-v1';
const SHELL_CACHE = `range-shell-${VERSION}`;
const DATA_CACHE = `range-data-${VERSION}`;
const SESSION_URL = '/api/clinic/session';

// أصول ثابتة نضمن وجودها قبل أول انقطاع للشبكة
const PRECACHE = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .catch(() => undefined) // تعذر تخزين أحد الملفات لا يمنع تفعيل النسخة الجديدة
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

/** التطبيق يطلب مسح البيانات عند الخروج */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'clear-data') {
        event.waitUntil(caches.delete(DATA_CACHE));
    }
});

/** أصول التطبيق: من التخزين فورًا، مع تحديثها في الخلفية */
async function cacheFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => cached);
    return cached || network;
}

/** الصفحة نفسها: أحدث نسخة إن وُجدت شبكة، وإلا النسخة المخزّنة */
async function navigationHandler(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) cache.put('/', response.clone());
        return response;
    } catch {
        return (await cache.match('/')) || Response.error();
    }
}

/**
 * بيانات المريض: الشبكة أولًا حتى تكون البيانات حديثة دائمًا،
 * وتُخزَّن نسخة للاستخدام بلا إنترنت — لدور المريض وحده.
 */
async function sessionHandler(request) {
    const cache = await caches.open(DATA_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) {
            const copy = response.clone();
            copy.json()
                .then((body) => {
                    if (body && body.user && body.user.role === 'patient') cache.put(SESSION_URL, response.clone());
                    else cache.delete(SESSION_URL); // حساب غير مريض: لا نترك له أثرًا
                })
                .catch(() => undefined);
        } else if (response.status === 401) {
            await cache.delete(SESSION_URL); // انتهت الجلسة: تُمحى البيانات فورًا
        }
        return response;
    } catch (error) {
        const cached = await cache.match(SESSION_URL);
        if (cached) return cached;
        throw error;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname === SESSION_URL) {
        event.respondWith(sessionHandler(request));
        return;
    }
    // باقي واجهات السيرفر تحتاج شبكة دائمًا ولا يصح تخزينها
    if (url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(navigationHandler(request));
        return;
    }

    if (url.pathname.startsWith('/_astro/') || /\.(?:png|svg|webmanifest|woff2?|css|js)$/.test(url.pathname)) {
        event.respondWith(cacheFirst(request));
    }
});
