import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { MODE } from '../api';
import type { ID } from '../types';
import { Badge, Button, Card, CardHeader, EmptyState, Table, Td } from '../components/ui';
import { adherence, adherenceLevel, LEVEL_CLASSES, promTrends, PROGRAM_STATUS_CLASSES, PROGRAM_STATUS_LABELS } from '../telerehab';
import { promTemplate } from '../prom';
import { formatDate } from '../utils';

function Tile({ label, value, hint, tone = 'text-slate-800' }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
    return (
        <Card className="p-4">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
            {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
        </Card>
    );
}

export default function TeleRehab({ onOpenPatient }: { onOpenPatient: (id: ID) => void }) {
    const { db, update, can } = useStore();
    const [onlyProblems, setOnlyProblems] = useState(false);

    const rows = useMemo(() => {
        return db.programs
            .filter((p) => p.status !== 'done')
            .map((program) => {
                const patient = db.patients.find((x) => x.id === program.patientId);
                const stats = adherence(program, db.programLogs);
                const responses = db.promResponses.filter((r) => r.patientId === program.patientId);
                const trend = promTrends(responses)[0] ?? null;
                const lastResponse = [...responses].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
                const unread = db.portalMessages.filter((m) => m.patientId === program.patientId && m.from === 'patient' && !m.readByStaff);
                return { program, patient, stats, trend, lastResponse, unread, level: adherenceLevel(stats) };
            })
            .filter((row) => Boolean(row.patient) && !row.patient?.archived)
            .sort((a, b) => a.stats.percent - b.stats.percent);
    }, [db]);

    const shown = onlyProblems ? rows.filter((r) => r.level !== 'ok' || r.unread.length > 0) : rows;

    const totals = useMemo(() => {
        const silent = rows.filter((r) => r.stats.daysSilent >= 3).length;
        const unread = rows.reduce((sum, r) => sum + r.unread.length, 0);
        const average = rows.length ? Math.round(rows.reduce((sum, r) => sum + r.stats.percent, 0) / rows.length) : 0;
        return { silent, unread, average };
    }, [rows]);

    const markRead = (patientId: ID) => {
        for (const message of db.portalMessages.filter((m) => m.patientId === patientId && m.from === 'patient' && !m.readByStaff)) {
            update('portalMessages', message.id, { readByStaff: true });
        }
    };

    if (MODE === 'local') {
        return (
            <Card>
                <EmptyState
                    title="المتابعة عن بُعد تحتاج نسخة السيرفر"
                    hint="في النسخة المحلية لا يستطيع المريض الوصول للبوابة، فلا يوجد سجل التزام يومي لعرضه. شغّل نسخة السيرفر لتفعيل هذه الشاشة."
                />
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="برامج نشطة" value={rows.length} hint="مرضى لديهم برنامج منزلي جارٍ" />
                <Tile
                    label="متوسط الالتزام"
                    value={`${totals.average}%`}
                    tone={totals.average < 50 ? 'text-rose-600' : totals.average < 75 ? 'text-amber-600' : 'text-emerald-600'}
                />
                <Tile
                    label="انقطاع ثلاثة أيام فأكثر"
                    value={totals.silent}
                    tone={totals.silent > 0 ? 'text-rose-600' : 'text-emerald-600'}
                    hint="يحتاجون اتصالًا"
                />
                <Tile label="رسائل لم تُقرأ" value={totals.unread} tone={totals.unread > 0 ? 'text-amber-600' : 'text-slate-800'} />
            </div>

            <Card>
                <CardHeader
                    title="متابعة المرضى عن بُعد"
                    subtitle="مرتبة من الأقل التزامًا — هؤلاء من يحتاجون تدخلًا قبل الجلسة القادمة"
                    action={
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="checkbox"
                                checked={onlyProblems}
                                onChange={(e) => setOnlyProblems(e.target.checked)}
                                className="size-4 accent-teal-600"
                            />
                            <span className="text-xs font-semibold text-slate-600">من يحتاج انتباهًا فقط</span>
                        </label>
                    }
                />

                {shown.length === 0 ? (
                    <EmptyState
                        title={rows.length === 0 ? 'لا توجد برامج منزلية نشطة' : 'كل المرضى ملتزمون'}
                        hint={
                            rows.length === 0 ? 'ابنِ برنامجًا منزليًا من ملف أي مريض ليبدأ الالتزام في الظهور هنا.' : 'لا أحد متأخر ولا توجد رسائل غير مقروءة.'
                        }
                    />
                ) : (
                    <Table head={['المريض', 'البرنامج', 'الالتزام', 'آخر تسجيل', 'الألم', 'آخر قياس', 'رسائل', '']}>
                        {shown.map(({ program, patient, stats, trend, lastResponse, unread, level }) => (
                            <tr key={program.id}>
                                <Td>
                                    <button
                                        type="button"
                                        onClick={() => patient && onOpenPatient(patient.id)}
                                        className="cursor-pointer font-bold text-teal-700 hover:underline"
                                    >
                                        {patient?.name}
                                    </button>
                                    <span className="block text-[11px] text-slate-400">{patient?.code}</span>
                                </Td>
                                <Td>
                                    <span className="block text-xs font-semibold text-slate-700">{program.title}</span>
                                    <Badge className={`${PROGRAM_STATUS_CLASSES[program.status]} mt-1`}>{PROGRAM_STATUS_LABELS[program.status]}</Badge>
                                </Td>
                                <Td>
                                    <Badge className={LEVEL_CLASSES[level]}>{stats.percent}%</Badge>
                                    <span className="block text-[11px] text-slate-400">
                                        {stats.doneDays} من {stats.expectedDays} يوم
                                        {stats.streak > 1 ? ` · ${stats.streak} متتالية` : ''}
                                    </span>
                                </Td>
                                <Td className="text-slate-500">
                                    {stats.lastDate ? (
                                        <>
                                            {formatDate(stats.lastDate)}
                                            {stats.daysSilent >= 3 ? (
                                                <span className="block text-[11px] font-bold text-rose-600">منذ {stats.daysSilent} أيام</span>
                                            ) : null}
                                        </>
                                    ) : (
                                        <span className="text-rose-600">لم يبدأ</span>
                                    )}
                                </Td>
                                <Td>
                                    {stats.averagePain === null ? (
                                        '—'
                                    ) : (
                                        <>
                                            <span dir="ltr">{stats.averagePain}/10</span>
                                            {stats.painChange !== null ? (
                                                <span className={`block text-[11px] font-bold ${stats.painChange < 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {stats.painChange > 0 ? '+' : ''}
                                                    {stats.painChange}
                                                </span>
                                            ) : null}
                                        </>
                                    )}
                                </Td>
                                <Td className="text-slate-500">
                                    {lastResponse ? (
                                        <>
                                            <span className="font-semibold text-slate-700">
                                                {promTemplate(lastResponse.templateId)?.short} {lastResponse.score}
                                            </span>
                                            {trend ? (
                                                <span className={`block text-[11px] font-bold ${trend.improved ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {trend.change > 0 ? '+' : ''}
                                                    {trend.change}
                                                    {trend.meaningful ? ' ✓' : ''}
                                                </span>
                                            ) : null}
                                        </>
                                    ) : (
                                        '—'
                                    )}
                                </Td>
                                <Td>
                                    {unread.length > 0 ? (
                                        <Badge className="bg-amber-100 text-amber-800 ring-amber-200">{unread.length} جديدة</Badge>
                                    ) : (
                                        <span className="text-slate-400">—</span>
                                    )}
                                </Td>
                                <Td className="text-left">
                                    <div className="flex justify-end gap-1">
                                        {unread.length > 0 && can('portalMessages', 'update') ? (
                                            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => patient && markRead(patient.id)}>
                                                تعليم كمقروء
                                            </Button>
                                        ) : null}
                                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => patient && onOpenPatient(patient.id)}>
                                            فتح الملف
                                        </Button>
                                    </div>
                                </Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>
        </div>
    );
}
