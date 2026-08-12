import React, { useState } from 'react';
import { StudioProvider } from './store';
import { VideoStage } from './VideoStage';
import { Results } from './Results';
import { AnglesPanel, DetectionPanel, ExportPanel, SourcePanel, StatsPanel, TipsPanel, ToolsPanel, TracksPanel } from './panels';

/**
 * Studio shell.
 *
 * Layout is video-first: the picture and its overlay take the width they can
 * get, controls sit in a single scrollable column beside it, and the numbers
 * live below both. The side column is tabbed because the full control surface
 * is far longer than any screen, and an analyst works in one mode at a time.
 */
type Tab = 'source' | 'detect' | 'measure' | 'export';

const TABS: { id: Tab; label: string }[] = [
    { id: 'source', label: 'المصدر' },
    { id: 'detect', label: 'الكشف' },
    { id: 'measure', label: 'القياس' },
    { id: 'export', label: 'التصدير' }
];

export default function MotionStudio(): React.ReactElement {
    return (
        <StudioProvider>
            <StudioLayout />
        </StudioProvider>
    );
}

function StudioLayout(): React.ReactElement {
    const [tab, setTab] = useState<Tab>('source');

    return (
        <div dir="rtl" className="flex flex-col gap-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex flex-col gap-4">
                    <VideoStage />
                    <StatsPanel />
                </div>

                <aside className="flex flex-col gap-3">
                    <nav className="flex gap-1 rounded-md bg-black/25 p-1" aria-label="أقسام التحكّم">
                        {TABS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                aria-current={tab === t.id ? 'page' : undefined}
                                className={`grow rounded px-2 py-2 text-xs font-semibold transition-colors ${
                                    tab === t.id ? 'bg-primary text-primary-content' : 'text-white/70 hover:bg-white/10'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </nav>

                    <div className="flex flex-col gap-3">
                        {tab === 'source' && (
                            <>
                                <SourcePanel />
                                <TipsPanel />
                            </>
                        )}
                        {tab === 'detect' && (
                            <>
                                <ToolsPanel />
                                <DetectionPanel />
                            </>
                        )}
                        {tab === 'measure' && (
                            <>
                                <ToolsPanel />
                                <TracksPanel />
                                <AnglesPanel />
                            </>
                        )}
                        {tab === 'export' && (
                            <>
                                <ExportPanel />
                                <TracksPanel />
                            </>
                        )}
                    </div>
                </aside>
            </div>

            <Results />
        </div>
    );
}
