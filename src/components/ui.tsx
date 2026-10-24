import { Bike, ChevronLeft, Footprints, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { SportId, User } from "../types";
import { SPORTS } from "../data/sports";

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(" "); }

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; block?: boolean };
export function Button({ variant = "primary", size = "md", block, className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" && "h-9 px-3.5 text-[13px]",
        size === "md" && "h-11 px-5 text-[15px]",
        size === "lg" && "h-[52px] px-6 text-base",
        variant === "primary" && "bg-accent text-accent-ink hover:brightness-105 shadow-[0_6px_20px_-8px_rgb(var(--accent)/.7)]",
        variant === "secondary" && "bg-raised text-ink hover:bg-line/70",
        variant === "ghost" && "text-ink hover:bg-raised",
        variant === "danger" && "bg-bad/10 text-bad hover:bg-bad/15",
        block && "w-full",
        className,
      )}
    />
  );
}

export function IconButton({ label, children, className, badge, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; badge?: number }) {
  return (
    <button aria-label={label} title={label} {...p} className={cx("relative grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-raised transition", className)}>
      {children}
      {!!badge && <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink tnum">{badge}</span>}
    </button>
  );
}

export function Chip({ active, children, onClick, icon }: { active?: boolean; children: ReactNode; onClick?: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition",
        active ? "border-ink bg-ink text-bg" : "border-line bg-surface text-ink hover:border-muted/60",
      )}
    >
      {icon}{children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, desc, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; desc?: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {desc && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{desc}</span>}
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-[26px] w-[44px] rounded-full bg-line transition peer-checked:bg-good peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
        <span className="absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-[18px]" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-raised p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition", value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold">{label}</label>
      {children}
      {error ? <p className="text-[12.5px] font-medium text-bad">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}
export const inputCls = "h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition";

export function SportIcon({ sport, size = 16 }: { sport: SportId; size?: number }) {
  return sport === "run" ? <Footprints size={size} strokeWidth={2.2} /> : <Bike size={size} strokeWidth={2.2} />;
}
export function SportTag({ sport }: { sport: SportId }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold", sport === "run" ? "bg-run/10 text-run" : "bg-ride/10 text-ride")}>
      <SportIcon sport={sport} size={13} /> {SPORTS[sport].label}
    </span>
  );
}

export function Avatar({ user, size = 36, ring }: { user?: User; size?: number; ring?: boolean }) {
  if (!user) return null;
  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      className={cx("inline-grid shrink-0 place-items-center overflow-hidden font-bold text-white", user.kind === "club" ? "rounded-xl" : "rounded-full", ring && "ring-2 ring-surface")}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(140deg, hsl(${user.hue} 62% 52%), hsl(${user.hue + 28} 58% 40%))` }}
      aria-hidden
    >
      {user.photo ? <img src={user.photo} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}
export function AvatarStack({ users, max = 4, size = 26 }: { users: User[]; max?: number; size?: number }) {
  const shown = users.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((u, i) => <span key={u.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar user={u} size={size} ring /></span>)}
      {users.length > max && <span className="ml-1 text-[12px] font-semibold text-muted tnum">+{users.length - max}</span>}
    </span>
  );
}

export function TopBar({ title, onBack, right, sub }: { title?: ReactNode; onBack?: () => void; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-line/60 bg-bg/85 px-2 backdrop-blur-md">
      {onBack ? <IconButton label="Zurück" onClick={onBack}><ChevronLeft size={22} /></IconButton> : <span className="w-2" />}
      <div className="min-w-0 flex-1">
        {title && <h1 className="truncate font-display text-[17px] font-extrabold">{title}</h1>}
        {sub && <p className="truncate text-[12px] text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-end" role="dialog" aria-modal aria-label={title}>
      <button aria-label="Schließen" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="sheet-in relative flex max-h-[88%] w-full flex-col rounded-t-[26px] bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="font-display text-lg font-extrabold">{title}</h2>
          <IconButton label="Schließen" onClick={onClose}><X size={20} /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-raised text-muted">{icon}</span>
      <h3 className="font-display text-base font-extrabold">{title}</h3>
      <p className="max-w-[30ch] text-[14px] text-muted">{text}</p>
      {action}
    </div>
  );
}

export function DemoTag({ children = "Simuliert" }: { children?: ReactNode }) {
  return <span className="inline-flex items-center rounded-md border border-warn/40 bg-warn/10 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-warn">{children}</span>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
