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

/**
 * Request permission, subscribe, and POST the subscription to the server.
 * Returns the subscription on success, null on failure / denied.
 */
export async function enablePush(): Promise<PushSubscription | null> {
  if (getPushSupport() === "unsupported") return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const reg = await registerServiceWorker();
  if (!reg) return null;

  // Get VAPID public key from the server
  const keyRes = await fetch("/api/push/subscribe");
  const keyJson = await keyRes.json();
  const publicKey: string | null = keyJson?.publicKey;
  if (!publicKey) {
    console.error("[push] no VAPID public key from server");
    return null;
  }

  let sub: PushSubscription | null = null;
  try {
    // Check for existing subscription (could be from an earlier session)
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
  } catch (e) {
    console.error("[push] subscribe failed", e);
    return null;
  }

  // Send the subscription to the server
  const payload = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return sub;
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
