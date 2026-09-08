import React, { useState } from 'react';
import { useStore } from '../../store';
import { usePortal } from '../context';
import { Button, Card, CardHeader, Field, Input, Modal, Select } from '../../components/ui';
import type { Gender, Patient } from '../../types';

const MAX_MEMBERS = 8;

interface Draft {
    name: string;
    phone: string;
    gender: Gender;
    birthDate: string;
    address: string;
    job: string;
}

const emptyDraft = (): Draft => ({ name: '', phone: '', gender: 'male', birthDate: '', address: '', job: '' });

export default function PortalFamily() {
    const { db, user, add, update } = useStore();
    const { t, profiles, activeId, setActiveId } = usePortal();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Patient | null>(null);
    const [draft, setDraft] = useState<Draft>(emptyDraft());

    const startAdd = () => {
        setEditing(null);
        setDraft(emptyDraft());
        setOpen(true);
    };

    const startEdit = (patient: Patient) => {
        setEditing(patient);
        setDraft({
            name: patient.name,
            phone: patient.phone,
            gender: patient.gender,
            birthDate: patient.birthDate,
            address: patient.address,
            job: patient.job
        });
        setOpen(true);
    };

    const save = () => {
        if (!draft.name.trim()) return;
        if (editing) {
            update('patients', editing.id, draft);
        } else {
            // السيرفر هو من يربط الملف الجديد بالحساب ويولّد رقم الملف
            add('patients', {
                ...draft,
                code: '',
                diagnosis: '',
                referredBy: '',
                history: '',
                notes: '',
                plannedSessions: 0,
                sessionPrice: 0,
                archived: false
            });
        }
        setOpen(false);
    };

    const memberCount = profiles.filter((p) => p.id !== user?.patientId).length;
    const atLimit = memberCount >= MAX_MEMBERS;

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-extrabold text-slate-800">{t('fam.title')}</h1>
                <p className="mt-0.5 text-xs text-slate-500">{t('fam.subtitle')}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {profiles.map((profile) => {
                    const isSelf = profile.id === user?.patientId;
                    const isActive = profile.id === activeId;
                    const sessions = db.sessions.filter((s) => s.patientId === profile.id).length;
                    return (
                        <Card key={profile.id} className={`p-4 ${isActive ? 'border-teal-400 ring-1 ring-teal-200' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-extrabold text-slate-800">{profile.name}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        {isSelf ? t('fam.mine') : profile.code} · {sessions} {t('home.sessionsDone')}
                                    </p>
                                </div>
                                {isActive ? (
                                    <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">{t('fam.active')}</span>
                                ) : null}
                            </div>
                            {profile.diagnosis ? <p className="mt-2 text-xs text-slate-600">{profile.diagnosis}</p> : null}
                            <div className="mt-3 flex gap-2">
                                {!isActive ? (
                                    <Button variant="subtle" className="grow" onClick={() => setActiveId(profile.id)}>
                                        {t('fam.switch')}
                                    </Button>
                                ) : null}
                                <Button variant="secondary" className={isActive ? 'grow' : ''} onClick={() => startEdit(profile)}>
                                    {t('common.edit')}
                                </Button>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <Card>
                <CardHeader
                    title={t('fam.add')}
                    subtitle={atLimit ? t('fam.limit') : undefined}
                    action={
                        <Button onClick={startAdd} disabled={atLimit}>
                            + {t('common.add')}
                        </Button>
                    }
                />
            </Card>

            <Modal
                open={open}
                title={editing ? t('common.edit') : t('fam.add')}
                onClose={() => setOpen(false)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={save} disabled={!draft.name.trim()}>
                            {t('common.save')}
                        </Button>
                    </>
                }
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('common.name')} className="sm:col-span-2">
                        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </Field>
                    <Field label={t('common.phone')}>
                        <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label={t('common.gender')}>
                        <Select value={draft.gender} onChange={(e) => setDraft({ ...draft, gender: e.target.value as Gender })}>
                            <option value="male">{t('common.male')}</option>
                            <option value="female">{t('common.female')}</option>
                        </Select>
                    </Field>
                    <Field label={t('common.birthDate')}>
                        <Input type="date" value={draft.birthDate} onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })} />
                    </Field>
                    <Field label={t('common.job')}>
                        <Input value={draft.job} onChange={(e) => setDraft({ ...draft, job: e.target.value })} />
                    </Field>
                    <Field label={t('common.address')} className="sm:col-span-2">
                        <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
                    </Field>
                </div>
            </Modal>
        </div>
    );
}
