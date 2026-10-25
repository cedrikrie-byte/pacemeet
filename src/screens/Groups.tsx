import { useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import type { Group } from "../types";
import { Button, Empty, SportIcon, inputCls, cx } from "../components/ui";
import { GroupBadge } from "../components/GroupBadge";
import { kindLabel } from "../lib/groups";
import { cityName } from "../lib/activity";
import { haversineKm } from "../lib/geo";
import { myPos } from "../lib/location";

/** Liste: eigene Gruppen und Gruppen in der Nähe. */
export function GroupsView() {
  const { state } = useApp();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Group["kind"]>("all");
  const pos = myPos(state);
  const mine = state.groups.filter((g) => g.myStatus);
  const term = q.trim().toLowerCase();
  const others = state.groups
    .filter((g) => !g.myStatus && g.listed)
    .filter((g) => (kind === "all" || g.kind === kind) && (!term || g.name.toLowerCase().includes(term) || cityName(g.city).toLowerCase().includes(term)))
    .sort((a, b) => b.memberCount - a.memberCount);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="label">Meine Gruppen</h2>
          <Button size="sm" variant="secondary" onClick={() => nav.push({ name: "groupEdit" })}><Plus size={15} /> Gruppe gründen</Button>
        </div>
        {mine.length === 0 ? (
          <Empty icon={<Users size={22} />} title="Noch in keiner Gruppe" text="Tritt einem Running Club oder Verein bei, oder gründe deine eigene Gruppe. Termine und Serien plant ihr dann gemeinsam." />
        ) : mine.map((g) => <GroupCard key={g.id} g={g} pos={pos} />)}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="label">Gruppen in der Nähe</h2>
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input id="group-search" aria-label="Gruppen suchen" className={cx(inputCls, "pl-10")} placeholder="Name oder Stadt" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {([["all", "Alle"], ["club", "Running Clubs"], ["verein", "Vereine"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)} className={cx("rounded-full border px-3 py-1.5 text-[13px] font-semibold", kind === v ? "border-ink bg-ink text-bg" : "border-line text-muted")}>{l}</button>
          ))}
        </div>
        {others.length === 0
          ? <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-muted">{term || kind !== "all" ? "Keine passende Gruppe gefunden." : "In deiner Nähe gibt es noch keine Gruppen. Gründe die erste!"}</p>
          : others.map((g) => <GroupCard key={g.id} g={g} pos={pos} />)}
      </section>
    </div>
  );
}

function GroupCard({ g, pos }: { g: Group; pos: [number, number] }) {
  const nav = useNav();
  const km = g.cityPos ? haversineKm(pos, g.cityPos) : null;
  return (
    <button type="button" onClick={() => nav.push({ name: "group", id: g.id })}
      className="flex w-full items-center gap-3 rounded-[20px] border border-line bg-surface p-3.5 text-left transition hover:border-muted/50 active:scale-[.995]">
      <GroupBadge group={g} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-[16px] font-extrabold">{g.name}</span>
          {g.myStatus === "pending" && <span className="shrink-0 rounded-full bg-warn/12 px-2 py-px text-[11px] font-bold text-warn">Anfrage offen</span>}
          {(g.myRole === "owner" || g.myRole === "admin") && g.myStatus === "active" && <span className="shrink-0 rounded-full bg-accent/12 px-2 py-px text-[11px] font-bold text-accent">Admin</span>}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted">
          {kindLabel(g.kind)} · {cityName(g.city) || "ohne Ort"}{km !== null && km > 1 ? ` · ${Math.round(km)} km` : ""} · {g.memberCount} {g.memberCount === 1 ? "Mitglied" : "Mitglieder"}
        </span>
      </span>
      <span className="flex shrink-0 gap-1 text-muted">{g.sports.map((s) => <SportIcon key={s} sport={s} size={16} />)}</span>
    </button>
  );
}
