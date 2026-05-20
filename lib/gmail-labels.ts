/**
 * Auto-label Gmail with Oushi's classification so the user sees organized
 * Gmail every time they open it — even if they never visit Oushi directly.
 *
 * The label taxonomy, color palette, and pure classifier live in
 * `lib/gmail-labels-shared.ts` (client-safe). This file owns the
 * server-only Gmail API side: creating labels, batch-modifying messages,
 * cleaning up on uninstall.
 */

import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/gmail";
import { createServiceClient } from "@/lib/supabase/server";
import {
  OUSHI_LABELS,
  LABEL_PREFIX,
  type OushiLabelKey,
} from "@/lib/gmail-labels-shared";

// Re-export the client-safe surface so existing server-side imports
// (e.g. `import { computeLabelForEmail } from "@/lib/gmail-labels"`)
// keep working without changes.
export {
  OUSHI_LABELS,
  computeLabelForEmail,
  getLabelByKey,
  LABEL_PREFIX,
} from "@/lib/gmail-labels-shared";
export type {
  OushiLabelKey,
  OushiLabelDef,
} from "@/lib/gmail-labels-shared";

// ─────────────────────────────────────────────────────────────────────────
// GMAIL API — create labels + apply them
// ─────────────────────────────────────────────────────────────────────────

/**
 * Ensure all Oushi labels exist in the user's Gmail account. Idempotent —
 * existing labels are left alone (we don't re-color them if the user changed
 * the color manually). Returns { key -> gmailLabelId }.
 */
export async function ensureOushiLabels(
  userId: string
): Promise<Map<OushiLabelKey, string>> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Fetch existing labels
  const existing = await gmail.users.labels.list({ userId: "me" });
  const byName = new Map<string, string>(); // name -> id
  for (const lbl of existing.data.labels || []) {
    if (lbl.name && lbl.id) byName.set(lbl.name, lbl.id);
  }

  const result = new Map<OushiLabelKey, string>();

  for (const def of OUSHI_LABELS) {
    const existingId = byName.get(def.name);
    if (existingId) {
      result.set(def.key, existingId);
      continue;
    }
    try {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: def.name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
          color: def.color,
        },
      });
      if (created.data.id) {
        result.set(def.key, created.data.id);
      }
    } catch (e) {
      console.error("[gmail-labels] create failed for", def.name, e instanceof Error ? e.message : e);
    }
  }

  return result;
}

export interface ApplyProgressEvent {
  phase: "ensuring_labels" | "applying" | "applied" | "stamping";
  /** For applying/applied phases: the label group being processed. */
  group?: OushiLabelKey | "__none__";
  /** For applying/applied phases: the size of this group. */
  count?: number;
  /** Running total of successfully labeled messages so far. */
  appliedSoFar?: number;
  /** Total messages we intend to label across all groups. */
  totalToApply?: number;
}

/**
 * Apply Oushi labels to a set of emails in batch. For each email:
 *   - removes any existing Oushi/* labels (so only one is set)
 *   - adds the new Oushi label (if any)
 *
 * Uses Gmail's batchModify endpoint — one API call per (add-id, remove-ids)
 * combination. Groups emails by their target label for maximum batching.
 *
 * When `emailId` is provided in a decision, the email's `gmail_label_applied_at`
 * column is stamped to NOW() after a successful batch — that's how we detect
 * stale labels later (any state-change timestamp newer than this column
 * means the label might no longer be correct).
 *
 * If `onProgress` is supplied, it's called with phase events that can be
 * forwarded to a streaming client (the Settings "Apply labels" UI uses this).
 */
export async function applyLabelsBatch(
  userId: string,
  decisions: Array<{
    emailId?: string;
    gmailMessageId: string;
    labelKey: OushiLabelKey | null;
  }>,
  onProgress?: (event: ApplyProgressEvent) => void
): Promise<{ applied: number; cleared: number }> {
  if (decisions.length === 0) return { applied: 0, cleared: 0 };

  onProgress?.({ phase: "ensuring_labels" });
  const labelMap = await ensureOushiLabels(userId);
  const allOushiLabelIds = Array.from(labelMap.values());
  if (allOushiLabelIds.length === 0) {
    return { applied: 0, cleared: 0 };
  }

  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const gmailToEmailId = new Map<string, string>();
  for (const d of decisions) {
    if (d.emailId) gmailToEmailId.set(d.gmailMessageId, d.emailId);
  }

  // Group by the target labelKey (null group = clear only)
  const byLabel = new Map<OushiLabelKey | "__none__", string[]>();
  for (const d of decisions) {
    const key = (d.labelKey || "__none__") as OushiLabelKey | "__none__";
    const list = byLabel.get(key) || [];
    list.push(d.gmailMessageId);
    byLabel.set(key, list);
  }

  const totalToApply = decisions.filter((d) => d.labelKey !== null).length;
  let applied = 0;
  let cleared = 0;
  const succeededEmailIds: string[] = [];

  for (const [key, ids] of byLabel) {
    const targetLabelId = key === "__none__" ? null : labelMap.get(key);
    const removeIds = targetLabelId
      ? allOushiLabelIds.filter((id) => id !== targetLabelId)
      : allOushiLabelIds;
    const addIds = targetLabelId ? [targetLabelId] : [];

    onProgress?.({
      phase: "applying",
      group: key,
      count: ids.length,
      appliedSoFar: applied,
      totalToApply,
    });

    for (let i = 0; i < ids.length; i += 1000) {
      const slice = ids.slice(i, i + 1000);
      try {
        await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: {
            ids: slice,
            addLabelIds: addIds,
            removeLabelIds: removeIds,
          },
        });
        if (key === "__none__") cleared += slice.length;
        else applied += slice.length;
        for (const gmailId of slice) {
          const eid = gmailToEmailId.get(gmailId);
          if (eid) succeededEmailIds.push(eid);
        }
      } catch (e) {
        console.error(
          "[gmail-labels] batchModify failed",
          key,
          e instanceof Error ? e.message : e
        );
      }
    }

    onProgress?.({
      phase: "applied",
      group: key,
      count: ids.length,
      appliedSoFar: applied,
      totalToApply,
    });
  }

  if (succeededEmailIds.length > 0) {
    onProgress?.({ phase: "stamping" });
    try {
      const service = await createServiceClient();
      const CHUNK = 500;
      const now = new Date().toISOString();
      for (let i = 0; i < succeededEmailIds.length; i += CHUNK) {
        const chunk = succeededEmailIds.slice(i, i + CHUNK);
        await service
          .from("emails")
          .update({ gmail_label_applied_at: now })
          .in("id", chunk);
      }
    } catch (e) {
      console.error(
        "[gmail-labels] gmail_label_applied_at stamp failed",
        e instanceof Error ? e.message : e
      );
    }
  }

  return { applied, cleared };
}

/**
 * Remove ALL Oushi/* labels from every message — used by the "Reset labels"
 * settings action so the user can cleanly uninstall.
 */
export async function removeAllOushiLabelsFromAllMessages(
  userId: string
): Promise<{ removed: number; deleted_labels: number }> {
  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const list = await gmail.users.labels.list({ userId: "me" });
  const oushiLabels = (list.data.labels || []).filter(
    (l) => l.name && l.id && l.name.startsWith(LABEL_PREFIX)
  );
  if (oushiLabels.length === 0) return { removed: 0, deleted_labels: 0 };

  let deleted = 0;
  for (const lbl of oushiLabels) {
    if (!lbl.id) continue;
    try {
      await gmail.users.labels.delete({ userId: "me", id: lbl.id });
      deleted++;
    } catch (e) {
      console.error("[gmail-labels] delete failed", lbl.name, e instanceof Error ? e.message : e);
    }
  }
  return { removed: 0, deleted_labels: deleted };
}
