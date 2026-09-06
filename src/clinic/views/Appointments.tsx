import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Appointment } from '../types';
import { AppointmentForm, SessionForm } from '../components/forms';
import { Badge, Button, Card, EmptyState, Input, Select, Table, Td } from '../components/ui';
import { addDays, formatDateLong, formatTime, patientName, sortAppointments, statusClasses, statusLabels, therapistName, todayISO } from '../utils';

export default function Appointments({ onOpenPatient }: { onOpenPatient: (id: string) => void }) {
    const { db, update, remove } = useStore();
    const [date, setDate] = useState(todayISO());
    const [therapistFilter, setTherapistFilter] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Appointment | null>(null);
    const [sessionFrom, setSessionFrom] = useState<Appointment | null>(null);

    const week = useMemo(() => {
        const start = addDays(date, -3);
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }, [date]);

    const dayAppointments = useMemo(() => {
        const list = db.appointments.filter((a) => a.date === date && (!therapistFilter || a.therapistId === therapistFilter));
        return sortAppointments(list);
    }, [db.appointments, date, therapistFilter]);

    const countFor = (d: string) => db.appointments.filter((a) => a.date === d && a.status !== 'cancelled').length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">المواعيد</h2>
                    <p className="mt-1 text-sm text-slate-500">{formatDateLong(date)}</p>
                </div>
                <Button
                    onClick={() => {
                        setEditing(null);
                        setFormOpen(true);
                    }}
                >
                    + حجز موعد
                </Button>
            </div>

            <Card className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={() => setDate(addDays(date, -1))}>
                        اليوم السابق
                    </Button>
                    <Input type="date" className="max-w-44" value={date} onChange={(e) => setDate(e.target.value)} />
                    <Button variant="secondary" onClick={() => setDate(addDays(date, 1))}>
                        اليوم التالي
                    </Button>
                    <Button variant="subtle" onClick={() => setDate(todayISO())}>
                        اليوم
                    </Button>
                    <Select className="max-w-52" value={therapistFilter} onChange={(e) => setTherapistFilter(e.target.value)}>
                        <option value="">كل الأخصائيين</option>
                        {db.therapists.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </Select>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1.5">
                    {week.map((d) => {
                        const isSelected = d === date;
                        const isToday = d === todayISO();
                        return (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDate(d)}
                                className={`cursor-pointer rounded-lg border px-1 py-2 text-center transition ${
                                    isSelected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                            >
                                <span className={`block text-[11px] ${isSelected ? 'text-teal-50' : 'text-slate-500'}`}>{formatDateLong(d).split(' ')[0]}</span>
                                <span className="block text-sm font-bold">{Number(d.slice(8, 10))}</span>
                                <span className={`block text-[11px] ${isSelected ? 'text-teal-50' : isToday ? 'text-teal-600' : 'text-slate-400'}`}>
                                    {countFor(d)} موعد
                                </span>
                            </button>
                        );
                    })}
                </div>
            </Card>

            <Card>
                {dayAppointments.length === 0 ? (
                    <EmptyState title="لا توجد مواعيد في هذا اليوم" action={<Button onClick={() => setFormOpen(true)}>حجز موعد</Button>} />
                ) : (
                    <Table head={['الوقت', 'المريض', 'الأخصائي', 'المدة', 'الحالة', 'ملاحظات', '']}>
                        {dayAppointments.map((a) => (
                            <tr key={a.id} className="hover:bg-slate-50">
                                <Td className="font-bold text-slate-800">{formatTime(a.time)}</Td>
                                <Td>
                                    <button
                                        type="button"
                                        className="cursor-pointer font-semibold text-teal-700 hover:underline"
                                        onClick={() => onOpenPatient(a.patientId)}
                                    >
                                        {patientName(db, a.patientId)}
                                    </button>
                                </Td>
                                <Td className="text-slate-500">{therapistName(db, a.therapistId)}</Td>
                                <Td className="text-slate-500">{a.duration} د</Td>
                                <Td>
                                    <Badge className={statusClasses[a.status]}>{statusLabels[a.status]}</Badge>
                                </Td>
                                <Td className="max-w-40 truncate text-slate-500" title={a.notes}>
                                    {a.notes || '—'}
                                </Td>
                                <Td className="text-left">
                                    <div className="flex flex-wrap justify-end gap-1">
                                        <Button variant="subtle" className="px-2 py-1 text-xs" onClick={() => setSessionFrom(a)}>
                                            تسجيل جلسة
                                        </Button>
                                        {a.status === 'scheduled' ? (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    className="px-2 py-1 text-xs"
                                                    onClick={() => update('appointments', a.id, { status: 'done' })}
                                                >
                                                    حضر
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    className="px-2 py-1 text-xs"
                                                    onClick={() => update('appointments', a.id, { status: 'cancelled' })}
                                                >
                                                    إلغاء
                                                </Button>
                                            </>
                                        ) : null}
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs"
                                            onClick={() => {
                                                setEditing(a);
                                                setFormOpen(true);
                                            }}
                                        >
                                            تعديل
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                                            onClick={() => window.confirm('حذف هذا الموعد؟') && remove('appointments', a.id)}
                                        >
                                            حذف
                                        </Button>
                                    </div>
                                </Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>

            <AppointmentForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} presetDate={date} />
            <SessionForm open={Boolean(sessionFrom)} onClose={() => setSessionFrom(null)} fromAppointment={sessionFrom} />
        </div>
    );
}
