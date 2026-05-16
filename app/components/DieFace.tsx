"use client";

interface Props {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  kept: boolean;
  interactive: boolean;
  onClick?: () => void;
}

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 25],
    [72, 25],
    [28, 50],
    [72, 50],
    [28, 75],
    [72, 75],
  ],
};

export function DieFace({ value, kept, interactive, onClick }: Props) {
  const dots = DOT_POSITIONS[value];

  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      className={[
        "w-20 h-20 rounded-2xl shadow-lg transition-all duration-200 focus:outline-none",
        interactive ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default",
        kept
          ? "bg-amber-400 border-4 border-amber-300 shadow-amber-500/40 shadow-lg translate-y-[-6px]"
          : "bg-white border-4 border-slate-200",
      ]
        .filter(Boolean)
        .join(" ")}
      title={interactive ? (kept ? "Click to unkeep" : "Click to keep") : undefined}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full p-1">
        {dots.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={9}
            className={kept ? "fill-amber-800" : "fill-slate-800"}
          />
        ))}
      </svg>
    </button>
  );
}
