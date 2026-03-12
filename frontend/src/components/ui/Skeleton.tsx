import { cn } from "@/lib/utils";

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("shimmer", className)}
      style={{ borderRadius: "var(--radius-sm)", ...style }}
    />
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: "7px 12px", borderBottom: "1px solid var(--border0)" }}>
          <Skeleton style={{ height: 10, width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card", className)} style={{ padding: 12 }}>
      <Skeleton style={{ height: 10, width: 80, marginBottom: 10 }} />
      <Skeleton style={{ height: 24, width: 120, marginBottom: 8 }} />
      <Skeleton style={{ height: 10, width: 60 }} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} style={{ padding: "6px 12px", borderBottom: "1px solid var(--border0)" }}>
              <Skeleton style={{ height: 8, width: 60 }} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  );
}
