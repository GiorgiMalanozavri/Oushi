/**
 * Structured card schema returned by /api/ask when an answer benefits
 * from visual structure instead of plain prose.
 *
 * Each card is a small interactive widget rendered inline in the chat.
 */

export type TimelineIcon =
  | "plane"
  | "hotel"
  | "calendar"
  | "meeting"
  | "deadline"
  | "package"
  | "mail"
  | "dollar"
  | "dot";

export interface TimelineCard {
  type: "timeline";
  title?: string;
  events: Array<{
    date: string;            // human-readable: "May 22" or "Today"
    time?: string;           // "10:30am"
    title: string;           // "United UA847 to NRT"
    subtitle?: string;       // "Confirmation MYE8MC"
    detail?: string;         // optional second-line detail
    icon?: TimelineIcon;
  }>;
}

export interface ChecklistCard {
  type: "checklist";
  title?: string;
  items: Array<{
    text: string;
    detail?: string;
    source?: string;         // "from Sarah, May 10"
    completed?: boolean;
  }>;
}

export interface PeopleCard {
  type: "people";
  title?: string;
  people: Array<{
    name: string;
    email?: string;
    role?: string;           // "Manager", "Investor", "Friend"
    last_contact?: string;   // "2 days ago"
    status?: "waiting" | "replied" | "stale" | "fresh";
    note?: string;           // 1-line context
  }>;
}

export interface ComparisonCard {
  type: "comparison";
  title?: string;
  columns: Array<{
    name: string;
    subtitle?: string;
    rows: Array<{
      label: string;
      value: string;
      highlight?: boolean;
    }>;
  }>;
}

export interface SummaryCard {
  type: "summary";
  title?: string;
  sections: Array<{
    heading: string;
    items: Array<{
      text: string;
      from?: string;
    }>;
  }>;
}

export type OushiCard =
  | TimelineCard
  | ChecklistCard
  | PeopleCard
  | ComparisonCard
  | SummaryCard;

/** Runtime guard for cards coming from the LLM */
export function isOushiCard(obj: unknown): obj is OushiCard {
  if (!obj || typeof obj !== "object") return false;
  const card = obj as { type?: unknown };
  return (
    card.type === "timeline" ||
    card.type === "checklist" ||
    card.type === "people" ||
    card.type === "comparison" ||
    card.type === "summary"
  );
}
