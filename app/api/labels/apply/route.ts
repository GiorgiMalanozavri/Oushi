import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  ensureOushiLabels,
  applyLabelsBatch,
  computeLabelForEmail,
  type OushiLabelKey,
} from "@/lib/gmail-labels";
import type { EmailRow } from "@/lib/outstanding";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/labels/apply
 *   Idempotent backfill. Walks the user's last N days of synced emails,
 *   computes the right Oushi label for each, applies via batchModify.
 *   Manual overrides from email_label_overrides win over the heuristic.
 *
 *   Returns a streamed application/x-ndjson response — one JSON object per
 *   line — so the Settings UI can show real progress instead of staring at
 *   a stuck "Labeling…" button for 30+ seconds. Events look like:
 *     { phase: "ensuring_labels" }
 *     { phase: "fetching", days: 14 }
 *     { phase: "fetched", count: 287 }
 *     { phase: "classifying" }
 *     { phase: "applying", group: "respond", count: 45, appliedSoFar: 0, totalToApply: 287 }
 *     { phase: "applied", group: "respond", count: 45, appliedSoFar: 45, totalToApply: 287 }
 *     ... (one applying/applied pair per group) ...
 *     { phase: "done", scanned, applied, cleared, breakdown }
 *     { phase: "error", message }
 *
 *   Body: { days?: number } — default 14, capped at 60
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3 applies per 10 min — backfill is expensive against Gmail quota
  const limit = rateLimit(`labels-apply:${user.id}`, 3, 10 * 60 * 1000);
  if (!limit.ok) {
    return new Response(
      JSON.stringify({
        error: `Labeling is rate-limited. Try again in ${limit.retryAfterSeconds}s.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const days = Math.max(1, Math.min(60, Number(body?.days) || 14));

  const encoder = new TextEncoder();
  const userId = user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        // 1. Ensure labels exist in Gmail
        send({ phase: "ensuring_labels" });
        let labelMap;
        try {
          labelMap = await ensureOushiLabels(userId);
        } catch (e) {
          send({
            phase: "error",
            message: e instanceof Error ? e.message : "Could not create Gmail labels",
          });
          controller.close();
          return;
        }
        if (labelMap.size === 0) {
          send({
            phase: "error",
            message:
              "Couldn't create labels in Gmail. Try reconnecting Gmail in Settings.",
          });
          controller.close();
          return;
        }

        // 2. Fetch the last N days of emails
        send({ phase: "fetching", days });
        const service = await createServiceClient();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const { data: emails, error } = await service
          .from("emails")
          .select("*")
          .eq("user_id", userId)
          .gte("received_at", since)
          .order("received_at", { ascending: false })
          .limit(1000);

        if (error) {
          send({ phase: "error", message: error.message });
          controller.close();
          return;
        }
        if (!emails || emails.length === 0) {
          send({
            phase: "done",
            scanned: 0,
            applied: 0,
            cleared: 0,
            days,
            breakdown: {},
          });
          controller.close();
          return;
        }
        send({ phase: "fetched", count: emails.length });

        // 3. Load overrides so manual decisions win
        const { data: overrideRows } = await service
          .from("email_label_overrides")
          .select("email_id, override_label_key")
          .eq("user_id", userId);
        const overrides = new Map<string, OushiLabelKey | null>();
        for (const r of (overrideRows || []) as Array<{
          email_id: string;
          override_label_key: OushiLabelKey | null;
        }>) {
          overrides.set(r.email_id, r.override_label_key ?? null);
        }

        // 4. Classify each email
        send({ phase: "classifying" });
        const decisions: Array<{
          emailId: string;
          gmailMessageId: string;
          labelKey: OushiLabelKey | null;
        }> = [];
        const counts: Record<string, number> = {};

        for (const e of emails as (EmailRow & { id: string; gmail_message_id: string })[]) {
          if (!e.gmail_message_id) continue;
          const override = overrides.has(e.id) ? overrides.get(e.id) : undefined;
          const labelKey = computeLabelForEmail(e, override);
          decisions.push({
            emailId: e.id,
            gmailMessageId: e.gmail_message_id,
            labelKey,
          });
          const k = labelKey || "no_label";
          counts[k] = (counts[k] || 0) + 1;
        }

        // 5. Batch apply — forward progress events to the client
        const result = await applyLabelsBatch(userId, decisions, (event) => {
          // Don't re-send "ensuring_labels" (we already did our own).
          if (event.phase === "ensuring_labels") return;
          send(event);
        });

        // 6. Mark the user as opted-in so future syncs auto-label
        await service
          .from("user_sync_state")
          .upsert(
            {
              user_id: userId,
              gmail_labels_enabled: true,
              gmail_labels_last_applied_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        send({
          phase: "done",
          scanned: emails.length,
          applied: result.applied,
          cleared: result.cleared,
          days,
          breakdown: counts,
        });
      } catch (e) {
        send({
          phase: "error",
          message: e instanceof Error ? e.message : "Apply failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
