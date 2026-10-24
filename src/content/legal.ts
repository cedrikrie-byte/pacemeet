import { APP, OPERATOR } from "../config/app";

/**
 * ENTWÜRFE für Impressum, Datenschutzerklärung und Nutzungsbedingungen.
 * Sie sind ein Ausgangspunkt, keine Rechtsberatung. Vor dem Start von einer
 * Fachperson prüfen lassen oder mit einem Generator (z. B. eRecht24) abgleichen.
 */

const v = (x: string, ph: string) => x || `[${ph}]`;

export interface LegalSection { h: string; p: string[] }
export interface LegalText { title: string; updated: string; sections: LegalSection[] }

export function impressum(): LegalText {
  return {
    title: "Impressum", updated: "Oktober 2026",
    sections: [
      { h: "Angaben gemäß § 5 DDG", p: [v(OPERATOR.name, "Name bzw. Firma mit Rechtsform"), v(OPERATOR.street, "Straße und Hausnummer"), v(OPERATOR.city, "PLZ und Ort"), "Deutschland"] },
      { h: "Kontakt", p: [`E-Mail: ${v(OPERATOR.email, "E-Mail-Adresse")}`, ...(OPERATOR.phone ? [`Telefon: ${OPERATOR.phone}`] : [])] },
      ...(OPERATOR.vatId ? [{ h: "Umsatzsteuer-ID", p: [`Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${OPERATOR.vatId}`] }] : []),
      { h: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV", p: [v(OPERATOR.responsible || OPERATOR.name, "Name"), v(OPERATOR.street, "Anschrift"), v(OPERATOR.city, "PLZ und Ort")] },
      { h: "Inhalte von Nutzerinnen und Nutzern", p: [`Aktivitäten, Profile und Chat-Nachrichten in ${APP.name} werden von den Nutzenden selbst erstellt. Wir prüfen gemeldete Inhalte und entfernen rechtswidrige Inhalte, sobald wir davon Kenntnis erhalten. Meldungen sind in der App über „Melden“ oder per E-Mail möglich.`] },
      { h: "Streitbeilegung", p: ["Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen."] },
    ],
  };
}

export function datenschutz(): LegalText {
  const contact = v(OPERATOR.privacyEmail || OPERATOR.email, "E-Mail für Datenschutzanfragen");
  return {
    title: "Datenschutzerklärung", updated: "Oktober 2026",
    sections: [
      { h: "1. Verantwortlicher", p: [`${v(OPERATOR.name, "Name")}, ${v(OPERATOR.street, "Straße")}, ${v(OPERATOR.city, "PLZ Ort")}. Kontakt für Datenschutzfragen: ${contact}.`] },
      { h: "2. Welche Daten wir verarbeiten und warum", p: [
        "Konto: E-Mail-Adresse für die Anmeldung per Einmalcode (Art. 6 Abs. 1 lit. b DSGVO, Vertrag).",
        "Profil: Anzeigename, Stadt, Sportarten, übliches Tempo, Kurzbeschreibung und optional Foto, Alter und Bestzeiten. Alter und Bestzeiten sind freiwillig; das Alter ist standardmäßig nur für dich sichtbar (Art. 6 Abs. 1 lit. b DSGVO).",
        "Aktivitäten: Titel, Treffpunkt (öffentlicher Ort mit Koordinaten), Zeit, Distanz, Tempo, Route, Teilnahmen und Bestätigungen. Sie sind für angemeldete Nutzende in der Umgebung sichtbar (Art. 6 Abs. 1 lit. b DSGVO).",
        "Gruppenchat: Nachrichten innerhalb einer Aktivität, sichtbar nur für deren Teilnehmende.",
        "Standort: Wir speichern nur die von dir gewählte Stadt. Ein GPS-Standort wird nicht erfasst.",
        "Community-Liga: nur wenn du sie aktivierst (Art. 6 Abs. 1 lit. a DSGVO, Einwilligung). Du kannst sie jederzeit deaktivieren.",
        "Sicherheit: Blockierungen, Meldungen und kurzfristige Absagen, um Missbrauch zu verhindern und Zuverlässigkeit sachlich darzustellen (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an einer sicheren Plattform).",
      ] },
      { h: "3. Dienstleister (Auftragsverarbeitung)", p: [
        "Supabase Inc. (Datenbank, Anmeldung, Dateispeicher). Die Daten liegen in einem Rechenzentrum in Frankfurt am Main (EU). Mit Supabase besteht ein Vertrag zur Auftragsverarbeitung; für mögliche Zugriffe aus den USA gelten EU-Standardvertragsklauseln.",
        `[Hosting-Anbieter der Web-App, z. B. Vercel Inc. oder Netlify Inc.]: Auslieferung der App. Dabei werden IP-Adresse und technische Zugriffsdaten verarbeitet.`,
        "[E-Mail-Versanddienst für die Anmeldecodes, z. B. Brevo (Sendinblue GmbH, Berlin)].",
      ] },
      { h: "4. Karten- und Routendienste", p: [
        "Für Karten, Ortssuche und Routenplanung ruft die App Dienste auf Basis von OpenStreetMap auf: OpenFreeMap (Kartenkacheln), Photon von Komoot (Ortssuche), BRouter (brouter.de) und den OSRM-Server der FOSSGIS e.V. (Routenberechnung). Dabei wird deine IP-Adresse an diese Anbieter übertragen, und es werden die gesuchten Begriffe bzw. Koordinaten übermittelt (Art. 6 Abs. 1 lit. f DSGVO).",
        "Kartendaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License.",
      ] },
      { h: "5. Speicherdauer", p: [
        "Deine Daten speichern wir, solange dein Konto besteht. Wenn du dein Konto löschst, werden Profil, Teilnahmen, Nachrichten und Benachrichtigungen sofort gelöscht. Deine kommenden Aktivitäten werden vorher automatisch abgesagt.",
        "Meldungen können zur Missbrauchsabwehr bis zu 12 Monate aufbewahrt werden.",
      ] },
      { h: "6. Deine Rechte", p: [
        "Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht, Einwilligungen jederzeit zu widerrufen.",
        "In der App kannst du unter Einstellungen → Konto deine Daten herunterladen und dein Konto löschen.",
        "Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der für deinen Wohnort zuständigen Landesbehörde.",
      ] },
      { h: "7. Keine Werbung, kein Tracking", p: ["Wir verwenden keine Werbe- oder Analyse-Cookies und verkaufen keine Daten. Im Browser werden nur technisch notwendige Daten gespeichert (Anmeldung, Einstellungen)."] },
    ],
  };
}

export function nutzung(): LegalText {
  return {
    title: "Nutzungsbedingungen", updated: "Oktober 2026",
    sections: [
      { h: "1. Worum es geht", p: [`${APP.name} hilft dabei, gemeinsame Sportaktivitäten zu organisieren. Wir vermitteln nur den Kontakt; die Aktivitäten selbst organisieren die Nutzenden eigenverantwortlich.`] },
      { h: "2. Mindestalter", p: ["Die Nutzung ist ab 16 Jahren erlaubt."] },
      { h: "3. Teilnahme auf eigene Verantwortung", p: [
        "Sport ist mit Risiken verbunden. Du nimmst auf eigene Verantwortung teil und schätzt selbst ein, ob Distanz und Tempo zu dir passen. Achte auf Verkehrsregeln und geeignete Ausrüstung (beim Radfahren z. B. Helm).",
        "Vorgeschlagene Routen werden automatisch berechnet. Prüfe sie vor Ort; Wege können gesperrt, unbefestigt oder ungeeignet sein.",
      ] },
      { h: "4. Verhalten", p: [
        "Sei respektvoll. Belästigung, Diskriminierung, Spam, kommerzielle Werbung ohne Erlaubnis und Kontaktversuche außerhalb des Sports sind nicht erlaubt. PaceMeet ist keine Dating-Plattform.",
        "Treffpunkte müssen öffentliche Orte sein. Gib keine privaten Adressen an.",
        "Sage rechtzeitig ab, wenn du nicht teilnehmen kannst.",
      ] },
      { h: "5. Moderation", p: ["Wir können Inhalte entfernen und Konten sperren, wenn gegen diese Regeln verstoßen wird. Gemeldete Inhalte prüfen wir zeitnah."] },
      { h: "6. Haftung", p: ["Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit, die auf unserem Verschulden beruht. Im Übrigen haften wir nur für die Verletzung wesentlicher Pflichten und begrenzt auf den vorhersehbaren Schaden. Für das Verhalten anderer Nutzender bei Aktivitäten haften wir nicht."] },
      { h: "7. Kosten", p: ["Die Basisnutzung ist kostenlos. Sollten später kostenpflichtige Funktionen hinzukommen, informieren wir vorher und nur mit deiner ausdrücklichen Zustimmung entstehen Kosten."] },
      { h: "8. Änderungen und Kündigung", p: ["Du kannst dein Konto jederzeit in den Einstellungen löschen. Über Änderungen dieser Bedingungen informieren wir rechtzeitig in der App."] },
    ],
  };
}
