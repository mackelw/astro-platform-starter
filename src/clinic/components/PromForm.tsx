import React, { useState } from 'react';
import type { PromTemplate } from '../prom';
import { Button, Modal } from './ui';

/**
 * نموذج ملء استبيان. عرض خالص بلا اتصال بالمخزن، حتى تستخدمه شاشة المركز
 * وبوابة المريض بنفس المنطق والمظهر.
 */
export default function PromForm({
    open,
    template,
    onClose,
    onSubmit,
    busy = false
}: {
    open: boolean;
    template: PromTemplate | null;
    onClose: () => void;
    onSubmit: (answers: number[]) => void;
    busy?: boolean;
}) {
    const [answers, setAnswers] = useState<(number | null)[]>([]);
    const [key, setKey] = useState('');

    const currentKey = `${open}-${template?.id ?? ''}`;
    if (key !== currentKey) {
        setKey(currentKey);
        setAnswers(template ? new Array(template.items.length).fill(null) : []);
    }

    if (!template) return null;

    const answered = answers.filter((a) => a !== null).length;
    const complete = answered === template.items.length;
    const preview = complete ? template.score(answers as number[]) : null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            wide
            title={`${template.name} (${template.short})`}
            footer={
                <>
                    <span className="ml-auto text-xs font-semibold text-slate-500">
                        {answered} من {template.items.length} سؤال
                        {preview !== null ? (
                            <>
                                {' · الدرجة '}
                                <span dir="ltr">
                                    {preview} {template.unit}
                                </span>
                            </>
                        ) : null}
                    </span>
                    <Button variant="secondary" onClick={onClose}>
                        إلغاء
                    </Button>
                    <Button onClick={() => complete && onSubmit(answers as number[])} disabled={!complete || busy}>
                        {busy ? 'جارٍ الحفظ…' : 'حفظ الإجابة'}
                    </Button>
                </>
            }
        >
            <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{template.description}</p>

            <ol className="space-y-4">
                {template.items.map((item, index) => (
                    <li key={index} className="rounded-lg border border-slate-200 p-3">
                        <p className="mb-2 text-sm font-bold text-slate-800">
                            <span className="text-teal-600">{index + 1}.</span> {item.text}
                        </p>
                        <div className="grid gap-1.5">
                            {item.options.map((option, value) => {
                                const selected = answers[index] === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)))}
                                        className={`cursor-pointer rounded-lg border px-3 py-2 text-right text-sm transition ${
                                            selected
                                                ? 'border-teal-600 bg-teal-600 font-semibold text-white'
                                                : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'
                                        }`}
                                    >
                                        {option}
                                    </button>
                                );
                            })}
                        </div>
                    </li>
                ))}
            </ol>
        </Modal>
    );
}
