# Alpha Engine — Front-End Style Guide

Institutional Bloomberg/quant terminal aesthetic. Every decision below is a non-negotiable constraint.

---

## Surface Layers (3-layer hierarchy, no exceptions)

| Layer | Token           | Hex       | Usage                          |
|-------|-----------------|-----------|--------------------------------|
| bg0   | `surface.base`  | `#09090b` | Page / app background          |
| bg1   | `surface.raised`| `#111113` | Sidebar, nav panels            |
| bg2   | `surface.overlay`| `#18181b` | Cards (`.card`), modals       |

**Rule:** Cards must always be visually elevated above the sidebar. `.card` = `bg-surface-overlay`.

---

## Border Tokens

| Token             | Hex       | Usage                            |
|-------------------|-----------|----------------------------------|
| `surface.border`  | `#27272a` | Default dividers, card borders   |
| `surface.border1` | `#323236` | Hover-state border elevation     |

Use `border-surface-border` for default, `hover:border-surface-border1` for interactive hover.

---

## Spacing Scale (8px grid — use ONLY these values)

| Class    | px  | Usage                        |
|----------|-----|------------------------------|
| `p-2`    | 8px | Tight internal, icon buttons |
| `p-3`    | 12px| Button padding, compact rows |
| `p-4`    | 16px| Standard card padding        |
| `p-6`    | 24px| Section spacing              |
| `p-8`    | 32px| Page-level outer margin      |

**DO NOT use:** `px-5` (20px), `px-7` (28px), or any non-multiple-of-4 value.

---

## Typography

- **Body:** Inter, system-ui — set via `font-family` on `body`
- **Monospace / numbers:** JetBrains Mono — use `.num` class or `font-mono`
- **Global tabular-nums:** `font-variant-numeric: tabular-nums` is set on `body` globally — all numeric values align by default
- **Labels:** Use `.label` class — `text-xs text-text-muted uppercase tracking-wider font-medium`
- **Never** use `tracking-widest` — too aggressive for dense data layouts

### Text color hierarchy:
| Class             | Hex       | Usage                        |
|-------------------|-----------|------------------------------|
| `text-text-primary` | `#f4f4f5` | Primary content            |
| `text-text-muted`   | `#71717a` | Secondary, labels, meta    |
| `text-text-subtle`  | `#3f3f46` | Disabled, placeholder      |

---

## PanelCard — Canonical Card Chrome

Use `PanelCard` everywhere instead of raw `div.card` + `SectionHeader`.

```tsx
import { PanelCard } from "@/components/ui/PanelCard";

// Standard card with header
<PanelCard title="ELO Leaderboard" subtitle="Top 10" action={<Button>...</Button>}>
  {children}
</PanelCard>

// Flush — rows go edge-to-edge (no content padding)
<PanelCard title="ELO Leaderboard" padding="flush">
  <div className="divide-y divide-surface-border/50">
    {rows}
  </div>
</PanelCard>

// Tight — slightly less padding (px-4 py-3)
<PanelCard title="Settings" padding="tight">
  {children}
</PanelCard>

// No title — bare card with padding only
<PanelCard>{children}</PanelCard>
```

**padding values:**
- `"normal"` (default): `px-4 py-4`
- `"tight"`: `px-4 py-3`
- `"flush"`: no padding — children control their own spacing

---

## Tabs — One Style Only (Underline)

Use `NavTabs` (Link-based) or `StateTabs` (button-based) from `@/components/ui/Tabs`.

```tsx
// Link-based (sport filters, page navigation)
<NavTabs items={[{ label: "All", href: "/matches", active: true }, ...]} />

// State-based (time range, local UI state)
<StateTabs items={[{ label: "7d", value: "7d" }, ...]} value={range} onChange={setRange} />
```

**DO NOT** use pill-style tabs (bg fill, rounded containers). Only underline style.

---

## Table — Numeric Columns

Always use `numeric` prop for columns containing numbers, dates, percentages, or currency.

```tsx
<TableHeader numeric>Date</TableHeader>
<TableHeader numeric>Confidence</TableHeader>

<TableCell numeric>{formatDate(m.scheduled_at)}</TableCell>
<TableCell numeric>{formatPercent(m.confidence)}</TableCell>
```

Use `density` prop on `<Table>` for compact/normal row height:
```tsx
<Table density={density}>  {/* "normal" | "compact" */}
```

---

## Badge — Semantic Variants

```tsx
// Sport badge (dynamic color — inline style required)
<Badge sport="soccer">soccer</Badge>
<Badge sport="tennis">tennis</Badge>

// Semantic variants (Tailwind classes — safe for static rendering)
<Badge variant="positive">Win</Badge>
<Badge variant="negative">Loss</Badge>
<Badge variant="warning">Draw</Badge>
<Badge variant="muted">Scheduled</Badge>

// Status and outcome (use dedicated components)
<StatusBadge status="live" />
<OutcomeBadge outcome="home_win" />
```

---

## Chart Defaults

Import `chartDefaults` from `@/lib/tokens` and spread into all Recharts components:

```tsx
import { chartDefaults, colors } from "@/lib/tokens";

// Axis
<XAxis tick={chartDefaults.axis.tick} axisLine={chartDefaults.axis.axisLine} tickLine={chartDefaults.axis.tickLine} />
<YAxis tick={chartDefaults.axis.tick} width={chartDefaults.yAxisWidth} ... />

// Grid
<CartesianGrid stroke={chartDefaults.grid.stroke} strokeDasharray={chartDefaults.grid.strokeDasharray} />

// Cursor (on charts with Tooltip)
<Tooltip cursor={chartDefaults.cursor} />

// Tooltip contentStyle (for Recharts built-in tooltip)
<Tooltip contentStyle={chartDefaults.tooltip.contentStyle} labelStyle={chartDefaults.tooltip.labelStyle} itemStyle={chartDefaults.tooltip.itemStyle} />

// Custom tooltip wrapper div (JSX-based)
<div style={chartDefaults.tooltip.contentStyle}>...</div>
```

All 5 chart files use `chartDefaults`. If you add a new chart, do the same.

---

## Accent Color Semantics

| Token           | Hex       | Meaning                              |
|-----------------|-----------|--------------------------------------|
| `accent.green`  | `#22c55e` | Positive, win, profit, live, success |
| `accent.red`    | `#ef4444` | Negative, loss, error, danger        |
| `accent.blue`   | `#3b82f6` | Neutral highlight, info, active UI   |
| `accent.amber`  | `#f59e0b` | Warning, draw, DEV environment       |
| `accent.purple` | `#a855f7` | Esports sport category only          |

---

## DO NOTs

- **DO NOT** use `px-5` (20px) — off the 8px grid. Use `px-4` (16px) or `px-6` (24px).
- **DO NOT** use pill-style tabs. Only underline tabs.
- **DO NOT** use `tracking-widest`. Use `tracking-wider` or less.
- **DO NOT** use `animate-pulse` for skeletons. Use `.shimmer` class.
- **DO NOT** hardcode hex colors in component files. Use Tailwind tokens or import from `@/lib/tokens`.
- **DO NOT** use raw `div.card` + `SectionHeader` together. Use `PanelCard`.
- **DO NOT** use `bg-surface-raised` for cards. Cards are `bg-surface-overlay` (bg2).
- **DO NOT** add a new chart without importing `chartDefaults` from `@/lib/tokens`.
- **DO NOT** use numeric columns without `numeric` prop on `TableHeader`/`TableCell`.
