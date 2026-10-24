/**
 * Zentrale Produktkonfiguration.
 * Der Name ist ein Arbeitstitel – hier an einer Stelle austauschbar.
 */
export const APP = {
  name: "PaceMeet",
  nameIsWorkingTitle: true,
  motto: "Gemeinsam statt allein.",
  /** Startmarkt. Weitere Länder werden über COUNTRIES freigeschaltet. */
  launchMarket: "DE",
  defaultLocale: "de-DE",
} as const;

export type CountryStatus = "live" | "planned";
export interface Country { code: string; name: string; status: CountryStatus; units: "metric" | "imperial"; }

export const COUNTRIES: Country[] = [
  { code: "DE", name: "Deutschland", status: "live", units: "metric" },
  { code: "AT", name: "Österreich", status: "planned", units: "metric" },
  { code: "CH", name: "Schweiz", status: "planned", units: "metric" },
  { code: "NL", name: "Niederlande", status: "planned", units: "metric" },
  { code: "GB", name: "Vereinigtes Königreich", status: "planned", units: "imperial" },
  { code: "US", name: "USA", status: "planned", units: "imperial" },
];

export interface City { id: string; name: string; country: string; lat: number; lng: number; }

/** Städte mit Demodaten im Startmarkt. Koordinaten = Stadtzentrum. */
export const CITIES: City[] = [
  { id: "essen", name: "Essen", country: "DE", lat: 51.4556, lng: 7.0116 },
  { id: "bochum", name: "Bochum", country: "DE", lat: 51.4818, lng: 7.2162 },
  { id: "hattingen", name: "Hattingen", country: "DE", lat: 51.3995, lng: 7.1858 },
];

export const LANGUAGES = [
  { code: "de-DE", name: "Deutsch", ready: true },
  { code: "en-GB", name: "English", ready: false },
  { code: "nl-NL", name: "Nederlands", ready: false },
];

/**
 * Angaben zum Betreiber für Impressum und Datenschutz.
 * VOR DEM START AUSFÜLLEN. Solange Felder leer sind, zeigt die App einen Warnhinweis.
 */
export const OPERATOR = {
  name: "",            // z. B. "Max Mustermann" oder Firmenname mit Rechtsform
  street: "",          // Straße und Hausnummer (ladungsfähige Anschrift, kein Postfach)
  city: "",            // PLZ und Ort
  email: "",           // Kontakt-E-Mail
  phone: "",           // optional, aber empfohlen
  vatId: "",           // USt-IdNr., falls vorhanden
  responsible: "",     // Verantwortlich für Inhalte (falls abweichend)
  privacyEmail: "",    // E-Mail für Datenschutzanfragen
  legalReviewed: false // auf true setzen, wenn die Texte rechtlich geprüft wurden
};
export const operatorComplete = () => !!(OPERATOR.name && OPERATOR.street && OPERATOR.city && OPERATOR.email);
