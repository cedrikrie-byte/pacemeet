import { useMemo, useRef } from "react";
import { PLACES } from "../data/places";
import { routeLengthKm } from "../lib/geo";

type P = [number, number];

/** Schematischer Verlauf der Ruhr als Orientierung (vereinfacht). */
const RUHR: P[] = [[51.43, 6.86], [51.405, 6.9], [51.372, 6.94], [51.388, 6.975], [51.404, 6.995], [51.408, 7.02], [51.403, 7.045], [51.398, 7.06], [51.388, 7.085], [51.392, 7.12], [51.401, 7.155], [51.405, 7.185], [51.41, 7.22], [51.42, 7.255], [51.424, 7.29], [51.432, 7.33]];

export interface View { minLat: number; maxLat: number; minLng: number; maxLng: number; }
const W = 360, H = 230;

export function fitView(points: P[], center: P, spanKm: number): View {
  const pts = points.length ? [...points, center] : [center];
  let minLat = Math.min(...pts.map((p) => p[0])), maxLat = Math.max(...pts.map((p) => p[0]));
  let minLng = Math.min(...pts.map((p) => p[1])), maxLng = Math.max(...pts.map((p) => p[1]));
  const kmLng = 111 * Math.cos((center[0] * Math.PI) / 180);
  // Mindestgröße
  const half = spanKm / 2;
  const cLat = (minLat + maxLat) / 2, cLng = (minLng + maxLng) / 2;
  let hKm = Math.max((maxLat - minLat) * 111 * 1.25, half * 2 * (H / W));
  let wKm = Math.max((maxLng - minLng) * kmLng * 1.25, half * 2);
  // Seitenverhältnis halten
  if (wKm / hKm > W / H) hKm = wKm * (H / W); else wKm = hKm * (W / H);
  minLat = cLat - hKm / 2 / 111; maxLat = cLat + hKm / 2 / 111;
  minLng = cLng - wKm / 2 / kmLng; maxLng = cLng + wKm / 2 / kmLng;
  return { minLat, maxLat, minLng, maxLng };
}

export interface MapMarker { id: string; lat: number; lng: number; sport: "run" | "ride"; label?: string; }
export interface MapPoi { lat: number; lng: number; label: string; }

export function RouteMap({ points, center, centerLabel, editable, onAdd, view: fixedView, spanKm = 4, accent = "run", height, markers, selectedId, onMarker, pois, hint }: {
  points: P[]; center: P; centerLabel?: string; editable?: boolean; onAdd?: (p: P) => void; view?: View; spanKm?: number; accent?: "run" | "ride"; height?: number;
  markers?: MapMarker[]; selectedId?: string | null; onMarker?: (id: string) => void;
  pois?: MapPoi[]; hint?: string;
}) {
  const view = useMemo(() => fixedView ?? fitView(markers?.length ? markers.map((m) => [m.lat, m.lng] as P) : [...points, ...(pois ?? []).map((p) => [p.lat, p.lng] as P)], center, spanKm), [fixedView, points, center, spanKm, markers, pois]);
  const ref = useRef<SVGSVGElement>(null);
  const x = (lng: number) => ((lng - view.minLng) / (view.maxLng - view.minLng)) * W;
  const y = (lat: number) => ((view.maxLat - lat) / (view.maxLat - view.minLat)) * H;
  const path = (pts: P[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p[1]).toFixed(1)},${y(p[0]).toFixed(1)}`).join(" ");

  const kmLng = 111 * Math.cos((center[0] * Math.PI) / 180);
  const widthKm = (view.maxLng - view.minLng) * kmLng;
  const scaleKm = [0.5, 1, 2, 5, 10, 20].find((s) => s / widthKm > 0.18) ?? 20;
  const scalePx = (scaleKm / widthKm) * W;
  const gridKm = scaleKm;
  const gridLines: number[] = [];
  for (let k = gridKm; k < widthKm; k += gridKm) gridLines.push((k / widthKm) * W);
  const heightKm = (view.maxLat - view.minLat) * 111;
  const gridH: number[] = [];
  for (let k = gridKm; k < heightKm; k += gridKm) gridH.push((k / heightKm) * H);

  const landmarks = PLACES.filter((p) => p.lat > view.minLat && p.lat < view.maxLat && p.lng > view.minLng && p.lng < view.maxLng && !(Math.abs(p.lat - center[0]) < 1e-4 && Math.abs(p.lng - center[1]) < 1e-4));

  function toLatLng(e: React.MouseEvent<SVGSVGElement>): P | null {
    const r = ref.current?.getBoundingClientRect(); if (!r) return null;
    const sx = ((e.clientX - r.left) / r.width) * W, sy = ((e.clientY - r.top) / r.height) * H;
    return [view.maxLat - (sy / H) * (view.maxLat - view.minLat), view.minLng + (sx / W) * (view.maxLng - view.minLng)];
  }

  const col = accent === "run" ? "rgb(var(--run))" : "rgb(var(--ride))";
  const len = routeLengthKm(points);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-raised/60" style={height ? { height } : undefined}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className={editable ? "block w-full cursor-crosshair touch-manipulation" : "block w-full"}
        role="img"
        aria-label={points.length ? `Routenskizze, ${len.toFixed(1)} Kilometer` : "Lage des Treffpunkts"}
        onClick={(e) => { if (!editable || !onAdd) return; const p = toLatLng(e); if (p) onAdd(p); }}
      >
        <rect width={W} height={H} fill="rgb(var(--raised) / .55)" />
        {gridLines.map((gx) => <line key={"v" + gx} x1={gx} x2={gx} y1={0} y2={H} stroke="rgb(var(--line))" strokeWidth={0.6} />)}
        {gridH.map((gy) => <line key={"h" + gy} y1={gy} y2={gy} x1={0} x2={W} stroke="rgb(var(--line))" strokeWidth={0.6} />)}
        <path d={path(RUHR)} fill="none" stroke="rgb(var(--ride) / .28)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        {landmarks.map((p) => (
          <g key={p.name} opacity={0.75}>
            <circle cx={x(p.lng)} cy={y(p.lat)} r={2.6} fill="rgb(var(--muted))" />
            <text x={x(p.lng) + 5} y={y(p.lat) + 3} fontSize={8.5} fill="rgb(var(--muted))" style={{ fontFamily: "Figtree" }}>{p.name.split(",")[0]}</text>
          </g>
        ))}
        {points.length > 1 && (
          <>
            <path d={path(points)} fill="none" stroke="rgb(var(--surface))" strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d={path(points)} fill="none" stroke={col} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {editable && points.map((p, i) => <circle key={i} cx={x(p[1])} cy={y(p[0])} r={i === points.length - 1 ? 4.5 : 2.6} fill={col} stroke="rgb(var(--surface))" strokeWidth={1.5} />)}
        {markers?.map((m) => {
          const on = m.id === selectedId;
          const c = m.sport === "run" ? "rgb(var(--run))" : "rgb(var(--ride))";
          return (
            <g key={m.id} role="button" aria-label={m.label} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onMarker?.(m.id); }}>
              <circle cx={x(m.lng)} cy={y(m.lat)} r={14} fill="transparent" />
              <circle cx={x(m.lng)} cy={y(m.lat)} r={on ? 8 : 6} fill={c} stroke="rgb(var(--surface))" strokeWidth={2} />
            </g>
          );
        })}
        {pois?.map((p) => (
          <g key={p.label}>
            <rect x={x(p.lng) - 5} y={y(p.lat) - 5} width={10} height={10} rx={2} transform={`rotate(45 ${x(p.lng)} ${y(p.lat)})`} fill={col} stroke="rgb(var(--surface))" strokeWidth={1.5} />
            <text x={x(p.lng) + 9} y={y(p.lat) + 3.5} fontSize={9.5} fontWeight={700} fill="rgb(var(--ink))" style={{ fontFamily: "Figtree" }}>{p.label}</text>
          </g>
        ))}
        {!markers && <g>
          <circle cx={x(center[1])} cy={y(center[0])} r={9} fill={col} opacity={0.18} />
          <circle cx={x(center[1])} cy={y(center[0])} r={5.5} fill="rgb(var(--ink))" stroke="rgb(var(--surface))" strokeWidth={2} />
          {centerLabel && <text x={x(center[1]) + 9} y={y(center[0]) - 8} fontSize={9.5} fontWeight={700} fill="rgb(var(--ink))" style={{ fontFamily: "Figtree" }}>{centerLabel}</text>}
        </g>}
        {/* Maßstab */}
        <g transform={`translate(10 ${H - 14})`}>
          <rect x={-4} y={-11} width={scalePx + 40} height={18} rx={5} fill="rgb(var(--surface) / .85)" />
          <line x1={0} x2={scalePx} y1={0} y2={0} stroke="rgb(var(--ink))" strokeWidth={2} />
          <line x1={0} x2={0} y1={-3} y2={3} stroke="rgb(var(--ink))" strokeWidth={1.5} />
          <line x1={scalePx} x2={scalePx} y1={-3} y2={3} stroke="rgb(var(--ink))" strokeWidth={1.5} />
          <text x={scalePx + 5} y={3} fontSize={9} fontWeight={700} fill="rgb(var(--ink))" style={{ fontFamily: "Figtree" }}>{scaleKm < 1 ? `${scaleKm * 1000} m` : `${scaleKm} km`}</text>
        </g>
        <g transform={`translate(${W - 16} 18)`}>
          <path d="M0,-9 L5,5 L0,2 L-5,5 Z" fill="rgb(var(--ink))" />
          <text x={0} y={15} fontSize={8} textAnchor="middle" fontWeight={700} fill="rgb(var(--muted))">N</text>
        </g>
      </svg>
      {editable && (hint || points.length === 0) && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-md bg-surface/90 px-2 py-1 text-[11.5px] font-semibold">{hint ?? "Tippe, um Wegpunkte zu setzen"}</p>
      )}
    </div>
  );
}
