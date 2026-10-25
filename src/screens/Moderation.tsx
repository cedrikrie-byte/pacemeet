import { useCallback, useEffect, useState } from "react";
import { Ban, CalendarHeart, CheckCircle2, Flag, Loader2, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useNav } from "../nav";
import { useApp } from "../store/AppStore";
import { Button, Empty, Field, Segmented, Sheet, TopBar, inputCls, cx } from "../components/ui";
import { MedalIcon } from "../components/Awards";
import * as be from "../backend/supabase";
import { fmtAgo, fmtDay } from "../lib/format";

const STATUS_LABEL: Record<be.AdminReport["status"], string> = { open: "Offen", reviewed: "Geprüft", actioned: "Maßnahme ergriffen", dismissed: "Kein Verstoß" };

/** Meldungen prüfen und Nutzer sperren (nur Admins, der Server prüft die Rolle). */
export function Moderation() {
  const nav = useNav();
  const { state } = useApp();
  const [area, setArea] = useState<"reports" | "events">("reports");
  const [tab, setTab] = useState<"open" | "done">("open");
  const [rows, setRows] = useState<be.AdminReport[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [suspendFor, setSuspendFor] = useState<be.AdminReport | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (area !== "reports") return;
    setErr("");
    try { setRows(await be.adminReports(tab)); } catch (e) { setErr((e as Error).message); setRows([]); }
  }, [tab, area]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  async function act(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try { await fn(); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  }

  if (!state.myStatus?.isAdmin) {
    return <div><TopBar onBack={nav.back} title="Moderation" /><div className="p-4"><Empty icon={<ShieldCheck size={22} />} title="Nur für Admins" text="Dieser Bereich ist nur für das Moderationsteam." /></div></div>;
  }

  return (
    <div className="screen-in pb-10">
      <TopBar onBack={nav.back} title="Moderation" sub="Meldungen von Nutzerinnen und Nutzern" />
      <div className="flex flex-col gap-4 px-4 pt-4">
        <Segmented label="Bereich" value={area} onChange={setArea} options={[{ value: "reports", label: <><Flag size={14} /> Meldungen</> }, { value: "events", label: <><CalendarHeart size={14} /> Events</> }]} />
        {area === "events" ? <EventsAdmin /> : <>
        <Segmented label="Status" value={tab} onChange={setTab} options={[{ value: "open", label: "Offen" }, { value: "done", label: "Erledigt" }]} />
        {err && <p className="rounded-xl bg-bad/10 p-3 text-[13.5px] text-bad">{err}</p>}
        {rows === null ? (
          <p className="flex items-center gap-2 text-[14px] text-muted"><Loader2 size={16} className="animate-spin" /> Wird geladen …</p>
        ) : rows.length === 0 ? (
          <Empty icon={<CheckCircle2 size={22} />} title={tab === "open" ? "Keine offenen Meldungen" : "Noch nichts erledigt"} text={tab === "open" ? "Alles ruhig. Neue Meldungen erscheinen hier." : "Bearbeitete Meldungen erscheinen hier."} />
        ) : rows.map((r) => (
          <article key={r.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[15px] font-bold"><Flag size={15} className="text-bad" /> {r.reportedName ?? "Gelöschtes Konto"}
                  {r.reportedSuspended && <span className="rounded-full bg-bad/10 px-2 py-px text-[11px] font-bold text-bad">Gesperrt</span>}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">gemeldet von {r.reporterName ?? "gelöschtem Konto"} · {fmtAgo(r.createdAt)}{r.reportsAgainst > 1 ? ` · ${r.reportsAgainst} Meldungen insgesamt` : ""}</p>
              </div>
              <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold", r.status === "open" ? "bg-warn/12 text-warn" : "bg-raised text-muted")}>{STATUS_LABEL[r.status]}</span>
            </div>
            <p className="rounded-xl bg-raised px-3 py-2 text-[14px]">„{r.reason}“</p>
            {r.activityTitle && <button onClick={() => r.activityId && nav.push({ name: "activity", id: r.activityId })} className="self-start text-[13px] font-semibold text-accent">Aktivität: {r.activityTitle}</button>}
            <div className="flex flex-wrap gap-2">
              {r.status === "open" && (
                <>
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act(r.id, () => be.adminSetReportStatus(r.id, "dismissed"))}><XCircle size={14} /> Kein Verstoß</Button>
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act(r.id, () => be.adminSetReportStatus(r.id, "reviewed"))}><CheckCircle2 size={14} /> Geprüft</Button>
                </>
              )}
              {r.reportedId && !r.reportedSuspended && <Button size="sm" variant="danger" disabled={!!busy} onClick={() => { setSuspendFor(r); setReason(r.reason); }}><Ban size={14} /> Sperren</Button>}
              {r.reportedId && r.reportedSuspended && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act(r.id, () => be.adminUnsuspend(r.reportedId!))}><RotateCcw size={14} /> Entsperren</Button>}
              {r.status !== "open" && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(r.id, () => be.adminSetReportStatus(r.id, "open"))}>Wieder öffnen</Button>}
              {busy === r.id && <Loader2 size={16} className="animate-spin self-center text-muted" />}
            </div>
          </article>
        ))}
        </>}
      </div>

      <Sheet open={!!suspendFor} onClose={() => setSuspendFor(null)} title={`${suspendFor?.reportedName ?? "Konto"} sperren?`}
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setSuspendFor(null)}>Abbrechen</Button>
          <Button variant="danger" block disabled={reason.trim().length < 3} onClick={() => { const r = suspendFor!; setSuspendFor(null); void act(r.id, () => be.adminSuspend(r.reportedId!, reason.trim())); }}>Sperren</Button></div>}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-[14.5px] leading-relaxed">Die Person kann nichts mehr anlegen, beitreten oder schreiben. Ihr Profil und ihre Aktivitäten verschwinden für andere, kommende Aktivitäten werden abgesagt und Teilnehmende informiert. Offene Meldungen gegen sie werden als erledigt markiert. Entsperren ist jederzeit möglich.</p>
          <label htmlFor="suspend-reason" className="text-[13px] font-semibold">Grund (sieht die Person)</label>
          <textarea id="suspend-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] outline-none focus:border-bad" />
        </div>
      </Sheet>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const HUES = [22, 200, 140, 280, 340, 45];

/** Community-Events anlegen und löschen. Medaillen gibt es fürs Mitmachen, nicht für Zeiten. */
function EventsAdmin() {
  const { state, api } = useApp();
  const today = new Date(); const inWeek = new Date(Date.now() + 6 * 86400000);
  const [name, setName] = useState("");
  const [medal, setMedal] = useState("");
  const [start, setStart] = useState(toDate(today));
  const [end, setEnd] = useState(toDate(inWeek));
  const [required, setRequired] = useState(3);
  const [desc, setDesc] = useState("");
  const [hue, setHue] = useState(HUES[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [del, setDel] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) return setMsg({ text: "Gib dem Event einen Namen (mind. 3 Zeichen).", bad: true });
    if (medal.trim().length < 2) return setMsg({ text: "Gib der Medaille einen kurzen Namen.", bad: true });
    if (end < start) return setMsg({ text: "Das Ende liegt vor dem Beginn.", bad: true });
    const id = `${name.trim().toLowerCase().replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${start.slice(0, 7)}`;
    setBusy(true); setMsg(null);
    try {
      await be.adminSaveEvent({ id, name: name.trim(), start: new Date(`${start}T00:00`).toISOString(), end: new Date(`${end}T23:59`).toISOString(), required, medal: medal.trim(), description: desc.trim(), hue });
      await api.reload();
      setName(""); setMedal(""); setDesc("");
      setMsg({ text: "Event angelegt. Es ist jetzt für alle sichtbar." });
    } catch (x) { setMsg({ text: (x as Error).message, bad: true }); } finally { setBusy(false); }
  }

  const events = [...state.events].sort((a, b) => b.start.localeCompare(a.start));
  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={save} noValidate className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-display text-[17px] font-extrabold">Neues Event</h2>
        <Field label="Name" htmlFor="ev-name"><input id="ev-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="z. B. Winterlauf-Woche" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Beginn" htmlFor="ev-start"><input id="ev-start" type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Ende" htmlFor="ev-end"><input id="ev-end" type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Medaille" htmlFor="ev-medal"><input id="ev-medal" className={inputCls} value={medal} onChange={(e) => setMedal(e.target.value)} maxLength={30} placeholder="z. B. Winterläufer" /></Field>
          <Field label="Nötige Aktivitäten" htmlFor="ev-req"><input id="ev-req" type="number" min={1} max={50} className={cx(inputCls, "tnum")} value={required} onChange={(e) => setRequired(Math.max(1, Math.min(50, +e.target.value || 1)))} /></Field>
        </div>
        <Field label="Beschreibung" htmlFor="ev-desc"><textarea id="ev-desc" rows={2} maxLength={300} className={cx(inputCls, "h-auto py-3")} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Was ist die Idee? Gilt für jedes Tempo." /></Field>
        <div className="flex items-center gap-3">
          <MedalIcon hue={hue} size={44} />
          <div className="flex gap-1.5" role="radiogroup" aria-label="Farbe der Medaille">
            {HUES.map((h) => <button key={h} type="button" role="radio" aria-checked={hue === h} aria-label={`Farbe ${h}`} onClick={() => setHue(h)} className={cx("h-7 w-7 rounded-full border-2", hue === h ? "border-ink" : "border-transparent")} style={{ background: `hsl(${h} 70% 50%)` }} />)}
          </div>
        </div>
        {msg && <p className={cx("text-[13px]", msg.bad ? "text-bad" : "text-good")}>{msg.text}</p>}
        <Button type="submit" disabled={busy}>{busy ? "Wird gespeichert …" : "Event anlegen"}</Button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="label">Alle Events</h2>
        {events.length === 0 ? <p className="text-[13.5px] text-muted">Noch keine Events.</p> : events.map((ev) => (
          <div key={ev.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <MedalIcon hue={ev.hue} size={40} />
            <div className="min-w-0 flex-1"><p className="truncate text-[14.5px] font-bold">{ev.name}</p><p className="text-[12px] text-muted">{fmtDay(ev.start)} bis {fmtDay(ev.end)} · {ev.required} Aktivität{ev.required > 1 ? "en" : ""} · Medaille „{ev.medal}“</p></div>
            <button type="button" aria-label={`${ev.name} löschen`} onClick={() => setDel(ev.id)} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-raised"><Trash2 size={16} /></button>
          </div>
        ))}
      </section>

      <Sheet open={!!del} onClose={() => setDel(null)} title="Event löschen?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setDel(null)}>Abbrechen</Button>
          <Button variant="danger" block onClick={async () => { const id = del!; setDel(null); try { await be.adminDeleteEvent(id); await api.reload(); } catch (x) { setMsg({ text: (x as Error).message, bad: true }); } }}>Löschen</Button></div>}>
        <p className="pb-2 text-[14.5px]">Aktivitäten, die diesem Event zugeordnet sind, bleiben bestehen, zählen aber für keine Medaille mehr.</p>
      </Sheet>
    </div>
  );
}
