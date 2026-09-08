import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Textarea } from '../components/ui';
import type { Booking, BookingStatus } from '../types';
import { formatDate, formatTime, patientName, todayISO } from '../utils';

const STATUS_LABELS: Record<BookingStatus, string> = {
    new: 'جديد',
    confirmed: 'مؤكد',
    rejected: 'مرفوض',
    cancelled: 'ألغاه المريض',
    done: 'تم'
};

const STATUS_CLASSES: Record<BookingStatus, string> = {
    new: 'bg-sky-100 text-sky-800 ring-sky-200',
    confirmed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 ring-rose-200',
    cancelled: 'bg-slate-200 text-slate-700 ring-slate-300',
    done: 'bg-teal-100 text-teal-800 ring-teal-200'
};

export default function Bookings({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
    const { db, add, update, can } = useStore();
    const [filter, setFilter] = useState<'open' | 'all'>('open');
    const [confirming, setConfirming] = useState<Booking | null>(null);
    const [rejecting, setRejecting] = useState<Booking | null>(null);
    const [reply, setReply] = useState('');
    const [slot, setSlot] = useState({ date: '', time: '', therapistId: '', duration: 45 });

    const mayManage = can('bookings', 'update');
    const mayBook = can('appointments', 'create');

    const list = useMemo(() => {
        const rows = filter === 'open' ? db.bookings.filter((b) => b.status === 'new') : db.bookings;
        return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [db.bookings, filter]);

    const newCount = db.bookings.filter((b) => b.status === 'new').length;

    const serviceName = (id: string) => db.services.find((s) => s.id === id)?.name ?? '—';

    const openConfirm = (booking: Booking) => {
        const service = db.services.find((s) => s.id === booking.serviceId);
        setSlot({
            date: booking.date || todayISO(),
            time: booking.time || db.settings.workStart,
            therapistId: '',
            duration: service?.duration || db.settings.defaultDuration
        });
        setReply('');
        setConfirming(booking);
    };

    /** تأكيد الطلب = إنشاء موعد فعلي في الجدول + تحديث حالة الطلب */
    const confirm = () => {
        if (!confirming) return;
        if (mayBook) {
            add('appointments', {
                patientId: confirming.patientId,
                therapistId: slot.therapistId,
                date: slot.date,
                time: slot.time,
                duration: Number(slot.duration) || db.settings.defaultDuration,
                status: 'scheduled',
                notes: confirming.place === 'home' ? `زيارة منزلية — ${confirming.area}` : ''
            });
        }
        update('bookings', confirming.id, { status: 'confirmed', replyNote: reply });
        setConfirming(null);
    };

    const reject = () => {
        if (!rejecting) return;
        update('bookings', rejecting.id, { status: 'rejected', replyNote: reply });
        setRejecting(null);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader
                    title="طلبات الحجز من التطبيق"
                    subtitle={newCount ? `${newCount} طلب في انتظار الرد` : 'لا توجد طلبات جديدة'}
                    action={
                        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'all')} className="w-40">
                            <option value="open">الطلبات الجديدة</option>
                            <option value="all">كل الطلبات</option>
                        </Select>
                    }
                />
                {list.length === 0 ? (
                    <EmptyState title="لا توجد طلبات" hint="طلبات الحجز التي يرسلها المرضى من التطبيق تظهر هنا" />
                ) : (
                    <Table head={['المريض', 'الخدمة', 'المكان', 'الموعد المطلوب', 'الحالة', '']}>
                        {list.map((booking) => (
                            <tr key={booking.id} className="hover:bg-slate-50">
                                <Td>
                                    <button
                                        type="button"
                                        onClick={() => onOpenPatient(booking.patientId)}
                                        className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                    >
                                        {patientName(db, booking.patientId)}
                                    </button>
                                    {booking.notes ? <p className="mt-0.5 text-[11px] text-slate-400">{booking.notes}</p> : null}
                                </Td>
                                <Td>{serviceName(booking.serviceId)}</Td>
                                <Td>
                                    {booking.place === 'home' ? 'زيارة منزلية' : 'في المركز'}
                                    {booking.area ? <span className="block text-[11px] text-slate-400">{booking.area}</span> : null}
                                </Td>
                                <Td>
                                    {formatDate(booking.date)}
                                    {booking.time ? <span className="block text-[11px] text-slate-400">{formatTime(booking.time)}</span> : null}
                                </Td>
                                <Td>
                                    <Badge className={STATUS_CLASSES[booking.status]}>{STATUS_LABELS[booking.status]}</Badge>
                                </Td>
                                <Td>
                                    {mayManage && (booking.status === 'new' || booking.status === 'confirmed') ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {booking.status === 'new' ? (
                                                <>
                                                    <Button variant="subtle" onClick={() => openConfirm(booking)}>
                                                        تأكيد
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        className="text-rose-600"
                                                        onClick={() => {
                                                            setReply('');
                                                            setRejecting(booking);
                                                        }}
                                                    >
                                                        رفض
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button variant="secondary" onClick={() => update('bookings', booking.id, { status: 'done' })}>
                                                    إنهاء
                                                </Button>
                                            )}
                                        </div>
                                    ) : null}
                                </Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>

            <Modal
                open={Boolean(confirming)}
                title="تأكيد الطلب وحجز الموعد"
                onClose={() => setConfirming(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setConfirming(null)}>
                            إلغاء
                        </Button>
                        <Button onClick={confirm} disabled={!slot.date}>
                            تأكيد وحجز
                        </Button>
                    </>
                }
            >
                <p className="mb-3 text-xs text-slate-500">
                    {mayBook
                        ? 'سيُضاف موعد في جدول المركز ويظهر للمريض في تطبيقه فورًا.'
                        : 'سيُبلَّغ المريض بالتأكيد — حجز الموعد في الجدول يحتاج صلاحية المواعيد.'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="التاريخ">
                        <Input type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} />
                    </Field>
                    <Field label="الوقت">
                        <Input type="time" value={slot.time} onChange={(e) => setSlot({ ...slot, time: e.target.value })} />
                    </Field>
                    <Field label="الأخصائي">
                        <Select value={slot.therapistId} onChange={(e) => setSlot({ ...slot, therapistId: e.target.value })}>
                            <option value="">غير محدد</option>
                            {db.therapists
                                .filter((therapist) => therapist.active)
                                .map((therapist) => (
                                    <option key={therapist.id} value={therapist.id}>
                                        {therapist.name}
                                    </option>
                                ))}
                        </Select>
                    </Field>
                    <Field label="مدة الجلسة (دقيقة)">
                        <Input type="number" min={10} value={slot.duration} onChange={(e) => setSlot({ ...slot, duration: Number(e.target.value) })} />
                    </Field>
                    <Field label="رد يظهر للمريض" className="sm:col-span-2">
                        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="مثال: تم تأكيد موعدك، برجاء الحضور قبلها بعشر دقائق." />
                    </Field>
                </div>
            </Modal>

            <Modal
                open={Boolean(rejecting)}
                title="رفض الطلب"
                onClose={() => setRejecting(null)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setRejecting(null)}>
                            إلغاء
                        </Button>
                        <Button variant="danger" onClick={reject}>
                            إرسال الرفض
                        </Button>
                    </>
                }
            >
                <Field label="سبب الاعتذار — يظهر للمريض في التطبيق">
                    <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="مثال: الموعد المطلوب محجوز، برجاء اختيار موعد آخر." />
                </Field>
            </Modal>
        </div>
    );
}
