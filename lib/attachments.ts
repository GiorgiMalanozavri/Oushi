import { google } from "googleapis";
import { createAnthropicClient } from "@/lib/claude";
import type { OAuth2Client } from "google-auth-library";

// Cap settings — keep cost predictable, fail fast on stupid sizes
const MAX_BYTES_PER_ATTACHMENT = 3 * 1024 * 1024; // 3 MB
const MAX_ATTACHMENTS_PER_EMAIL = 3;
const VISION_MODEL = "claude-haiku-4-5-20251001";

const SUPPORTED_PDF = ["application/pdf"];
const SUPPORTED_IMAGE = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

interface AttachmentRef {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Walks Gmail's MIME tree and collects PDFs + images we know how to OCR.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findExtractableAttachments(payload: any): AttachmentRef[] {
  const out: AttachmentRef[] = [];
  const walk = (part: { mimeType?: string; filename?: string; body?: { attachmentId?: string; size?: number }; parts?: unknown[] }) => {
    if (!part) return;
    const mt = (part.mimeType || "").toLowerCase();
    const supported = SUPPORTED_PDF.includes(mt) || SUPPORTED_IMAGE.includes(mt);
    if (supported && part.body?.attachmentId && (part.filename?.length || 0) > 0) {
      const size = part.body.size || 0;
      if (size > 0 && size <= MAX_BYTES_PER_ATTACHMENT) {
        out.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename!,
          mimeType: mt,
          size,
        });
      }
    }
    if (Array.isArray(part.parts)) {
      for (const sub of part.parts) walk(sub as Parameters<typeof walk>[0]);
    }
  };
  walk(payload);
  return out.slice(0, MAX_ATTACHMENTS_PER_EMAIL);
}

/**
 * For a given message, fetches each supported attachment's bytes, sends them
 * to Claude vision for OCR + structured extraction, and concatenates results
 * into a single text blob suitable for storage and AI prompt injection.
 *
 * Returns empty string if no extractable attachments, or extraction fails.
 */
export async function extractAttachmentsForMessage(
  oauth2Client: OAuth2Client,
  gmailMessageId: string,
  emailSubject: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
): Promise<string> {
  const refs = findExtractableAttachments(payload);
  if (refs.length === 0) return "";

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const anthropic = createAnthropicClient();
  const sections: string[] = [];

  for (const ref of refs) {
    try {
      // Fetch attachment binary from Gmail
      const attRes = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: gmailMessageId,
        id: ref.attachmentId,
      });
      const b64data = attRes.data.data;
      if (!b64data) continue;

      // Gmail returns URL-safe base64; convert to standard base64 for Anthropic
      const standardB64 = b64data.replace(/-/g, "+").replace(/_/g, "/");

      // Build content block for vision call
      const isImage = SUPPORTED_IMAGE.includes(ref.mimeType);
      const isPdf = SUPPORTED_PDF.includes(ref.mimeType);
      if (!isImage && !isPdf) continue;

      // Anthropic SDK types are a moving target across versions; this content
      // shape is supported in @anthropic-ai/sdk >= 0.27.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentBlock: any = isPdf
        ? {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: standardB64,
            },
          }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: ref.mimeType,
              data: standardB64,
            },
          };

      const vision = await anthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 800,
        system: `You extract structured key information from email attachments. Be concise and factual. Always include: dates, times, amounts, confirmation/order/booking numbers, names, locations, and any deadline-like info.`,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              {
                type: "text",
                text: `This attachment (${ref.filename}) was attached to an email titled "${emailSubject}". Extract the key facts in 6-12 short lines. Use a format like:\n- Type: <e.g. flight confirmation, receipt, contract>\n- Date(s): ...\n- Amount(s): ...\n- Confirmation/order number: ...\n- Names/parties: ...\n- Location(s): ...\n- Key dates/deadlines: ...\n- Other useful detail: ...\n\nOnly include lines that apply. Never invent details.`,
              },
            ],
          },
        ],
      });

      const text =
        vision.content[0]?.type === "text" ? vision.content[0].text.trim() : "";
      if (text) {
        sections.push(`--- ${ref.filename} (${ref.mimeType}) ---\n${text}`);
      }
    } catch (e) {
      console.error(
        `[attachments] failed to extract ${ref.filename} from ${gmailMessageId}:`,
        e instanceof Error ? e.message : e
      );
      // continue to next attachment
    }
  }

  return sections.join("\n\n").slice(0, 8000);
}
