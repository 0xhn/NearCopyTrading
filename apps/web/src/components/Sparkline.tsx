import { useId } from "react";

export function Sparkline({
  points,
  width = 148,
  height = 56,
  positive = true,
}: {
  points: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const data = points.length > 1 ? points : [0, points[0] ?? 0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const coords = data.map((point, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((point - min) / span) * (height - 8) - 4;
    return { x, y };
  });
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const fill = `${line} L${width} ${height} L0 ${height} Z`;
  const color = positive ? "#10B981" : "#F43F5E";
  const last = coords[coords.length - 1];
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" />
      <circle className="dot-end" cx={last.x} cy={last.y} r="2.5" fill={color} />
    </svg>
  );
}
