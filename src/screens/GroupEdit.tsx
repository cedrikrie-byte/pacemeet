import { useState } from "react";
import { Building2, Trash2, Users } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import type { Group, SportId } from "../types";
import { Button, Field, Segmented, Sheet, SportIcon, Toggle, TopBar, inputCls, cx } from "../components/ui";
import { CityPicker, type CityValue } from "../components/CityPicker";
import { GroupBadge } from "../components/GroupBadge";
import { cityName } from "../lib/activity";
import { knownCityPos, myPos } from "../lib/location";

const HUES = [10, 28, 45, 140, 175, 200, 225, 260, 300, 340];

export function GroupEdit({ id }: { id?: string }) {
  const { state, api, me } = useApp();
  const nav = useNav();
  const editing = id ? state.groups.find((g) => g.id === id) : undefined;
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<Group["kind"]>(editing?.kind ?? "club");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const startCity = editing?.city ?? me.city;
  const [city, setCity] = useState<CityValue>({ id: startCity, name: cityName(startCity), pos: editing?.cityPos ?? knownCityPos(startCity) ?? me.cityPos ?? myPos(state) });
  const [cityOpen, setCityOpen] = useState(false);
  const [sports, setSports] = useState<SportId[]>(editing?.sports ?? (me.sports.length ? me.sports : ["run"]));
  const [joinMode, setJoinMode] = useState<Group["joinMode"]>(editing?.joinMode ?? "open");
  const [listed, setListed] = useState(editing?.listed ?? true);
  const [postMode, setPostMode] = useState<Group["postMode"]>(editing?.postMode ?? "members");
  const [hue, setHue] = useState(editing?.hue ?? HUES[Math.floor(Math.random() * HUES.length)]);
  const [website, setWebsite] = useState(editing?.website ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Vereine: Standard „Aufnahme auf Anfrage“ und „nur Admins legen Termine an“
  function pickKind(k: Group["kind"]) {
    setKind(k);
    if (!editing) { setJoinMode(k === "verein" ? "request" : "open"); setPostMode(k === "verein" ? "admins" : "members"); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (name.trim().length < 3) err.name = "Gib einen Namen mit mindestens 3 Zeichen ein.";
    const web = website.trim() ? (website.trim().startsWith("http") ? website.trim().replace(/^http:/, "https:") : `https://${website.trim()}`) : "";
    if (web && !/^https:\/\/[^ ]{3,200}$/.test(web)) err.website = "Gib eine gültige Webadresse ein.";
    setErrors(err);
    if (Object.keys(err).length) return;
    const g: Partial<Group> = { name: name.trim(), kind, description: desc.trim(), city: city.id, cityPos: city.pos, sports, joinMode, listed, postMode, hue, website: web || undefined };
    setSaving(true);
    if (editing) {
      const ok = await api.updateGroup(editing.id, g);
      setSaving(false);
      if (ok) nav.back();
    } else {
      const newId = await api.createGroup(g);
      setSaving(false);
      if (newId) nav.replace({ name: "group", id: newId });
    }
  }

  return (
    <form onSubmit={submit} noValidate className="screen-in pb-28">
      <TopBar onBack={nav.back} title={editing ? "Gruppe bearbeiten" : "Gruppe gründen"} />
      <div className="flex flex-col gap-7 px-4 pt-4">
        <div className="flex items-center gap-4">
          <GroupBadge group={{ name: name || "Neue Gruppe", hue, kind }} size={64} />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Farbe">
            {HUES.map((h) => (
              <button key={h} type="button" role="radio" aria-checked={hue === h} aria-label={`Farbe ${h}`} onClick={() => setHue(h)}
                className={cx("h-7 w-7 rounded-full border-2", hue === h ? "border-ink" : "border-transparent")} style={{ background: `hsl(${h} 70% 50%)` }} />
            ))}
          </div>
        </div>

        <Field label="Art der Gruppe">
          <div className="grid grid-cols-2 gap-2">
            {([["club", "Running Club", "Privat organisiert, z. B. Freunde oder Lauftreff", <Users key="u" size={18} />], ["verein", "Verein", "Eingetragener Verein oder Abteilung", <Building2 key="b" size={18} />]] as const).map(([v, l, d, icon]) => (
              <button key={v} type="button" aria-pressed={kind === v} onClick={() => pickKind(v)}
                className={cx("flex flex-col items-start gap-1 rounded-2xl border p-3 text-left", kind === v ? "border-ink bg-surface" : "border-line text-muted")}>
                <span className="flex items-center gap-1.5 text-[14.5px] font-bold text-ink">{icon} {l}</span>
                <span className="text-[12px] leading-snug">{d}</span>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Name" htmlFor="gname" error={errors.name}>
          <input id="gname" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={kind === "verein" ? "z. B. TuS Essen Laufabteilung" : "z. B. Rü Runners"} />
        </Field>

        <Field label="Beschreibung" htmlFor="gdesc" hint="Wann und wo trefft ihr euch? Für wen ist die Gruppe?">
          <textarea id="gdesc" rows={4} className={cx(inputCls, "h-auto py-3 leading-relaxed")} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
        </Field>

        <Field label="Ort">
          {cityOpen
            ? <CityPicker id="gcity" value={city} onPick={(c) => { setCity(c); setCityOpen(false); }} autoFocus />
            : <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3"><span className="font-semibold">{city.name}</span><button type="button" className="text-[13px] font-semibold text-accent" onClick={() => setCityOpen(true)}>Ändern</button></div>}
        </Field>

        <Field label="Sportarten">
          <div className="flex gap-2">
            {(["run", "ride"] as SportId[]).map((sp) => {
              const on = sports.includes(sp);
              return <button key={sp} type="button" aria-pressed={on} onClick={() => { const n = on ? sports.filter((x) => x !== sp) : [...sports, sp]; if (n.length) setSports(n); }}
                className={cx("flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13.5px] font-semibold", on ? "border-ink bg-ink text-bg" : "border-line text-muted")}><SportIcon sport={sp} /> {sp === "run" ? "Laufen" : "Radfahren"}</button>;
            })}
          </div>
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold">Wer darf beitreten?</p>
          <Segmented label="Beitritt" value={joinMode} onChange={setJoinMode} options={[{ value: "open", label: "Alle sofort" }, { value: "request", label: "Auf Anfrage" }]} />
          <p className="text-[12.5px] text-muted">{joinMode === "open" ? "Jede Person kann direkt Mitglied werden." : "Admins nehmen neue Mitglieder auf und bekommen dafür eine Benachrichtigung."}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[14px] font-semibold">Wer darf Termine anlegen?</p>
          <Segmented label="Termine anlegen" value={postMode} onChange={setPostMode} options={[{ value: "members", label: "Alle Mitglieder" }, { value: "admins", label: "Nur Admins" }]} />
        </div>

        <div className="rounded-2xl border border-line bg-surface px-4">
          <Toggle id="glisted" checked={listed} onChange={setListed} label="In der Gruppensuche zeigen" desc={listed ? "Andere in der Nähe finden die Gruppe." : "Nur wer den Einladungslink hat, findet die Gruppe."} />
        </div>

        {kind === "verein" && (
          <Field label="Webseite (optional)" htmlFor="gweb" error={errors.website}>
            <input id="gweb" className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.mein-verein.de" inputMode="url" />
          </Field>
        )}

        {editing?.myRole === "owner" && (
          <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 self-start text-[13.5px] font-semibold text-bad"><Trash2 size={15} /> Gruppe löschen</button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <Button type="submit" block size="lg" disabled={saving}>{saving ? "Wird gespeichert …" : editing ? "Änderungen speichern" : "Gruppe gründen"}</Button>
      </div>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Gruppe löschen?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setConfirmDelete(false)}>Abbrechen</Button><Button variant="danger" block onClick={async () => { setConfirmDelete(false); if (editing && await api.deleteGroup(editing.id)) { nav.tab("mine"); } }}>Löschen</Button></div>}>
        <p className="text-[15px] leading-relaxed">Alle Mitglieder verlieren den Zugang. Kommende Termine, die nur für Mitglieder sichtbar sind, werden abgesagt. Das lässt sich nicht rückgängig machen.</p>
      </Sheet>
    </form>
  );
}
