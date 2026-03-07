"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge, OutcomeBadge } from "@/components/ui/Badge";
import { PanelCard } from "@/components/ui/PanelCard";
import { StatCard } from "@/components/ui/StatCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { StateTabs } from "@/components/ui/Tabs";
import { Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Activity, Database, TrendingUp, AlertCircle } from "lucide-react";

/* ── Section wrapper ─────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border0)" }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text1)" }}>
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

/* ── Color swatch ────────────────────────────────────────────────────────── */
function Swatch({ name, value, cssVar }: { name: string; value: string; cssVar: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 32, height: 32, background: `var(${cssVar})`, border: "1px solid var(--border1)", borderRadius: "var(--radius-md)", flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--text0)" }}>{name}</p>
        <p className="num" style={{ fontSize: 10, color: "var(--text1)" }}>{value} · {cssVar}</p>
      </div>
    </div>
  );
}

const TOKEN_GROUPS = [
  {
    label: "Surfaces",
    tokens: [
      { name: "bg0 — App background",  value: "#0c0c10", cssVar: "--bg0" },
      { name: "bg1 — Panels / Rails",  value: "#111116", cssVar: "--bg1" },
      { name: "bg2 — Cards / Tables",  value: "#16161d", cssVar: "--bg2" },
    ],
  },
  {
    label: "Text",
    tokens: [
      { name: "text0 — Primary",  value: "#e2e2ea", cssVar: "--text0" },
      { name: "text1 — Muted",    value: "#72728a", cssVar: "--text1" },
      { name: "text2 — Subtle",   value: "#36364a", cssVar: "--text2" },
    ],
  },
  {
    label: "Borders",
    tokens: [
      { name: "border0 — Default", value: "#1e1e2c", cssVar: "--border0" },
      { name: "border1 — Hover",   value: "#2c2c3f", cssVar: "--border1" },
    ],
  },
  {
    label: "Accent & Status",
    tokens: [
      { name: "accent — Electric cyan", value: "#00d4ff", cssVar: "--accent"   },
      { name: "positive — Emerald",     value: "#10b981", cssVar: "--positive" },
      { name: "negative — Rose",        value: "#f43f5e", cssVar: "--negative" },
      { name: "warning — Amber",        value: "#f59e0b", cssVar: "--warning"  },
      { name: "info — Indigo",          value: "#818cf8", cssVar: "--info"     },
    ],
  },
];

const MOCK_ROWS = [
  { match: "Man City vs Arsenal",   league: "Premier League", conf: 78, edge: "+4.2%", pick: "Home", outcome: "home_win" },
  { match: "PSG vs Barcelona",      league: "Champions League",conf: 64, edge: "+1.8%", pick: "Draw",outcome: "draw"     },
  { match: "Novak vs Alcaraz",      league: "ATP Finals",      conf: 55, edge: "-0.9%", pick: "Away", outcome: "away_win"},
  { match: "Team Liquid vs NaVi",   league: "ESL Pro League",  conf: 82, edge: "+6.1%", pick: "Home", outcome: null      },
  { match: "Real Madrid vs Bayern", league: "Champions League",conf: 71, edge: "+3.3%", pick: "Home", outcome: null      },
];

export function DesignSystemClient() {
  const [density, setDensity] = useState<"normal" | "compact">("normal");
  const [modalOpen, setModalOpen]  = useState(false);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 64px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text0)", letterSpacing: "-0.02em" }}>
          Quant Terminal
        </h1>
        <p style={{ fontSize: 13, color: "var(--text1)", marginTop: 4 }}>
          Design system reference — tokens, typography, components, patterns.
        </p>
      </div>

      {/* ── Color Tokens ─────────────────────────────────────────────── */}
      <Section title="Color Tokens">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 24 }}>
          {TOKEN_GROUPS.map((group) => (
            <div key={group.label} className="card" style={{ padding: 16 }}>
              <p className="label" style={{ marginBottom: 12 }}>{group.label}</p>
              {group.tokens.map((t) => <Swatch key={t.cssVar} {...t} />)}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Typography ───────────────────────────────────────────────── */}
      <Section title="Typography">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <div>
              <p className="label" style={{ marginBottom: 12 }}>UI Type Scale — Inter</p>
              {[
                { label: "Label / 10px / 700",  size: 10, weight: 700, text: "MARKET STATUS" },
                { label: "Caption / 11px / 400", size: 11, weight: 400, text: "Secondary information" },
                { label: "Body / 12px / 400",    size: 12, weight: 400, text: "Primary body copy and table cells" },
                { label: "Base / 13px / 500",    size: 13, weight: 500, text: "Navigation and headings" },
                { label: "Title / 16px / 600",   size: 16, weight: 600, text: "Page title" },
                { label: "Display / 26px / 600", size: 26, weight: 600, text: "KPI value" },
              ].map(({ label, size, weight, text }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: "var(--text2)", marginBottom: 2 }}>{label}</p>
                  <p style={{ fontSize: size, fontWeight: weight, color: "var(--text0)" }}>{text}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="label" style={{ marginBottom: 12 }}>Mono Scale — JetBrains Mono</p>
              {[
                { label: "Mono / 10px",   size: 10,  text: "78.4% 1.28x 0.342 +4.2%" },
                { label: "Mono / 11px",   size: 11,  text: "78.4% 1.28x 0.342 +4.2%" },
                { label: "Mono / 12px",   size: 12,  text: "78.4% 1.28x 0.342 +4.2%" },
                { label: "Mono / 18px",   size: 18,  text: "72.4%" },
                { label: "Mono / 26px",   size: 26,  text: "+3.28x" },
              ].map(({ label, size, text }) => (
                <div key={label} style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, color: "var(--text2)", marginBottom: 2 }}>{label}</p>
                  <p className="num" style={{ fontSize: size, color: "var(--text0)" }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Buttons ──────────────────────────────────────────────────── */}
      <Section title="Buttons">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="primary" loading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button variant="primary"   size="sm">Small Primary</Button>
            <Button variant="secondary" size="sm">Small Secondary</Button>
            <Button variant="ghost"     size="sm">Small Ghost</Button>
            <Button variant="primary"   size="lg">Large Primary</Button>
          </div>
        </div>
      </Section>

      {/* ── Badges ───────────────────────────────────────────────────── */}
      <Section title="Badges">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <Badge variant="muted">Muted</Badge>
            <Badge variant="positive">Positive</Badge>
            <Badge variant="negative">Negative</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="accent">Accent</Badge>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <StatusBadge status="scheduled" />
            <StatusBadge status="live" />
            <StatusBadge status="finished" />
            <StatusBadge status="cancelled" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <OutcomeBadge outcome="home_win" />
            <OutcomeBadge outcome="draw" />
            <OutcomeBadge outcome="away_win" />
            <Badge sport="soccer">Soccer</Badge>
            <Badge sport="tennis">Tennis</Badge>
            <Badge sport="esports">Esports</Badge>
          </div>
        </div>
      </Section>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Section title="Tabs">
        <div className="card" style={{ padding: 20 }}>
          <p className="label" style={{ marginBottom: 8 }}>Underline (default — for page sections)</p>
          <StateTabs
            items={[
              { label: "Overview", value: "overview" },
              { label: "Leaderboard", value: "leaderboard", count: 24 },
              { label: "Feed", value: "feed" },
              { label: "Rules", value: "rules" },
            ]}
            value="overview"
            onChange={() => {}}
            style="underline"
          />
          <div style={{ marginTop: 24 }}>
            <p className="label" style={{ marginBottom: 8 }}>Segmented (for compact toggles — time range, density)</p>
            <StateTabs
              items={[
                { label: "7D", value: "7d" },
                { label: "30D", value: "30d" },
                { label: "90D", value: "90d" },
                { label: "All", value: "all" },
              ]}
              value="30d"
              onChange={() => {}}
              style="segmented"
            />
          </div>
        </div>
      </Section>

      {/* ── Tooltips ─────────────────────────────────────────────────── */}
      <Section title="Tooltips">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Tooltip content="Win Rate: 72.4%">
              <Button variant="secondary" size="sm">Hover me (top)</Button>
            </Tooltip>
            <Tooltip content="Brier Score: 0.218 (good calibration)" position="bottom">
              <Button variant="secondary" size="sm">Hover me (bottom)</Button>
            </Tooltip>
            <Tooltip content="Edge: +4.2% above market implied" position="right">
              <Button variant="secondary" size="sm">Hover me (right)</Button>
            </Tooltip>
          </div>
        </div>
      </Section>

      {/* ── Stat Cards ───────────────────────────────────────────────── */}
      <Section title="Stat Cards">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          <StatCard label="Win Rate"   value="72.4%"  delta={3.1} />
          <StatCard label="ROI"        value="+18.2%" delta={-1.4} />
          <StatCard label="Sharpe"     value="1.28"   delta={0.09} />
          <StatCard label="Brier"      value="0.218"  delta={-0.012} />
          <StatCard label="Total Bets" value="1,284" />
        </div>
      </Section>

      {/* ── Panel Card patterns ───────────────────────────────────────── */}
      <Section title="Panel Card Patterns">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <PanelCard title="Standard Panel" subtitle="With subtitle" action={<Button size="sm" variant="ghost">Action</Button>}>
            <p style={{ fontSize: 12, color: "var(--text1)" }}>Normal padding (12px) panel content. Use for cards with inline content.</p>
          </PanelCard>
          <PanelCard title="Flush Panel" padding="flush">
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border0)" }}>
              <p style={{ fontSize: 12, color: "var(--text0)" }}>Row 1 — flush padding lets you control internal spacing</p>
            </div>
            <div style={{ padding: "8px 12px" }}>
              <p style={{ fontSize: 12, color: "var(--text0)" }}>Row 2</p>
            </div>
          </PanelCard>
        </div>
      </Section>

      {/* ── Data Table ───────────────────────────────────────────────── */}
      <Section title="Data Table">
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--border0)" }}>
            <p className="panel-title">Top Signals</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StateTabs
                items={[{ label: "Normal", value: "normal" }, { label: "Compact", value: "compact" }]}
                value={density}
                onChange={(v) => setDensity(v as "normal" | "compact")}
                style="segmented"
              />
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className={`data-table${density === "compact" ? " compact" : ""}`}>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>League</th>
                  <th className="col-right">Confidence</th>
                  <th className="col-right">Edge</th>
                  <th>Pick</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_ROWS.map((row, i) => (
                  <tr key={i} className="tr-hover">
                    <td style={{ fontWeight: 500 }}>{row.match}</td>
                    <td style={{ color: "var(--text1)" }}>{row.league}</td>
                    <td className="num col-right" style={{
                      color: row.conf >= 70 ? "var(--positive)" : row.conf >= 55 ? "var(--warning)" : "var(--negative)",
                    }}>
                      {row.conf}%
                    </td>
                    <td className="num col-right" style={{
                      color: row.edge.startsWith("+") ? "var(--positive)" : "var(--negative)",
                    }}>
                      {row.edge}
                    </td>
                    <td><Badge variant="muted">{row.pick}</Badge></td>
                    <td>
                      {row.outcome ? <OutcomeBadge outcome={row.outcome} /> : <span style={{ color: "var(--text2)", fontSize: 11 }}>Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── Skeleton ─────────────────────────────────────────────────── */}
      <Section title="Skeleton Loading States">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <SkeletonTable rows={4} cols={5} />
        </div>
      </Section>

      {/* ── Empty States ─────────────────────────────────────────────── */}
      <Section title="Empty States">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card">
            <EmptyState
              title="No matches found"
              description="Try adjusting your filters or come back later when events are scheduled."
              icon={Database}
              action={<Button variant="secondary" size="sm">Reset filters</Button>}
            />
          </div>
          <div className="card">
            <EmptyState
              title="No data available"
              description="Connect the API to start seeing predictions."
              icon={AlertCircle}
            />
          </div>
        </div>
      </Section>

      {/* ── Modal ────────────────────────────────────────────────────── */}
      <Section title="Modal / Drawer">
        <div className="card" style={{ padding: 20 }}>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>Open Modal</Button>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Challenge" subtitle="Set up a new prediction challenge" size="md">
            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label className="label" style={{ display: "block", marginBottom: 4 }}>Challenge Name</label>
                <input className="input-field" placeholder="e.g. Premier League Week 12" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label" style={{ display: "block", marginBottom: 4 }}>Sport</label>
                <input className="input-field" placeholder="soccer / tennis / esports" />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary">Create</Button>
              </div>
            </div>
          </Modal>
        </div>
      </Section>

      {/* ── Chart placeholder ─────────────────────────────────────────── */}
      <Section title="Chart Container Pattern">
        <div className="chart-container">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p className="panel-title">ROI Over Time</p>
            <StateTabs
              items={[{ label: "7D", value: "7d" }, { label: "30D", value: "30d" }, { label: "All", value: "all" }]}
              value="30d"
              onChange={() => {}}
              style="segmented"
            />
          </div>
          <div style={{
            height:        200,
            background:    "var(--bg1)",
            borderRadius:  "var(--radius-sm)",
            border:        "1px solid var(--border0)",
            display:       "flex",
            alignItems:    "center",
            justifyContent: "center",
            flexDirection: "column",
            gap:           8,
          }}>
            <TrendingUp size={24} style={{ color: "var(--text2)" }} />
            <p style={{ fontSize: 11, color: "var(--text2)" }}>Chart renders here — see ROIChart, EloComparisonChart, etc.</p>
          </div>
        </div>
      </Section>

      {/* ── Spacing ──────────────────────────────────────────────────── */}
      <Section title="Spacing Scale">
        <div className="card" style={{ padding: 20 }}>
          {[8, 12, 16, 24, 32].map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <p className="num" style={{ fontSize: 11, color: "var(--text1)", width: 60 }}>{s}px</p>
              <div style={{ width: s * 2, height: 8, background: "var(--accent)", borderRadius: "var(--radius-sm)", opacity: 0.5 }} />
              <p style={{ fontSize: 11, color: "var(--text2)" }}>--space-{s}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Border radius ────────────────────────────────────────────── */}
      <Section title="Border Radius">
        <div className="card" style={{ padding: 20, display: "flex", gap: 24 }}>
          {[
            { label: "--radius-sm", value: "2px", radius: 2 },
            { label: "--radius-md", value: "4px", radius: 4 },
            { label: "lg (6px)",    value: "6px", radius: 6 },
          ].map(({ label, value, radius }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ width: 48, height: 48, background: "var(--border1)", borderRadius: radius }} />
              <p style={{ fontSize: 10, color: "var(--text1)", textAlign: "center" }}>{label}<br />{value}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
