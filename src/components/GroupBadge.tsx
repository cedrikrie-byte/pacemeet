import { Building2, Users } from "lucide-react";
import type { Group } from "../types";

/** Rundes Gruppenzeichen mit Anfangsbuchstaben und Farbe der Gruppe. */
export function GroupBadge({ group, size = 44 }: { group: Pick<Group, "name" | "hue" | "kind">; size?: number }) {
  const initials = group.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="relative grid shrink-0 place-items-center rounded-2xl font-display font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${group.hue} 70% 52%), hsl(${(group.hue + 30) % 360} 65% 40%))` }} aria-hidden>
      {initials}
      <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-surface bg-ink text-bg">
        {group.kind === "verein" ? <Building2 size={10} /> : <Users size={10} />}
      </span>
    </span>
  );
}
