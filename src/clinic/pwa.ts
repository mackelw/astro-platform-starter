/**
 * تثبيت التطبيق على شاشة الموبايل، وحالة الاتصال، ومسح ما خُزِّن على الجهاز.
 */
import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'range-install-dismissed';

interface InstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * يمحو كل بيانات المريض المخزّنة على الجهاز.
 * يُستدعى عند تسجيل الخروج حتى لا يبقى ملف طبي على هاتف مشترك.
 */
export function clearOfflineData(): void {
    if (typeof window === 'undefined') return;
    try {
        navigator.serviceWorker?.controller?.postMessage({ type: 'clear-data' });
    } catch {
        /* لا يوجد عامل خدمي نشط */
    }
    // مسح مباشر أيضًا، فقد يكون العامل الخدمي غير متحكم في هذه الصفحة بعد.
    // CacheStorage غير موجودة أصلًا خارج الاتصال الآمن، فنتحقق من وجودها لا من قيمتها.
    if (typeof caches === 'undefined') return;
    void caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('range-data-')).map((key) => caches.delete(key))))
        .catch(() => undefined);
}

/** هل المتصفح متصل بالإنترنت الآن؟ */
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

/**
 * عرض «ثبّت التطبيق» في وقته: المتصفح يخبرنا متى يكون التثبيت متاحًا،
 * ولا نعاود إزعاج من رفضه.
 */
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
            e.preventDefault(); // نعرض دعوتنا الخاصة في مكان مناسب بدل شريط المتصفح
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
            /* المتصفح يمنع التخزين — الدعوة تختفي لهذه الجلسة فقط */
        }
    }, []);

    return { canInstall: Boolean(event) && !dismissed, install, dismiss };
}
