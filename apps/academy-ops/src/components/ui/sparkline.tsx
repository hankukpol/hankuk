type SparklineProps = {
  data: number[];
  color?: string;
  positiveIsGood?: boolean;
};

function formatDelta(delta: number) {
  const abs = Math.abs(delta);

  if (abs < 0.05) {
    return "=";
  }

  return `${delta > 0 ? "+" : "-"}${abs.toFixed(1)}`;
}

export function Sparkline({ data, color = "#C55A11", positiveIsGood = true }: SparklineProps) {
  if (data.length === 0) {
    return null;
  }

  const width = 88;
  const height = 24;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((value, index) => {
      const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  const delta = data[data.length - 1] - data[0];
  const isPositive = delta > 0;
  const deltaClassName =
    Math.abs(delta) < 0.05
      ? "text-slate"
      : isPositive === positiveIsGood
      ? "text-forest"
      : "text-red-600";

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`text-xs font-semibold ${deltaClassName}`}>{formatDelta(delta)}</span>
    </div>
  );
}
