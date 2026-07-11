import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { ensureAdminUser, ensurePasswordColumn, registerLocalAuthRoutes } from "./localAuth";
import { initScheduledJobs } from "../services/scheduledJobs";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { generateProposalPdf, type DeclarationTemplate } from "../proposalPdf";
import { exportProductsToExcel, importProductsFromExcel } from "../exportExcel";
import { getProposalWithItems, getCompanySettings, upsertCompanySettings, getDb } from "../db";
import { declarationTemplates } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";
import { storagePut, localUploadDir } from "../storage";
import multer from "multer";
import { apiRateLimiter, authRateLimiter } from "./rateLimit";


function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Atrás de proxy reverso (Render, nginx), confiar no primeiro salto para
  // que req.ip reflita o cliente real (necessário para o rate limiter).
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Rate limiting: geral na API, estrito na autenticação
  app.use("/api", apiRateLimiter);
  app.use("/api/auth", authRateLimiter);
  app.use("/api/oauth", authRateLimiter);
  // Health check (usado pelo Render e por monitoramento externo)
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });
  // Uploads locais (logos etc.) — usado quando não há proxy de storage externo
  app.use("/uploads", express.static(localUploadDir(), { maxAge: "1d" }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Login local (email/senha) — modo padrão fora da plataforma Manus
  registerLocalAuthRoutes(app);
  ensurePasswordColumn()
    .then(() => ensureAdminUser())
    .catch(err => console.error("[LocalAuth] Falha na inicialização:", err));
  // Logo upload route (multipart/form-data)
  const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
  app.post("/api/upload/logo", logoUpload.single("logo"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }
      const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "png";
      const key = `logos/company-logo-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      // Persist logo URL to company settings
      await upsertCompanySettings({ logoUrl: url } as any);
      res.json({ url });
    } catch (err) {
      console.error("[Logo Upload] Error:", err);
      res.status(500).json({ error: "Erro ao fazer upload do logo" });
    }
  });

  // PDF download route for proposals
  app.get("/api/proposals/:id/pdf", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }
      const proposal = await getProposalWithItems(id);
      if (!proposal) {
        res.status(404).json({ error: "Proposta não encontrada" });
        return;
      }
      const company = await getCompanySettings();
      const markupPercent = parseFloat(String(req.query.markup ?? "0")) || 0;
      // Parse selected declaration IDs from query param (comma-separated)
      let declarations: DeclarationTemplate[] = [];
      const declParam = String(req.query.declarations ?? "");
      if (declParam) {
        const declIds = declParam.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (declIds.length > 0) {
          try {
            const dbInst = await getDb();
            if (dbInst) {
              const rows = await dbInst.select().from(declarationTemplates).where(inArray(declarationTemplates.id, declIds));
              declarations = rows.map((r: typeof declarationTemplates.$inferSelect) => ({ id: r.id, title: r.title, content: r.content }));
            }
          } catch (e) {
            console.error("[PDF] Failed to load declarations:", e);
          }
        }
      }
      const pdfBuffer = await generateProposalPdf(proposal as any, company as any, markupPercent, declarations);
      const filename = `proposta-${proposal.id}-${(proposal.title ?? 'proposta').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[PDF] Error generating proposal PDF:", err);
      res.status(500).json({ error: "Erro ao gerar PDF" });
    }
  });

  // ─── Exportação do catálogo em Excel ─────────────────────────────────────────
  app.get("/api/products/export-excel", async (req: any, res: any) => {
    try {
      const filters: Record<string, any> = {};
      if (req.query.supplierId) filters.supplierId = parseInt(req.query.supplierId);
      if (req.query.categoryId) filters.categoryId = parseInt(req.query.categoryId);
      if (req.query.isActive) filters.isActive = req.query.isActive;
      if (req.query.withoutFichaTecnica === "true") filters.withoutFichaTecnica = true;
      if (req.query.withoutCategory === "true") filters.withoutCategory = true;
      if (req.query.search) filters.search = req.query.search;
      const buffer = await exportProductsToExcel(filters);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `catalogo-produtos-${date}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (err: any) {
      console.error("[Excel Export] Error:", err);
      res.status(500).json({ error: err?.message ?? "Erro ao exportar Excel" });
    }
  });

  // ─── Importação de Excel para atualização em massa ────────────────────────────
  const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.post("/api/products/import-excel-update", excelUpload.single("file"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }
      const result = await importProductsFromExcel(req.file.buffer);
      res.json(result);
    } catch (err: any) {
      console.error("[Excel Import] Error:", err);
      res.status(500).json({ error: err?.message ?? "Erro ao importar Excel" });
    }
  });

  // tRPC API — middleware de proteção: garante que /api/trpc NUNCA retorne HTML
  app.use("/api/trpc", (req: any, res: any, next: any) => {
    const originalSend = res.send.bind(res);
    res.send = (body: any) => {
      // Se o body for HTML (começa com <!DOCTYPE ou <html), converter para JSON de erro
      if (typeof body === 'string' && (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html'))) {
        console.error('[tRPC Guard] HTML response intercepted on', req.method, req.url, '— converting to JSON error');
        res.setHeader('Content-Type', 'application/json');
        return originalSend(JSON.stringify({ error: { message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' } }));
      }
      return originalSend(body);
    };
    next();
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        console.error(`[tRPC Error] ${path ?? 'unknown'}:`, error.message);
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    // Em produção, subir noutra porta deixaria o app inacessível por trás do
    // mapeamento fixo do Docker/proxy — melhor falhar alto do que fingir saúde.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Porta ${preferredPort} ocupada — em produção a porta deve ser a configurada (PORT).`,
      );
    }
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Jobs recorrentes: sincronização de e-mail e alertas proativos.
  try {
    initScheduledJobs();
  } catch (err) {
    console.error("[Scheduler] Falha ao inicializar jobs agendados:", err);
  }
}

startServer().catch(console.error);
