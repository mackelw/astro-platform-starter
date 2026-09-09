import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** مناطق الجسم التي تُصنَّف عليها التمارين وتُبنى منها فلاتر الصفحة */
export const bodyAreas = ['neck', 'back', 'shoulder', 'knee', 'hip', 'ankle'] as const;

/**
 * المحتوى مكتوب مرتين: ar/ و en/ داخل كل مجموعة، وبنفس اسم الملف
 * حتى يتطابق الرابطان ويعمل زر تبديل اللغة بلا جداول ربط.
 */
const services = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/services' }),
    schema: z.object({
        title: z.string(),
        summary: z.string(),
        duration: z.number(),
        price: z.number(),
        icon: z.string().default('✚'),
        order: z.number().default(99)
    })
});

const conditions = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/conditions' }),
    schema: z.object({
        title: z.string(),
        summary: z.string(),
        symptoms: z.array(z.string()).default([]),
        treatments: z.array(z.string()).default([]),
        relatedServices: z.array(z.string()).default([]),
        relatedExercises: z.array(z.string()).default([]),
        order: z.number().default(99)
    })
});

const exercises = defineCollection({
    loader: glob({ pattern: '**/*.md', base: './src/content/exercises' }),
    schema: z.object({
        title: z.string(),
        summary: z.string(),
        bodyArea: z.enum(bodyAreas),
        difficulty: z.enum(['easy', 'medium', 'hard']).default('easy'),
        sets: z.number().default(3),
        reps: z.number().default(10),
        hold: z.string().default(''),
        equipment: z.array(z.string()).default([]),
        cautions: z.string().default(''),
        order: z.number().default(99)
    })
});

export const collections = { services, conditions, exercises };
