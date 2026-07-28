import {
  syncS2PortalOpportunities,
  type S2PortalSyncResult,
} from "./s2PortalOpportunitySyncService";
import {
  S2_TARGET_PORTALS,
  type S2TargetPortal,
} from "./s2TargetPortals";

/**
 * Executa cada conector isoladamente e consolida os resultados. Além de deixar
 * falhas independentes por portal, evita que um resumo conjunto de Fundep e
 * Funarbe seja atribuído duas vezes às estatísticas individuais.
 */
export async function syncS2PortalOpportunitiesSafely(options?: {
  sources?: S2TargetPortal[];
  maxFundepGroups?: number;
}): Promise<S2PortalSyncResult> {
  const requested = options?.sources?.length
    ? options.sources
    : [...S2_TARGET_PORTALS];
  const sources = Array.from(new Set(requested)).filter(
    (source): source is S2TargetPortal =>
      (S2_TARGET_PORTALS as readonly string[]).includes(source),
  );

  const results: S2PortalSyncResult[] = [];
  for (const source of sources) {
    try {
      results.push(
        await syncS2PortalOpportunities({
          sources: [source],
          maxFundepGroups: options?.maxFundepGroups,
        }),
      );
    } catch (error) {
      results.push({
        sources: [source],
        found: 0,
        imported: 0,
        skipped: 0,
        matchedItems: 0,
        unmatchedItems: 0,
        errors: [`${source}: ${(error as Error).message}`],
        sourceStats: [
          {
            source,
            found: 0,
            imported: 0,
            skipped: 0,
            matchedItems: 0,
            unmatchedItems: 0,
            errors: [(error as Error).message],
          },
        ],
      });
    }
  }

  return {
    sources,
    found: results.reduce((sum, result) => sum + result.found, 0),
    imported: results.reduce((sum, result) => sum + result.imported, 0),
    skipped: results.reduce((sum, result) => sum + result.skipped, 0),
    matchedItems: results.reduce((sum, result) => sum + result.matchedItems, 0),
    unmatchedItems: results.reduce((sum, result) => sum + result.unmatchedItems, 0),
    errors: results.flatMap((result) => result.errors),
    sourceStats: results.flatMap((result) => result.sourceStats),
  };
}
