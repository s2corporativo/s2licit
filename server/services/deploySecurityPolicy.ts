export function assertSafeDeployUser(user: string): void {
  const normalized = user.trim();
  if (!normalized) throw new Error("Usuário de deploy não configurado.");
  if (normalized === "root") throw new Error("Deploy remoto como root é proibido.");
}
