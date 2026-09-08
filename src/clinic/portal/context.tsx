import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Patient } from '../types';
import { useStore } from '../store';
import { formatDateIn, formatTimeIn, initialLang, isRtl, LANG_KEY, moneyIn, translate, type Lang } from '../i18n';

interface PortalValue {
    lang: Lang;
    setLang: (lang: Lang) => void;
    dir: 'rtl' | 'ltr';
    t: (key: string) => string;
    date: (iso: string, withDay?: boolean) => string;
    time: (value: string) => string;
    money: (amount: number) => string;
    /** الملفات التي يديرها هذا الحساب: ملفه أولًا ثم أفراد أسرته */
    profiles: Patient[];
    /** الملف المعروض حاليًا — يتبدّل بلا تسجيل خروج */
    patient: Patient | null;
    activeId: string;
    setActiveId: (id: string) => void;
    isSelf: boolean;
}

const PortalContext = createContext<PortalValue | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
    const { db, user } = useStore();
    const [lang, setLangState] = useState<Lang>('ar');
    const [activeId, setActiveId] = useState('');

    // اللغة تُقرأ بعد الإقلاع حتى لا يختلف ما يرسمه السيرفر عما يرسمه المتصفح
    useEffect(() => setLangState(initialLang()), []);

    const setLang = useCallback((next: Lang) => {
        setLangState(next);
        try {
            window.localStorage.setItem(LANG_KEY, next);
        } catch {
            /* المتصفح يمنع التخزين — اللغة تعمل لهذه الجلسة فقط */
        }
    }, []);

    // ترتيب الملفات: ملف صاحب الحساب أولًا ثم بقية أفراد الأسرة
    const profiles = useMemo(() => {
        if (!user) return [];
        const order = [user.patientId, ...(user.memberIds ?? [])].filter(Boolean);
        const byId = new Map(db.patients.map((p) => [p.id, p]));
        const listed = order.map((id) => byId.get(id)).filter((p): p is Patient => Boolean(p));
        // أي ملف وصل من السيرفر ولم يُذكر في الترتيب يُضاف في النهاية بدل أن يختفي
        const rest = db.patients.filter((p) => !order.includes(p.id));
        return [...listed, ...rest];
    }, [db.patients, user]);

    const active = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;

    const value = useMemo<PortalValue>(
        () => ({
            lang,
            setLang,
            dir: isRtl(lang) ? 'rtl' : 'ltr',
            t: (key: string) => translate(lang, key),
            date: (iso: string, withDay = false) => formatDateIn(lang, iso, withDay),
            time: (value: string) => formatTimeIn(lang, value),
            money: (amount: number) => moneyIn(lang, amount, db.settings.currency),
            profiles,
            patient: active,
            activeId: active?.id ?? '',
            setActiveId,
            isSelf: Boolean(active && user && active.id === user.patientId)
        }),
        [lang, setLang, db.settings.currency, profiles, active, user]
    );

    return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalValue {
    const ctx = useContext(PortalContext);
    if (!ctx) throw new Error('usePortal يجب أن يُستخدم داخل PortalProvider');
    return ctx;
}

/** رابط واتساب جاهز برسالة افتتاحية تحمل اسم المريض */
export function whatsappLink(number: string, message: string): string {
    const digits = number.replace(/[^\d]/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
