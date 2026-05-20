/**
 * Auto-label Gmail with Oushi's classification so the user sees organized
 * Gmail every time they open it — even if they never visit Oushi directly.
 *
 * The label taxonomy maps our existing bucket / category / commitment data
 * onto a small set of Gmail labels with brand-aware colors. Each email gets
 * AT MOST ONE Oushi label (the highest-priority one that applies); other
 * Oushi/* labels are removed before applying.
 *
 * Numbered prefixes ("Oushi/1 · Respond") force a sensible sort order in
 * the Gmail sidebar.
 */

import { google } from "googleapis";
import { getAuthenticatedClient } from "@/lib/gmail";
import {
  isAutomatedEmail,
  isTrueTransactional,
  isLowValueNotification,
  type EmailRow,
} from "@/lib/outstanding";

// Google Gmail's color API only accepts colors from its restricted palette.
// These values are exact picks from Google's allowed list.
// Reference: https://developers.google.com/gmail/api/reference/rest/v1/users.labels#color
export interface OushiLabelDef {
  key: OushiLabelKey;
  name: string;
  color: { textColor: string; backgroundColor: string };
  description: string;
}

export type OushiLabelKey =
  | "respond"
  | "awaiting"
  | "followup"
  | "meeting"
  | "receipt"
  | "fyi"
  | "marketing";

const LABEL_PREFIX = "Oushi/";

export const OUSHI_LABELS: OushiLabelDef[] = [
  {
    key: "respond",
    name: "Oushi/1 · Respond",
    color: { textColor: "#ffffff", backgroundColor: "#cc3a21" },
    description: "Needs your reply",
  },
  {
    key: "awaiting",
    name: "Oushi/2 · Awaiting reply",
    color: { textColor: "#ffffff", backgroundColor: "#eaa041" },
    description: "You opened, never replied",
  },
  {
    key: "followup",
    name: "Oushi/3 · Follow up",
    color: { textColor: "#ffffff", backgroundColor: "#3c78d8" },
    description: "You sent the last message; they went quiet",
  },
  {
    key: "meeting",
    name: "Oushi/4 · Meeting",
    color: { textColor: "#ffffff", backgroundColor: "#8e63ce" },
    description: "Calendar invites, meeting context",
  },
  {
    key: "receipt",
    name: "Oushi/5 · Receipt",
    color: { textColor: "#ffffff", backgroundColor: "#149e60" },
    description: "Confirmations, invoices, transactional",
  },
  {
    key: "fyi",
    name: "Oushi/6 · FYI",
    color: { textColor: "#000000", backgroundColor: "#cccccc" },
    description: "Informational — no reply needed",
  },
  {
    key: "marketing",
    name: "Oushi/7 · Marketing",
    color: { textColor: "#000000", backgroundColor: "#fbc8d9" },
    description: "Newsletters, promos, ads",
  },
];

const LABEL_BY_KEY = new Map(OUSHI_LABELS.map((l) => [l.key, l]));

// ─────────────────────────────────────────────────────────────────────────
// CLASSIFIER — picks ONE label for a given email
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pick the single best Oushi label for an email, or null if no label fits.
 * Priority order matters — earlier rules win.
 */
export function computeLabelForEmail(email: EmailRow): OushiLabelKey | null {
  const subject = (email.subject || "").toLowerCase();
  const fromEmail = (email.from_email || "").toLowerCase();

  // 1. Marketing — pure noise
  if (email.category === "noise") {
    // Re-confirm with content signals
    if (
      isAutomatedEmail(email) ||
      isLowValueNotification(email)
    ) {
      // Login alerts / verification codes go to FYI, not marketing
      if (isLowValueNotification(email)) return "fyi";
      return "marketing";
    }
    return "marketing";
  }

  // 2. Receipts / transactional confirmations
  if (isTrueTransactional(email)) {
    return "receipt";
  }
  // Subject-based receipt fallback
  if (
    /^your\s+(receipt|order|invoice|booking|reservation|subscription|statement)/i.test(subject) ||
    /receipt\s+from/i.test(subject) ||
    /payment\s+(received|confirmation|successful)/i.test(subject) ||
    /order\s+confirmation/i.test(subject) ||
    /thanks?\s+for\s+(your\s+order|signing\s*up|subscribing|your\s+purchase)/i.test(subject)
  ) {
    return "receipt";
  }

  // 3. Meeting — calendar invites / scheduling
  if (
    /\b(meeting|calendar|invite|invitation|scheduled|rsvp|google\s+meet|zoom)\b/i.test(subject) ||
    /^invitation:/i.test(subject) ||
    fromEmail === "calendar-notification@google.com"
  ) {
    return "meeting";
  }

  // 4. Low-value notification (login alerts, verification codes etc) -> FYI
  if (isLowValueNotification(email)) {
    return "fyi";
  }

  // 5. Follow-up — user sent last and the thread went quiet
  if (
    email.user_was_last_sender &&
    !email.followup_dismissed_at &&
    email.user_last_sent_at &&
    !isAutomatedEmail(email)
  ) {
    const daysSinceUserSent =
      (Date.now() - new Date(email.user_last_sent_at).getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceUserSent >= 5 && email.score >= 50) {
      return "followup";
    }
  }

  // 6. Awaiting — you opened, never replied, real sender, score >= 50
  if (
    email.is_read &&
    !email.user_replied &&
    !isAutomatedEmail(email) &&
    email.score >= 50
  ) {
    return "awaiting";
  }

  // 7. Respond — unread, scored >= 60, real sender, not transactional
  if (
    email.is_unread &&
    !email.user_replied &&
    !isAutomatedEmail(email) &&
    email.score >= 60
  ) {
    return "respond";
  }

  // 8. Useful FYI — middle ground
  if (email.category === "useful" && email.score >= 30 && email.score < 60) {
    return "fyi";
  }

  // No label
  return null;
}

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
    // Create the label with the right color
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

/**
 * Apply Oushi labels to a set of emails in batch. For each email:
 *   - removes any existing Oushi/* labels (so only one is set)
 *   - adds the new Oushi label (if any)
 *
 * Uses Gmail's batchModify endpoint — one API call per (add-id, remove-ids)
 * combination. Groups emails by their target label for maximum batching.
 */
export async function applyLabelsBatch(
  userId: string,
  decisions: Array<{ gmailMessageId: string; labelKey: OushiLabelKey | null }>
): Promise<{ applied: number; cleared: number }> {
  if (decisions.length === 0) return { applied: 0, cleared: 0 };

  const labelMap = await ensureOushiLabels(userId);
  const allOushiLabelIds = Array.from(labelMap.values());
  if (allOushiLabelIds.length === 0) {
    return { applied: 0, cleared: 0 };
  }

  const oauth2Client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Group by the target labelKey (null group = clear only)
  const byLabel = new Map<OushiLabelKey | "__none__", string[]>();
  for (const d of decisions) {
    const key = (d.labelKey || "__none__") as OushiLabelKey | "__none__";
    const list = byLabel.get(key) || [];
    list.push(d.gmailMessageId);
    byLabel.set(key, list);
  }

  let applied = 0;
  let cleared = 0;

  for (const [key, ids] of byLabel) {
    // Gmail's batchModify accepts up to 1000 message ids per call
    const targetLabelId = key === "__none__" ? null : labelMap.get(key);
    // For each message: remove all OTHER oushi labels + add this one
    const removeIds = targetLabelId
      ? allOushiLabelIds.filter((id) => id !== targetLabelId)
      : allOushiLabelIds;
    const addIds = targetLabelId ? [targetLabelId] : [];

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
      } catch (e) {
        console.error(
          "[gmail-labels] batchModify failed",
          key,
          e instanceof Error ? e.message : e
        );
      }
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

  // Find all Oushi labels
  const list = await gmail.users.labels.list({ userId: "me" });
  const oushiLabels = (list.data.labels || []).filter(
    (l) => l.name && l.id && l.name.startsWith(LABEL_PREFIX)
  );
  if (oushiLabels.length === 0) return { removed: 0, deleted_labels: 0 };

  // Delete each label — this also removes the label from any message that has it
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

export function getLabelByKey(key: OushiLabelKey): OushiLabelDef | undefined {
  return LABEL_BY_KEY.get(key);
}
