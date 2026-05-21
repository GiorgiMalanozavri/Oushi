/**
 * Admin access gate.
 *
 * Set OUSHI_ADMIN_EMAILS in your environment to a comma-separated list of
 * email addresses that can access /admin and /api/admin/*. Example:
 *
 *   OUSHI_ADMIN_EMAILS=giorgi@example.com,you@example.com
 *
 * If the env var is missing or empty, admin access is DENIED for everyone.
 * Don't use this for anything more sensitive than the operator dashboard —
 * it's a simple allowlist, not RBAC.
 */

export function getAdminEmails(): Set<string> {
  const raw = process.env.OUSHI_ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(email.toLowerCase());
}
