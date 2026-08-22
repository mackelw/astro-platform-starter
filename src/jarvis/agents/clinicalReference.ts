import type { AssessmentRecord, BodyRegion, Joint, Movement, RedFlagHit } from '../types';

/**
 * Clinic-configurable clinical reference data used by Agent 1.
 *
 * These are defaults, not truth. A clinic should review both tables against its own protocols
 * before go-live; every value here is advisory input to a clinician, never an output to a patient.
 */

export interface RedFlagDefinition extends RedFlagHit {
    /** The intake question whose answer sets this flag, stored in `history.screening`. */
    question: string;
}

export const DEFAULT_RED_FLAGS: readonly RedFlagDefinition[] = [
    {
        id: 'cauda-equina',
        label: 'Possible cauda equina syndrome',
        question: 'Any saddle numbness, or new bladder/bowel control changes?',
        action: 'Stop assessment. Same-day emergency referral.',
        urgency: 'same-day'
    },
    {
        id: 'progressive-neuro-deficit',
        label: 'Progressive neurological deficit',
        question: 'Is weakness, numbness or pins and needles getting worse?',
        action: 'Escalate to the treating clinician before any exercise is prescribed.',
        urgency: 'urgent-referral'
    },
    {
        id: 'unexplained-weight-loss',
        label: 'Unexplained weight loss',
        question: 'Any unexplained weight loss in the last three months?',
        action: 'Route to GP for investigation alongside physiotherapy.',
        urgency: 'urgent-referral'
    },
    {
        id: 'cancer-history',
        label: 'History of malignancy with new skeletal pain',
        question: 'Any previous cancer diagnosis?',
        action: 'Route to GP for investigation alongside physiotherapy.',
        urgency: 'urgent-referral'
    },
    {
        id: 'unremitting-night-pain',
        label: 'Unremitting night pain',
        question: 'Does the pain wake you and stay regardless of position?',
        action: 'Escalate to the treating clinician for screening before planning.',
        urgency: 'urgent-referral'
    },
    {
        id: 'infection-signs',
        label: 'Signs of infection',
        question: 'Any fever, chills or night sweats with this pain?',
        action: 'Same-day medical review.',
        urgency: 'same-day'
    },
    {
        id: 'significant-trauma',
        label: 'Significant trauma or inability to weight-bear',
        question: 'Was there a fall or impact, or can you not put weight through the limb?',
        action: 'Fracture screening before any loading.',
        urgency: 'same-day'
    },
    {
        id: 'systemic-steroid-use',
        label: 'Long-term corticosteroid use',
        question: 'Long-term steroid use?',
        action: 'Consider fragility fracture risk when selecting loading.',
        urgency: 'routine-referral'
    }
];

/** Active range of motion, degrees, adult normative defaults. */
export const NORMATIVE_ROM: Readonly<Record<string, number>> = {
    'cervical-spine:flexion': 50,
    'cervical-spine:extension': 60,
    'cervical-spine:internal-rotation': 80,
    'cervical-spine:external-rotation': 80,
    'lumbar-spine:flexion': 60,
    'lumbar-spine:extension': 25,
    'shoulder:flexion': 180,
    'shoulder:extension': 60,
    'shoulder:abduction': 180,
    'shoulder:internal-rotation': 70,
    'shoulder:external-rotation': 90,
    'elbow:flexion': 145,
    'elbow:extension': 0,
    'wrist:flexion': 80,
    'wrist:extension': 70,
    'hip:flexion': 120,
    'hip:extension': 20,
    'hip:abduction': 45,
    'hip:adduction': 30,
    'hip:internal-rotation': 40,
    'hip:external-rotation': 45,
    'knee:flexion': 135,
    'knee:extension': 0,
    'ankle:dorsiflexion': 20,
    'ankle:plantarflexion': 50
};

export function normativeRange(joint: Joint, movement: Movement): number | undefined {
    return NORMATIVE_ROM[`${joint}:${movement}`];
}

const REGION_KEYWORDS: ReadonlyArray<[BodyRegion, string[]]> = [
    ['shoulder', ['shoulder', 'rotator', 'overhead']],
    ['knee', ['knee', 'patell', 'meniscus']],
    ['lumbar-spine', ['back', 'lumbar', 'sciatic']],
    ['cervical-spine', ['neck', 'cervical']],
    ['hip', ['hip', 'groin', 'gluteal']],
    ['ankle', ['ankle', 'achilles', 'calf']],
    ['elbow', ['elbow', 'epicondyl']],
    ['wrist', ['wrist', 'hand']]
];

/**
 * The region an episode is about: the largest measured restriction, falling back to the complaint
 * text. Shared by planning and exercise prescription so both read the same episode the same way.
 */
export function inferRegion(assessment: AssessmentRecord): BodyRegion {
    const [largestDeficit] = assessment.findings.romDeficits;
    if (largestDeficit) return largestDeficit.joint;

    const complaint = assessment.input.history.presentingComplaint.toLowerCase();
    for (const [region, keywords] of REGION_KEYWORDS) {
        if (keywords.some((keyword) => complaint.includes(keyword))) return region;
    }
    return 'general';
}
