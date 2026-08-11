// Pinned to UTC and Latin digits so the server-rendered island markup and the
// client-hydrated markup agree — otherwise React reports a hydration mismatch.
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
});

export function formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}
