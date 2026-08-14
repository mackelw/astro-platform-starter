/**
 * Payroll engine.
 *
 * Net pay = base salary + (completed shifts x shift rate)
 *         + commission on sessions the staff member ran
 *         + bonuses - deductions.
 */

import type { Adjustment, Attendance, PublicUser, Session } from './models';

export interface PayrollRow {
    userId: string;
    name: string;
    role: string;
    employmentType: string;
    baseSalary: number;
    shifts: number;
    shiftRate: number;
    shiftPay: number;
    sessionCount: number;
    commissionPct: number;
    commission: number;
    bonuses: number;
    deductions: number;
    gross: number;
    net: number;
}

/** `month` is YYYY-MM. */
export function computePayroll(
    month: string,
    staff: PublicUser[],
    attendance: Attendance[],
    sessions: Session[],
    adjustments: Adjustment[]
): PayrollRow[] {
    return staff.map((user) => {
        const shifts = attendance
            .filter((a) => a.userId === user.id && a.day.startsWith(month))
            .reduce((sum, a) => sum + a.shifts, 0);

        const own = sessions.filter((s) => s.doctorId === user.id && s.date.startsWith(month));
        const feeTotal = own.reduce((sum, s) => sum + (s.fee || 0), 0);
        const commission = round(feeTotal * (user.commissionPct / 100));

        const mine = adjustments.filter((a) => a.userId === user.id && a.month === month);
        const bonuses = mine.filter((a) => a.kind === 'bonus').reduce((sum, a) => sum + a.amount, 0);
        const deductions = mine.filter((a) => a.kind === 'deduction').reduce((sum, a) => sum + a.amount, 0);

        const shiftPay = round(shifts * user.shiftRate);
        const gross = round(user.baseSalary + shiftPay + commission + bonuses);

        return {
            userId: user.id,
            name: user.name,
            role: user.role,
            employmentType: user.employmentType,
            baseSalary: user.baseSalary,
            shifts,
            shiftRate: user.shiftRate,
            shiftPay,
            sessionCount: own.length,
            commissionPct: user.commissionPct,
            commission,
            bonuses,
            deductions,
            gross,
            net: round(gross - deductions)
        };
    });
}

export function payrollToCsv(rows: PayrollRow[], month: string): string {
    const header = [
        'Month',
        'Name',
        'Role',
        'Employment',
        'Base Salary',
        'Shifts',
        'Shift Rate',
        'Shift Pay',
        'Sessions',
        'Commission %',
        'Commission',
        'Bonuses',
        'Deductions',
        'Gross',
        'Net'
    ];
    const lines = rows.map((r) =>
        [
            month,
            r.name,
            r.role,
            r.employmentType,
            r.baseSalary,
            r.shifts,
            r.shiftRate,
            r.shiftPay,
            r.sessionCount,
            r.commissionPct,
            r.commission,
            r.bonuses,
            r.deductions,
            r.gross,
            r.net
        ]
            .map(csvCell)
            .join(',')
    );
    return [header.join(','), ...lines].join('\n');
}

function csvCell(value: string | number): string {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function round(n: number): number {
    return Math.round(n * 100) / 100;
}
