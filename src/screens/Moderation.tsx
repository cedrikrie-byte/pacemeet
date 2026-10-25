import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Flag, Loader2, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { useNav } from "../nav";
import { useApp } from "../store/AppStore";
import { Button, Empty, Segmented, Sheet, TopBar, cx } from "../components/ui";
import * as be from "../backend/supabase";
import { fmtAgo } from "../lib/format";

const STATUS_LABEL: Record<be.AdminReport["status"], string> = { open: "Offen", reviewed: "Geprüft", actioned: "Maßnahme ergriffen", dismissed: "Kein Verstoß" };

/** Meldungen prüfen und Nutzer sperren (nur Admins, der Server prüft die Rolle). */
export function Moderation() {
  const nav = useNav();
  const { state } = useApp();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [rows, setRows] = useState<be.AdminReport[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [suspendFor, setSuspendFor] = useState<be.AdminReport | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { setRows(await be.adminReports(tab)); } catch (e) { setErr((e as Error).message); setRows([]); }
  }, [tab]);
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
