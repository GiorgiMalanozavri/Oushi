/**
 * Notion integration — OAuth + database mirror + page append.
 *
 * Notion's OAuth flow is similar to Slack's: the user authorizes an
 * "integration" to access a workspace, gives it specific pages, and we
 * get back an access token plus the bot_id. From there:
 *
 *   - Saving a thread → append a child block under a page the user
 *     chose. We render the email as a clean Block Kit-ish set of
 *     paragraphs + a callout for the body preview.
 *
 *   - Mirroring commitments → upsert a page in a Notion database the
 *     user selected. Each commitment is one DB page with Title, Status,
 *     Due, Recipient, Source link properties.
 *
 * Setup (you, the operator):
 *   - Create a public Notion integration at notion.so/my-integrations
 *     and set the redirect URI to https://www.oushi.app/api/integrations/notion/callback
 *   - Env vars:
 *       NOTION_CLIENT_ID
 *       NOTION_CLIENT_SECRET
 *       NOTION_REDIRECT_URI
 *
 * Notion auth uses Basic auth on the token exchange (client_id:secret
 * base64 encoded) — different from Slack which uses form-urlencoded.
 */

const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export function isNotionConfigured(): boolean {
  return !!(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET);
}

export function buildAuthorizeUrl(state: string): string {
  const u = new URL(NOTION_AUTHORIZE_URL);
  u.searchParams.set("client_id", process.env.NOTION_CLIENT_ID || "");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("owner", "user");
  if (process.env.NOTION_REDIRECT_URI) {
    u.searchParams.set("redirect_uri", process.env.NOTION_REDIRECT_URI);
  }
  u.searchParams.set("state", state);
  return u.toString();
}

interface NotionOAuthResponse {
  access_token: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  duplicated_template_id?: string | null;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForToken(
  code: string
): Promise<NotionOAuthResponse> {
  const credentials = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.NOTION_REDIRECT_URI,
    }),
  });
  return res.json();
}

interface NotionSearchResult {
  results: Array<{
    id: string;
    object: "page" | "database";
    properties?: Record<string, unknown>;
    title?: Array<{ plain_text: string }>;
    parent?: { type: string };
  }>;
}

/**
 * List pages + databases the user has shared with the Oushi integration.
 * Used to populate the picker in Settings.
 */
export async function listSharedTargets(accessToken: string): Promise<{
  pages: Array<{ id: string; title: string }>;
  databases: Array<{ id: string; title: string }>;
}> {
  const res = await fetch(`${NOTION_API}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 50 }),
  });
  if (!res.ok) {
    console.error("[notion] search failed", res.status, await res.text());
    return { pages: [], databases: [] };
  }
  const data = (await res.json()) as NotionSearchResult;
  const pages: Array<{ id: string; title: string }> = [];
  const databases: Array<{ id: string; title: string }> = [];
  for (const r of data.results || []) {
    const title = extractTitle(r);
    if (r.object === "database") {
      databases.push({ id: r.id, title });
    } else if (r.object === "page") {
      pages.push({ id: r.id, title });
    }
  }
  return { pages, databases };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTitle(item: any): string {
  // Database title lives at root .title array of rich-text spans
  if (Array.isArray(item.title)) {
    const t = item.title.map((x: { plain_text?: string }) => x.plain_text || "").join("");
    if (t) return t;
  }
  // Page title lives inside properties.{Name|Title}.title
  const props = item.properties || {};
  for (const key of Object.keys(props)) {
    const p = props[key];
    if (p?.type === "title" && Array.isArray(p.title)) {
      const t = p.title.map((x: { plain_text?: string }) => x.plain_text || "").join("");
      if (t) return t;
    }
  }
  return "(untitled)";
}

/**
 * Append a saved-email block to a parent page. The block layout is
 * deliberately simple — a divider, a small heading with the subject,
 * a context line, and a callout with the body preview.
 */
export async function saveEmailToPage(
  accessToken: string,
  pageId: string,
  email: {
    subject: string;
    from_name: string | null;
    from_email: string;
    received_at: string | null;
    snippet: string | null;
    gmail_thread_id: string | null;
  }
): Promise<boolean> {
  const dateLine = email.received_at
    ? new Date(email.received_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const sender = email.from_name
    ? `${email.from_name} <${email.from_email}>`
    : email.from_email;

  const blocks: object[] = [
    { object: "block", type: "divider", divider: {} },
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: email.subject || "(no subject)" } }],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: `From ${sender} · ${dateLine}` },
            annotations: { italic: true, color: "gray" },
          },
        ],
      },
    },
  ];

  if (email.snippet) {
    blocks.push({
      object: "block",
      type: "callout",
      callout: {
        icon: { type: "emoji", emoji: "✉️" },
        rich_text: [{ type: "text", text: { content: email.snippet.slice(0, 1800) } }],
        color: "default",
      },
    });
  }

  if (email.gmail_thread_id) {
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Open in Gmail →",
              link: {
                url: `https://mail.google.com/mail/u/0/#inbox/${email.gmail_thread_id}`,
              },
            },
          },
        ],
      },
    });
  }

  const res = await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ children: blocks }),
  });
  if (!res.ok) {
    console.error("[notion] save thread failed", res.status, await res.text());
    return false;
  }
  return true;
}

/**
 * Upsert a commitment as a row in a Notion database. Best-effort —
 * if the schema doesn't have the expected properties we just skip
 * those (Notion ignores unknown property keys in created_by/created_time
 * but rejects nonexistent property NAMES, so we wrap each in try/catch).
 *
 * Expected DB columns (case-insensitive match by name):
 *   - Name (title)         — the commitment summary
 *   - Status (select)      — "Open" / "Done" / "Snoozed"
 *   - Due (date)           — due_at if known
 *   - Recipient (rich_text) — who the user promised
 *   - Source (url)         — Gmail thread deep-link
 *
 * The user should set the DB up with these columns; we tolerate missing
 * ones by sending only what they've defined.
 */
export async function upsertCommitmentInDatabase(
  accessToken: string,
  databaseId: string,
  c: {
    summary: string;
    status: "Open" | "Done" | "Snoozed";
    due_at: string | null;
    recipient: string | null;
    gmail_thread_id: string | null;
  }
): Promise<boolean> {
  // Probe the DB schema once to know what we can safely send
  const dbRes = await fetch(`${NOTION_API}/databases/${databaseId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
    },
  });
  if (!dbRes.ok) {
    console.error("[notion] db schema fetch failed", dbRes.status);
    return false;
  }
  const db = (await dbRes.json()) as {
    properties: Record<string, { type: string }>;
  };
  const propNames = Object.fromEntries(
    Object.entries(db.properties || {}).map(([name, def]) => [
      name.toLowerCase(),
      { name, type: def.type },
    ])
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {};

  // Title — pick whichever column is type=title
  const titleEntry = Object.values(propNames).find((p) => p.type === "title");
  if (titleEntry) {
    properties[titleEntry.name] = {
      title: [{ type: "text", text: { content: c.summary.slice(0, 1500) } }],
    };
  }

  // Status select
  const statusEntry = propNames.status;
  if (statusEntry && statusEntry.type === "select") {
    properties[statusEntry.name] = { select: { name: c.status } };
  }

  // Due date
  const dueEntry = propNames.due;
  if (dueEntry && dueEntry.type === "date" && c.due_at) {
    properties[dueEntry.name] = { date: { start: c.due_at } };
  }

  // Recipient
  const recipientEntry = propNames.recipient;
  if (recipientEntry && recipientEntry.type === "rich_text" && c.recipient) {
    properties[recipientEntry.name] = {
      rich_text: [{ type: "text", text: { content: c.recipient } }],
    };
  }

  // Source URL
  const sourceEntry = propNames.source;
  if (sourceEntry && sourceEntry.type === "url" && c.gmail_thread_id) {
    properties[sourceEntry.name] = {
      url: `https://mail.google.com/mail/u/0/#inbox/${c.gmail_thread_id}`,
    };
  }

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });
  if (!res.ok) {
    console.error("[notion] upsert commitment failed", res.status, await res.text());
    return false;
  }
  return true;
}
