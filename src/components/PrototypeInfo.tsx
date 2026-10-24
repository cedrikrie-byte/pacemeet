import { CheckCircle2, CircleDashed, FlaskConical } from "lucide-react";
import { APP } from "../config/app";

const DONE = [
  "Aktivitäten entdecken, suchen, filtern (Sportart, Umkreis, Datum, Tageszeit, Distanz, Tempo, freie Plätze)",
  "Aktivität erstellen und bearbeiten, mit Validierung und Warnung bei Wohnadressen",
  "Echte Karte (MapLibre, OpenStreetMap) in Entdecken, Details und beim Erstellen",
  "Route planen per Tippen, auf Wunsch entlang von Wegen, oder GPX-Import; alternativ „spontan“",
  "Treffpunkt-Suche (nur Deutschland), Adressen lösen die Sicherheitswarnung aus",
  "Teilnehmen, absagen, Teilnehmerliste, Gastgeber sagt für alle ab",
  "Teilnahmebestätigung nach dem Training (selbst + Gastgeber)",
  "Profil mit Foto, Beschreibung, optionalem Alter, Bestzeiten",
  "Community-Liga mit Opt-in, abgeleiteten Punkten, Abzeichen, Ranglisten, Sichtbarkeit",
  "Event-Medaillen fürs Mitmachen",
  "Melden, Blockieren, Datenschutz- und Benachrichtigungseinstellungen",
  "Hell/Dunkel, km/Meilen, lokale Datumsformate",
];
const SIMULATED = [
  "In dieser Demo: Anmeldung ohne Konto (der Live-Modus mit E-Mail-Code und Datenbank ist eingebaut, siehe LAUNCH.md)",
  "Andere Nutzer, ihre Chat-Antworten und Beitritte zu deinen Aktivitäten",
  "Benachrichtigungen (nur in der App, keine Push-Nachrichten)",
  "Bestätigung durch Gastgeber bei fremden Aktivitäten",
  "Meldungen gehen an kein echtes Moderationsteam",
  "Ohne erreichbaren Kartendienst (z. B. in dieser Vorschau) erscheint eine Skizze statt der Karte",
  "Daten liegen nur in diesem Browser",
];
const LATER = [
  "Push-Nachrichten aufs Handy bei geschlossener App",
  "Eigener Kartenserver statt öffentlicher Gratisdienste",
  "Weitere Sprachen und Länder (Struktur vorbereitet)",
  "Premium-Komfortfunktionen, Veranstalter-Accounts, Ticketing",
];

export function PrototypeInfo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="label flex items-center gap-1.5"><FlaskConical size={13} /> Prototyp v0.1</p>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">„{APP.name}“ ist ein Arbeitstitel. Start in Deutschland, Datenmodell und Formate sind für weitere Länder vorbereitet.</p>
      </div>
      <List title="Funktioniert im Prototyp" items={compact ? DONE.slice(0, 6) : DONE} icon={<CheckCircle2 size={15} className="text-good" />} />
      <List title="Simuliert" items={SIMULATED} icon={<span className="mt-[5px] block h-2 w-2 rounded-full bg-warn" />} />
      <List title="Noch nicht umgesetzt" items={LATER} icon={<CircleDashed size={15} className="text-muted" />} />
      {!compact && (
        <>
          <div>
            <h3 className="label">Live-Modus (eingebaut)</h3>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13.5px] leading-snug">
              <li><b>Supabase</b> in Frankfurt: Anmeldung per E-Mail-Code, Datenbank mit Zugriffsregeln, Fotos.</li>
              <li><b>Chat und Benachrichtigungen</b> in Echtzeit.</li>
              <li><b>Liga-Punkte</b> werden auf dem Server berechnet, nie von der App gesendet.</li>
              <li><b>Konto löschen und Datenexport</b> nach DSGVO.</li>
              <li>Aktivieren: Supabase-Zugangsdaten in <code>.env</code> eintragen, siehe LAUNCH.md.</li>
            </ul>
          </div>
          <div>
            <h3 className="label">Geschäftsmodell später</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed">Basis bleibt kostenlos. Später: Premium-Komfort (z. B. Wiederholungstermine, erweiterte Filter), Veranstalter-Accounts für Vereine und Lauftreffs, Ticketgebühr für kommerzielle Events. Im Prototyp gibt es keine Bezahlschranken.</p>
          </div>
        </>
      )}
    </div>
  );
}

function List({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div>
      <h3 className="label">{title}</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((t) => <li key={t} className="flex gap-2 text-[13.5px] leading-snug"><span className="mt-0.5 shrink-0">{icon}</span><span>{t}</span></li>)}
      </ul>
    </div>
  );
}
