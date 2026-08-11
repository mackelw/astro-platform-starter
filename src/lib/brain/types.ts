export type Note = {
    id: string;
    title: string;
    body: string;
    tags: string[];
    url?: string;
    linksTo: string[];
    createdAt: string;
    updatedAt: string;
};

// What the index blob holds: everything but the (potentially long) body.
export type NoteSummary = Omit<Note, 'body'> & {
    excerpt: string;
};

export type NoteInput = {
    title?: string;
    body?: string;
    tags?: string[] | string;
    url?: string;
};
