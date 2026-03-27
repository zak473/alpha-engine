"use client";

import { cn } from "@/lib/utils";
import {
  X,
  AlertTriangle,
  AlertCircle,
  BarChart2,
  Brain,
  CheckCircle,
  Clock,
  Trophy,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

// ── Alert types ───────────────────────────────────────────────────────────────

interface Alert {
  id: string;
  level: "error" | "warn" | "info";
  title: string;
  detail?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

interface ActionItem {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  href?: string;
  onClick?: () => void;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ActionCenterProps {
  open: boolean;
  onClose: () => void;
  apiOk: boolean;
  dbOk: boolean;
  modelStaledays: number | null;   // days since trained, null if no model
  expiringCount: number;           // predictions starting in < 2h
  challengeEndingName?: string;    // name of challenge ending soon, if any
  onOpenSystemDrawer?: () => void;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function AlertRow({ alert }: { alert: Alert }) {
  const Icon = alert.level === "error" ? AlertCircle : alert.level === "warn" ? AlertTriangle : CheckCircle;
  const colors = {
    error: { text: "text-accent-red",   bg: "bg-accent-red/8",   border: "border-accent-red/20"   },
    warn:  { text: "text-accent-amber", bg: "bg-accent-amber/8", border: "border-accent-amber/20" },
    info:  { text: "text-accent-green", bg: "bg-accent-green/8", border: "border-accent-green/20" },
  }[alert.level];

  return (
    <div className={cn("rounded-lg border p-3", colors.bg, colors.border)}>
      <div className="flex items-start gap-2">
        <Icon size={13} className={cn("shrink-0 mt-0.5", colors.text)} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-medium", colors.text)}>{alert.title}</p>
          {alert.detail && <p className="text-xs text-text-muted mt-0.5">{alert.detail}</p>}
        </div>
      </div>
      {alert.action && (
        <button
          onClick={alert.action.onClick}
          className={cn("mt-2 text-xs font-medium flex items-center gap-1", colors.text, "hover:opacity-80 transition-opacity")}
        >
          {alert.action.label}
          <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}


// ── Main ActionCenter ─────────────────────────────────────────────────────────

export function ActionCenter({
  open,
  onClose,
  apiOk,
  dbOk,
  modelStaledays,
  expiringCount,
  challengeEndingName,
  onOpenSystemDrawer,
}: ActionCenterProps) {
  // Build alert list
  const alerts: Alert[] = [];

  if (!apiOk || !dbOk) {
    alerts.push({
      id: "pipeline",
      level: "error",
      title: "Pipeline degraded",
      detail: !apiOk ? "API not reachable — data may be stale." : "Database connection failed.",
      action: { label: "View system status", onClick: onOpenSystemDrawer },
    });
  }

  if (modelStaledays !== null && modelStaledays > 14) {
    alerts.push({
      id: "model-stale",
      level: "warn",
      title: `Model stale — trained ${modelStaledays}d ago`,
      detail: "Predictions may be less accurate. Retrain recommended.",
      action: { label: "Go to Models →", href: "/models" },
    });
  }

  if (expiringCount > 0) {
    alerts.push({
      id: "expiring",
      level: "warn",
      title: `${expiringCount} prediction${expiringCount > 1 ? "s" : ""} starting in < 2h`,
      detail: "Resolve these predictions before they lock.",
    });
  }

  if (challengeEndingName) {
    alerts.push({
      id: "challenge",
      level: "info",
      title: "Challenge ending soon",
      detail: `"${challengeEndingName}" — place your picks now.`,
      action: { label: "Go to challenge →", href: "/challenges" },
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-good",
      level: "info",
      title: "All systems operational",
      detail: "No action required right now.",
    });
  }

  // Suggested actions
  const actions: ActionItem[] = [];
  if (modelStaledays !== null && modelStaledays > 14) {
    actions.push({ id: "train", icon: Brain, label: "Train new model", description: "Retrain with latest data", href: "/models" });
  }
  if (expiringCount > 0) {
    actions.push({ id: "resolve", icon: Clock, label: `Resolve ${expiringCount} expiring`, description: "Predictions locking soon", href: "/predictions" });
  }
  if (challengeEndingName) {
    actions.push({ id: "picks", icon: Trophy, label: "Place challenge picks", description: challengeEndingName, href: "/challenges" });
  }
  actions.push({ id: "review", icon: BarChart2, label: "Review performance", description: "Check model calibration", href: "/models" });

  return (
    <>
      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Rail */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-72 z-40 bg-white/[0.04] border-l border-white/8",
          "flex flex-col shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div>
            <p className="text-sm font-semibold text-text-primary">Action Center</p>
            <p className="text-2xs text-text-muted">What to do next</p>
          </div>
          <button onClick={onClose} className="text-text-subtle hover:text-text-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Alerts */}
          <section>
            <p className="label mb-2">Alerts</p>
            <div className="space-y-2">
              {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
            </div>
          </section>

          {/* Suggested actions */}
          {actions.length > 0 && (
            <section>
              <p className="label mb-2">Suggested Actions</p>
              <div className="space-y-1.5">
                {actions.map((a) => (
                  <a
                    key={a.id}
                    href={a.href ?? "#"}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/8 bg-white/[0.02] hover:bg-white/[0.025] hover:border-zinc-600 transition-all group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center shrink-0">
                      <a.icon size={13} className="text-accent-blue" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-text-primary">{a.label}</p>
                      <p className="text-2xs text-text-muted">{a.description}</p>
                    </div>
                    <ChevronRight size={11} className="text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            </section>
          )}


          {/* Keyboard shortcuts hint */}
          <section>
            <p className="label mb-2">Keyboard Shortcuts</p>
            <div className="space-y-1.5 text-xs text-text-muted">
              {[
                ["/",     "Focus search"],
                ["↑ ↓",   "Navigate rows"],
                ["Enter", "Expand row"],
                ["W",     "Watchlist toggle"],
                ["Q",     "Add to queue"],
                ["C",     "Compare selected"],
                ["A",     "Toggle action center"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span>{desc}</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/8 text-text-subtle text-2xs font-mono">{key}</kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
