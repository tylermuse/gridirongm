'use client';

import { useMemo, useState, type ReactNode } from 'react';

// Shape returned by admin_interaction_report (supabase/migrations/20261024_ui_interactions.sql)
export interface InteractionReport {
  totals: { clicks: number; hovers: number; changes: number; rageClicks: number; deadClicks: number; devices: number; activeHours: number };
  features: {
    feature: string; devices: number; users: number; clicks: number; hovers: number; changes: number;
    rage: number; dead: number; activeMs: number; visibleMs: number; returningDevices: number;
  }[];
  elements: { feature: string; area: string; target: string; clicks: number; clickDevices: number; hoverDevices: number; rage: number; dead: number }[];
  frustration: { feature: string; area: string; target: string; clicks: number; rage: number; dead: number }[];
  hoverNoClick: { feature: string; target: string; hovered: number; hoveredOnly: number }[];
  changes: { feature: string; target: string; value: string; count: number; devices: number }[];
}

type FeatureRow = InteractionReport['features'][number] & {
  reach: number; returnRate: number; clicksPerDevice: number; activeMinPerDevice: number; frustrationPer100: number;
};
type SortKey = 'devices' | 'reach' | 'returnRate' | 'clicksPerDevice' | 'activeMinPerDevice' | 'frustrationPer100';

const FEATURE_COLUMNS: { key: SortKey; label: string; help: string; fmt: (r: FeatureRow) => string }[] = [
  { key: 'devices', label: 'Devices', help: 'used it in the window', fmt: r => r.devices.toLocaleString() },
  { key: 'reach', label: 'Reach', help: 'share of all interacting devices', fmt: r => `${r.reach.toFixed(0)}%` },
  { key: 'returnRate', label: 'Came back', help: 'used it on 2+ separate days', fmt: r => `${r.returnRate.toFixed(0)}%` },
  { key: 'clicksPerDevice', label: 'Clicks / device', help: 'depth of use', fmt: r => r.clicksPerDevice.toFixed(1) },
  { key: 'activeMinPerDevice', label: 'Active min / device', help: 'visible + input in the last minute', fmt: r => r.activeMinPerDevice.toFixed(1) },
  { key: 'frustrationPer100', label: 'Frustration', help: 'rage + dead clicks per 100 clicks', fmt: r => r.clicks ? r.frustrationPer100.toFixed(1) : '—' },
];

const PAGE_SIZE = 25;

export function InteractionsSection({ r, period, error }: { r: InteractionReport | null; period: string; error?: string }) {
  const [sort, setSort] = useState<SortKey>('devices');
  const [feature, setFeature] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const features = useMemo<FeatureRow[]>(() => {
    if (!r) return [];
    const total = Math.max(1, r.totals.devices);
    return r.features
      .map(f => ({
        ...f,
        reach: (f.devices / total) * 100,
        returnRate: f.devices ? (f.returningDevices / f.devices) * 100 : 0,
        clicksPerDevice: f.devices ? f.clicks / f.devices : 0,
        activeMinPerDevice: f.devices ? f.activeMs / f.devices / 60000 : 0,
        frustrationPer100: f.clicks ? ((f.rage + f.dead) / f.clicks) * 100 : 0,
      }))
      .sort((a, b) => b[sort] - a[sort]);
  }, [r, sort]);

  const elements = useMemo(() => {
    if (!r) return [];
    const q = query.trim().toLowerCase();
    return r.elements.filter(e =>
      (feature === 'all' || e.feature === feature) && (!q || e.target.toLowerCase().includes(q)));
  }, [r, feature, query]);

  if (!r && error && !/does not exist|Could not find the function/i.test(error)) {
    return (
      <Card title="Feature Usage & Interactions">
        <p className="text-sm text-amber-700">Couldn&rsquo;t load: {error}</p>
      </Card>
    );
  }

  if (!r) {
    return (
      <Card title="Feature Usage & Interactions">
        <p className="text-sm text-gray-500">
          The report function isn&rsquo;t in the database yet. Run{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">supabase/migrations/20261024_ui_interactions.sql</code> in the Supabase SQL editor.
        </p>
      </Card>
    );
  }

  if (r.totals.clicks + r.totals.hovers === 0) {
    return (
      <Card title="Feature Usage & Interactions">
        <p className="text-sm text-gray-500">No interaction events in the last {period} yet. Capture starts as soon as the tracking deploy is live.</p>
      </Card>
    );
  }

  const shown = showAll ? elements : elements.slice(0, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Feature usage · last {period}</h2>
        <p className="text-xs text-gray-400 mb-3">
          Captured automatically from every click, hover (mouse only, 600ms+), and setting change. Admin pages are excluded.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Stat label="Clicks" value={r.totals.clicks} />
          <Stat label="Hovers" value={r.totals.hovers} />
          <Stat label="Setting changes" value={r.totals.changes} />
          <Stat label="Active hours" value={r.totals.activeHours} />
          <Stat label="Rage clicks" value={r.totals.rageClicks} tone={r.totals.rageClicks > 0 ? 'bad' : undefined} />
          <Stat label="Dead clicks" value={r.totals.deadClicks} tone={r.totals.deadClicks > 0 ? 'bad' : undefined} />
        </div>
      </div>

      <Card title="Features ranked" sub="Click a column to re-rank. Click a feature to filter the element list below.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium pb-2 pr-4">Feature</th>
                {FEATURE_COLUMNS.map(c => (
                  <th key={c.key} className="text-right font-medium pb-2 pl-3 whitespace-nowrap">
                    <button
                      onClick={() => setSort(c.key)}
                      title={c.help}
                      className={sort === c.key ? 'text-gray-900 font-bold' : 'hover:text-gray-700'}
                    >
                      {c.label}{sort === c.key ? ' ↓' : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map(f => (
                <tr
                  key={f.feature}
                  onClick={() => { setFeature(f.feature === feature ? 'all' : f.feature); setShowAll(false); }}
                  className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${f.feature === feature ? 'bg-blue-50' : ''}`}
                >
                  <td className="py-1.5 pr-4 font-medium text-gray-800">{featurePath(f.feature)}</td>
                  {FEATURE_COLUMNS.map(c => (
                    <td
                      key={c.key}
                      className={`py-1.5 pl-3 text-right tabular-nums ${
                        c.key === 'frustrationPer100' && f.frustrationPer100 >= 5 ? 'text-red-600 font-semibold' : 'text-gray-700'
                      }`}
                    >
                      {c.fmt(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Most-used controls"
        sub="Labels collapse numbers to # so “Sim Week 5” and “Sim Week 6” count together."
        right={
          <div className="flex gap-2">
            <select
              value={feature}
              onChange={e => { setFeature(e.target.value); setShowAll(false); }}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
              data-track-ignore
            >
              <option value="all">All features</option>
              {r.features.map(f => <option key={f.feature} value={f.feature}>{featurePath(f.feature)}</option>)}
            </select>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search labels"
              className="text-xs border border-gray-200 rounded-md px-2 py-1 w-36"
              data-track-ignore
            />
          </div>
        }
      >
        {elements.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">No matching controls</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left font-medium pb-2 pr-4">Control</th>
                  <th className="text-left font-medium pb-2 pr-4">Feature</th>
                  <th className="text-right font-medium pb-2 pl-3">Clicks</th>
                  <th className="text-right font-medium pb-2 pl-3">Devices</th>
                  <th className="text-right font-medium pb-2 pl-3" title="devices that rested the mouse on it">Hovered by</th>
                  <th className="text-right font-medium pb-2 pl-3">Rage</th>
                  <th className="text-right font-medium pb-2 pl-3">Dead</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={`${e.feature}|${e.area}|${e.target}|${i}`} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 max-w-[320px]">
                      <div className="truncate text-gray-800" title={e.target}>{e.target}</div>
                      <div className="text-[11px] text-gray-400">{e.area}</div>
                    </td>
                    <td className="py-1.5 pr-4 text-gray-500">{featurePath(e.feature)}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{e.clicks.toLocaleString()}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{e.clickDevices.toLocaleString()}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums text-gray-500">{e.hoverDevices.toLocaleString()}</td>
                    <td className={`py-1.5 pl-3 text-right tabular-nums ${e.rage ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>{e.rage}</td>
                    <td className={`py-1.5 pl-3 text-right tabular-nums ${e.dead ? 'text-amber-600 font-semibold' : 'text-gray-300'}`}>{e.dead}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {elements.length > PAGE_SIZE && (
              <button onClick={() => setShowAll(s => !s)} className="mt-3 text-xs text-blue-600 hover:underline">
                {showAll ? 'Show top 25' : `Show all ${elements.length}`}
              </button>
            )}
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Frustration" sub="Rage = 3+ clicks in 1s. Dead = the page didn’t change within 1s of the click.">
          {r.frustration.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">No rage or dead clicks 🎉</div>
          ) : (
            <ul className="space-y-2">
              {r.frustration.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-gray-800" title={f.target}>{f.target}</div>
                    <div className="text-[11px] text-gray-400">{featurePath(f.feature)} · {f.area} · {f.clicks} clicks</div>
                  </div>
                  <div className="text-xs whitespace-nowrap tabular-nums">
                    <span className="text-red-600 font-semibold">{f.rage} rage</span>
                    <span className="text-gray-300"> · </span>
                    <span className="text-amber-600 font-semibold">{f.dead} dead</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Looked at, didn’t click" sub="Devices that rested the mouse on a control but never clicked it.">
          {r.hoverNoClick.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Nothing yet</div>
          ) : (
            <ul className="space-y-2">
              {r.hoverNoClick.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-gray-800" title={h.target}>{h.target}</div>
                    <div className="text-[11px] text-gray-400">{featurePath(h.feature)}</div>
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
                    {h.hoveredOnly} of {h.hovered} never clicked
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {r.changes.length > 0 && (
        <Card title="Settings & choices" sub="What people pick in dropdowns and toggles. Typed text is never recorded.">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="text-left font-medium pb-2 pr-4">Control</th>
                  <th className="text-left font-medium pb-2 pr-4">Choice</th>
                  <th className="text-left font-medium pb-2 pr-4">Feature</th>
                  <th className="text-right font-medium pb-2 pl-3">Times</th>
                  <th className="text-right font-medium pb-2 pl-3">Devices</th>
                </tr>
              </thead>
              <tbody>
                {r.changes.map((c, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 text-gray-800 truncate max-w-[220px]" title={c.target}>{c.target}</td>
                    <td className="py-1.5 pr-4 text-gray-600 truncate max-w-[200px]" title={c.value}>{c.value}</td>
                    <td className="py-1.5 pr-4 text-gray-500">{featurePath(c.feature)}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{c.count.toLocaleString()}</td>
                    <td className="py-1.5 pl-3 text-right tabular-nums">{c.devices.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${tone === 'bad' ? 'text-red-600' : 'text-gray-900'}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function featurePath(feature: string) {
  return feature === 'home' ? '/' : `/${feature}`;
}
