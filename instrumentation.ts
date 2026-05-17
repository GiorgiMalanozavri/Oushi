export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "development") return;

  const SYNC_INTERVAL_MS = 5 * 60 * 1000;
  const DIGEST_CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

  const secret = () => process.env.CRON_SECRET;
  const baseUrl = () => `http://localhost:${process.env.PORT || "3000"}`;

  const syncTick = async () => {
    try {
      const s = secret();
      if (!s) return;
      const res = await fetch(`${baseUrl()}/api/cron/sync-all`, {
        headers: { authorization: `Bearer ${s}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[auto-sync] ${data.users} users`);
      } else {
        console.log(`[auto-sync] failed: ${res.status}`);
      }
    } catch (e) {
      console.log(`[auto-sync] error:`, e instanceof Error ? e.message : e);
    }
  };

  const digestTick = async () => {
    try {
      const s = secret();
      if (!s) return;
      const res = await fetch(`${baseUrl()}/api/cron/daily-digest`, {
        headers: { authorization: `Bearer ${s}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.due > 0) {
          console.log(`[digest] sent to ${data.due} users`);
        }
      } else {
        console.log(`[digest] failed: ${res.status}`);
      }
    } catch (e) {
      console.log(`[digest] error:`, e instanceof Error ? e.message : e);
    }
  };

  setTimeout(syncTick, 15_000);
  setInterval(syncTick, SYNC_INTERVAL_MS);

  setTimeout(digestTick, 30_000);
  setInterval(digestTick, DIGEST_CHECK_INTERVAL_MS);
}
