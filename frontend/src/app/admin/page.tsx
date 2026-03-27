"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { getStoredToken } from "@/lib/auth";
import {
  Users,
  CreditCard,
  TrendingUp,
  UserPlus,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";

interface AdminStats {
  total_users: number;
  active_subscribers: number;
  trialing: number;
  canceled: number;
  no_subscription: number;
  mrr_gbp: number;
  new_users_30d: number;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
  stripe_customer_id: string | null;
  ai_tokens: number;
}

function statusBadge(status: string | null) {
  if (status === "active")
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-400"><CheckCircle className="h-3 w-3" />Active</span>;
  if (status === "trialing")
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400"><Clock className="h-3 w-3" />Trial</span>;
  if (status === "canceled")
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-400"><XCircle className="h-3 w-3" />Cancelled</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-white/40">No sub</span>;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const token = getStoredToken();
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch("/api/v1/admin/stats", { headers }),
        fetch("/api/v1/admin/users", { headers }),
      ]);
      if (statsRes.status === 403 || usersRes.status === 403) {
        setError("You don't have admin access.");
        return;
      }
      if (!statsRes.ok || !usersRes.ok) throw new Error("Failed to load admin data");
      setStats(await statsRes.json());
      setUsers(await usersRes.json());
    } catch {
      setError("Failed to load admin data. Make sure the API is reachable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.display_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const kpis = stats
    ? [
        { label: "Total Users", value: stats.total_users.toString(), icon: Users, color: "text-blue-400" },
        { label: "Active Subs", value: stats.active_subscribers.toString(), icon: CheckCircle, color: "text-green-400" },
        { label: "MRR", value: `£${stats.mrr_gbp.toFixed(2)}`, icon: CreditCard, color: "text-nid-accent" },
        { label: "New (30d)", value: stats.new_users_30d.toString(), icon: UserPlus, color: "text-purple-400" },
        { label: "Trialing", value: stats.trialing.toString(), icon: Clock, color: "text-blue-300" },
        { label: "Cancelled", value: stats.canceled.toString(), icon: XCircle, color: "text-red-400" },
        { label: "No Sub", value: stats.no_subscription.toString(), icon: TrendingUp, color: "text-white/40" },
        { label: "Annual Run Rate", value: `£${(stats.mrr_gbp * 12).toFixed(0)}`, icon: TrendingUp, color: "text-nid-accent" },
      ]
    : [];

  return (
    <AppShell title="Admin" subtitle="Users, subscriptions, and platform health">
      {loading ? (
        <div className="flex items-center justify-center py-24 text-sm text-nid-textMute">Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-300">{error}</div>
      ) : (
        <div className="space-y-6">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-nid-border bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-nid-textMute">{k.label}</span>
                  <k.icon className={`h-4 w-4 shrink-0 ${k.color}`} />
                </div>
                <div className="mt-3 font-display text-[28px] font-black tracking-[-0.04em] text-nid-text">{k.value}</div>
              </div>
            ))}
          </div>

          {/* Users table */}
          <div className="rounded-2xl border border-nid-border bg-white/[0.02] overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-nid-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[15px] font-semibold text-nid-text">All Users</div>
                <div className="mt-0.5 text-[12px] text-nid-textMute">{users.length} total</div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search by email or name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-64 rounded-xl border border-nid-border bg-white/[0.05] px-3 text-[13px] text-nid-text placeholder:text-nid-textMute outline-none focus:border-nid-accentRing"
                />
                <button
                  onClick={load}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-nid-border bg-white/[0.04] text-nid-textMute hover:text-nid-text transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-[13px]">
                <thead>
                  <tr className="border-b border-nid-border">
                    {["Name / Email", "Status", "Joined", "Period End", "AI Tokens", "Stripe ID"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.10em] text-nid-textMute">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-nid-border/50 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-nid-text">{u.display_name ?? "—"}</div>
                        <div className="text-nid-textMute">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">{statusBadge(u.subscription_status)}</td>
                      <td className="px-4 py-3 text-nid-textSoft">{fmt(u.created_at)}</td>
                      <td className="px-4 py-3 text-nid-textSoft">{fmt(u.subscription_current_period_end)}</td>
                      <td className="px-4 py-3 font-mono text-nid-textSoft">{u.ai_tokens}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-nid-textMute">
                        {u.stripe_customer_id ? u.stripe_customer_id.slice(0, 18) + "…" : "—"}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-nid-textMute">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
