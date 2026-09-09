import { getCollection, type CollectionEntry } from 'astro:content';
import { defaultLang, type Lang } from './ui';

type Named = 'services' | 'conditions' | 'exercises';

/**
 * معرّف الملف يأتي على الشكل "ar/low-back-pain"، فالجزء الأول هو اللغة
 * والباقي هو الرابط. نفس الرابط موجود في اللغتين فيعمل زر التبديل تلقائيًا.
 */
export function slugOf(entry: { id: string }): string {
    return entry.id.split('/').slice(1).join('/');
}

export function langOf(entry: { id: string }): Lang {
    const [first] = entry.id.split('/');
    return first === 'en' ? 'en' : 'ar';
}

/** كل عناصر المجموعة بلغة واحدة، مرتبة بحقل order ثم بالعنوان */
export async function entriesFor<C extends Named>(collection: C, lang: Lang): Promise<CollectionEntry<C>[]> {
    const all = await getCollection(collection, (entry: { id: string }) => langOf(entry) === lang);
    return all.sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

/** عنصر واحد بالرابط واللغة، أو undefined إن لم يوجد */
export async function entryFor<C extends Named>(collection: C, lang: Lang, slug: string): Promise<CollectionEntry<C> | undefined> {
    const list = await entriesFor(collection, lang);
    return list.find((entry) => slugOf(entry) === slug);
}

/** مسارات getStaticPaths لمجموعة بلغة واحدة */
export async function pathsFor<C extends Named>(collection: C, lang: Lang) {
    const list = await entriesFor(collection, lang);
    return list.map((entry) => ({ params: { slug: slugOf(entry) }, props: { entry } }));
}

/** يبني خريطة رابط → عنوان، لعرض الخدمات والتمارين المرتبطة داخل صفحة حالة */
export async function titleMap<C extends Named>(collection: C, lang: Lang): Promise<Map<string, string>> {
    const list = await entriesFor(collection, lang);
    return new Map(list.map((entry) => [slugOf(entry), entry.data.title]));
}

export { defaultLang };
