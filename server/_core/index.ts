import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { ensureAdminUser, ensurePasswordColumn, registerLocalAuthRoutes } from "./localAuth";
import { ensureProductColumns } from "./ensureSchema";
import { initScheduledJobs } from "../services/scheduledJobs";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import type { Request, Response, NextFunction } from "express";
import { generateProposalPdf, type DeclarationTemplate } from "../proposalPdf";
import { PricingValidationError } from "../services/pricingSafety";
import { exportProductsToExcel, importProductsFromExcel } from "../exportExcel";
import { getProposalWithItems, getCompanySettings, upsertCompanySettings, getDb } from "../db";
import { auditLog, declarationTemplates } from "../../drizzle/schema";
import { inArray, sql } from "drizzle-orm";
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
  let initializationStatus: "pending" | "ready" | "failed" = "pending";
  // Atrás de proxy reverso (Render, nginx), confiar no primeiro salto para
  // que req.ip reflita o cliente real (necessário para o rate limiter).
  app.set("trust proxy", 1);
  // Compressão gzip de todas as respostas (HTML/JS/CSS/JSON) — corta o
  // tamanho na rede em ~3x e é o principal ganho de velocidade de abertura.
  app.use(compression());
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Rate limiting: geral na API, estrito na autenticação
  app.use("/api", apiRateLimiter);
  app.use("/api/auth", authRateLimiter);
  app.use("/api/oauth", authRateLimiter);
  // Health check (usado pelo Render e por monitoramento externo)
  app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "ok", uptime: process.uptime() });
  });
  // Readiness separada da liveness: só recebe tráfego quando banco e ajustes
  // mínimos de schema responderem de verdade.
  app.get("/readyz", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const db = await getDb();
      if (!db || initializationStatus !== "ready") {
        res.status(503).json({ status: "not_ready", database: Boolean(db), initialization: initializationStatus });
        return;
      }
      await db.execute(sql`SELECT 1 AS ready`);
      res.json({ status: "ready", database: true, initialization: initializationStatus });
    } catch {
      res.status(503).json({ status: "not_ready", database: false, initialization: initializationStatus });
    }
  });
  // Uploads locais (logos etc.) — usado quando não há proxy de storage externo
  app.use("/uploads", express.static(localUploadDir(), { maxAge: "1d" }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Login local (email/senha) — modo padrão fora da plataforma Manus
  registerLocalAuthRoutes(app);
  Promise.all([ensurePasswordColumn().then(() => ensureAdminUser()), ensureProductColumns()])
    .then(() => { initializationStatus = "ready"; })
    .catch(err => {
      initializationStatus = "failed";
      console.error("[Startup] Falha na inicialização de banco/schema:", err);
    });
  // Guarda de autenticação para as rotas REST fora do tRPC (download de PDF,
  // exportação/importação de catálogo, upload de logo). Sem isto, essas rotas
  // ficavam abertas a qualquer anônimo (IDOR: baixar proposta trocando o id).
  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await sdk.authenticateRequest(req);
      (req as Request & { authUser?: typeof user }).authUser = user;
      next();
    } catch {
      res.status(401).json({ error: "Não autenticado" });
    }
  };
  const roleRank: Record<string, number> = { user: 0, viewer: 1, editor: 2, admin: 3 };
  const requireRole = (minimum: "editor" | "admin") =>
    (req: Request, res: Response, next: NextFunction) => {
      const user = (req as Request & { authUser?: { role?: string | null } }).authUser;
      if (!user || (roleRank[user.role ?? "user"] ?? 0) < roleRank[minimum]) {
        res.status(403).json({ error: `Requer perfil ${minimum === "admin" ? "Administrador" : "Editor"} ou superior` });
        return;
      }
      next();
    };
  const requireEditor = requireRole("editor");
  const requireAdmin = requireRole("admin");

  // Telemetria sem conteúdo sensível: registra apenas a rota visitada e o
  // usuário. Ela sustenta a remoção futura de telas legadas com evidência real.
  app.post("/api/usage/route", requireAuth, async (req: any, res: any) => {
    const route = String(req.body?.route ?? "").split("?")[0];
    if (!/^\/[a-z0-9/_-]{0,200}$/i.test(route)) {
      res.status(400).json({ error: "Rota inválida" });
      return;
    }
    const db = await getDb();
    if (db) {
      await db.insert(auditLog).values({
        source: "ui",
        action: "route_view",
        endpoint: route,
        status: "ok",
        userId: req.authUser?.openId ?? null,
      });
    }
    res.status(204).end();
  });

  // Logo upload route (multipart/form-data)
  const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
  app.post("/api/upload/logo", requireAuth, requireAdmin, logoUpload.single("logo"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }
      const file: Buffer = req.file.buffer;
      const isJpeg = file[0] === 0xff && file[1] === 0xd8;
      const isPng = file[0] === 0x89 && file[1] === 0x50 && file[2] === 0x4e && file[3] === 0x47;
      const isWebp =
        file.subarray(0, 4).toString("ascii") === "RIFF" &&
        file.subarray(8, 12).toString("ascii") === "WEBP";
      const ext = isJpeg ? "jpg" : isPng ? "png" : isWebp ? "webp" : null;
      if (!ext) {
        res.status(400).json({ error: "Imagem inválida. Use JPEG, PNG ou WebP." });
        return;
      }
      const key = `logos/company-logo-${Date.now()}.${ext}`;
      const contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const { url } = await storagePut(key, file, contentType);
      // Persist logo URL to company settings
      await upsertCompanySettings({ logoUrl: url } as any);
      res.json({ url });
    } catch (err) {
      console.error("[Logo Upload] Error:", err);
      res.status(500).json({ error: "Erro ao fazer upload do logo" });
    }
  });

  // PDF download route for proposals
  app.get("/api/proposals/:id/pdf", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }
      if (req.query.markup !== undefined) {
        res.status(400).json({
          error:
            "Ajuste de margem no download foi desativado. Salve o preço de venda de cada item antes de gerar o PDF.",
        });
        return;
      }

      const proposal = await getProposalWithItems(id);
      if (!proposal) {
        res.status(404).json({ error: "Proposta não encontrada" });
        return;
      }
      const company = await getCompanySettings();
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
      const pdfBuffer = await generateProposalPdf(proposal as any, company as any, declarations);
      const filename = `proposta-${proposal.id}-${(proposal.title ?? 'proposta').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      if (err instanceof PricingValidationError) {
        res.status(422).json({ error: err.message, issues: err.issues });
        return;
      }
      console.error("[PDF] Error generating proposal PDF:", err);
      res.status(500).json({ error: "Erro ao gerar PDF" });
    }
  });

  // ─── Exportação do catálogo em Excel ─────────────────────────────────────────
  app.get("/api/products/export-excel", requireAuth, async (req: any, res: any) => {
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
  app.post("/api/products/import-excel-update", requireAuth, requireEditor, excelUpload.single("file"), async (req: any, res: any) => {
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
