import type { AngleSeries } from './angles';
import type { Calibration, KinematicSeries, Track } from './types';
import { pixelsPerMetre, realTimeScale } from './kinematics';

/**
 * Export helpers. The whole point of an analysis session is the numbers that
 * come out of it, so everything the app computes can leave as CSV for a
 * spreadsheet or as JSON for a re-import.
 */

function csvEscape(value: string | number): string {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: (string | number)[][]): string {
    // BOM so Excel opens UTF-8 Arabic labels correctly instead of mojibake.
    return '﻿' + [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function kinematicsToCsv(series: KinematicSeries[]): string {
    const unit = series[0]?.calibrated ? 'm' : 'px';
    const header = [
        'track_id',
        'label',
        'time_s',
        `x_px`,
        `y_px`,
        `vx_${unit}_per_s`,
        `vy_${unit}_per_s`,
        `speed_${unit}_per_s`,
        'speed_kmh',
        `accel_${unit}_per_s2`,
        `distance_${unit}`,
        'heading_deg'
    ];
    const rows: (string | number)[][] = [];
    for (const s of series) {
        for (const k of s.samples) {
            rows.push([
                s.trackId,
                s.label,
                k.t.toFixed(4),
                k.x.toFixed(2),
                k.y.toFixed(2),
                k.vx.toFixed(4),
                k.vy.toFixed(4),
                k.speed.toFixed(4),
                s.calibrated ? (k.speed * 3.6).toFixed(3) : '',
                k.accel.toFixed(4),
                k.distance.toFixed(4),
                k.heading.toFixed(2)
            ]);
        }
    }
    return toCsv(header, rows);
}

export function anglesToCsv(series: AngleSeries[]): string {
    const header = ['label', 'time_s', 'media_time_s', 'angle_deg', 'angular_velocity_deg_per_s'];
    const rows: (string | number)[][] = [];
    for (const s of series) {
        for (const k of s.samples) {
            rows.push([s.label, k.t.toFixed(4), k.mediaT.toFixed(4), k.angle.toFixed(2), k.angularVelocity.toFixed(2)]);
        }
    }
    return toCsv(header, rows);
}

export function tracksToCsv(tracks: Track[]): string {
    const header = ['track_id', 'label', 'source', 'media_time_s', 'x_px', 'y_px', 'w_px', 'h_px', 'score', 'predicted'];
    const rows: (string | number)[][] = [];
    for (const t of tracks) {
        for (const s of t.samples) {
            rows.push([
                t.id,
                t.label,
                t.source,
                s.t.toFixed(4),
                s.x.toFixed(2),
                s.y.toFixed(2),
                s.w.toFixed(2),
                s.h.toFixed(2),
                s.score.toFixed(3),
                s.predicted ? 1 : 0
            ]);
        }
    }
    return toCsv(header, rows);
}

export interface SessionSummary {
    source: string;
    videoWidth: number;
    videoHeight: number;
    calibration: Calibration;
    pixelsPerMetre: number | null;
    realTimeScale: number;
    tracks: Track[];
    angles: AngleSeries[];
    kinematics: KinematicSeries[];
}

export function sessionToJson(summary: SessionSummary): string {
    return JSON.stringify(
        {
            exportedAt: new Date().toISOString(),
            tool: 'Motion Studio — DJI Osmo Pocket 3',
            source: summary.source,
            video: { width: summary.videoWidth, height: summary.videoHeight },
            calibration: {
                ...summary.calibration,
                pixelsPerMetre: summary.pixelsPerMetre,
                realTimeScale: summary.realTimeScale
            },
            tracks: summary.tracks,
            angles: summary.angles,
            kinematics: summary.kinematics
        },
        null,
        2
    );
}

export function buildSessionSummary(
    source: string,
    videoWidth: number,
    videoHeight: number,
    cal: Calibration,
    tracks: Track[],
    angles: AngleSeries[],
    kinematics: KinematicSeries[]
): SessionSummary {
    return {
        source,
        videoWidth,
        videoHeight,
        calibration: cal,
        pixelsPerMetre: pixelsPerMetre(cal),
        realTimeScale: realTimeScale(cal),
        tracks,
        angles,
        kinematics
    };
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
    const blob = new Blob([text], { type: mime });
    downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download in some browsers; one tick
    // of slack is enough for the navigation to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampedName(prefix: string, ext: string): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
}
