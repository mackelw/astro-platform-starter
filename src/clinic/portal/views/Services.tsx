import React from 'react';
import { useStore } from '../../store';
import { usePortal } from '../context';
import { Card, EmptyState } from '../../components/ui';

export default function PortalServices({ onBook }: { onBook: () => void }) {
    const { db } = useStore();
    const { t, lang, money } = usePortal();

    const services = db.services.filter((service) => service.active);
    const areas = db.settings.homeVisitAreas
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-extrabold text-slate-800">{t('srv.title')}</h1>
                <p className="mt-0.5 text-xs text-slate-500">{t('srv.subtitle')}</p>
            </div>

            {services.length === 0 ? (
                <Card>
                    <EmptyState title={t('common.none')} />
                </Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {services.map((service) => (
                        <Card key={service.id} className="flex flex-col p-4">
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-extrabold text-slate-800">{lang === 'ar' ? service.name : service.nameEn || service.name}</h3>
                                <span className="shrink-0 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-extrabold text-teal-700">{money(service.price)}</span>
                            </div>
                            <p className="mt-1.5 grow text-xs leading-relaxed text-slate-600">
                                {lang === 'ar' ? service.description : service.descriptionEn || service.description}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                                <span>
                                    {service.duration} {t('common.minutes')}
                                </span>
                                {service.homeVisit ? (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">{t('srv.homeAvailable')}</span>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={onBook}
                                className="mt-3 w-full cursor-pointer rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700 transition hover:bg-teal-100"
                            >
                                {t('srv.book')}
                            </button>
                        </Card>
                    ))}
                </div>
            )}

            {areas.length ? (
                <Card className="p-4">
                    <p className="text-xs font-bold text-slate-500">{t('srv.areas')}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {areas.map((area) => (
                            <span key={area} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {area}
                            </span>
                        ))}
                    </div>
                </Card>
            ) : null}
        </div>
    );
}
