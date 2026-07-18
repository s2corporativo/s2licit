/**
 * aiJobRunner: execução em segundo plano das operações de IA em massa, com
 * estado persistido em `ai_jobs`. A mutation tRPC cria o job e devolve o id;
 * o cliente acompanha por polling (aiJobStatus). O progresso sobrevive a
 * consulta/refresh da página — e um restart do servidor marca o job como
 * interrompido em vez de deixá-lo "executando" para sempre.
 */
import { and, eq, lt } from "drizzle-orm";
import { aiJobs, type AiJob } from "../../drizzle/schema";
import { getDb } from "../db";
import type { PageResult } from "../services/aiEnrichmentService";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type AiJobProgress = {
  processed: number;
  total: number;
  updated: number;
  skipped: number;
  errors: number;
};

const MAX_ERROR_MESSAGES = 20;

/**
 * Executa `runPage` repetidamente (uma página por vez) até esgotar os itens,
 * gravando progresso no banco a cada página. Retorna o id do job criado.
 */
export async function startPagedAiJob(opts: {
  tipo: string;
  payload: unknown;
  requestedBy?: number;
  runPage: (db: Db, offset: number) => Promise<PageResult>;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível para iniciar o job de IA.");

  // Guarda de sobreposição: um job do mesmo tipo por vez.
  const [running] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(and(eq(aiJobs.tipo, opts.tipo), eq(aiJobs.status, "executando")))
    .limit(1);
  if (running) {
    throw new Error(
      `Já existe uma execução de "${opts.tipo}" em andamento (job #${running.id}). Aguarde a conclusão.`
    );
  }

  const [ins] = await db.insert(aiJobs).values({
    tipo: opts.tipo,
    status: "executando",
    payload: opts.payload as object,
    requestedBy: opts.requestedBy ?? null,
    progresso: { processed: 0, total: 0, updated: 0, skipped: 0, errors: 0 },
  });
  const jobId = Number((ins as { insertId: number | string }).insertId);

  void runJob(db, jobId, opts.runPage);
  return jobId;
}

async function runJob(db: Db, jobId: number, runPage: (db: Db, offset: number) => Promise<PageResult>) {
  const progress: AiJobProgress = { processed: 0, total: 0, updated: 0, skipped: 0, errors: 0 };
  const errorMessages: string[] = [];
  let offset = 0;
  try {
    // Teto duro de páginas como proteção contra loop (300 páginas ≈ 45–60k produtos)
    for (let page = 0; page < 300; page++) {
      const res = await runPage(db, offset);
      progress.total = res.total;
      progress.processed += res.processedInPage;
      progress.updated += res.updated;
      progress.skipped += res.skipped;
      progress.errors += res.errors;
      for (const msg of res.errorMessages) {
        if (errorMessages.length < MAX_ERROR_MESSAGES) errorMessages.push(msg);
      }
      offset = res.nextOffset;
      await db
        .update(aiJobs)
        .set({ progresso: { ...progress }, errorMessages: [...errorMessages] })
        .where(eq(aiJobs.id, jobId));
      if (!res.hasMore) break;
    }
    await db
      .update(aiJobs)
      .set({
        status: "concluido",
        progresso: { ...progress },
        errorMessages: [...errorMessages],
        concluidoEm: new Date(),
      })
      .where(eq(aiJobs.id, jobId));
  } catch (err) {
    if (errorMessages.length < MAX_ERROR_MESSAGES) {
      errorMessages.push(err instanceof Error ? err.message : String(err));
    }
    await db
      .update(aiJobs)
      .set({
        status: "erro",
        progresso: { ...progress },
        errorMessages: [...errorMessages],
        concluidoEm: new Date(),
      })
      .where(eq(aiJobs.id, jobId))
      .catch(() => undefined);
  }
}

export async function getAiJob(jobId: number): Promise<AiJob | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(aiJobs).where(eq(aiJobs.id, jobId)).limit(1);
  return row ?? null;
}

/**
 * Marca como interrompidos jobs que ficaram "executando" de um boot anterior
 * (o runner morre com o processo). Chamado no startup do servidor.
 */
export async function recoverStaleAiJobs(): Promise<number> {
  const db = await getDb().catch(() => null);
  if (!db) return 0;
  const stale = await db
    .select({ id: aiJobs.id, errorMessages: aiJobs.errorMessages })
    .from(aiJobs)
    .where(and(eq(aiJobs.status, "executando"), lt(aiJobs.iniciadoEm, new Date(Date.now() - 60_000))));
  for (const job of stale) {
    await db
      .update(aiJobs)
      .set({
        status: "erro",
        errorMessages: [...(job.errorMessages ?? []), "Interrompido por reinício do servidor."],
        concluidoEm: new Date(),
      })
      .where(eq(aiJobs.id, job.id));
  }
  return stale.length;
}
