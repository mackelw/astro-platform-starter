/**
 * تثبيت البوابة على شاشة الموبايل، ومعرفة حالة الاتصال، ومحو أثر المريض عند الخروج.
 */
import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'clinic-portal-install-dismissed';

interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** يسجّل العامل الخدمي. نطاقه الموقع كله لأن ملفات البناء تحت /_astro/ خارج /p */
export function registerServiceWorker(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* المتصفح يمنع التسجيل أو الاتصال غير آمن — البوابة تعمل بلا تثبيت */
    });
}

/**
 * يمحو كل ما خُزِّن عن المريض على هذا الجهاز.
 * يُستدعى عند الخروج حتى لا يبقى ملف طبي على هاتف مشترك.
 */
export function clearOfflineData(): void {
    if (typeof window === 'undefined') return;
    try {
        navigator.serviceWorker?.controller?.postMessage({ type: 'clear-data' });
    } catch {
        /* لا يوجد عامل خدمي متحكم في هذه الصفحة */
    }
    // محو مباشر أيضًا، فقد لا يكون العامل قد تحكّم في الصفحة بعد
    if (typeof caches === 'undefined') return;
    void caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('range-data-')).map((key) => caches.delete(key))))
        .catch(() => undefined);
}

/** هل المتصفح متصل الآن؟ */
export function useOnline(): boolean {
    const [online, setOnline] = useState(true);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    return online;
}

/** المتصفح يخبرنا متى يكون التثبيت متاحًا، ولا نعاود إزعاج من رفض الدعوة */
export function useInstallPrompt() {
    const [event, setEvent] = useState<InstallPromptEvent | null>(null);
    const [dismissed, setDismissed] = useState(true);

    useEffect(() => {
        try {
            setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
        } catch {
            setDismissed(false);
        }

        const onPrompt = (e: Event) => {
            e.preventDefault(); // ندعو للتثبيت في مكان مناسب بدل شريط المتصفح
            setEvent(e as InstallPromptEvent);
        };
        const onInstalled = () => setEvent(null);

        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const install = useCallback(async () => {
        if (!event) return;
        await event.prompt();
        await event.userChoice;
        setEvent(null);
    }, [event]);

    const dismiss = useCallback(() => {
        setDismissed(true);
        try {
            window.localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            /* المتصفح يمنع التخزين — تختفي الدعوة لهذه الجلسة فقط */
        }
    }, []);

    return { canInstall: Boolean(event) && !dismissed, install, dismiss };
}

/**
 * سفاري لا يدعم دعوة التثبيت التلقائية، فيحتاج المريض شرحًا يدويًا.
 * نعرضه لمستخدمي iPhone الذين لم يفتحوا التطبيق مثبَّتًا بعد.
 */
export function useIosInstallHint(): { show: boolean; dismiss: () => void } {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const ua = navigator.userAgent;
        const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
        const standalone =
            window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
        let dismissed = false;
        try {
            dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
        } catch {
            /* تجاهل */
        }
        setShow(isIos && !standalone && !dismissed);
    }, []);

    const dismiss = useCallback(() => {
        setShow(false);
        try {
            window.localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            /* تجاهل */
        }
    }, []);

    return { show, dismiss };
}
