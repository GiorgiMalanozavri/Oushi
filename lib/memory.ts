import { SupabaseClient } from "@supabase/supabase-js";

export type MemoryKind = "person" | "project" | "commitment" | "deadline" | "preference" | "context";

export interface MemoryEntry {
  id?: string;
  user_id?: string;
  kind: MemoryKind;
  subject: string;
  content: string;
  source_email_id?: string | null;
  confidence?: "high" | "medium" | "low";
  pinned?: boolean;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExtractedMemory {
  kind: MemoryKind;
  subject: string;
  content: string;
  ttl_days?: number;
}

/**
 * Fetch the user's active (non-expired) memories, ordered by recency.
 * Pinned memories first, then by updated_at desc.
 */
export async function getActiveMemories(
  supabase: SupabaseClient,
  userId: string,
  limit = 60
): Promise<MemoryEntry[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("memory_entries")
    .select("*")
    .eq("user_id", userId)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[memory] fetch failed", error.message);
    return [];
  }
  return data || [];
}

/**
 * Format memories into a concise block that goes into a Claude system or user message.
 * Returns empty string if no memories.
 */
export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const byKind = memories.reduce<Record<string, MemoryEntry[]>>((acc, m) => {
    if (!acc[m.kind]) acc[m.kind] = [];
    acc[m.kind].push(m);
    return acc;
  }, {});

  const labels: Record<MemoryKind, string> = {
    person: "People",
    project: "Projects",
    commitment: "Open commitments",
    deadline: "Upcoming deadlines",
    preference: "Preferences",
    context: "Context",
  };

  const sections = (Object.keys(byKind) as MemoryKind[])
    .filter((k) => labels[k])
    .map((kind) => {
      const items = byKind[kind].map((m) => `  - ${m.subject}: ${m.content}`).join("\n");
      return `${labels[kind]}:\n${items}`;
    });

  return `WHAT OUSHI REMEMBERS ABOUT THIS USER:\n${sections.join("\n\n")}`;
}

/**
 * Save extracted memories, soft-deduping against existing ones by (kind, lowercase subject).
 * If a match exists, update content + reset expiry. Otherwise insert.
 */
export async function saveExtractedMemories(
  supabase: SupabaseClient,
  userId: string,
  sourceEmailId: string,
  extracted: ExtractedMemory[]
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const m of extracted) {
    if (!m.kind || !m.subject || !m.content) continue;
    if (m.subject.length > 80 || m.content.length > 400) continue;

    const ttlDays = typeof m.ttl_days === "number" && m.ttl_days > 0 ? m.ttl_days : 90;
    const expires_at = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    // Check for existing match (kind + case-insensitive subject)
    const { data: existing } = await supabase
      .from("memory_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", m.kind)
      .ilike("subject", m.subject)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("memory_entries")
        .update({
          content: m.content,
          source_email_id: sourceEmailId,
          updated_at: new Date().toISOString(),
          expires_at,
        })
        .eq("id", existing.id);
      updated++;
    } else {
      await supabase.from("memory_entries").insert({
        user_id: userId,
        kind: m.kind,
        subject: m.subject,
        content: m.content,
        source_email_id: sourceEmailId,
        confidence: "medium",
        expires_at,
      });
      created++;
    }
  }

  return { created, updated };
}
