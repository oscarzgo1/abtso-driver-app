// Overview — KPI cards over one multi-series line chart, built on the
// 21st.dev @cnippet-dev/cnippet-chart "line with legend" pattern: every
// series on the same axes, each with its own stroke (solid / dashed /
// dotted), a shared tooltip and a legend underneath. Each KPI card carries
// its series' colour and line style and toggles that line on or off.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { BadgeDelta, type BadgeDeltaDirection, type BadgeDeltaTone } from '../ui/badge-delta';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../ui/cnippet-chart';

export interface OverviewKpi {
  key: string;
  label: string;
  value: number;
  format: (value: number) => string;
  delta: { label: string; direction: BadgeDeltaDirection; tone: BadgeDeltaTone } | null;
  hint?: ReactNode;
  /** Plotted series only (Margin is a % and stays a card). */
  series?: { color: string; dash?: string };
}

export default function OverviewChart({ kpis, data, axisFormat, valueFormat, aside, emptyText }: {
  kpis: OverviewKpi[];
  /** One row per x-axis point: `label` plus one number per plotted kpi key. */
  data: Array<{ label: string } & Record<string, number | string>>;
  axisFormat: (value: number) => string;
  valueFormat: (value: number) => string;
  aside?: ReactNode;
  emptyText: string;
}) {
  const plotted = kpis.filter(k => k.series);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setHidden(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else if (plotted.length - next.size > 1) next.add(key); // always keep one line
    return next;
  });

  const config: ChartConfig = Object.fromEntries(
    plotted.map(k => [k.key, { label: k.label, color: k.series!.color }]),
  );
  const visible = plotted.filter(k => !hidden.has(k.key));

  return (
    <div className="ov-panel">
      <div className="ov-kpis">
        {kpis.map(k => {
          const isSeries = Boolean(k.series);
          const off = hidden.has(k.key);
          const body = (
            <>
              <span className="ov-kpi-top">
                <span className="ov-kpi-label">
                  {k.series && <span className="ov-key" style={{ '--key-color': k.series.color } as CSSProperties} data-dash={k.series.dash ? (k.series.dash === '2 2' ? 'dotted' : 'dashed') : 'solid'} />}
                  {k.label}
                </span>
                {k.delta && <BadgeDelta label={k.delta.label} direction={k.delta.direction} tone={k.delta.tone} />}
              </span>
              <span className="ov-kpi-value" style={{ color: k.value < 0 ? 'var(--brand-red)' : undefined }}>{k.format(k.value)}</span>
              {k.hint && <span className="ov-kpi-hint">{k.hint}</span>}
            </>
          );
          return isSeries ? (
            <button
              key={k.key}
              type="button"
              className={`ov-kpi ov-kpi--toggle ${off ? 'is-off' : ''}`}
              aria-pressed={!off}
              title={off ? `Show ${k.label} on the chart` : `Hide ${k.label} from the chart`}
              onClick={() => toggle(k.key)}
            >
              {body}
            </button>
          ) : (
            <div key={k.key} className="ov-kpi">{body}</div>
          );
        })}
      </div>

      <div className={aside ? 'ov-body ov-body--aside' : 'ov-body'}>
        <div className="ov-chart">
          {data.length < 2 ? (
            <div className="ov-empty">{emptyText}</div>
          ) : (
            <ChartContainer className="ov-chart-container" config={config}>
              <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 12, top: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={8} minTickGap={20} />
                <YAxis axisLine={false} tickFormatter={v => axisFormat(Number(v))} tickLine={false} width={56} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) => (
                        <>
                          <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                          <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                            <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                            <span className="font-medium font-mono text-foreground tabular-nums">{valueFormat(Number(value))}</span>
                          </div>
                        </>
                      )}
                    />
                  }
                />
                {/* Keep the legend in card order (Recharts sorts by name by default). */}
                <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
                {visible.map(k => (
                  <Line
                    key={k.key}
                    dataKey={k.key}
                    name={k.key}
                    dot={false}
                    activeDot={{ r: 4 }}
                    stroke={`var(--color-${k.key})`}
                    strokeDasharray={k.series!.dash}
                    strokeWidth={2}
                    type="monotone"
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </div>
        {aside && <div className="ov-aside">{aside}</div>}
      </div>
    </div>
  );
}
