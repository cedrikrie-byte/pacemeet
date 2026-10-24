/** Öffentliche Treffpunkte (Vorschläge beim Erstellen). Keine Wohnadressen. */
export interface Place { name: string; city: string; lat: number; lng: number; }
export const PLACES: Place[] = [
  { name: "Baldeneysee, Regattatribüne", city: "essen", lat: 51.4065, lng: 7.0257 },
  { name: "Grugapark, Haupteingang Messe", city: "essen", lat: 51.4293, lng: 7.0034 },
  { name: "Zeche Zollverein, Vorplatz Schacht XII", city: "essen", lat: 51.4862, lng: 7.045 },
  { name: "Rüttenscheider Stern", city: "essen", lat: 51.4375, lng: 7.0055 },
  { name: "Haus Scheppen, Baldeneysee Süd", city: "essen", lat: 51.3985, lng: 7.056 },
  { name: "Stadtpark Bochum, Bismarckturm", city: "bochum", lat: 51.4905, lng: 7.219 },
  { name: "Kemnader See, Parkplatz Haus Kemnade", city: "bochum", lat: 51.4196, lng: 7.26 },
  { name: "Bochum Hbf, Vorplatz Ost", city: "bochum", lat: 51.4786, lng: 7.2236 },
  { name: "Ruhr-Universität, Forumsplatz", city: "bochum", lat: 51.444, lng: 7.2622 },
  { name: "Henrichshütte, Museumseingang", city: "hattingen", lat: 51.404, lng: 7.1755 },
  { name: "Altstadt Hattingen, Untermarkt", city: "hattingen", lat: 51.3999, lng: 7.186 },
  { name: "Ruhrbrücke Hattingen (Ruhrtalradweg)", city: "hattingen", lat: 51.405, lng: 7.188 },
];
export const placeByName = (n: string) => PLACES.find((p) => p.name === n);
