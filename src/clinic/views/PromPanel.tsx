import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Patient, PromResponse, PromTemplateId } from '../types';
import { PROM_MCID, PROM_TEMPLATES, promTemplate, type PromTemplate } from '../prom';
import PromForm from '../components/PromForm';
import { Badge, Button, Card, CardHeader, EmptyState, Table, Td } from '../components/ui';
import { activeProgram } from '../telerehab';
import { formatDate, todayISO } from '../utils';

/** منحنى صغير يوضح اتجاه الدرجة عبر الزمن */
function Spark({ values, betterWhen, max }: { values: number[]; betterWhen: 'lower' | 'higher'; max: number }) {
    if (values.length < 2) return null;
    const width = 120;
    const height = 34;
    const top = Math.max(max, ...values) || 1;
    const step = width / (values.length - 1);
    const points = values.map((v, i) => `${width - i * step},${height - (v / top) * (height - 4) - 2}`).join(' ');
    const first = values[0];
    const last = values[values.length - 1];
    const improved = betterWhen === 'lower' ? last < first : last > first;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="اتجاه الدرجة">
            <polyline points={points} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" stroke={improved ? '#059669' : '#e11d48'} />
        </svg>
    );
}

function MeasureCard({ template, responses, onFill, canFill }: { template: PromTemplate; responses: PromResponse[]; onFill: () => void; canFill: boolean }) {
    const sorted = [...responses].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const change = first && last && sorted.length > 1 ? Math.round((last.score - first.score) * 10) / 10 : null;
    const improved = change === null ? false : template.betterWhen === 'lower' ? change < 0 : change > 0;
    const meaningful = change !== null && Math.abs(change) >= PROM_MCID[template.id];

    return (
        <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">
                        {template.short} <span className="text-xs font-normal text-slate-500">— {template.name}</span>
                    </p>
                    {last ? (
                        <p className="mt-1 text-xs text-slate-500">
                            آخر قياس {formatDate(last.date)} · {template.interpret(last.score)}
                        </p>
                    ) : (
                        <p className="mt-1 text-xs text-slate-400">لم يُقَس بعد</p>
                    )}
                </div>
                {canFill ? (
                    <Button variant="secondary" className="shrink-0 px-2 py-1 text-xs" onClick={onFill}>
                        تسجيل قياس
                    </Button>
                ) : null}
            </div>

            {last ? (
                <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                        <p dir="ltr" className="text-right text-2xl font-extrabold text-slate-800">
                            {last.score}
                            <span className="text-sm font-semibold text-slate-400"> {template.unit}</span>
                        </p>
                        {change !== null ? (
                            <Badge
                                className={improved ? 'mt-1 bg-emerald-100 text-emerald-800 ring-emerald-200' : 'mt-1 bg-rose-100 text-rose-800 ring-rose-200'}
                            >
                                {change > 0 ? '+' : ''}
                                {change} منذ البداية{meaningful ? ' · تغيّر مهم' : ''}
                            </Badge>
                        ) : null}
                    </div>
                    <Spark values={sorted.map((r) => r.score).reverse()} betterWhen={template.betterWhen} max={template.max} />
                </div>
            ) : null}
        </div>
    );
}

export default function PromPanel({ patient }: { patient: Patient }) {
    const { db, add, can } = useStore();
    const [openId, setOpenId] = useState<PromTemplateId | null>(null);

    const responses = useMemo(
        () => db.promResponses.filter((r) => r.patientId === patient.id).sort((a, b) => b.date.localeCompare(a.date)),
        [db.promResponses, patient.id]
    );

    const program = useMemo(() => activeProgram(db, patient.id), [db, patient.id]);

    // المقاييس المطلوبة في البرنامج أولًا، ثم أي مقياس سبق قياسه
    const shown = useMemo(() => {
        const ids = new Set<PromTemplateId>([...(program?.proms ?? []), ...responses.map((r) => r.templateId)]);
        return PROM_TEMPLATES.filter((t) => ids.has(t.id));
    }, [program, responses]);

    const canFill = can('promResponses', 'create');
    const template = openId ? (promTemplate(openId) ?? null) : null;

    const submit = (answers: number[]) => {
        if (!template) return;
        add('promResponses', {
            patientId: patient.id,
            templateId: template.id,
            date: todayISO(),
            answers,
            // السيرفر يعيد حسابها من المعادلة؛ نحسبها هنا لتعمل النسخة المحلية أيضًا
            score: template.score(answers),
            filledBy: 'staff'
        });
        setOpenId(null);
    };

    return (
        <div className="space-y-4 p-4">
            <Card>
                <CardHeader
                    title="مقاييس النتائج"
                    subtitle={
                        program?.proms.length
                            ? 'المقاييس المطلوبة في البرنامج الحالي — يملؤها المريض من بوابته أو تُسجَّل هنا'
                            : 'اختر المقاييس المطلوبة عند بناء البرنامج المنزلي، أو سجّل قياسًا مباشرة'
                    }
                    action={
                        canFill ? (
                            <div className="flex flex-wrap gap-1">
                                {PROM_TEMPLATES.filter((t) => !shown.some((s) => s.id === t.id)).map((t) => (
                                    <Button key={t.id} variant="ghost" className="px-2 py-1 text-xs" onClick={() => setOpenId(t.id)}>
                                        + {t.short}
                                    </Button>
                                ))}
                            </div>
                        ) : undefined
                    }
                />
                {shown.length === 0 ? (
                    <EmptyState
                        title="لا توجد مقاييس مسجلة"
                        hint="المقاييس المعيارية تحوّل «تحسّن الحمد لله» إلى رقم يمكن عرضه على الطبيب المحوِّل وشركة التأمين."
                    />
                ) : (
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                        {shown.map((t) => (
                            <MeasureCard
                                key={t.id}
                                template={t}
                                responses={responses.filter((r) => r.templateId === t.id)}
                                canFill={canFill}
                                onFill={() => setOpenId(t.id)}
                            />
                        ))}
                    </div>
                )}
            </Card>

            {responses.length > 0 ? (
                <Card>
                    <CardHeader title={`سجل القياسات (${responses.length})`} />
                    <Table head={['التاريخ', 'المقياس', 'الدرجة', 'التفسير', 'سُجّل بواسطة']}>
                        {responses.map((r) => {
                            const t = promTemplate(r.templateId);
                            return (
                                <tr key={r.id}>
                                    <Td className="font-semibold text-slate-700">{formatDate(r.date)}</Td>
                                    <Td>{t?.short ?? r.templateId}</Td>
                                    <Td dir="ltr" className="text-right font-bold text-slate-800">
                                        {r.score} {t?.unit}
                                    </Td>
                                    <Td className="text-slate-500">{t ? t.interpret(r.score) : '—'}</Td>
                                    <Td className="text-slate-500">{r.filledBy === 'patient' ? 'المريض' : 'المركز'}</Td>
                                </tr>
                            );
                        })}
                    </Table>
                </Card>
            ) : null}

            <PromForm open={Boolean(template)} template={template} onClose={() => setOpenId(null)} onSubmit={submit} />
        </div>
    );
}
