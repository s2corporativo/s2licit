export interface AppliedMigrationRecord {
  createdAt: number;
  hash: string;
}

/**
 * Política usada pela auditoria e pelos testes: migration já aplicada é
 * imutável. Mudança de hash com o mesmo timestamp é drift e deve interromper
 * deploy; correções exigem nova migration.
 */
export function assertMigrationImmutable(
  applied: AppliedMigrationRecord | undefined,
  incoming: AppliedMigrationRecord,
): void {
  if (!applied) return;
  if (applied.hash !== incoming.hash) {
    throw new Error(
      `Migration drift detectado em ${incoming.createdAt}: arquivo aplicado foi alterado. ` +
      "Crie uma nova migration em vez de modificar uma já aplicada.",
    );
  }
}
