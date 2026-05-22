"use client";

/**
 * Admin dashboard — every signal in one page.
 *
 * Sections:
 *   1. Overview cards (users, emails, labels, corrections, error rate, cost)
 *   2. Confusion matrix (top 20 computed→override pairs)
 *   3. Problem senders (top 20 with most corrections)
 *   4. Recent corrections feed (last 50, auto-refresh every 30s)
 *   5. Per-user breakdown (every user's activity, sortable)
 *
 * No write actions yet — pure observability. Once you see the patterns,
 * you ship a heuristic fix server-side.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Users,
  Mail,
  Tag,
  Bot,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  ArrowDownUp,
  Search,
  Sparkles,
  Check,
  X,
  Loader2,
} from "lucide-react";

interface OverviewData {
  overview: {
    total_users: number;
    total_emails: number;
    emails_24h: number;
    labels_applied_total: number;
    labels_applied_24h: number;
    labels_applied_14d: number;
    llm_classified_total: number;
    llm_classified_14d: number;
    corrections_total: number;
    corrections_14d: number;
    corrections_24h: number;
    error_rate_14d_pct: number;
    llm_cost_estimate_14d_usd: number;
    upvotes_14d: number;
    downvotes_14d: number;
    feedback_total: number;
    feedback_24h: number;
  };
  confusion: Array<{
    from: string;
    to: string;
    count: number;
    llm: number;
    heur: number;
  }>;
  problem_senders: Array<{
    sender: string;
    count: number;
    top_correction: string;
    sample_subject: string | null;
  }>;
  recent: Array<{
    id: string;
    user_id: string;
    computed_label: string | null;
    user_override: string;
    was_llm: boolean;
    llm_content_label: string | null;
    sender_email: string | null;
    subject: string | null;
    correction_reason: string | null;
    score_at_time: number | null;
    created_at: string;
  }>;
  users: Array<{
    user_id: string;
    emails: number;
    labels_applied: number;
    corrections: number;
    feedback: number;
    last_synced_at: string | null;
    gmail_labels_enabled: boolean;
  }>;
  recent_feedback: Array<{
    id: string;
    user_id: string;
    message: string;
    page_url: string | null;
    emailed: boolean;
    created_at: string;
  }>;
  generated_at: string;
}

type UserSortKey =
  | "emails"
  | "labels_applied"
  | "corrections"
  | "feedback"
  | "last_synced_at";

const LABEL_COLOR: Record<string, string> = {
  respond: "#cc3a21",
  awaiting: "#eaa041",
  followup: "#3c78d8",
  meeting: "#8e63ce",
  receipt: "#149e60",
  fyi: "#cccccc",
  marketing: "#fbc8d9",
  no_label: "#A89F92",
  none: "#A89F92",
};

const PAGE_BG = "min-h-screen text-[#2A2520] dark:text-[#FBF4DF] settings-bg";

export function AdminDashboard({ adminEmail }: { adminEmail: string }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSort, setUserSort] = useState<UserSortKey>("emails");

  const load = async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || `Couldn't load (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Auto-refresh every 30s so the live correction feed stays fresh
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const ov = data?.overview;

  return (
    <div className={PAGE_BG}>
      <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-[#A89F92] mb-1">
              Operator console
            </p>
            <h1
              className="text-[36px] tracking-[-0.018em] text-[#2A2520] dark:text-[#FBF4DF] leading-tight"
              style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
            >
              Oushi admin
            </h1>
            <p className="mt-1 text-[12px] text-[#A89F92]">
              {adminEmail} ·{" "}
              {data?.generated_at
                ? "Updated " +
                  new Date(data.generated_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] px-3 py-2 text-[12px] font-medium text-[#766E63] dark:text-[#A89F92] hover:text-[#B86B4A] disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-[12px] text-[#766E63] dark:text-[#A89F92] hover:text-[#B86B4A] px-3 py-2"
            >
              Back to dashboard →
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-[#B86B4A]/30 bg-[#F5E8E0]/40 px-5 py-3.5 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 text-[#B86B4A]" />
            <div>
              <p className="text-[13px] font-medium text-[#B86B4A]">
                Couldn&apos;t load admin data
              </p>
              <p className="text-[12px] text-[#A66556] mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ===== Overview cards ===== */}
        <SectionHeader title="System overview" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
          <StatCard
            icon={<Users className="w-3.5 h-3.5" />}
            label="Users"
            value={ov?.total_users ?? "—"}
            sub="active accounts"
          />
          <StatCard
            icon={<Mail className="w-3.5 h-3.5" />}
            label="Emails synced"
            value={ov?.total_emails ?? "—"}
            sub={`${ov?.emails_24h ?? 0} in last 24h`}
          />
          <StatCard
            icon={<Tag className="w-3.5 h-3.5" />}
            label="Labels applied"
            value={ov?.labels_applied_total ?? "—"}
            sub={`${ov?.labels_applied_14d ?? 0} in last 14d`}
          />
          <StatCard
            icon={<Bot className="w-3.5 h-3.5" />}
            label="LLM classifications"
            value={ov?.llm_classified_total ?? "—"}
            sub={`${ov?.llm_classified_14d ?? 0} in last 14d`}
          />
          <StatCard
            icon={<AlertCircle className="w-3.5 h-3.5" />}
            label="Corrections logged"
            value={ov?.corrections_total ?? "—"}
            sub={`${ov?.corrections_24h ?? 0} in last 24h`}
            tone="warn"
          />
          <StatCard
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            label="Error rate (14d)"
            value={`${ov?.error_rate_14d_pct ?? "—"}%`}
            sub="corrections / labels applied"
            tone={ov && ov.error_rate_14d_pct > 10 ? "warn" : "good"}
          />
          <StatCard
            icon={<DollarSign className="w-3.5 h-3.5" />}
            label="LLM spend (14d)"
            value={`$${ov?.llm_cost_estimate_14d_usd ?? "—"}`}
            sub="estimated Haiku cost"
          />
          <StatCard
            icon={<ThumbsUp className="w-3.5 h-3.5" />}
            label="Feedback (14d)"
            value={
              ov
                ? `${ov.upvotes_14d}↑ ${ov.downvotes_14d}↓`
                : "—"
            }
            sub="thumbs up / down"
          />
          <StatCard
            icon={<ThumbsDown className="w-3.5 h-3.5" />}
            label="Bug reports"
            value={ov?.feedback_total ?? "—"}
            sub={`${ov?.feedback_24h ?? 0} in last 24h`}
            tone={ov && ov.feedback_24h > 0 ? "warn" : "default"}
          />
        </div>

        {/* ===== Confusion matrix ===== */}
        <SectionHeader
          title="Confusion matrix"
          subtitle="What users correct labels TO, ordered by frequency. Patterns here are direct hints for the next heuristic/prompt change."
        />
        <Card className="mb-10">
          {data && data.confusion.length === 0 ? (
            <EmptyRow text="No corrections logged yet." />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A89F92] border-b border-[#E6DCC4] dark:border-[#3A3127]">
                <tr>
                  <th className="text-left px-4 py-2.5">Computed</th>
                  <th className="text-left px-4 py-2.5">→ User picked</th>
                  <th className="text-right px-4 py-2.5">Count</th>
                  <th className="text-right px-4 py-2.5">LLM</th>
                  <th className="text-right px-4 py-2.5">Heuristic</th>
                </tr>
              </thead>
              <tbody>
                {data?.confusion.map((p, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#E6DCC4]/50 dark:border-[#3A3127]/50 ${
                      i % 2 === 1 ? "bg-[#FAF6EB]/30 dark:bg-[#25201A]/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <LabelPill name={p.from} />
                    </td>
                    <td className="px-4 py-2.5">
                      <LabelPill name={p.to} />
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono tabular-nums font-semibold">
                      {p.count}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono tabular-nums text-[#766E63] dark:text-[#A89F92]">
                      {p.llm}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono tabular-nums text-[#766E63] dark:text-[#A89F92]">
                      {p.heur}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* ===== Problem senders ===== */}
        <SectionHeader
          title="Problem senders"
          subtitle="Senders generating the most corrections. Candidates for the BROADCAST_SENDER_DOMAINS noise list or a sender rule."
        />
        <Card className="mb-10">
          {data && data.problem_senders.length === 0 ? (
            <EmptyRow text="No corrections logged yet." />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A89F92] border-b border-[#E6DCC4] dark:border-[#3A3127]">
                <tr>
                  <th className="text-left px-4 py-2.5">Sender</th>
                  <th className="text-left px-4 py-2.5">Top correction</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">
                    Sample subject
                  </th>
                  <th className="text-right px-4 py-2.5">Errors</th>
                </tr>
              </thead>
              <tbody>
                {data?.problem_senders.map((s, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#E6DCC4]/50 dark:border-[#3A3127]/50 ${
                      i % 2 === 1 ? "bg-[#FAF6EB]/30 dark:bg-[#25201A]/30" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-[11.5px]">
                      {s.sender}
                    </td>
                    <td className="px-4 py-2.5 text-[#766E63] dark:text-[#A89F92]">
                      {s.top_correction}
                    </td>
                    <td className="px-4 py-2.5 text-[#766E63] dark:text-[#A89F92] truncate max-w-[280px] hidden md:table-cell">
                      {s.sample_subject || "—"}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono tabular-nums font-semibold">
                      {s.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* ===== Recent corrections feed ===== */}
        <SectionHeader
          title="Recent corrections"
          subtitle="Live feed of every label override across all users. Auto-refreshes every 30 seconds."
        />
        <Card className="mb-10">
          {data && data.recent.length === 0 ? (
            <EmptyRow text="No corrections logged yet." />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A89F92] border-b border-[#E6DCC4] dark:border-[#3A3127]">
                <tr>
                  <th className="text-left px-4 py-2.5">When</th>
                  <th className="text-left px-4 py-2.5">User</th>
                  <th className="text-left px-4 py-2.5">Source</th>
                  <th className="text-left px-4 py-2.5">Computed → Picked</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">
                    Sender / subject
                  </th>
                  <th className="text-right px-4 py-2.5 hidden lg:table-cell">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.recent.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[#E6DCC4]/50 dark:border-[#3A3127]/50"
                  >
                    <td className="px-4 py-2.5 font-mono text-[10.5px] text-[#A89F92] whitespace-nowrap">
                      {formatRelativeTime(r.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10.5px] text-[#766E63] dark:text-[#A89F92]">
                      {r.user_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          r.was_llm
                            ? "bg-[#D0E1F0]/50 text-[#3D6A95] dark:bg-[#3A2F23] dark:text-[#D9956E]"
                            : "bg-[#F0E9D6] text-[#766E63] dark:bg-[#2E2820] dark:text-[#A89F92]"
                        }`}
                      >
                        {r.was_llm ? "LLM" : "Heur"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="inline-flex items-center gap-1.5">
                        <LabelPill name={r.computed_label || "no_label"} />
                        <span className="text-[#A89F92]">→</span>
                        <LabelPill name={r.user_override} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 max-w-[280px] hidden md:table-cell">
                      <p className="text-[11.5px] font-mono text-[#A89F92] truncate">
                        {r.sender_email || "—"}
                      </p>
                      <p className="text-[12.5px] truncate text-[#3F362C] dark:text-[#E8D9B8]">
                        {r.subject || "—"}
                      </p>
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono tabular-nums text-[#766E63] dark:text-[#A89F92] hidden lg:table-cell">
                      {r.score_at_time ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* ===== In-app feedback reports ===== */}
        <SectionHeader
          title="Feedback reports"
          subtitle="Submitted via the in-app 'Send feedback' widget. Also emailed to support@oushi.app in real time."
        />
        <Card className="mb-10">
          {data && data.recent_feedback.length === 0 ? (
            <EmptyRow text="No feedback reports yet — testers haven't used the widget." />
          ) : (
            <div className="divide-y divide-[#E6DCC4]/50 dark:divide-[#3A3127]/50">
              {data?.recent_feedback.map((f) => (
                <div key={f.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2 text-[10.5px] font-mono">
                      <span className="text-[#A89F92]">
                        {formatRelativeTime(f.created_at)}
                      </span>
                      <span className="text-[#766E63] dark:text-[#A89F92]">
                        {f.user_id.slice(0, 8)}…
                      </span>
                      <span
                        className={`uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          f.emailed
                            ? "bg-[#E8EFE5] text-[#4F6B4D] dark:bg-[#2E3A2E] dark:text-[#A8C9A1]"
                            : "bg-[#F5E8E0] text-[#B86B4A] dark:bg-[#3A2F23] dark:text-[#D9956E]"
                        }`}
                      >
                        {f.emailed ? "Emailed" : "DB only"}
                      </span>
                    </div>
                    {f.page_url && (
                      <a
                        href={f.page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10.5px] font-mono text-[#A89F92] hover:text-[#B86B4A] truncate max-w-[260px]"
                      >
                        {new URL(f.page_url).pathname}
                      </a>
                    )}
                  </div>
                  <p className="text-[13.5px] text-[#3F362C] dark:text-[#E8D9B8] leading-relaxed whitespace-pre-wrap">
                    {f.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ===== Plan management ===== */}
        <SectionHeader
          title="Plan management"
          subtitle="Search a beta tester by email and flip them to Pro. No payment processing yet — this is the manual grant flow."
        />
        <PlanManagement />

        {/* ===== Per-user breakdown ===== */}
        <SectionHeader
          title="Users"
          subtitle="Per-user activity across the system. Click a column header to sort."
        />
        <Card className="mb-10">
          {data && data.users.length === 0 ? (
            <EmptyRow text="No users yet." />
          ) : (
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A89F92] border-b border-[#E6DCC4] dark:border-[#3A3127]">
                <tr>
                  <th className="text-left px-4 py-2.5">User ID</th>
                  <SortHeader
                    label="Emails"
                    sortKey="emails"
                    current={userSort}
                    onSort={setUserSort}
                  />
                  <SortHeader
                    label="Labeled"
                    sortKey="labels_applied"
                    current={userSort}
                    onSort={setUserSort}
                  />
                  <SortHeader
                    label="Corrections"
                    sortKey="corrections"
                    current={userSort}
                    onSort={setUserSort}
                  />
                  <SortHeader
                    label="Feedback"
                    sortKey="feedback"
                    current={userSort}
                    onSort={setUserSort}
                  />
                  <SortHeader
                    label="Last sync"
                    sortKey="last_synced_at"
                    current={userSort}
                    onSort={setUserSort}
                  />
                  <th className="text-center px-4 py-2.5">Labels on</th>
                </tr>
              </thead>
              <tbody>
                {data?.users
                  .slice()
                  .sort((a, b) => {
                    if (userSort === "last_synced_at") {
                      const aT = a.last_synced_at
                        ? new Date(a.last_synced_at).getTime()
                        : 0;
                      const bT = b.last_synced_at
                        ? new Date(b.last_synced_at).getTime()
                        : 0;
                      return bT - aT;
                    }
                    return (
                      (b[userSort] as number) - (a[userSort] as number)
                    );
                  })
                  .map((u, i) => (
                    <tr
                      key={u.user_id}
                      className={`border-b border-[#E6DCC4]/50 dark:border-[#3A3127]/50 ${
                        i % 2 === 1 ? "bg-[#FAF6EB]/30 dark:bg-[#25201A]/30" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[10.5px] text-[#766E63] dark:text-[#A89F92]">
                        {u.user_id.slice(0, 12)}…
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono tabular-nums">
                        {u.emails}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono tabular-nums">
                        {u.labels_applied}
                      </td>
                      <td
                        className={`text-right px-4 py-2.5 font-mono tabular-nums ${
                          u.corrections > 5
                            ? "text-[#B86B4A] dark:text-[#D9956E] font-semibold"
                            : ""
                        }`}
                      >
                        {u.corrections}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono tabular-nums">
                        {u.feedback}
                      </td>
                      <td className="text-right px-4 py-2.5 font-mono text-[10.5px] text-[#A89F92] whitespace-nowrap">
                        {u.last_synced_at
                          ? formatRelativeTime(u.last_synced_at)
                          : "—"}
                      </td>
                      <td className="text-center px-4 py-2.5">
                        {u.gmail_labels_enabled ? (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#6B8E68]" />
                        ) : (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D6CDB8]" />
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* ===== Help footer ===== */}
        <div className="mt-12 rounded-2xl border border-[#E6DCC4] dark:border-[#3A3127] bg-[#FFFCF3]/60 dark:bg-[#25201A]/60 px-6 py-5">
          <p
            className="text-[14px] text-[#2A2520] dark:text-[#FBF4DF] mb-2"
            style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
          >
            How to read this dashboard
          </p>
          <ul className="text-[12.5px] text-[#766E63] dark:text-[#A89F92] leading-relaxed space-y-1.5 list-disc pl-5">
            <li>
              <strong className="text-[#3F362C] dark:text-[#E8D9B8]">
                Confusion matrix
              </strong>{" "}
              is the most actionable signal. Pairs that show up 5+ times are
              candidates for a heuristic or LLM-prompt fix. The LLM/Heuristic
              split tells you WHICH layer to fix.
            </li>
            <li>
              <strong className="text-[#3F362C] dark:text-[#E8D9B8]">
                Problem senders
              </strong>{" "}
              with 3+ corrections are candidates for the
              BROADCAST_SENDER_DOMAINS list in lib/outstanding.ts. Add the
              substring, redeploy, hit /api/email/rerank-broadcasts to
              retroactively rewrite scores.
            </li>
            <li>
              <strong className="text-[#3F362C] dark:text-[#E8D9B8]">
                Error rate
              </strong>{" "}
              over 10% means something systemic is off. Under 5% is healthy.
            </li>
            <li>
              <strong className="text-[#3F362C] dark:text-[#E8D9B8]">
                LLM spend
              </strong>{" "}
              should stay near $0.30/active user/month. Higher means the LLM
              cap is being hit too often.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2
        className="text-[22px] tracking-[-0.01em] text-[#2A2520] dark:text-[#FBF4DF]"
        style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-[12.5px] text-[#766E63] dark:text-[#A89F92] max-w-[700px] leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-[#E6DCC4]/80 dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] overflow-hidden ${className}`}
      style={{
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 24px -10px rgba(106,76,38,0.08), 0 1px 3px rgba(106,76,38,0.04)",
      }}
    >
      {children}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  const accent =
    tone === "warn"
      ? "text-[#B86B4A] dark:text-[#D9956E]"
      : tone === "good"
        ? "text-[#6B8E68]"
        : "text-[#B86B4A]";
  return (
    <div
      className="rounded-xl border border-[#E6DCC4]/80 dark:border-[#3A3127] bg-[#FFFCF3] dark:bg-[#25201A] p-4"
      style={{
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.5) inset, 0 2px 8px -4px rgba(106,76,38,0.06)",
      }}
    >
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#A89F92] mb-2">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <p
        className="text-[26px] tracking-[-0.01em] text-[#2A2520] dark:text-[#FBF4DF] leading-none"
        style={{ fontFamily: "var(--font-source-serif), Georgia, serif" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-[#A89F92] mt-1.5 leading-tight">
          {sub}
        </p>
      )}
    </div>
  );
}

function LabelPill({ name }: { name: string }) {
  const bg = LABEL_COLOR[name] || "#A89F92";
  const isLight = name === "fyi" || name === "marketing" || name === "no_label" || name === "none";
  const fg = isLight ? "#000" : "#fff";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-medium uppercase tracking-wider"
      style={{ backgroundColor: bg, color: fg }}
    >
      {name}
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: UserSortKey;
  current: UserSortKey;
  onSort: (k: UserSortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`text-right px-4 py-2.5 cursor-pointer hover:text-[#B86B4A] transition-colors ${
        active ? "text-[#B86B4A] dark:text-[#D9956E]" : ""
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowDownUp className="w-2.5 h-2.5 opacity-50" />
      </span>
    </th>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-[12.5px] text-[#A89F92] italic">
      {text}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

// ─────────────────────────────────────────────────────────────────────────
// Plan management — search by email, grant/revoke Pro
// ─────────────────────────────────────────────────────────────────────────

interface PlanUserRow {
  user_id: string;
  email: string | null;
  name: string | null;
  created_at: string | null;
  tier: "free" | "pro";
  subscription_active_until: string | null;
  subscription_updated_at: string | null;
  last_synced_at: string | null;
  email_count: number;
}

function PlanManagement() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<PlanUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [lastFlash, setLastFlash] = useState<{
    user_id: string;
    tier: "free" | "pro";
  } | null>(null);

  // Debounced search — fires 250ms after the last keystroke so each
  // letter doesn't hit Supabase's admin listUsers. Initial mount fires
  // immediately with an empty query (gets the 20 most recent users).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/grant-pro?q=${encodeURIComponent(query)}`
        );
        if (cancelled) return;
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setError(j?.error || `Couldn't search (HTTP ${res.status})`);
          setUsers([]);
          return;
        }
        const json = (await res.json()) as { users: PlanUserRow[] };
        if (cancelled) return;
        setUsers(json.users);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Flash highlight fades after a moment. Visual confirmation that the
  // flip actually persisted.
  useEffect(() => {
    if (!lastFlash) return;
    const t = setTimeout(() => setLastFlash(null), 1800);
    return () => clearTimeout(t);
  }, [lastFlash]);

  async function flip(userId: string, action: "grant" | "revoke") {
    setBusyId(userId);
    setConfirmRevokeId(null);
    try {
      const res = await fetch("/api/admin/grant-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || `Couldn't update (HTTP ${res.status})`);
        return;
      }
      // Optimistically update the row in-place so the table doesn't blink.
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === userId
            ? {
                ...u,
                tier: json.tier === "pro" ? "pro" : "free",
                subscription_active_until: null,
                subscription_updated_at: new Date().toISOString(),
              }
            : u
        )
      );
      setLastFlash({ user_id: userId, tier: json.tier });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mb-10">
      {/* Search bar */}
      <div className="px-4 py-3 border-b border-[#E6DCC4]/60 dark:border-[#3A3127]/60 flex items-center gap-2.5">
        <Search className="w-3.5 h-3.5 text-[#A89F92] shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email or name…"
          className="flex-1 bg-transparent text-[13.5px] text-[#2A2520] dark:text-[#FBF4DF] placeholder:text-[#A89F92] outline-none"
        />
        {loading && (
          <Loader2 className="w-3.5 h-3.5 text-[#A89F92] animate-spin shrink-0" />
        )}
        {!loading && users.length > 0 && (
          <span className="text-[10.5px] font-mono text-[#A89F92] shrink-0">
            {users.length} {users.length === 1 ? "result" : "results"}
          </span>
        )}
      </div>

      {error && (
        <div className="px-4 py-2.5 border-b border-[#B86B4A]/20 bg-[#F5E8E0]/40 flex items-center gap-2 text-[12px] text-[#B86B4A]">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {users.length === 0 ? (
        <EmptyRow
          text={
            loading
              ? "Searching…"
              : query
                ? `No users matching "${query}"`
                : "No users yet."
          }
        />
      ) : (
        <table className="w-full text-[12.5px]">
          <thead className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#A89F92] border-b border-[#E6DCC4] dark:border-[#3A3127]">
            <tr>
              <th className="text-left px-4 py-2.5">User</th>
              <th className="text-left px-4 py-2.5">Tier</th>
              <th className="text-right px-4 py-2.5">Activity</th>
              <th className="text-right px-4 py-2.5 w-[160px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const isFlashing = lastFlash?.user_id === u.user_id;
              const isBusy = busyId === u.user_id;
              const isConfirmingRevoke = confirmRevokeId === u.user_id;
              return (
                <tr
                  key={u.user_id}
                  className={`border-b border-[#E6DCC4]/50 dark:border-[#3A3127]/50 transition-colors ${
                    isFlashing
                      ? "bg-[#E8EFE5] dark:bg-[#2E3A2E]/40"
                      : i % 2 === 1
                        ? "bg-[#FAF6EB]/30 dark:bg-[#25201A]/30"
                        : ""
                  }`}
                >
                  <td className="px-4 py-3 align-top min-w-0">
                    <div className="flex flex-col">
                      <span className="text-[13px] font-medium text-[#2A2520] dark:text-[#FBF4DF] truncate max-w-[280px]">
                        {u.email || "(no email)"}
                      </span>
                      {u.name && (
                        <span className="text-[11.5px] text-[#766E63] dark:text-[#A89F92] truncate max-w-[280px]">
                          {u.name}
                        </span>
                      )}
                      <span className="mt-0.5 text-[10.5px] font-mono text-[#A89F92] truncate">
                        {u.user_id}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <TierBadge tier={u.tier} />
                    {u.subscription_updated_at && (
                      <p className="mt-1 text-[10.5px] text-[#A89F92]">
                        Changed{" "}
                        {formatRelativeTime(u.subscription_updated_at)} ago
                      </p>
                    )}
                  </td>
                  <td className="text-right px-4 py-3 align-top">
                    <p className="text-[12px] font-mono tabular-nums text-[#2A2520] dark:text-[#FBF4DF]">
                      {u.email_count} emails
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-[#A89F92]">
                      {u.last_synced_at
                        ? `synced ${formatRelativeTime(u.last_synced_at)} ago`
                        : "never synced"}
                    </p>
                  </td>
                  <td className="text-right px-4 py-3 align-top">
                    {u.tier === "pro" ? (
                      isConfirmingRevoke ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => flip(u.user_id, "revoke")}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-md bg-[#B86B4A] px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-[#A65B3F] disabled:opacity-60"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            disabled={isBusy}
                            className="inline-flex items-center rounded-md border border-[#E6DCC4] bg-[#FFFCF3] px-2 py-1 text-[11.5px] font-medium text-[#766E63] hover:text-[#2A2520]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(u.user_id)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E6DCC4] bg-[#FFFCF3] px-2.5 py-1 text-[11.5px] font-medium text-[#766E63] hover:text-[#B86B4A] hover:border-[#B86B4A]/40 disabled:opacity-60"
                        >
                          <X className="w-3 h-3" />
                          Revoke Pro
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => flip(u.user_id, "grant")}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 rounded-md bg-[#5E8FBF] px-2.5 py-1 text-[11.5px] font-medium text-white shadow-sm hover:bg-[#4A7AAB] hover:shadow-md disabled:opacity-60 transition-all"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Grant Pro
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function TierBadge({ tier }: { tier: "free" | "pro" }) {
  if (tier === "pro") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D0E1F0]/60 border border-[#5E8FBF]/30 px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-[#3D6A95]">
        <Sparkles className="w-2.5 h-2.5" />
        Pro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#FAF6EB] border border-[#E6DCC4] px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-[0.14em] text-[#766E63] dark:text-[#A89F92]">
      Free
    </span>
  );
}
