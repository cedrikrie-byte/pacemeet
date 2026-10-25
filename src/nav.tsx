import { createContext, useContext } from "react";

export type Screen =
  | { name: "discover" } | { name: "mine" } | { name: "league" } | { name: "profile" }
  | { name: "create"; editId?: string; groupId?: string; series?: boolean }
  | { name: "group"; id: string }
  | { name: "groupEdit"; id?: string }
  | { name: "activity"; id: string }
  | { name: "chat"; id: string }
  | { name: "user"; id: string }
  | { name: "editProfile" }
  | { name: "settings" }
  | { name: "notifications" }
  | { name: "info" }
  | { name: "moderation" }
  | { name: "legal"; doc: LegalDoc };

export type LegalDoc = "impressum" | "datenschutz" | "nutzung";

export type Tab = "discover" | "mine" | "league" | "profile";

export interface Nav {
  current: Screen;
  push: (s: Screen) => void;
  back: () => void;
  tab: (t: Tab) => void;
  replace: (s: Screen) => void;
}
export const NavCtx = createContext<Nav | null>(null);
export function useNav() {
  const n = useContext(NavCtx);
  if (!n) throw new Error("Nav fehlt");
  return n;
}
