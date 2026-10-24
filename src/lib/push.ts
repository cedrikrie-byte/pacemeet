/** Web Push auf diesem Gerät (funktioniert in Chrome/Edge/Firefox; auf dem iPhone nur in der installierten App). */

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
}

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isInstalled()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "unsupported";
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Fragt die Erlaubnis an und meldet das Gerät an. Gibt das Abo zum Speichern auf dem Server zurück. */
export async function subscribe(publicKey: string): Promise<PushSubscriptionJSON> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Du hast Benachrichtigungen nicht erlaubt. Du kannst das in den Browser-Einstellungen ändern.");
  const reg = await registration();
  if (!reg) throw new Error("Push ist in diesem Browser nicht verfügbar.");
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  return sub.toJSON();
}

export async function unsubscribe(): Promise<string | null> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
