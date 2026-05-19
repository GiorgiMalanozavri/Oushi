/**
 * Client-side web push helpers — registers the service worker, requests
 * permission, manages the browser PushSubscription, syncs with /api/push.
 */

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function getPushSupport(): PushPermission {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window)) return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as PushPermission;
}

export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.error("[push] SW registration failed", e);
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Allocate a fresh ArrayBuffer-backed view so the type is concrete
  // (TS will otherwise flag the union with SharedArrayBuffer).
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return view;
}

export type EnablePushResult =
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: string; detail?: string };

/**
 * Request permission, subscribe, and POST the subscription to the server.
 * Returns a structured result so the UI can show *why* it failed.
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (getPushSupport() === "unsupported") {
    return { ok: false, reason: "This browser doesn't support web push." };
  }

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (e) {
    return { ok: false, reason: "Permission prompt failed.", detail: errMsg(e) };
  }
  if (permission === "denied") {
    return {
      ok: false,
      reason: "Notifications are blocked for this site. Allow them in your browser settings and reload.",
    };
  }
  if (permission !== "granted") {
    return { ok: false, reason: "Permission wasn't granted." };
  }

  const reg = await registerServiceWorker();
  if (!reg) {
    return {
      ok: false,
      reason: "Couldn't register the service worker. Try a hard reload (Cmd+Shift+R).",
    };
  }

  // Get VAPID public key from the server
  let keyJson: { publicKey?: string | null } | null = null;
  try {
    const keyRes = await fetch("/api/push/subscribe");
    if (!keyRes.ok) {
      return {
        ok: false,
        reason: "Couldn't reach the server.",
        detail: `HTTP ${keyRes.status}`,
      };
    }
    keyJson = await keyRes.json();
  } catch (e) {
    return { ok: false, reason: "Network error fetching VAPID key.", detail: errMsg(e) };
  }
  const publicKey = keyJson?.publicKey;
  if (!publicKey) {
    return {
      ok: false,
      reason: "Server is missing VAPID keys.",
      detail:
        "Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT to your Vercel env vars and redeploy.",
    };
  }

  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
  } catch (e) {
    return {
      ok: false,
      reason: "Browser rejected the subscription.",
      detail: errMsg(e),
    };
  }

  // Send the subscription to the server
  try {
    const payload = sub.toJSON();
    const saveRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!saveRes.ok) {
      const errJson = await saveRes.json().catch(() => null);
      return {
        ok: false,
        reason: "Couldn't save subscription to the server.",
        detail: errJson?.error || `HTTP ${saveRes.status}`,
      };
    }
  } catch (e) {
    return {
      ok: false,
      reason: "Network error saving subscription.",
      detail: errMsg(e),
    };
  }

  return { ok: true, subscription: sub };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

export async function disablePush(): Promise<void> {
  const sub = await getActiveSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch (e) {
    console.error("[push] unsubscribe failed", e);
  }
  try {
    await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
    });
  } catch {
    // best effort
  }
}

export async function sendTestPush(): Promise<{ delivered: number; failed: number; pruned: number }> {
  const res = await fetch("/api/push/test", { method: "POST" });
  return await res.json();
}
