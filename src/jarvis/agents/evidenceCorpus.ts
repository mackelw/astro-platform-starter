import type { EvidenceCitation } from '../types';

/**
 * Seed corpus for Agent 3.
 *
 * ⚠️ Every entry here is a PLACEHOLDER. The titles describe what a real source would need to
 * support; the `source` field deliberately does not name a journal, guideline body or year that
 * could be mistaken for a real citation. Fabricated references are worse than none in a clinical
 * system, so the corpus ships empty of real claims and each record carries `isPlaceholder: true`.
 *
 * Before clinical use, replace this file with a loader for the sources the clinic has chosen and
 * licensed (national guidelines, a systematic-review database, the clinic's own protocols). Any
 * plan built on placeholder evidence is stamped as such in its precautions by Agent 2, and the
 * clinician acceptance gate on that plan is what stops placeholder-backed advice reaching a
 * patient.
 */

function placeholder(citation: Omit<EvidenceCitation, 'isPlaceholder' | 'source'>): EvidenceCitation {
    return { ...citation, source: 'PLACEHOLDER — replace with the clinic’s licensed source', isPlaceholder: true };
}

export const EVIDENCE_CORPUS: readonly EvidenceCitation[] = [
    placeholder({
        id: 'ev-shoulder-loading',
        title: 'Progressive resistance loading for rotator-cuff-related shoulder pain',
        year: 2024,
        sourceType: 'clinical-guideline',
        strength: 'strong',
        summary: 'Supports graded resistance exercise as first-line management for non-traumatic shoulder pain.',
        region: 'shoulder',
        families: ['exercise-therapy', 'load-management'],
        keywords: ['shoulder', 'rotator cuff', 'loading', 'overhead']
    }),
    placeholder({
        id: 'ev-shoulder-manual-adjunct',
        title: 'Manual therapy as a short-term adjunct in shoulder pain',
        year: 2023,
        sourceType: 'systematic-review',
        strength: 'moderate',
        summary: 'Supports manual therapy for short-term symptom relief when combined with exercise, not as a stand-alone.',
        region: 'shoulder',
        families: ['manual-therapy', 'pain-modulation'],
        keywords: ['shoulder', 'manual therapy', 'mobilisation']
    }),
    placeholder({
        id: 'ev-knee-quads',
        title: 'Quadriceps strengthening for patellofemoral and tibiofemoral knee pain',
        year: 2024,
        sourceType: 'clinical-guideline',
        strength: 'strong',
        summary: 'Supports quadriceps and hip strengthening as core management for anterior and medial knee pain.',
        region: 'knee',
        families: ['exercise-therapy'],
        keywords: ['knee', 'quadriceps', 'patellofemoral', 'strength']
    }),
    placeholder({
        id: 'ev-lumbar-activity',
        title: 'Staying active and avoiding bed rest in non-specific low back pain',
        year: 2023,
        sourceType: 'clinical-guideline',
        strength: 'strong',
        summary: 'Supports advice to remain active and resume normal activity as tolerated, over rest.',
        region: 'lumbar-spine',
        families: ['education', 'load-management'],
        keywords: ['back', 'lumbar', 'activity', 'advice']
    }),
    placeholder({
        id: 'ev-lumbar-exercise',
        title: 'Exercise therapy for persistent non-specific low back pain',
        year: 2024,
        sourceType: 'systematic-review',
        strength: 'moderate',
        summary: 'Supports supervised exercise therapy; no single exercise type is clearly superior.',
        region: 'lumbar-spine',
        families: ['exercise-therapy'],
        keywords: ['back', 'lumbar', 'exercise', 'chronic']
    }),
    placeholder({
        id: 'ev-pain-education',
        title: 'Pain-science education alongside active treatment',
        year: 2023,
        sourceType: 'systematic-review',
        strength: 'moderate',
        summary: 'Supports structured explanation of pain and prognosis as an adjunct to active treatment.',
        region: 'general',
        families: ['education'],
        keywords: ['education', 'reassurance', 'prognosis', 'pain']
    }),
    placeholder({
        id: 'ev-irritability-dosing',
        title: 'Symptom-guided dosing in highly irritable presentations',
        year: 2022,
        sourceType: 'clinic-protocol',
        strength: 'limited',
        summary: 'Supports isometric or pain-free-range loading as an entry point when symptoms are easily provoked.',
        region: 'general',
        families: ['exercise-therapy', 'pain-modulation'],
        keywords: ['irritability', 'isometric', 'dosing', 'acute']
    }),
    placeholder({
        id: 'ev-adherence',
        title: 'Adherence strategies for home exercise programmes',
        year: 2023,
        sourceType: 'systematic-review',
        strength: 'moderate',
        summary: 'Supports brief programmes, written or video instruction, and scheduled follow-up to sustain adherence.',
        region: 'general',
        families: ['education', 'load-management'],
        keywords: ['adherence', 'home exercise', 'follow-up']
    }),
    placeholder({
        id: 'ev-hip-strength',
        title: 'Hip abductor strengthening in lower-limb pain presentations',
        year: 2023,
        sourceType: 'systematic-review',
        strength: 'moderate',
        summary: 'Supports hip abductor and external rotator strengthening in knee and hip presentations.',
        region: 'hip',
        families: ['exercise-therapy'],
        keywords: ['hip', 'abductor', 'gluteal', 'strength']
    }),
    placeholder({
        id: 'ev-cervical-exercise',
        title: 'Exercise and mobilisation for non-specific neck pain',
        year: 2024,
        sourceType: 'clinical-guideline',
        strength: 'moderate',
        summary: 'Supports combined exercise and mobilisation over passive treatment alone for neck pain.',
        region: 'cervical-spine',
        families: ['exercise-therapy', 'manual-therapy'],
        keywords: ['neck', 'cervical', 'mobilisation', 'exercise']
    })
];
