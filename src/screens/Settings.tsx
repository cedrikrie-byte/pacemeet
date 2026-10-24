import { useState } from "react";
import { Download, FileText, Globe, Info, LogOut, Monitor, Moon, RotateCcw, Sun, Trash2 } from "lucide-react";
import { LIVE } from "../config/backend";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import { Avatar, Button, DemoTag, Segmented, Sheet, Toggle, TopBar, cx } from "../components/ui";
import { PrototypeInfo } from "../components/PrototypeInfo";
import { COUNTRIES, LANGUAGES } from "../config/app";

export function Settings() {
  const { state, api } = useApp();
  const nav = useNav();
  const s = state.settings;
  const [reset, setReset] = useState(false);
  const [del, setDel] = useState(false);
  const [delText, setDelText] = useState("");

  async function exportData() {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `pacemeet-daten-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { alertMsg(String((e as Error).message)); }
  }
  const [msg, alertMsg] = useState("");

  return (
    <div className="screen-in pb-10">
      <TopBar onBack={nav.back} title="Einstellungen" />
      <div className="flex flex-col gap-7 px-4 pt-5">
        {LIVE && (
          <Group title="Konto">
            <p className="py-3 text-[14px]"><span className="text-muted">Angemeldet als </span><b>{state.email ?? "–"}</b></p>
            <button onClick={() => api.signOut()} className="flex w-full items-center gap-2 py-3 text-left text-[14.5px] font-medium"><LogOut size={16} className="text-muted" /> Abmelden</button>
          </Group>
        )}
        <Group title="Darstellung">
          <div className="flex flex-col gap-3 py-3">
            <Segmented label="Farbschema" value={s.theme} onChange={(v) => api.setSettings({ theme: v })} options={[{ value: "system", label: <><Monitor size={14} /> System</> }, { value: "light", label: <><Sun size={14} /> Hell</> }, { value: "dark", label: <><Moon size={14} /> Dunkel</> }]} />
            <Segmented label="Einheiten" value={s.units} onChange={(v) => api.setSettings({ units: v })} options={[{ value: "metric", label: "km, min/km" }, { value: "imperial", label: "Meilen, min/mi" }]} />
          </div>
        </Group>

        <Group title="Sprache & Region">
          <div className="flex flex-col gap-2 py-3">
            {LANGUAGES.map((l) => (
              <div key={l.code} className="flex items-center justify-between text-[14.5px]"><span className="flex items-center gap-2"><Globe size={15} className="text-muted" /> {l.name}</span>{l.ready ? <span className="text-[12.5px] font-semibold text-good">Aktiv</span> : <span className="text-[12.5px] text-muted">geplant</span>}</div>
            ))}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COUNTRIES.map((c) => <span key={c.code} className={cx("rounded-full px-2.5 py-1 text-[12px] font-semibold", c.status === "live" ? "bg-good/12 text-good" : "bg-raised text-muted")}>{c.name}{c.status === "live" ? " · Start" : ""}</span>)}
            </div>
          </div>
        </Group>

        <Group title="Datenschutz">
          <div className="flex flex-col gap-2 py-3">
            <p className="text-[14.5px] font-medium">Wer darf mein Profil sehen?</p>
            <Segmented label="Profil-Sichtbarkeit" value={s.profileVisibility} onChange={(v) => api.setSettings({ profileVisibility: v })} options={[{ value: "participants", label: "Nur Mitlaufende" }, { value: "everyone", label: "Alle" }]} />
            <p className="text-[12.5px] text-muted">„Nur Mitlaufende“: Personen, die mit dir in einer Aktivität angemeldet sind.</p>
          </div>
          <Toggle id="s-pace" checked={s.showPace} onChange={(v) => api.setSettings({ showPace: v })} label="Tempo im Profil zeigen" />
          <Toggle id="s-hist" checked={s.showHistory} onChange={(v) => api.setSettings({ showHistory: v })} label="Vergangene Aktivitäten zeigen" desc="Standardmäßig nur für dich sichtbar." />
          <Toggle id="s-awards" checked={s.showAwards} onChange={(v) => api.setSettings({ showAwards: v })} label="Medaillen im Profil zeigen" />
          <p className="py-3 text-[12.5px] text-muted">Dein Standort wird nur als Stadt gespeichert. Treffpunkte sind immer öffentliche Orte.</p>
        </Group>

        <Group title="Benachrichtigungen" tag={<DemoTag>nur in der App</DemoTag>}>
          <Toggle id="n-changes" checked={s.notify.changes} onChange={(v) => api.setSettings({ notify: { ...s.notify, changes: v } })} label="Änderungen und Absagen" desc="Empfohlen. Zeit, Treffpunkt oder Absage einer Aktivität." />
          <Toggle id="n-chat" checked={s.notify.chat} onChange={(v) => api.setSettings({ notify: { ...s.notify, chat: v } })} label="Neue Chat-Nachrichten" />
          <Toggle id="n-joins" checked={s.notify.joins} onChange={(v) => api.setSettings({ notify: { ...s.notify, joins: v } })} label="Neue Teilnehmende bei meinen Aktivitäten" />
          <Toggle id="n-rem" checked={s.notify.reminders} onChange={(v) => api.setSettings({ notify: { ...s.notify, reminders: v } })} label="Erinnerungen und Bestätigungen" />
        </Group>

        <Group title="Community-Liga">
          <Toggle id="l-opt" checked={state.league.optIn} onChange={(v) => api.setLeague({ optIn: v })} label="An der Liga teilnehmen" desc="Freiwillig. Ohne Liga hast du keinerlei Nachteile." />
          {state.league.optIn && (
            <div className="flex flex-col gap-2 py-3">
              <p className="text-[14.5px] font-medium">Wer sieht mich in Ranglisten?</p>
              {([["private", "Nur ich", "Du siehst deine Position, andere sehen dich nicht."], ["friends", "Trainingspartner", "Personen, mit denen du unterwegs warst."], ["local", "Lokale Rangliste", "Alle Teilnehmenden in deiner Region."]] as const).map(([v, l, d]) => (
                <label key={v} className={cx("flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3", state.league.visibility === v ? "border-ink" : "border-line")}>
                  <input id={"vis-" + v} type="radio" name="vis" className="mt-1" checked={state.league.visibility === v} onChange={() => api.setLeague({ visibility: v })} />
                  <span><span className="block text-[14px] font-semibold">{l}</span><span className="block text-[12.5px] text-muted">{d}</span></span>
                </label>
              ))}
            </div>
          )}
        </Group>

        <Group title="Blockierte Personen">
          {state.blocked.length === 0 ? <p className="py-3 text-[13.5px] text-muted">Niemand blockiert.</p> : state.blocked.map((id) => (
            <div key={id} className="flex items-center gap-3 py-2.5"><Avatar user={state.users[id]} size={30} /><span className="flex-1 text-[14px] font-semibold">{state.users[id]?.name}</span><Button size="sm" variant="secondary" onClick={() => api.unblock(id)}>Aufheben</Button></div>
          ))}
          {state.reports.length > 0 && <p className="py-2 text-[12.5px] text-muted">{state.reports.length} Meldung(en) gesendet.</p>}
        </Group>

        {LIVE && <Group title="Deine Daten">
          <button onClick={exportData} className="flex w-full items-center gap-2 py-3 text-left text-[14.5px] font-medium"><Download size={16} className="text-muted" /> Meine Daten herunterladen</button>
          {<button onClick={() => setDel(true)} className="flex w-full items-center gap-2 py-3 text-left text-[14.5px] font-medium text-bad"><Trash2 size={16} /> Konto löschen</button>}
          {msg && <p className="py-2 text-[12.5px] text-bad">{msg}</p>}
        </Group>}

        <Group title="Rechtliches">
          {([["impressum", "Impressum"], ["datenschutz", "Datenschutzerklärung"], ["nutzung", "Nutzungsbedingungen"]] as const).map(([d, l]) => (
            <button key={d} onClick={() => nav.push({ name: "legal", doc: d })} className="flex w-full items-center gap-2 py-3 text-left text-[14.5px] font-medium"><FileText size={16} className="text-muted" /> {l}</button>
          ))}
        </Group>

        {!LIVE && (
          <Group title="Über den Prototyp">
            <button onClick={() => nav.push({ name: "info" })} className="flex w-full items-center gap-2 py-3 text-left text-[14.5px] font-medium"><Info size={16} className="text-muted" /> Was funktioniert, was ist simuliert?</button>
            <button onClick={() => setReset(true)} className="flex w-full items-center gap-2 py-3 text-left text-[14.5px] font-medium text-bad"><RotateCcw size={16} /> Demo zurücksetzen</button>
          </Group>
        )}
      </div>
      <Sheet open={del} onClose={() => setDel(false)} title="Konto endgültig löschen?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setDel(false)}>Abbrechen</Button><Button variant="danger" block disabled={delText.trim().toUpperCase() !== "LÖSCHEN"} onClick={() => { setDel(false); void api.deleteAccount(); }}>Konto löschen</Button></div>}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-[15px] leading-relaxed">Profil, Teilnahmen, Nachrichten und Punkte werden sofort gelöscht. Deine kommenden Aktivitäten werden abgesagt und die Teilnehmenden informiert. Das lässt sich nicht rückgängig machen.</p>
          <label htmlFor="del-confirm" className="text-[13px] font-semibold">Tippe LÖSCHEN zur Bestätigung</label>
          <input id="del-confirm" className="h-12 rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-bad" value={delText} onChange={(e) => setDelText(e.target.value)} autoComplete="off" />
        </div>
      </Sheet>
      <Sheet open={reset} onClose={() => setReset(false)} title="Demo zurücksetzen?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setReset(false)}>Abbrechen</Button><Button variant="danger" block onClick={() => { api.reset(); setReset(false); nav.tab("discover"); }}>Zurücksetzen</Button></div>}>
        <p className="text-[15px]">Alle Änderungen, erstellten Aktivitäten und Nachrichten in dieser Demo werden gelöscht.</p>
      </Sheet>
    </div>
  );
}

function Group({ title, children, tag }: { title: string; children: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <section>
      <h2 className="label mb-2 flex items-center gap-2">{title}{tag}</h2>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">{children}</div>
    </section>
  );
}

export function InfoScreen() {
  const nav = useNav();
  return (
    <div className="screen-in pb-10">
      <TopBar onBack={nav.back} title="Prototyp-Status" />
      <div className="px-4 pt-5"><PrototypeInfo /></div>
    </div>
  );
}
