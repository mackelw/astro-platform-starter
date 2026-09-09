import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Booking, BookingStatus } from '../types';
import { Badge, Button, Card, EmptyState, Select, Table, Td } from '../components/ui';
import { formatDate, formatTime, sortAppointments } from '../utils';

const statusLabels: Record<BookingStatus, string> = {
    new: 'جديد',
    confirmed: 'مؤكد',
    rejected: 'مرفوض',
    converted: 'تم التحويل'
};

const statusClasses: Record<BookingStatus, string> = {
    new: 'bg-sky-100 text-sky-800 ring-sky-200',
    confirmed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    rejected: 'bg-slate-200 text-slate-700 ring-slate-300',
    converted: 'bg-teal-100 text-teal-800 ring-teal-200'
};

const FILTERS: { key: 'pending' | BookingStatus | 'all'; label: string }[] = [
    { key: 'pending', label: 'بانتظار المراجعة' },
    { key: 'new', label: 'جديد' },
    { key: 'confirmed', label: 'مؤكد' },
    { key: 'converted', label: 'تم التحويل' },
    { key: 'rejected', label: 'مرفوض' },
    { key: 'all', label: 'الكل' }
];

export default function Bookings({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
    const { db, update, remove, can, convertBooking } = useStore();
    const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('pending');
    const [busy, setBusy] = useState('');

    const list = useMemo(() => {
        const rows = db.bookings.filter((b) => {
            if (filter === 'all') return true;
            if (filter === 'pending') return b.status === 'new' || b.status === 'confirmed';
            return b.status === filter;
        });
        // نفس ترتيب المواعيد: الأقرب زمنًا أولًا
        return sortAppointments(rows as unknown as Parameters<typeof sortAppointments>[0]) as unknown as Booking[];
    }, [db.bookings, filter]);

    const pendingCount = useMemo(() => db.bookings.filter((b) => b.status === 'new').length, [db.bookings]);

    const therapistName = (id: string) => (id ? (db.therapists.find((t) => t.id === id)?.name ?? 'غير محدد') : 'أي أخصائي');

    const convert = async (booking: Booking) => {
        if (!window.confirm(`تحويل طلب «${booking.name}» إلى ملف مريض وموعد محجوز؟`)) return;
        setBusy(booking.id);
        try {
            await convertBooking(booking.id);
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">طلبات الحجز</h2>
                    <p className="mt-1 text-sm text-slate-500">{pendingCount > 0 ? `${pendingCount} طلب جديد بانتظار المراجعة` : 'لا توجد طلبات جديدة'}</p>
                </div>
                <Select className="max-w-52" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                    {FILTERS.map((f) => (
                        <option key={f.key} value={f.key}>
                            {f.label}
                        </option>
                    ))}
                </Select>
            </div>

            <Card>
                {list.length === 0 ? (
                    <EmptyState title="لا توجد طلبات في هذا التصنيف" hint="الطلبات تصل من صفحة الحجز في الموقع." />
                ) : (
                    <Table head={['الموعد المطلوب', 'الاسم', 'الهاتف', 'الأخصائي', 'الحالة', 'الشكوى', '']}>
                        {list.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50">
                                <Td className="whitespace-nowrap font-bold text-slate-800">
                                    {formatDate(b.date)}
                                    <span className="block text-xs font-normal text-slate-500">{formatTime(b.time)}</span>
                                </Td>
                                <Td>
                                    {b.patientId ? (
                                        <button
                                            type="button"
                                            className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                            onClick={() => onOpenPatient(b.patientId)}
                                        >
                                            {b.name}
                                        </button>
                                    ) : (
                                        <span className="font-semibold text-slate-700">{b.name}</span>
                                    )}
                                    {b.email ? <span className="block text-xs text-slate-400">{b.email}</span> : null}
                                </Td>
                                <Td className="text-slate-600" dir="ltr">
                                    {b.phone}
                                </Td>
                                <Td className="text-slate-500">{therapistName(b.therapistId)}</Td>
                                <Td>
                                    <Badge className={statusClasses[b.status]}>{statusLabels[b.status]}</Badge>
                                </Td>
                                <Td className="max-w-48 truncate text-slate-500" title={b.message}>
                                    {b.message || '—'}
                                </Td>
                                <Td className="text-left">
                                    <div className="flex flex-wrap justify-end gap-1">
                                        {b.status !== 'converted' && can('bookings', 'update') ? (
                                            <>
                                                {b.status !== 'confirmed' ? (
                                                    <Button
                                                        variant="ghost"
                                                        className="px-2 py-1 text-xs"
                                                        onClick={() => update('bookings', b.id, { status: 'confirmed' })}
                                                    >
                                                        تأكيد
                                                    </Button>
                                                ) : null}
                                                {can('patients', 'create') && can('appointments', 'create') ? (
                                                    <Button
                                                        variant="subtle"
                                                        className="px-2 py-1 text-xs"
                                                        disabled={busy === b.id}
                                                        onClick={() => void convert(b)}
                                                    >
                                                        {busy === b.id ? 'جارٍ…' : 'تحويل لموعد'}
                                                    </Button>
                                                ) : null}
                                                {b.status !== 'rejected' ? (
                                                    <Button
                                                        variant="ghost"
                                                        className="px-2 py-1 text-xs"
                                                        onClick={() => update('bookings', b.id, { status: 'rejected' })}
                                                    >
                                                        رفض
                                                    </Button>
                                                ) : null}
                                            </>
                                        ) : null}
                                        {can('bookings', 'delete') ? (
                                            <Button
                                                variant="ghost"
                                                className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                                onClick={() => window.confirm('حذف هذا الطلب نهائيًا؟') && remove('bookings', b.id)}
                                            >
                                                حذف
                                            </Button>
                                        ) : null}
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
