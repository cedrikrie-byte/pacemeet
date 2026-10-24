import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { useApp } from "../store/AppStore";
import { LIVE } from "../config/backend";
import { isIOS, pushState, subscribe, unsubscribe, type PushState } from "../lib/push";
import * as be from "../backend/supabase";

/** Push-Nachrichten für dieses Gerät ein- oder ausschalten. */
export function PushSetting() {
  const { api } = useApp();
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void pushState().then(setSt); }, []);

  async function toggle() {
    if (!LIVE) { api.toast("Push gibt es nur in der echten App, nicht in der Demo."); return; }
    setBusy(true);
    try {
      if (st === "on") {
        const endpoint = await unsubscribe();
        if (endpoint) await be.deletePushSubscription(endpoint);
        api.toast("Push auf diesem Gerät ausgeschaltet");
      } else {
        const key = await be.vapidPublicKey();
        const sub = await subscribe(key);
        await be.savePushSubscription(sub);
        api.toast("Push ist an. Du bekommst Änderungen, Absagen und Nachrichten aufs Gerät.", "good");
      }
    } catch (e) {
      api.toast((e as Error).message, "bad");
    } finally {
      setSt(await pushState());
      setBusy(false);
    }
  }

  const desc =
    st === "needs-install" ? "Auf dem iPhone geht Push nur in der installierten App: In Safari auf Teilen → „Zum Home-Bildschirm“ tippen und die App von dort öffnen."
    : st === "unsupported" ? "Dieser Browser unterstützt keine Push-Nachrichten."
    : st === "denied" ? `Benachrichtigungen sind für diese Seite blockiert. Erlaube sie in den ${isIOS() ? "iPhone-Einstellungen" : "Browser-Einstellungen"} und versuche es erneut.`
    : st === "on" ? "An. Änderungen, Absagen, Erinnerungen und Nachrichten kommen aufs Gerät, auch wenn die App zu ist."
    : "Bekomme Änderungen, Absagen, Erinnerungen und Nachrichten aufs Gerät, auch wenn die App zu ist.";
  const canToggle = st === "on" || st === "off";

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[15px] font-medium"><BellRing size={16} className="text-muted" /> Push auf diesem Gerät</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{st === null ? "Wird geprüft …" : desc}</span>
      </span>
      <button type="button" role="switch" aria-checked={st === "on"} aria-label="Push auf diesem Gerät" disabled={!canToggle || busy} onClick={toggle}
        className="relative mt-0.5 h-[26px] w-[44px] shrink-0 rounded-full bg-line transition aria-checked:bg-good disabled:opacity-40">
        {busy ? <Loader2 size={14} className="absolute left-[15px] top-[6px] animate-spin text-white" />
          : <span className={`absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow transition ${st === "on" ? "translate-x-[18px]" : ""}`} />}
      </button>
    </div>
  );
}
