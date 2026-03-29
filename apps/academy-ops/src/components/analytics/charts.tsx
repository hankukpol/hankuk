"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Subject } from "@prisma/client";
import { SUBJECT_LABEL } from "@/lib/constants";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type NumericDatum = Record<string, number | string | null>;

type TrendLineChartProps = {
  data: NumericDatum[];
  xKey: string;
  xTickKey?: string;
  className?: string;
  yDomain?: [number, number];
  lines: Array<{
    dataKey: string;
    color: string;
    name: string;
  }>;
};

type BarComparisonChartProps = {
  data: NumericDatum[];
  xKey: string;
  className?: string;
  yDomain?: [number, number];
  bars: Array<{
    dataKey: string;
    color: string;
    name: string;
    stackId?: string;
  }>;
};

type RadarComparisonChartProps = {
  data: Array<{
    subject: Subject;
    studentAverage: number;
    cohortAverage: number;
    targetScore?: number;
  }>;
};

type StudentPairRadarChartProps = {
  data: Array<{
    subject: Subject;
    studentA: number;
    studentB: number;
  }>;
  studentAName: string;
  studentBName: string;
};

type DistributionChartProps = {
  data: Array<{
    range: string;
    count: number;
  }>;
};

type PercentileLineChartProps = {
  data: Array<{
    label: string;
    percentile: number | null;
    studentRank: number | null;
    participantCount: number;
  }>;
};

type TimelineMarkerShape = "circle" | "diamond" | "square" | "triangle";

type ScoreTimelineChartProps = {
  data: Array<Record<string, number | string | boolean | null | undefined>>;
  xKey: string;
  xTickKey?: string;
  className?: string;
  scoreDomain?: [number, number];
  scoreLines: Array<{
    dataKey: string;
    name: string;
    color: string;
    strokeWidth?: number;
    connectNulls?: boolean;
    dashed?: boolean;
  }>;
  attendanceEvents?: Array<{
    dataKey: string;
    name: string;
    color: string;
    lane?: number;
    shape?: TimelineMarkerShape;
  }>;
  statusChanges?: Array<{
    xValue: string | number;
    name: string;
    color: string;
    lineDash?: string;
  }>;
};

type ChartSurfaceProps = {
  className: string;
  fallbackText: string;
  children: (size: { width: number; height: number }) => ReactNode;
};

function subjectTickFormatter(value: string) {
  return SUBJECT_LABEL[value as Subject] ?? value;
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-ink/10 text-sm text-slate">
      {message}
    </div>
  );
}

function renderTimelineMarker(shape: TimelineMarkerShape, color: string, size = 9) {
  const half = size / 2;

  return function TimelineMarker(props: { cx?: number; cy?: number }) {
    if (props.cx === undefined || props.cy === undefined) {
      return null;
    }

    switch (shape) {
      case "diamond":
        return (
          <path
            d={`M ${props.cx} ${props.cy - half} L ${props.cx + half} ${props.cy} L ${props.cx} ${props.cy + half} L ${props.cx - half} ${props.cy} Z`}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        );
      case "square":
        return (
          <rect
            x={props.cx - half}
            y={props.cy - half}
            width={size}
            height={size}
            rx={2}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        );
      case "triangle":
        return (
          <path
            d={`M ${props.cx} ${props.cy - half} L ${props.cx + half} ${props.cy + half} L ${props.cx - half} ${props.cy + half} Z`}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        );
      default:
        return (
          <circle
            cx={props.cx}
            cy={props.cy}
            r={half}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        );
    }
  };
}

function ChartSurface({ className, fallbackText, children }: ChartSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => {
      const width = Math.floor(node.clientWidth);
      const height = Math.floor(node.clientHeight);
      setSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    };

    measure();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const isReady = size.width > 0 && size.height > 0;

  return (
    <div ref={containerRef} className={className}>
      {isReady ? children(size) : <EmptyChart message={fallbackText} />}
    </div>
  );
}

export function TrendLineChart({
  data,
  xTickKey,
  xKey,
  lines,
  className = "h-72",
  yDomain = [0, 100],
}: TrendLineChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  return (
    <ChartSurface className={className} fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <LineChart width={width} height={height} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => {
              if (!xTickKey) {
                return String(value);
              }

              const matchedRow = data.find((row) => String(row[xKey]) === String(value));
              return String(matchedRow?.[xTickKey] ?? value);
            }}
          />
          <YAxis domain={yDomain} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </ChartSurface>
  );
}

export function PercentileLineChart({ data }: PercentileLineChartProps) {
  if (data.length === 0 || data.every((row) => row.percentile === null)) {
    return <EmptyChart message="표시할 백분위 데이터가 없습니다." />;
  }

  return (
    <ChartSurface className="h-72" fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <LineChart width={width} height={height} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} reversed tick={{ fontSize: 12 }} tickFormatter={(value: number) => `${value}%`} />
          <ReferenceLine y={10} stroke="#0F766E" strokeDasharray="5 5" />
          <ReferenceLine y={30} stroke="#2563EB" strokeDasharray="5 5" />
          <ReferenceLine y={50} stroke="#94A3B8" strokeDasharray="5 5" />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) {
                return null;
              }

              const row = payload[0]?.payload as PercentileLineChartProps["data"][number];
              return (
                <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm shadow-lg">
                  <p className="font-semibold text-ink">{label}</p>
                  <p className="mt-1 text-slate">
                    {row.percentile !== null ? `상위 ${row.percentile.toFixed(1)}%` : "백분위 없음"}
                  </p>
                  <p className="mt-1 text-slate">
                    {row.studentRank !== null
                      ? `${row.studentRank}위 / ${row.participantCount}명`
                      : "순위 계산 불가"}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="percentile"
            name="백분위"
            stroke="#C55A11"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      )}
    </ChartSurface>
  );
}

export function BarComparisonChart({
  data,
  xKey,
  bars,
  className = "h-72",
  yDomain = [0, 100],
}: BarComparisonChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  return (
    <ChartSurface className={className} fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis
            dataKey={xKey}
            tickFormatter={xKey === "subject" ? subjectTickFormatter : undefined}
            tick={{ fontSize: 12 }}
          />
          <YAxis domain={yDomain} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name}
              fill={bar.color}
              stackId={bar.stackId}
              radius={[6, 6, 0, 0]}
            />
          ))}
        </BarChart>
      )}
    </ChartSurface>
  );
}

export function ScoreTimelineChart({
  data,
  xKey,
  xTickKey,
  scoreLines,
  attendanceEvents = [],
  statusChanges = [],
  className = "h-80",
  scoreDomain = [0, 100],
}: ScoreTimelineChartProps) {
  if (data.length === 0 || scoreLines.length === 0) {
    return <EmptyChart message="표시할 타임라인 데이터가 없습니다." />;
  }

  const eventLanes = attendanceEvents.map((event, index) => ({
    ...event,
    lane: event.lane ?? -(index + 1),
  }));
  const minLane = eventLanes.length > 0 ? Math.min(...eventLanes.map((event) => event.lane)) : -1;
  const eventAxisDomain: [number, number] = [Math.min(minLane - 0.5, -1.5), 1];

  return (
    <ChartSurface className={className} fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <ComposedChart width={width} height={height} data={data} margin={{ top: 28, right: 24, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 12 }}
            minTickGap={24}
            tickFormatter={(value) => {
              if (!xTickKey) {
                return String(value);
              }

              const matchedRow = data.find((row) => String(row[xKey]) === String(value));
              return String(matchedRow?.[xTickKey] ?? value);
            }}
          />
          <YAxis yAxisId="score" domain={scoreDomain} tick={{ fontSize: 12 }} width={36} />
          <YAxis yAxisId="events" domain={eventAxisDomain} hide />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active) {
                return null;
              }

              const row = (payload?.[0]?.payload ?? null) as ScoreTimelineChartProps["data"][number] | null;
              if (!row) {
                return null;
              }

              const scoreItems = scoreLines
                .map((line) => ({ line, value: row[line.dataKey] }))
                .filter((item) => typeof item.value === "number");
              const eventItems = eventLanes.filter((event) => {
                const value = row[event.dataKey];
                return value !== null && value !== undefined && value !== false && value !== 0;
              });
              const statusItems = statusChanges.filter((status) => String(status.xValue) === String(row[xKey]));

              return (
                <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm shadow-lg">
                  <p className="font-semibold text-ink">{String(row.displayLabel ?? label ?? row[xKey] ?? "-")}</p>
                  {typeof row.metaSubtitle === "string" ? (
                    <p className="mt-1 text-xs text-slate">{row.metaSubtitle}</p>
                  ) : null}
                  {typeof row.metaCaption === "string" ? (
                    <p className="mt-1 text-xs text-slate">{row.metaCaption}</p>
                  ) : null}
                  {scoreItems.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {scoreItems.map(({ line, value }) => (
                        <p key={line.dataKey} className="text-slate">
                          <span className="font-medium" style={{ color: line.color }}>
                            {line.name}
                          </span>
                          {": "}
                          {Number(value).toFixed(1)}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {eventItems.length > 0 ? (
                    <div className="mt-2 space-y-1 border-t border-ink/10 pt-2">
                      {eventItems.map((event) => (
                        <p key={event.dataKey} className="text-slate">
                          <span className="font-medium" style={{ color: event.color }}>
                            {event.name}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {statusItems.length > 0 ? (
                    <div className="mt-2 space-y-1 border-t border-ink/10 pt-2">
                      {statusItems.map((status) => (
                        <p key={`${String(status.xValue)}-${status.name}`} className="text-slate">
                          <span className="font-medium" style={{ color: status.color }}>
                            {status.name}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }}
          />
          <Legend />

          {statusChanges.map((status) => (
            <ReferenceLine
              key={`${String(status.xValue)}-${status.name}`}
              x={status.xValue}
              stroke={status.color}
              strokeDasharray={status.lineDash ?? "4 4"}
              ifOverflow="extendDomain"
              label={{
                value: status.name,
                position: "top",
                fill: status.color,
                fontSize: 11,
              }}
            />
          ))}

          {scoreLines.map((line) => (
            <Line
              key={line.dataKey}
              yAxisId="score"
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color}
              strokeWidth={line.strokeWidth ?? 2.5}
              strokeDasharray={line.dashed ? "5 5" : undefined}
              dot={{ r: 3, strokeWidth: 1.5, fill: line.color }}
              activeDot={{ r: 5 }}
              connectNulls={line.connectNulls ?? true}
            />
          ))}

          {eventLanes.map((event) => {
            const shape = event.shape ?? "circle";
            const marker = renderTimelineMarker(shape, event.color, 9);
            const scatterData = data
              .filter((row) => {
                const value = row[event.dataKey];
                return value !== null && value !== undefined && value !== false && value !== 0;
              })
              .map((row) => ({
                ...row,
                [xKey]: row[xKey],
                lane: event.lane,
              }));

            if (scatterData.length === 0) {
              return null;
            }

            return (
              <Scatter
                key={event.dataKey}
                yAxisId="events"
                data={scatterData}
                dataKey="lane"
                name={event.name}
                fill={event.color}
                shape={marker}
                legendType="none"
              />
            );
          })}

          {eventLanes.map((event) => (
            <ReferenceLine
              key={`${event.dataKey}-lane`}
              yAxisId="events"
              y={event.lane}
              stroke="#E2E8F0"
              strokeDasharray="2 6"
              ifOverflow="extendDomain"
            />
          ))}
        </ComposedChart>
      )}
    </ChartSurface>
  );
}

export function RadarComparisonChart({ data }: RadarComparisonChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  const chartData = data.map((row) => ({
    ...row,
    subjectLabel: SUBJECT_LABEL[row.subject],
  }));

  return (
    <ChartSurface className="h-80" fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <RadarChart width={width} height={height} data={chartData}>
          <PolarGrid stroke="#D6DCE5" />
          <PolarAngleAxis dataKey="subjectLabel" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Radar
            name="개인 평균"
            dataKey="studentAverage"
            stroke="#C2410C"
            fill="#FDBA74"
            fillOpacity={0.35}
          />
          <Radar
            name="전체 평균"
            dataKey="cohortAverage"
            stroke="#1D4ED8"
            fill="#93C5FD"
            fillOpacity={0.2}
          />
          {chartData.some((row) => Number(row.targetScore) > 0) ? (
            <Radar
              name="목표 점수"
              dataKey="targetScore"
              stroke="#475569"
              fillOpacity={0}
            />
          ) : null}
          <Legend />
          <Tooltip />
        </RadarChart>
      )}
    </ChartSurface>
  );
}

export function StudentPairRadarChart({
  data,
  studentAName,
  studentBName,
}: StudentPairRadarChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="비교할 과목 데이터가 없습니다." />;
  }

  const chartData = data.map((row) => ({
    ...row,
    subjectLabel: SUBJECT_LABEL[row.subject],
  }));

  return (
    <ChartSurface className="h-80" fallbackText="레이더 차트를 불러오지 못했습니다.">
      {({ width, height }) => (
        <RadarChart width={width} height={height} data={chartData}>
          <PolarGrid stroke="#D6DCE5" />
          <PolarAngleAxis dataKey="subjectLabel" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Radar
            name={studentAName}
            dataKey="studentA"
            stroke="#C2410C"
            fill="#FDBA74"
            fillOpacity={0.35}
          />
          <Radar
            name={studentBName}
            dataKey="studentB"
            stroke="#1D4ED8"
            fill="#93C5FD"
            fillOpacity={0.24}
          />
          <Legend />
          <Tooltip />
        </RadarChart>
      )}
    </ChartSurface>
  );
}

export function DistributionChart({ data }: DistributionChartProps) {
  if (data.length === 0) {
    return <EmptyChart message="표시할 데이터가 없습니다." />;
  }

  return (
    <ChartSurface className="h-72" fallbackText="차트를 불러오는 중입니다.">
      {({ width, height }) => (
        <BarChart width={width} height={height} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
          <XAxis
            dataKey="range"
            tick={{ fontSize: 11 }}
            interval={1}
            angle={-35}
            textAnchor="end"
            height={56}
          />
          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" name="인원" fill="#0F766E" radius={[6, 6, 0, 0]} />
        </BarChart>
      )}
    </ChartSurface>
  );
}
