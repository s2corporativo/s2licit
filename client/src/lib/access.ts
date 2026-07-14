export type Role = "user" | "viewer" | "editor" | "admin";

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  viewer: 1,
  editor: 2,
  admin: 3,
};

const ROLE_LABELS: Record<Role, string> = {
  user: "Usuário",
  viewer: "Visualizador",
  editor: "Editor",
  admin: "Administrador",
};

export function normalizeRole(role: unknown): Role {
  return typeof role === "string" && role in ROLE_RANK ? (role as Role) : "user";
}

export function hasMinimumRole(role: unknown, minimumRole?: Role): boolean {
  if (!minimumRole) return true;
  return ROLE_RANK[normalizeRole(role)] >= ROLE_RANK[minimumRole];
}

export function getRoleLabel(role: unknown): string {
  return ROLE_LABELS[normalizeRole(role)];
}
