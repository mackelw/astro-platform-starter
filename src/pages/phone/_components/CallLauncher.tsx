import { useEffect, useState } from 'react';

const TOKEN_STORAGE_KEY = 'voice-api-token';

interface CallResult {
    callSid: string;
    briefId: string;
}

export default function CallLauncher() {
    const [token, setToken] = useState('');
    const [to, setTo] = useState('');
    const [brief, setBrief] = useState('');
    const [dialing, setDialing] = useState(false);
    const [result, setResult] = useState<CallResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // The operator token is deliberately never baked into the bundle — it is typed
    // in here and kept for the tab's lifetime only.
    useEffect(() => {
        setToken(sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? '');
    }, []);

    const updateToken = (value: string) => {
        setToken(value);
        sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    };

    const placeCall = async () => {
        setDialing(true);
        setError(null);
        setResult(null);
        try {
            const response = await fetch('/api/voice/call', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ to, brief })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data.error ?? `Request failed with status ${response.status}`);
                return;
            }
            setResult(data as CallResult);
        } catch (requestError) {
            setError((requestError as Error).message);
        } finally {
            setDialing(false);
        }
    };

    const ready = token.trim() !== '' && to.trim() !== '' && brief.trim() !== '';

    return (
        <div className="flex flex-col gap-4 p-6 bg-white/5 rounded-lg">
            <label className="flex flex-col gap-2">
                <span className="font-semibold">Operator token</span>
                <span className="text-sm opacity-70">The value of your VOICE_API_TOKEN environment variable. Kept in this tab only.</span>
                <input
                    type="password"
                    className="px-3 py-2 text-gray-900 rounded"
                    value={token}
                    onChange={(event) => updateToken(event.target.value)}
                    autoComplete="off"
                />
            </label>

            <label className="flex flex-col gap-2">
                <span className="font-semibold">Number to call</span>
                <input
                    type="tel"
                    className="px-3 py-2 text-gray-900 rounded"
                    placeholder="+201234567890"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    dir="ltr"
                />
            </label>

            <label className="flex flex-col gap-2">
                <span className="font-semibold">Why is the agent calling?</span>
                <span className="text-sm opacity-70">The agent introduces itself and works toward this on the call.</span>
                <textarea
                    className="px-3 py-2 text-gray-900 rounded"
                    rows={4}
                    placeholder="Confirm tomorrow's 4pm dentist appointment for Mr. Ahmed, and reschedule to Thursday if it is not available."
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                />
            </label>

            <div>
                <button className="btn" onClick={placeCall} disabled={!ready || dialing}>
                    {dialing ? 'Dialing…' : 'Place call'}
                </button>
            </div>

            {result && (
                <p className="text-sm">
                    Call placed. SID <code>{result.callSid}</code>
                </p>
            )}
            {error && <p className="text-sm text-primary">{error}</p>}
        </div>
    );
}
