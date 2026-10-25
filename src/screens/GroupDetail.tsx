import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Copy, ExternalLink, Globe, Lock, LogOut, MoreHorizontal, Pencil, Repeat, Share2, ShieldCheck, Users, X } from "lucide-react";
import { useApp } from "../store/AppStore";
import { useNav } from "../nav";
import type { GroupMember } from "../types";
import { Avatar, Button, Empty, IconButton, Sheet, SportTag, TopBar, cx } from "../components/ui";
import { GroupBadge } from "../components/GroupBadge";
import { ActivityCard } from "../components/ActivityCard";
import { canPost, isGroupAdmin, isGroupMember, kindLabel } from "../lib/groups";
import { cityName } from "../lib/activity";
import { seriesLabel } from "../lib/series";
import { fmtDay, fmtTime } from "../lib/format";

export function GroupDetail({ id }: { id: string }) {
  const { state, api } = useApp();
  const nav = useNav();
  const g = state.groups.find((x) => x.id === id);
  const [loaded, setLoaded] = useState(!!g);
  const [shareOpen, setShareOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [memberSheet, setMemberSheet] = useState<GroupMember | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let on = true;
    void (async () => {
      if (!state.groups.some((x) => x.id === id)) await api.ensureGroup(id);
      if (on) setLoaded(true);
      await api.loadGroup(id);
    })();
    return () => { on = false; };
  }, [id, g?.myStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const upcoming = useMemo(() => state.activities
    .filter((a) => a.groupId === id && a.status === "open" && new Date(a.startsAt).getTime() > Date.now() - 2 * 3600e3)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [state.activities, id]);
  // Je Serie nur der nächste Termin
  const series = useMemo(() => {
    const seen = new Map<string, typeof upcoming[number]>();
    upcoming.forEach((a) => { if (a.seriesId && !seen.has(a.seriesId)) seen.set(a.seriesId, a); });
    return [...seen.values()];
  }, [upcoming]);
  useEffect(() => { series.filter((a) => !a.seriesRule).forEach((a) => void api.seriesInfo(a.seriesId!)); }, [series.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!g) {
    return <div><TopBar onBack={nav.back} title="Gruppe" /><div className="p-4">{loaded ? <Empty icon={<Users />} title="Nicht gefunden" text="Diese Gruppe gibt es nicht mehr." /> : <p className="text-center text-[13px] text-muted">Wird geladen …</p>}</div></div>;
  }

  const member = isGroupMember(g), admin = isGroupAdmin(g), owner = g.myRole === "owner" && member;
  const pending = g.myStatus === "pending";
  const members = state.groupMembers[id] ?? [];
  const active = members.filter((m) => m.status === "active");
  const requests = members.filter((m) => m.status === "pending");
  const shareUrl = `${window.location.origin}${window.location.pathname}#g-${g.id}`;
  const shareText = `${g.name} auf ${document.title || "PaceMeet"}: Lauf mit uns!`;

  async function share() {
    if (navigator.share) { try { await navigator.share({ title: g!.name, text: shareText, url: shareUrl }); return; } catch { /* abgebrochen */ } }
    setShareOpen(true);
  }

  return (
    <div className="screen-in pb-28">
      <TopBar onBack={nav.back} title="" right={<div className="flex gap-1">
        <IconButton label="Einladen" onClick={share}><Share2 size={19} /></IconButton>
        {admin && <IconButton label="Gruppe bearbeiten" onClick={() => nav.push({ name: "groupEdit", id: g.id })}><Pencil size={18} /></IconButton>}
      </div>} />

      <div className="flex flex-col gap-6 px-4 pt-2">
        <div className="flex items-start gap-4">
          <GroupBadge group={g} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{kindLabel(g.kind)}{g.city ? ` · ${cityName(g.city)}` : ""}</p>
            <h1 className="mt-0.5 font-display text-[26px] font-black leading-[1.05]">{g.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {g.sports.map((s) => <SportTag key={s} sport={s} />)}
              <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[12px] font-bold"><Users size={12} /> {g.memberCount}</span>
              {g.joinMode === "request" && <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[12px] font-bold"><ShieldCheck size={12} /> Aufnahme auf Anfrage</span>}
              {!g.listed && <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[12px] font-bold"><Lock size={12} /> Nur per Einladung</span>}
            </div>
          </div>
        </div>

        {g.description && <p className="whitespace-pre-line text-[15px] leading-relaxed">{g.description}</p>}
        {g.website && <a href={g.website} target="_blank" rel="noreferrer noopener" className="-mt-3 inline-flex items-center gap-1.5 self-start text-[13.5px] font-semibold text-accent"><Globe size={14} /> {g.website.replace(/^https:\/\//, "")} <ExternalLink size={12} /></a>}

        {pending && <div className="rounded-2xl bg-warn/12 p-3.5 text-[14px] text-warn"><b>Anfrage gesendet.</b> Sobald dich ein Admin aufnimmt, siehst du alle Termine und Mitglieder.</div>}

        {member && canPost(g) && (
          <Button block onClick={() => nav.push({ name: "create", groupId: g.id })}><CalendarPlus size={17} /> Termin oder Serie anlegen</Button>
        )}
        {member && !canPost(g) && <p className="text-[13px] text-muted">In dieser Gruppe legen nur Admins Termine an.</p>}

        {series.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="label">Feste Termine</h2>
            {series.map((a) => (
              <button key={a.seriesId} type="button" onClick={() => nav.push({ name: "activity", id: a.id })} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent"><Repeat size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{a.title}</span>
                  <span className="block truncate text-[12.5px] text-muted">{a.seriesRule ? seriesLabel(a.seriesRule) : "Serie"} · nächster: {fmtDay(a.startsAt)}, {fmtTime(a.startsAt)}</span>
                </span>
              </button>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="label">Nächste Termine</h2>
          {upcoming.length === 0
            ? <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-muted">{member ? "Noch keine Termine geplant." : pending ? "Termine siehst du nach der Aufnahme." : "Keine öffentlichen Termine. Tritt bei, um alle Termine zu sehen."}</p>
            : upcoming.filter((a) => !a.seriesId || series.some((x) => x.id === a.id)).slice(0, 12).map((a) => <ActivityCard key={a.id} a={a} compact />)}
        </section>

        {admin && requests.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="label">Beitrittsanfragen ({requests.length})</h2>
            {requests.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5">
                <Avatar user={state.users[m.userId] ?? { id: m.userId, name: m.name, photo: m.photo, hue: 200 } as never} size={36} />
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{m.name}</span>
                <IconButton label={`${m.name} ablehnen`} onClick={() => api.manageMember(g.id, m.userId, "decline")}><X size={18} /></IconButton>
                <Button size="sm" onClick={() => api.manageMember(g.id, m.userId, "approve")}><Check size={15} /> Aufnehmen</Button>
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="label">Mitglieder ({g.memberCount})</h2>
          {!member ? (
            <p className="text-[13.5px] text-muted">Die Mitgliederliste sehen nur Mitglieder.</p>
          ) : (
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-3">
              {active.map((m) => (
                <div key={m.userId} className="flex items-center gap-3 py-2.5">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => m.userId !== state.meId && nav.push({ name: "user", id: m.userId })}>
                    <Avatar user={state.users[m.userId] ?? { id: m.userId, name: m.name, photo: m.photo, hue: 200 } as never} size={34} />
                    <span className="min-w-0 truncate text-[14.5px] font-semibold">{m.userId === state.meId ? "Du" : m.name}</span>
                    {m.role !== "member" && <span className={cx("shrink-0 rounded-full px-2 py-px text-[11px] font-bold", m.role === "owner" ? "bg-ink text-bg" : "bg-accent/12 text-accent")}>{m.role === "owner" ? "Gründer" : "Admin"}</span>}
                  </button>
                  {admin && m.userId !== state.meId && m.role !== "owner" && (owner || m.role === "member") && (
                    <IconButton label={`Optionen für ${m.name}`} onClick={() => setMemberSheet(m)}><MoreHorizontal size={18} /></IconButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {member && !owner && <button onClick={() => setLeaveOpen(true)} className="inline-flex items-center gap-1.5 self-start text-[13.5px] font-semibold text-bad"><LogOut size={15} /> Gruppe verlassen</button>}
        {pending && <button onClick={() => api.leaveGroup(g.id)} className="self-start text-[13.5px] font-semibold text-muted">Anfrage zurückziehen</button>}
      </div>

      {!member && !pending && (
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
          <Button block size="lg" onClick={() => api.joinGroup(g.id)}>{g.joinMode === "open" ? "Beitreten" : "Beitritt anfragen"}</Button>
        </div>
      )}

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Zur Gruppe einladen">
        <p className="text-[14px] text-muted">Wer den Link öffnet, landet direkt bei {g.name}{g.joinMode === "request" ? " und kann den Beitritt anfragen" : " und kann beitreten"}.</p>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2.5"><span className="min-w-0 flex-1 truncate text-[13px]">{shareUrl}</span>
          <Button size="sm" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignorieren */ } }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Kopiert" : "Kopieren"}</Button>
        </div>
        <a className="mt-3 inline-flex text-[14px] font-semibold text-accent" href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`} target="_blank" rel="noreferrer">Per WhatsApp teilen</a>
      </Sheet>

      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Gruppe verlassen?"
        footer={<div className="flex gap-2"><Button variant="secondary" block onClick={() => setLeaveOpen(false)}>Bleiben</Button><Button variant="danger" block onClick={() => { void api.leaveGroup(g.id); setLeaveOpen(false); }}>Verlassen</Button></div>}>
        <p className="text-[15px] leading-relaxed">Du siehst dann keine Termine mehr, die nur für Mitglieder sind. Deine Anmeldungen zu Terminen bleiben bestehen.</p>
      </Sheet>

      <Sheet open={!!memberSheet} onClose={() => setMemberSheet(null)} title={memberSheet?.name ?? ""}>
        {memberSheet && (
          <div className="flex flex-col gap-2">
            {owner && memberSheet.role === "member" && <Button variant="secondary" block onClick={() => { void api.manageMember(g.id, memberSheet.userId, "make_admin"); setMemberSheet(null); }}><ShieldCheck size={16} /> Zum Admin machen</Button>}
            {owner && memberSheet.role === "admin" && <Button variant="secondary" block onClick={() => { void api.manageMember(g.id, memberSheet.userId, "make_member"); setMemberSheet(null); }}>Admin-Rechte entfernen</Button>}
            <Button variant="danger" block onClick={() => { void api.manageMember(g.id, memberSheet.userId, "remove"); setMemberSheet(null); }}>Aus der Gruppe entfernen</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
