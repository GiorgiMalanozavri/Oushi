"use client";

import { useState } from "react";
import { EmailCard } from "./email-card";

interface Email {
  id: string;
  from_name: string;
  from_email: string;
  subject: string;
  snippet: string;
  score: number;
  category: string;
  reasoning: string;
  requires_action: boolean;
  received_at: string;
  is_read: boolean;
}

interface CategorySectionProps {
  title: string;
  emails: Email[];
  defaultCollapsed?: boolean;
  onFeedback: (emailId: string, signal: string) => void;
  onMute: (muteType: string, value: string) => void;
}

export function CategorySection({
  title,
  emails,
  defaultCollapsed = false,
  onFeedback,
  onMute,
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (emails.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between py-2"
      >
        <h2 className="text-[15px] font-medium text-text-primary">{title}</h2>
        <span className="font-mono text-xs text-text-muted">
          {collapsed
            ? `${emails.length} emails hidden — show`
            : emails.length}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-3">
          {emails.map((email) => (
            <EmailCard
              key={email.id}
              email={email}
              onFeedback={onFeedback}
              onMute={onMute}
            />
          ))}
        </div>
      )}
    </div>
  );
}
