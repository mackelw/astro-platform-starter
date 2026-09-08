import React from 'react';
import { useStore } from '../../store';
import { usePortal, whatsappLink } from '../context';
import { Card } from '../../components/ui';
import { safeUrl } from '../../utils';

export default function PortalContact() {
    const { db } = useStore();
    const { t, lang, patient } = usePortal();

    const whatsapp = db.settings.whatsapp || db.settings.phone;
    const address = lang === 'ar' ? db.settings.address : db.settings.addressEn || db.settings.address;
    const map = safeUrl(db.settings.mapUrl);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-extrabold text-slate-800">{t('contact.title')}</h1>
                <p className="mt-0.5 text-xs text-slate-500">{t('contact.emergency')}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {whatsapp ? (
                    <a
                        href={whatsappLink(whatsapp, `${db.settings.name} — ${patient?.name ?? ''}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                        <span aria-hidden="true">💬</span>
                        {t('home.whatsapp')}
                    </a>
                ) : null}
                {db.settings.phone ? (
                    <a
                        href={`tel:${db.settings.phone.replace(/\s/g, '')}`}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                        <span aria-hidden="true">📞</span>
                        <span dir="ltr">{db.settings.phone}</span>
                    </a>
                ) : null}
            </div>

            <Card className="p-4">
                <p className="text-xs font-bold text-slate-500">{t('contact.location')}</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{address}</p>
                {map ? (
                    <a href={map} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-teal-700 underline">
                        {t('contact.map')}
                    </a>
                ) : null}
            </Card>

            <Card className="p-4">
                <p className="text-xs font-bold text-slate-500">{t('home.hours')}</p>
                <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <p className="flex justify-between gap-3">
                        <span>{t('home.hoursDaily')}</span>
                        <span className="font-semibold" dir="ltr">
                            {db.settings.workStart} – {db.settings.workEnd}
                        </span>
                    </p>
                    <p className="flex justify-between gap-3">
                        <span>{t('home.hoursFriday')}</span>
                        <span className="font-semibold" dir="ltr">
                            {db.settings.fridayStart} – {db.settings.fridayEnd}
                        </span>
                    </p>
                </div>
            </Card>
        </div>
    );
}
