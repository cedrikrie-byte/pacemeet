export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function routeLengthKm(pts: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineKm(pts[i - 1], pts[i]);
  return d;
}
/** Liest Track- oder Routenpunkte aus einer GPX-Datei. */
export function parseGpx(xml: string): [number, number][] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const nodes = Array.from(doc.querySelectorAll("trkpt, rtept"));
  const pts = nodes
    .map((n) => [parseFloat(n.getAttribute("lat") || ""), parseFloat(n.getAttribute("lon") || "")] as [number, number])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  // ausdünnen, damit die Darstellung leicht bleibt
  const step = Math.max(1, Math.floor(pts.length / 300));
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
}
