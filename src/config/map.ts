/**
 * Kartendienste. Alle drei sind kostenlos, ohne API-Schlüssel und basieren auf OpenStreetMap.
 * Für den Produktivbetrieb: eigene Instanzen oder einen EU-Anbieter mit Vertrag nutzen
 * (die öffentlichen Server haben Nutzungsgrenzen).
 */
export const MAP = {
  /** Vektor-Kartenstil von OpenFreeMap */
  styleUrl: "https://tiles.openfreemap.org/styles/positron",
  /** Ortssuche (Photon von Komoot) */
  geocodeUrl: "https://photon.komoot.io/api/",
  reverseUrl: "https://photon.komoot.io/reverse",
  /**
   * Rad- und lauffreundliches Routing mit Höhenmetern (BRouter).
   * Profile: Laufen = Wege und Pfade, Rennrad = verkehrsarme Straßen, Tour/Gravel = Radwege.
   */
  brouterUrl: "https://brouter.de/brouter",
  brouterProfiles: { run: "hiking-beta", road: "fastbike-lowtraffic", tour: "trekking" },
  /** Ersatz-Routing (OSRM-Server der FOSSGIS), falls BRouter nicht antwortet */
  routeUrl: (profile: "foot" | "bike") => `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/`,
  /** Nur Treffer in diesen Ländern anzeigen (Startmarkt) */
  countries: ["DE"],
};
