import type { AuthContext } from "./types.js";

export const ADMIN_TOKEN = "admin-token";
export const VIEWER_TOKEN = "viewer-token";

export function authenticate(authorizationHeader: string | undefined): AuthContext | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  if (!match?.[1]) {
    return null;
  }
  const token = match[1];
  return {
    token,
    role: token === ADMIN_TOKEN ? "admin" : "viewer",
  };
}

export function isAdminTool(name: string | undefined): boolean {
  return typeof name === "string" && name.startsWith("admin_");
}
