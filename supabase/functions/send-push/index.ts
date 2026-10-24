// PaceMeet: Push-Nachrichten verschicken (Supabase Edge Function, Deno)
//
// Aufruf 1: { setup: true }               → liefert den öffentlichen Push-Schlüssel (erzeugt ihn beim ersten Mal)
// Aufruf 2: { notification_id: "<uuid>" } → schickt diese Benachrichtigung an alle Geräte der Person
//
// Sicherheit: Jede Benachrichtigung wird höchstens einmal verschickt (pushed_at) und nur an die Person,
// für die sie in der Datenbank gespeichert ist. Ein Aufruf von außen kann also niemandem fremde Inhalte schicken.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

// Server-Schlüssel stellt Supabase automatisch bereit (alte oder neue Schlüsselart)
function serverKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) { try { const k = JSON.parse(keys); return k.default ?? Object.values(k)[0]; } catch { /* ignorieren */ } }
  const single = Deno.env.get("SUPABASE_SECRET_KEY");
  if (single) return single;
  throw new Error("Kein Server-Schlüssel verfügbar");
}
const db = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), { auth: { persistSession: false } });
const SUBJECT = Deno.env.get("PUSH_SUBJECT") ?? "https://pacemeet.netlify.app";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let cached: { pub: string; priv: string } | null = null;

/** Push-Schlüsselpaar laden oder beim ersten Start erzeugen und speichern. */
async function vapidKeys() {
  if (cached) return cached;
  const { data, error } = await db.from("app_secrets").select("key,value").in("key", ["vapid_public", "vapid_private"]);
  if (error) throw error;
  let pub = data?.find((r) => r.key === "vapid_public")?.value;
  let priv = data?.find((r) => r.key === "vapid_private")?.value;
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey;
    priv = k.privateKey;
    const { error: e1 } = await db.from("app_secrets").upsert([
      { key: "vapid_public", value: pub },
      { key: "vapid_private", value: priv },
    ]);
    if (e1) throw e1;
  }
  await db.from("app_config").upsert({ key: "vapid_public_key", value: pub });
  cached = { pub, priv };
  return cached;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const keys = await vapidKeys();
    webpush.setVapidDetails(SUBJECT, keys.pub, keys.priv);

    if (body.setup) return json({ publicKey: keys.pub });

    const id = body.notification_id;
    if (!id) return json({ error: "notification_id fehlt" }, 400);

    // Benachrichtigung „beanspruchen“: nur wenn sie noch nicht verschickt wurde
    const { data: n, error } = await db
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", id)
      .is("pushed_at", null)
      .select("id,user_id,body,activity_id,kind,created_at")
      .maybeSingle();
    if (error) throw error;
    if (!n) return json({ skipped: "schon verschickt oder unbekannt" });
    if (Date.now() - new Date(n.created_at).getTime() > 15 * 60 * 1000) return json({ skipped: "zu alt" });

    const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", n.user_id);
    const payload = JSON.stringify({
      title: n.kind === "chat" ? "Neue Nachricht" : n.kind === "cancel" ? "Abgesagt" : n.kind === "reminder" ? "Erinnerung" : "PaceMeet",
      body: n.body,
      url: n.activity_id ? `/#a-${n.activity_id}` : "/",
      tag: n.activity_id ? `${n.kind}-${n.activity_id}` : n.id,
    });

    let sent = 0, removed = 0, failed = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await db.from("push_subscriptions").delete().eq("id", s.id); // Gerät hat Push abbestellt
          removed++;
        } else {
          failed++;
          console.error("Push fehlgeschlagen", code, String(e));
        }
      }
    }));
    return json({ sent, removed, failed });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
