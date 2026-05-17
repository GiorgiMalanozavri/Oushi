"use client";

interface MuteModalProps {
  email: { from_name: string; from_email: string };
  onMute: (type: string, value: string) => void;
  onClose: () => void;
}

export function MuteModal({ email, onMute, onClose }: MuteModalProps) {
  const domain = email.from_email.split("@")[1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-warm-border bg-white p-6 shadow-lg">
        <h3 className="text-[15px] font-medium text-text-primary">
          Mute future emails?
        </h3>
        <p className="mt-2 text-[14px] text-text-secondary">
          Emails matching your selection will be automatically hidden.
        </p>

        <div className="mt-5 space-y-2">
          <button
            onClick={() => onMute("sender", email.from_email)}
            className="flex w-full items-center rounded-lg border border-warm-border px-4 py-3 text-left text-[14px] transition-colors hover:bg-cream"
          >
            <span className="text-text-primary">
              Mute{" "}
              <span className="font-medium">
                {email.from_name || email.from_email}
              </span>
            </span>
          </button>
          <button
            onClick={() => onMute("domain", domain)}
            className="flex w-full items-center rounded-lg border border-warm-border px-4 py-3 text-left text-[14px] transition-colors hover:bg-cream"
          >
            <span className="text-text-primary">
              Mute all from <span className="font-medium">@{domain}</span>
            </span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg py-2 text-center text-[14px] text-text-muted transition-colors hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
