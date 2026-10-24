import { TriangleAlert } from "lucide-react";
import { useNav, type LegalDoc } from "../nav";
import { TopBar } from "../components/ui";
import { datenschutz, impressum, nutzung } from "../content/legal";
import { OPERATOR, operatorComplete } from "../config/app";

export function LegalScreen({ doc }: { doc: LegalDoc }) {
  const nav = useNav();
  const t = doc === "impressum" ? impressum() : doc === "datenschutz" ? datenschutz() : nutzung();
  return (
    <div className="screen-in pb-10">
      <TopBar onBack={nav.back} title={t.title} />
      <article className="flex flex-col gap-5 px-4 pt-5">
        {(!operatorComplete() || !OPERATOR.legalReviewed) && (
          <p className="flex gap-2 rounded-xl bg-warn/12 p-3 text-[13px] text-warn"><TriangleAlert size={16} className="mt-0.5 shrink-0" />
            Entwurf: {operatorComplete() ? "noch nicht rechtlich geprüft." : "Betreiberangaben fehlen (src/config/app.ts) und der Text ist noch nicht rechtlich geprüft."}</p>
        )}
        <h1 className="font-display text-[24px] font-black">{t.title}</h1>
        {t.sections.map((s) => (
          <section key={s.h} className="flex flex-col gap-1.5">
            <h2 className="text-[15px] font-bold">{s.h}</h2>
            {s.p.map((x, i) => <p key={i} className="max-w-[65ch] text-[14px] leading-relaxed text-ink/90">{x}</p>)}
          </section>
        ))}
        <p className="text-[12px] text-muted">Stand: {t.updated}</p>
      </article>
    </div>
  );
}
