import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Mail, ShieldCheck, Users, Route as RouteIcon } from "lucide-react";
import { LIVE } from "../config/backend";
import { useNav } from "../nav";
import { useApp } from "../store/AppStore";
import type { SportId } from "../types";
import { Button, DemoTag, Field, SportIcon, inputCls, cx } from "../components/ui";
import { Logo } from "./Discover";
import { APP } from "../config/app";
import { CityPicker, type CityValue } from "../components/CityPicker";
import { SPORT_LIST } from "../data/sports";
import { clockToSec, secToClock } from "../lib/format";

export function Onboarding() {
  const { api, me: meMaybe, state } = useApp();
  const nav = useNav();
  const me = meMaybe ?? { pace: 390, speed: 24 };
  const needsProfile = LIVE && state.auth === "needsProfile";
  const [step, setStep] = useState(needsProfile ? 1 : 0);
  const [email, setEmail] = useState(state.email ?? "");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"start" | "email" | "code">("start");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  // Nach erfolgreicher Code-Anmeldung ohne Profil direkt zur Profilerstellung
  useEffect(() => { if (needsProfile) { setStep((x) => x || 1); setErr(""); } }, [needsProfile]);
  const [name, setName] = useState("");
  const [city, setCity] = useState<CityValue | null>(null);
  const [sports, setSports] = useState<SportId[]>(["run"]);
  const [pace, setPace] = useState(secToClock(me.pace));
  const [speed, setSpeed] = useState(String(me.speed));
  const [bio, setBio] = useState("");
  const [err, setErr] = useState("");

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    setBusy(true); setErr("");
    try { await api.sendCode(email.trim()); setPhase("code"); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }
  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6,8}$/.test(code)) { setErr("Bitte gib den Code aus der E-Mail ein."); return; }
    setBusy(true); setErr("");
    try { await api.verifyCode(email.trim(), code); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  if (LIVE && !needsProfile && phase !== "start") {
    return (
      <div className="screen-in flex min-h-full flex-col px-5 pb-8 pt-8">
        <button onClick={() => { setPhase(phase === "code" ? "email" : "start"); setErr(""); }} className="self-start text-[14px] font-semibold text-muted">← Zurück</button>
        <span className="mt-6 grid h-12 w-12 place-items-center rounded-2xl bg-accent/12 text-accent"><Mail size={22} /></span>
        {phase === "email" ? (
          <form onSubmit={requestCode} noValidate className="mt-4 flex flex-1 flex-col gap-5">
            <h1 className="font-display text-[28px] font-black leading-tight">Deine E-Mail-Adresse</h1>
            <p className="-mt-3 text-[14.5px] text-muted">Wir schicken dir eine E-Mail mit einem Code oder Anmeldelink. Ein Passwort brauchst du nicht.</p>
            <Field label="E-Mail" htmlFor="email" error={err}><input id="email" type="email" inputMode="email" autoComplete="email" autoFocus className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@beispiel.de" /></Field>
            <div className="mt-auto"><Button type="submit" size="lg" block disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : null} Code senden</Button></div>
          </form>
        ) : (
          <form onSubmit={checkCode} noValidate className="mt-4 flex flex-1 flex-col gap-5">
            <h1 className="font-display text-[28px] font-black leading-tight">E-Mail prüfen</h1>
            <p className="-mt-3 text-[14.5px] text-muted">Wir haben eine E-Mail an <b className="text-ink">{email}</b> geschickt. Tippe auf den Link darin oder gib den Code ein. Schau auch im Spam-Ordner nach.</p>
            <Field label="Code aus der E-Mail" htmlFor="otp" error={err}>
              <input id="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8} className={cx(inputCls, "text-center font-cond text-[26px] tracking-[0.3em] tnum")} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} />
            </Field>
            <button type="button" onClick={() => requestCode()} disabled={busy} className="self-start text-[13.5px] font-semibold text-accent">Neuen Code senden</button>
            <div className="mt-auto"><Button type="submit" size="lg" block disabled={busy}>{busy ? <Loader2 size={18} className="animate-spin" /> : null} Anmelden</Button></div>
          </form>
        )}
      </div>
    );
  }

  if (step === 0) {
    return (
      <div className="screen-in flex min-h-full flex-col justify-between gap-8 px-5 pb-8 pt-10">
        <div>
          <div className="flex items-center gap-2"><Logo size={36} /><span className="font-display text-[24px] font-black">{APP.name}</span></div>
          <h1 className="mt-10 font-display text-[40px] font-black leading-[0.98]">Gemeinsam<br />statt allein.</h1>
          <p className="mt-4 max-w-[32ch] text-[16px] leading-relaxed text-muted">Finde Leute in deiner Nähe, die heute laufen oder Rad fahren wollen. In deinem Tempo.</p>
          <ul className="mt-8 flex flex-col gap-4 text-[15px]">
            <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-run/10 text-run"><Users size={18} /></span><span><b>Mit einem Tipp dabei.</b> Aktivität finden, anmelden, losgehen.</span></li>
            <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ride/10 text-ride"><RouteIcon size={18} /></span><span><b>Route planen oder spontan.</b> Du entscheidest, wie viel du vorab festlegst.</span></li>
            <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-good/12 text-good"><ShieldCheck size={18} /></span><span><b>Sicher und privat.</b> Öffentliche Treffpunkte, nur deine Stadt ist sichtbar.</span></li>
          </ul>
        </div>
        {LIVE ? (
          <div className="flex flex-col gap-2">
            <Button size="lg" block onClick={() => setPhase("email")}>Anmelden oder registrieren <ArrowRight size={18} /></Button>
            <p className="mt-1 text-center text-[12px] text-muted">Mit E-Mail und Einmalcode, ohne Passwort.</p>
            <LegalLinks />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button size="lg" block onClick={() => setStep(1)}>Profil erstellen <ArrowRight size={18} /></Button>
            <Button size="lg" block variant="ghost" onClick={() => api.onboard({})}>Mit Demo-Profil ausprobieren</Button>
            <p className="mt-1 flex items-center justify-center gap-2 text-[12px] text-muted"><DemoTag>Prototyp</DemoTag> Kein Konto nötig, Daten bleiben in diesem Browser.</p>
          </div>
        )}
      </div>
    );
  }

  function finish() {
    if (LIVE && !consent) { setErr("Bitte stimme den Nutzungsbedingungen zu und bestätige, dass du mindestens 16 bist."); return; }
    const p = clockToSec(pace);
    if (name.trim().length < 2) { setStep(1); setErr("Bitte gib deinen Namen an."); return; }
    if (sports.includes("run") && (!p || p < 150 || p > 900)) { setErr("Pace im Format m:ss, z. B. 6:30."); return; }
    if (!city) { setStep(1); setErr("Bitte wähle deine Stadt."); return; }
    api.onboard({ name: name.trim(), city: city.id, cityPos: city.pos, sports, pace: p ?? me.pace, speed: parseFloat(speed) || me.speed, bio: bio.trim() });
  }

  return (
    <div className="screen-in flex min-h-full flex-col px-5 pb-8 pt-6">
      <div className="flex gap-1.5">{[1, 2].map((s) => <span key={s} className={cx("h-1 flex-1 rounded-full", step >= s ? "bg-accent" : "bg-line")} />)}</div>
      <p className="label mt-6">Schritt {step} von 2</p>
      {step === 1 ? (
        <div className="mt-2 flex flex-1 flex-col gap-5">
          <h1 className="font-display text-[28px] font-black leading-tight">Wie heißt du?</h1>
          <Field label="Anzeigename" htmlFor="o-name" hint="Vorname und Initial reichen, z. B. „Alex R.“" error={err}>
            <input id="o-name" autoFocus className={inputCls} value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} maxLength={30} />
          </Field>
          <Field label="Wo bist du unterwegs?" htmlFor="o-city" hint="Start in Deutschland. Nur die Stadt ist für andere sichtbar.">
            {city
              ? <div className="flex items-center justify-between rounded-xl border border-ink px-4 py-3"><span className="font-semibold">{city.name}</span><button type="button" className="text-[13px] font-semibold text-accent" onClick={() => setCity(null)}>Ändern</button></div>
              : <CityPicker id="o-city" value={city} onPick={(c) => { setCity(c); setErr(""); }} />}
          </Field>
          <div className="mt-auto"><Button size="lg" block onClick={() => { if (name.trim().length < 2) setErr("Bitte gib deinen Namen an."); else if (!city) setErr("Bitte wähle deine Stadt."); else { setErr(""); setStep(2); } }}>Weiter</Button></div>
        </div>
      ) : (
        <div className="mt-2 flex flex-1 flex-col gap-5">
          <h1 className="font-display text-[28px] font-black leading-tight">Was machst du gern?</h1>
          <div className="flex gap-2">
            {SPORT_LIST.map((s) => (
              <button key={s.id} type="button" aria-pressed={sports.includes(s.id)} onClick={() => setSports((x) => x.includes(s.id) ? (x.length > 1 ? x.filter((y) => y !== s.id) : x) : [...x, s.id])}
                className={cx("flex h-24 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border text-[15px] font-bold transition", sports.includes(s.id) ? "border-ink bg-ink text-bg" : "border-line bg-surface")}>
                <SportIcon sport={s.id} size={26} /> {s.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {sports.includes("run") && <Field label="Deine übliche Pace" htmlFor="o-pace" hint="min/km, grob reicht"><input id="o-pace" className={cx(inputCls, "tnum")} value={pace} onChange={(e) => setPace(e.target.value)} /></Field>}
            {sports.includes("ride") && <Field label="Dein Rad-Tempo" htmlFor="o-speed" hint="km/h im Schnitt"><input id="o-speed" inputMode="decimal" className={cx(inputCls, "tnum")} value={speed} onChange={(e) => setSpeed(e.target.value)} /></Field>}
          </div>
          <Field label="Kurz über dich (optional)" htmlFor="o-bio"><textarea id="o-bio" rows={3} maxLength={200} className={cx(inputCls, "h-auto py-3")} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="z. B. Laufe nach Feierabend, suche Leute für den Wiedereinstieg." /></Field>
          {LIVE && (
            <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-[13.5px] leading-snug">
              <input id="consent" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--accent))]" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErr(""); }} />
              <span>Ich bin mindestens 16 Jahre alt und stimme den <button type="button" className="font-semibold text-accent" onClick={() => nav.push({ name: "legal", doc: "nutzung" })}>Nutzungsbedingungen</button> zu. Die <button type="button" className="font-semibold text-accent" onClick={() => nav.push({ name: "legal", doc: "datenschutz" })}>Datenschutzerklärung</button> habe ich gelesen.</span>
            </label>
          )}
          {err && <p className="text-[13px] font-medium text-bad">{err}</p>}
          <div className="mt-auto flex gap-2"><Button size="lg" variant="secondary" onClick={() => setStep(1)}>Zurück</Button><Button size="lg" block onClick={finish}>Los geht's</Button></div>
        </div>
      )}
    </div>
  );
}

function LegalLinks() {
  const nav = useNav();
  return (
    <p className="mt-2 flex justify-center gap-4 text-[12px] text-muted">
      <button onClick={() => nav.push({ name: "legal", doc: "impressum" })}>Impressum</button>
      <button onClick={() => nav.push({ name: "legal", doc: "datenschutz" })}>Datenschutz</button>
      <button onClick={() => nav.push({ name: "legal", doc: "nutzung" })}>Nutzungsbedingungen</button>
    </p>
  );
}
