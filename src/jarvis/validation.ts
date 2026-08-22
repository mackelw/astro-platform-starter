/**
 * Boundary validation shared by every module.
 *
 * Modules never import each other; shared helpers live here so that a module's only dependencies
 * are the types, the store it is handed, and this file.
 */

/** Thrown by a module's `parse`. The orchestrator turns it into a `rejected` outcome. */
export class InputValidationError extends Error {
    constructor(readonly errors: string[]) {
        super(`Invalid input: ${errors.join('; ')}`);
        this.name = 'InputValidationError';
    }
}

export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Collects `field is required` errors for a set of string fields, returning the errors found. */
export function requireStrings(input: Record<string, unknown>, fields: string[]): string[] {
    return fields.filter((field) => typeof input[field] !== 'string' || !(input[field] as string).length).map((field) => `${field} is required`);
}
