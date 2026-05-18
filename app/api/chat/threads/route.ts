import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET  /api/chat/threads        — list recent threads (id, title, updated_at, msg count)
 * POST /api/chat/threads        — create or update a thread
 *
 * Body for POST:
 *   { id?: string, title: string, messages: ChatMessage[] }
 *   Returns: { id: string }
 *
 * If id is provided we upsert; otherwise we create a new thread.
 * Old threads beyond the most recent 50 per user are pruned on save.
 */

const MAX_THREADS_PER_USER = 50;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data, error } = await service
    .from("chat_threads")
    .select("id, title, messages, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threads = (data || []).map((t) => {
    const messages = Array.isArray(t.messages) ? t.messages : [];
    return {
      id: t.id,
      title: t.title,
      updated_at: t.updated_at,
      message_count: messages.length,
    };
  });

  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, title, messages } = body as {
    id?: string;
    title?: string;
    messages?: unknown;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const cleanTitle = (typeof title === "string" ? title : "Untitled chat")
    .slice(0, 80)
    .trim() || "Untitled chat";

  const service = await createServiceClient();

  let threadId = id;

  if (threadId) {
    // Update existing
    const { error } = await service
      .from("chat_threads")
      .update({
        title: cleanTitle,
        messages,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .eq("user_id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    // Create new
    const { data, error } = await service
      .from("chat_threads")
      .insert({
        user_id: user.id,
        title: cleanTitle,
        messages,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    threadId = data.id;
  }

  // Prune: keep only the most recent MAX_THREADS_PER_USER per user
  const { data: allIds } = await service
    .from("chat_threads")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (allIds && allIds.length > MAX_THREADS_PER_USER) {
    const toDelete = allIds.slice(MAX_THREADS_PER_USER).map((r) => r.id);
    if (toDelete.length > 0) {
      await service.from("chat_threads").delete().in("id", toDelete);
    }
  }

  return NextResponse.json({ id: threadId });
}
