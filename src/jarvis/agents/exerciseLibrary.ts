import type { ExerciseAsset, ExerciseLibraryService } from '../types';

/**
 * Sample exercise assets and the library service Agent 4 searches.
 *
 * `clinic-library` entries stand in for the clinic's own filmed exercises; `licensed-catalogue`
 * entries stand in for the bought-in fallback. Point `createExerciseLibrary` at the real catalogue
 * when it exists — the interface is what Agent 4 depends on, not this data.
 *
 * Video URLs here are placeholders under the clinic's own domain and resolve to nothing.
 */
export const SAMPLE_EXERCISE_ASSETS: readonly ExerciseAsset[] = [
    {
        id: 'ex-sh-pendulum',
        name: 'Pendulum swing',
        region: 'shoulder',
        targets: ['shoulder-range'],
        equipment: [],
        dosing: 'sets-reps',
        difficulty: 1,
        videoUrl: 'https://clinic.example/library/shoulder-pendulum',
        source: 'clinic-library',
        contraindications: ['acute-fracture']
    },
    {
        id: 'ex-sh-isometric-er',
        name: 'Isometric external rotation at the door frame',
        region: 'shoulder',
        targets: ['rotator-cuff-strength', 'pain-modulation'],
        equipment: [],
        dosing: 'sets-reps',
        difficulty: 2,
        videoUrl: 'https://clinic.example/library/shoulder-isometric-er',
        source: 'clinic-library',
        contraindications: []
    },
    {
        id: 'ex-sh-band-row',
        name: 'Banded row with scapular set',
        region: 'shoulder',
        targets: ['scapular-control', 'shoulder-strength'],
        equipment: ['resistance band'],
        dosing: 'sets-reps',
        difficulty: 3,
        videoUrl: 'https://clinic.example/library/shoulder-band-row',
        source: 'clinic-library',
        contraindications: []
    },
    {
        id: 'ex-sh-wall-slide',
        name: 'Wall slide into elevation',
        region: 'shoulder',
        targets: ['shoulder-range', 'scapular-control'],
        equipment: [],
        dosing: 'sets-reps',
        difficulty: 2,
        videoUrl: 'https://clinic.example/library/shoulder-wall-slide',
        source: 'clinic-library',
        contraindications: []
    },
    {
        id: 'ex-kn-sit-to-stand',
        name: 'Sit to stand',
        region: 'knee',
        targets: ['quadriceps-strength', 'knee-strength'],
        equipment: ['chair'],
        dosing: 'sets-reps',
        difficulty: 2,
        videoUrl: 'https://clinic.example/library/knee-sit-to-stand',
        source: 'clinic-library',
        contraindications: []
    },
    {
        id: 'ex-hip-abduction',
        name: 'Side-lying hip abduction',
        region: 'hip',
        targets: ['hip-abductor-strength'],
        equipment: [],
        dosing: 'sets-reps',
        difficulty: 2,
        videoUrl: 'https://clinic.example/library/hip-abduction',
        source: 'clinic-library',
        contraindications: []
    },
    {
        id: 'ex-lx-hip-hinge',
        name: 'Hip hinge pattern',
        region: 'lumbar-spine',
        targets: ['lumbar-strength', 'motor-control'],
        equipment: [],
        dosing: 'sets-reps',
        difficulty: 3,
        videoUrl: 'https://clinic.example/library/lumbar-hip-hinge',
        source: 'clinic-library',
        contraindications: []
    },
    {
        id: 'cat-sh-full-can',
        name: 'Full-can raise with dumbbell',
        region: 'shoulder',
        targets: ['shoulder-strength', 'rotator-cuff-strength'],
        equipment: ['dumbbell'],
        dosing: 'sets-reps',
        difficulty: 4,
        videoUrl: 'https://catalogue.example/shoulder-full-can',
        source: 'licensed-catalogue',
        contraindications: []
    },
    {
        id: 'cat-general-walking',
        name: 'Graded walking programme',
        region: 'general',
        targets: ['activity-tolerance'],
        equipment: [],
        dosing: 'duration',
        difficulty: 1,
        videoUrl: 'https://catalogue.example/graded-walking',
        source: 'licensed-catalogue',
        contraindications: []
    },
    {
        id: 'cat-cx-deep-flexor',
        name: 'Deep neck flexor hold',
        region: 'cervical-spine',
        targets: ['neck-endurance', 'motor-control'],
        equipment: [],
        dosing: 'sets-reps',
        difficulty: 2,
        videoUrl: 'https://catalogue.example/deep-neck-flexor',
        source: 'licensed-catalogue',
        contraindications: []
    }
];

/**
 * Prefers the clinic's own material: for equal target coverage a clinic asset always outranks a
 * catalogue one, which is what makes the coverage-gap report meaningful.
 */
export function createExerciseLibrary(assets: readonly ExerciseAsset[] = SAMPLE_EXERCISE_ASSETS): ExerciseLibraryService {
    return {
        async search({ region, targets, maxDifficulty, exclude = [] }) {
            return assets
                .filter((asset) => asset.region === region || asset.region === 'general')
                .filter((asset) => asset.difficulty <= maxDifficulty)
                .filter((asset) => !asset.contraindications.some((item) => exclude.includes(item)))
                .map((asset) => ({ asset, hits: asset.targets.filter((target) => targets.includes(target)).length }))
                .filter((entry) => entry.hits > 0)
                .sort(
                    (a, b) =>
                        b.hits - a.hits ||
                        Number(a.asset.source !== 'clinic-library') - Number(b.asset.source !== 'clinic-library') ||
                        b.asset.difficulty - a.asset.difficulty
                )
                .map((entry) => entry.asset);
        }
    };
}
