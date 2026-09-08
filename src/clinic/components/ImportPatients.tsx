import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Patient } from '../types';
import { Button, Modal, Table, Td, Textarea } from './ui';
import { nextPatientCode } from '../utils';

type Row = { name: string; phone: string; diagnosis: string; duplicate: boolean };

/** تحويل الأرقام العربية إلى إنجليزية حتى تُقرأ أرقام الهواتف بشكل صحيح */
function toLatinDigits(text: string): string {
    return text.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));
}

function looksLikePhone(value: string): boolean {
    const digits = toLatinDigits(value).replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
}

const HEADER_HINTS = ['الاسم', 'اسم', 'name', 'الهاتف', 'تليفون', 'phone', 'رقم'];

/**
 * يقرأ قائمة مكتوبة بأي ترتيب: اسم / رقم / تشخيص، مفصولة بفاصلة أو Tab
 * أو شرطة أو مسافات متعددة — وهو الشكل الذي تُكتب به السجلات الورقية عادة.
 */
export function parseRows(text: string, existing: Patient[]): Row[] {
    const rows: Row[] = [];
    const seen = new Set(existing.map((p) => `${p.name.trim()}|${toLatinDigits(p.phone).replace(/\D/g, '')}`));

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const lower = line.toLowerCase();
        const isHeader = HEADER_HINTS.filter((hint) => lower.includes(hint)).length >= 2;
        if (isHeader) continue;

        const parts = line
            .split(/\t|,|;|\||\s{2,}|\s+-\s+/)
            .map((part) => part.trim())
            .filter(Boolean);
        if (parts.length === 0) continue;

        const phoneIndex = parts.findIndex(looksLikePhone);
        const phone = phoneIndex >= 0 ? toLatinDigits(parts[phoneIndex]).replace(/[^\d+]/g, '') : '';
        const rest = parts.filter((_, i) => i !== phoneIndex);
        const name = rest.shift() ?? '';
        if (!name) continue;

        const key = `${name}|${phone.replace(/\D/g, '')}`;
        rows.push({ name, phone, diagnosis: rest.join(' - '), duplicate: seen.has(key) });
        seen.add(key);
    }
    return rows;
}

export default function ImportPatients({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { db, addMany } = useStore();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(0);
    const fileRef = useRef<HTMLInputElement>(null);

    const rows = useMemo(() => parseRows(text, db.patients), [text, db.patients]);
    const fresh = rows.filter((row) => !row.duplicate);

    const reset = () => {
        setText('');
        setDone(0);
    };

    const submit = async () => {
        if (fresh.length === 0) return;
        setBusy(true);
        try {
            let code = Number(nextPatientCode(db.patients).replace(/\D/g, '')) || 1001;
            await addMany(
                'patients',
                fresh.map((row) => ({
                    code: `P-${code++}`,
                    name: row.name,
                    phone: row.phone,
                    gender: 'male' as const,
                    birthDate: '',
                    address: '',
                    job: '',
                    diagnosis: row.diagnosis,
                    referredBy: '',
                    history: '',
                    notes: 'مستورد من قائمة',
                    plannedSessions: 0,
                    sessionPrice: db.settings.defaultSessionPrice,
                    archived: false
                }))
            );
            setDone(fresh.length);
            setText('');
        } finally {
            setBusy(false);
        }
    };

    const readFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => setText(String(reader.result ?? ''));
        reader.readAsText(file, 'utf-8');
    };

    return (
        <Modal
            open={open}
            wide
            title="استيراد قائمة مرضى"
            onClose={() => {
                reset();
                onClose();
            }}
            footer={
                <>
                    <Button
                        variant="secondary"
                        onClick={() => {
                            reset();
                            onClose();
                        }}
                    >
                        إغلاق
                    </Button>
                    <Button onClick={() => void submit()} disabled={busy || fresh.length === 0}>
                        {busy ? 'جارٍ الاستيراد…' : `استيراد ${fresh.length} مريض`}
                    </Button>
                </>
            }
        >
            {done > 0 ? <p className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">تمت إضافة {done} مريضًا بنجاح.</p> : null}

            <p className="mb-2 text-xs leading-relaxed text-slate-600">
                اكتب أو الصق كل مريض في سطر: <b>الاسم</b> ثم <b>رقم الهاتف</b> ثم <b>التشخيص</b> (اختياري)، مفصولة بفاصلة أو مسافة كبيرة. يمكنك أيضًا رفع ملف
                CSV.
            </p>

            <Textarea
                className="min-h-40 font-mono text-xs"
                placeholder={'محمد عبد الله, 01012345678, انزلاق غضروفي\nسارة إبراهيم, 01198765432, التهاب الكتف\nخالد منصور, 01555555555'}
                value={text}
                onChange={(e) => setText(e.target.value)}
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                    رفع ملف CSV
                </Button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) readFile(file);
                        e.target.value = '';
                    }}
                />
                {rows.length > 0 ? (
                    <span className="text-xs text-slate-500">
                        {rows.length} سطر مقروء
                        {rows.length - fresh.length > 0 ? ` — ${rows.length - fresh.length} مكرر سيتم تجاهله` : ''}
                    </span>
                ) : null}
            </div>

            {rows.length > 0 ? (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                    <Table head={['الاسم', 'الهاتف', 'التشخيص', '']}>
                        {rows.map((row, i) => (
                            <tr key={i} className={row.duplicate ? 'bg-amber-50/60 text-slate-400' : ''}>
                                <Td className="font-semibold">{row.name}</Td>
                                <Td dir="ltr" className="text-right">
                                    {row.phone || '—'}
                                </Td>
                                <Td>{row.diagnosis || '—'}</Td>
                                <Td className="text-xs">{row.duplicate ? 'موجود بالفعل' : 'جديد'}</Td>
                            </tr>
                        ))}
                    </Table>
                </div>
            ) : null}

            <p className="mt-3 text-[11px] text-slate-400">
                تُضاف الملفات بالاسم والهاتف والتشخيص فقط، ويمكنك بعدها فتح كل ملف لإكمال باقي البيانات (النوع، تاريخ الميلاد، الخطة العلاجية…).
            </p>
        </Modal>
    );
}
