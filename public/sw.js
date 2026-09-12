/**
 * يجعل بوابة المريض تعمل بلا إنترنت.
 *
 * المريض ينفّذ تمارينه في الجيم أو في بيت بلا شبكة، فلا بد أن يفتح برنامجه
 * ويعلّم ما أنجزه دون اتصال. ملفات التطبيق وآخر نسخة من بياناته تُخزَّن على جهازه.
 *
 * ثلاث قواعد تحكم هذا الملف:
 *   1. **بيانات المريض وحده تُخزَّن.** شاشات المركز وواجهاته (/api/clinic/*) تمر
 *      للشبكة بلا تخزين مهما حدث — لا يُترك ملف مركز كامل على جهاز.
 *   2. **كل ما يُخزَّن يُمحى عند الخروج** أو عند انتهاء الجلسة (401).
 *   3. **العامل مسجَّل على نطاق الموقع كله** لأن ملفات البناء تحت /_astro/ خارج /p،
 *      لكنه لا يتدخل إلا فيما تحتاجه البوابة. أي تنقل خارج /p يمر كما هو.
 */
const VERSION = 'range-portal-v2';
const SHELL_CACHE = `range-shell-${VERSION}`;
const DATA_CACHE = `range-data-${VERSION}`;

const PORTAL_PATH = '/p';
const SESSION_URL = '/api/portal/session';

/** أصول نضمن وجودها قبل أول انقطاع للشبكة */
const PRECACHE = [PORTAL_PATH, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE)
            // فشل تخزين ملف واحد لا يمنع تفعيل النسخة الجديدة
            .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
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

/** التطبيق يطلب محو البيانات عند تسجيل الخروج */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'clear-data') {
        event.waitUntil(caches.delete(DATA_CACHE));
    }
});

/** أصول البناء: من التخزين فورًا مع تحديث صامت في الخلفية */
async function cacheFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) {
        // التحديث في الخلفية حتى لا ينتظر المريض
        void fetch(request)
            .then((response) => (response.ok ? cache.put(request, response.clone()) : undefined))
            .catch(() => undefined);
        return cached;
    }
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
}

/** صفحة البوابة: أحدث نسخة إن وُجدت شبكة، وإلا النسخة المخزّنة */
async function portalPage(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const response = await fetch(request);
        // نخزّن تحت مسار ثابت حتى يعمل الرجوع مهما كانت معاملات الرابط
        if (response.ok) await cache.put(PORTAL_PATH, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(PORTAL_PATH);
        if (cached) return cached;
        throw error;
    }
}

/**
 * بيانات المريض: الشبكة أولًا لتبقى حديثة، مع حفظ نسخة للعمل بلا إنترنت.
 * لا تُحفظ إلا حمولة مريض مسجَّل الدخول فعلًا.
 */
async function patientSession(request) {
    const cache = await caches.open(DATA_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) {
            /*
             * نسختان تُؤخذان قبل أن يقرأ أحد الجسم: واحدة للفحص وواحدة للتخزين.
             * استنساخ الرد بعد بدء قراءته يفشل، فتضيع النسخة المخزّنة بلا أثر —
             * ولا يظهر العطل إلا حين ينقطع الإنترنت فعلًا.
             */
            const forCache = response.clone();
            const forRead = response.clone();
            void forRead
                .json()
                .then((body) => (body && body.authenticated ? cache.put(SESSION_URL, forCache) : cache.delete(SESSION_URL)))
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
    if (request.method !== 'GET') return; // الكتابة تحتاج شبكة، والتطبيق يصطفّها عنده
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // حمولة المريض وحدها من بين كل الواجهات
    if (url.pathname === SESSION_URL) {
        event.respondWith(patientSession(request));
        return;
    }
    if (url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        // شاشات المركز تمر كما هي — لا تُخزَّن ولا تُستبدل بصفحة البوابة
        if (url.pathname === PORTAL_PATH || url.pathname.startsWith(PORTAL_PATH + '/')) {
            event.respondWith(portalPage(request));
        }
        return;
    }

    // أصول عامة يتشارك فيها الجميع بلا ضرر
    if (url.pathname.startsWith('/_astro/') || /\.(?:png|svg|webmanifest|woff2?|css|js)$/.test(url.pathname)) {
        event.respondWith(cacheFirst(request));
    }
});
