import { MAP } from "../config/map";

let probe: Promise<boolean> | null = null;

/** Prüft einmal pro Sitzung, ob der Kartendienst erreichbar ist. */
export function mapAvailable(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(MAP.styleUrl, { signal: ctrl.signal });
        clearTimeout(t);
        return r.ok;
      } catch {
        return false;
      }
    })();
  }
  return probe;
}

export interface GeoResult { id: string; name: string; detail: string; lat: number; lng: number; isAddress: boolean; }

/** Ortssuche, bevorzugt in der Nähe von near. */
export async function geocode(q: string, near: [number, number], signal?: AbortSignal): Promise<GeoResult[]> {
  const url = `${MAP.geocodeUrl}?q=${encodeURIComponent(q)}&lang=de&limit=8&lat=${near[0]}&lon=${near[1]}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("Suche nicht erreichbar");
  const j = await r.json() as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] };
  return j.features
    .filter((f) => !MAP.countries.length || MAP.countries.includes((f.properties.countrycode || "").toUpperCase()))
    .map((f, i) => {
      const p = f.properties;
      const street = p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : "";
      const name = p.name || street || p.city || "Ort";
      const detail = [p.name ? street : "", p.postcode, p.city || p.town || p.village].filter(Boolean).join(", ");
      // Nur reine Hausadressen gelten als mögliche Wohnadresse. Benannte Orte (Park, Platz, Laden)
      // haben in OpenStreetMap oft ebenfalls eine Hausnummer, sind aber öffentlich.
      const isAddress = p.type === "house" || (!p.name && !!p.housenumber);
      return { id: `${p.osm_id ?? i}-${i}`, name, detail, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], isAddress };
    })
    .slice(0, 6);
}

/** Weg entlang von Straßen und Wegen zwischen zwei Punkten. */
export async function routeBetween(a: [number, number], b: [number, number], sport: "run" | "ride"): Promise<[number, number][]> {
  const url = `${MAP.routeUrl(sport === "run" ? "foot" : "bike")}${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error("Routing nicht erreichbar");
    const j = await r.json() as { routes?: { geometry: { coordinates: [number, number][] } }[] };
    const c = j.routes?.[0]?.geometry.coordinates;
    if (!c || c.length < 2) throw new Error("Kein Weg gefunden");
    return c.map(([lng, lat]) => [lat, lng]);
  } finally {
    clearTimeout(t);
  }
}

/** Ortsname für einen Kartenpunkt, bewusst ohne Hausnummer (Privatsphäre). */
export async function reverseGeocode(p: [number, number]): Promise<{ label: string; nearAddress: boolean } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${MAP.reverseUrl}?lat=${p[0]}&lon=${p[1]}&lang=de&limit=1`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json() as { features: { properties: Record<string, string> }[] };
    const pr = j.features?.[0]?.properties;
    if (!pr) return null;
    const city = pr.city || pr.town || pr.village || pr.district || "";
    const isHouse = pr.type === "house" || (!pr.name && !!pr.housenumber);
    const base = !isHouse && pr.name ? pr.name : pr.street ? `Nähe ${pr.street}` : pr.name || "";
    if (!base) return null;
    return { label: city && !base.includes(city) ? `${base}, ${city}` : base, nearAddress: isHouse };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface CityResult { id: string; name: string; region: string; pos: [number, number]; }

/** Städte und Orte im Startmarkt suchen (z. B. „Münster“). */
export async function searchCities(q: string, signal?: AbortSignal): Promise<CityResult[]> {
  const r = await fetch(`${MAP.geocodeUrl}?q=${encodeURIComponent(q)}&lang=de&limit=10&layer=city`, { signal });
  if (!r.ok) throw new Error("Suche nicht erreichbar");
  const j = await r.json() as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] };
  const seen = new Set<string>();
  return j.features
    .filter((f) => !MAP.countries.length || MAP.countries.includes((f.properties.countrycode || "").toUpperCase()))
    .map((f) => ({ id: f.properties.name, name: f.properties.name, region: f.properties.state || f.properties.county || "", pos: [f.geometry.coordinates[1], f.geometry.coordinates[0]] as [number, number] }))
    .filter((c) => { const k = `${c.name}|${c.region}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
}
