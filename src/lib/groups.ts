import type { Group } from "../types";

export const isGroupAdmin = (g?: Group) => !!g && g.myStatus === "active" && (g.myRole === "owner" || g.myRole === "admin");
export const isGroupMember = (g?: Group) => !!g && g.myStatus === "active";
/** Darf ich in dieser Gruppe Termine anlegen? */
export const canPost = (g?: Group) => isGroupMember(g) && (g!.postMode === "members" || isGroupAdmin(g));
export const kindLabel = (k: Group["kind"]) => (k === "verein" ? "Verein" : "Running Club");
