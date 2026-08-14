/**
 * Storage driver for Kartos.
 *
 * Uses Netlify Blobs when the runtime provides it (deployed, or `netlify dev`),
 * and falls back to a JSON file under `.data/` so `astro dev` works standalone.
 * Every collection is a single JSON document keyed by name — fine at clinic
 * scale (thousands of rows), and swappable for Postgres behind this interface.
 */

import { getStore } from '@netlify/blobs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORE_NAME = 'kartos';
const LOCAL_DIR = path.join(process.cwd(), '.data');

type Driver = {
    read(key: string): Promise<string | null>;
    write(key: string, value: string): Promise<void>;
};

let driver: Driver | null = null;

function localDriver(): Driver {
    return {
        async read(key) {
            try {
                return await readFile(path.join(LOCAL_DIR, `${key}.json`), 'utf8');
            } catch {
                return null;
            }
        },
        async write(key, value) {
            await mkdir(LOCAL_DIR, { recursive: true });
            await writeFile(path.join(LOCAL_DIR, `${key}.json`), value, 'utf8');
        }
    };
}

function blobDriver(): Driver | null {
    try {
        const store = getStore({ name: STORE_NAME, consistency: 'strong' });
        return {
            read: (key) => store.get(key, { type: 'text' }),
            write: (key, value) => store.set(key, value)
        };
    } catch {
        return null;
    }
}

function getDriver(): Driver {
    if (!driver) driver = blobDriver() ?? localDriver();
    return driver;
}

/** Serializes writes per collection so concurrent requests don't clobber each other. */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    locks.set(
        key,
        next.catch(() => undefined)
    );
    return next;
}

export async function readCollection<T>(name: string): Promise<T[]> {
    const raw = await getDriver().read(name);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function writeCollection<T>(name: string, rows: T[]): Promise<void> {
    await getDriver().write(name, JSON.stringify(rows));
}

/** Read-modify-write a collection under a lock. */
export async function mutate<T, R>(name: string, fn: (rows: T[]) => R | Promise<R>): Promise<R> {
    return withLock(name, async () => {
        const rows = await readCollection<T>(name);
        const result = await fn(rows);
        await writeCollection(name, rows);
        return result;
    });
}

export function id(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Human-facing sequential-ish code, e.g. PAT-8597. */
export function shortCode(prefix: string): string {
    return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}
