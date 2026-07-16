import "dotenv/config";
import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { ensureAdminUser, ensurePasswordColumn, registerLocalAuthRoutes } from "./localAuth";
import { ensureProductColumns, ensureAuthSecurityColumns, ensureCompanySettingsColumns } from "./ensureSchema";
import { initScheduledJobs } from "../services/scheduledJobs";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import type { Request, Response, NextFunction } from "express";
import { generateProposalPdf, type DeclarationTemplate } from "../proposalPdf";
import { generateProposalExcel } from "../proposalExcel";
import { PricingValidationError } from "../services/pricingSafety";
import { exportProductsToExcel, importProductsFromExcel } from "../exportExcel";
import { getProposalWithItems, getCompanySettings, upsertCompanySettings, getDb } from "../db";
import { declarationTemplates } from "../../drizzle/schema";
import { inArray, sql } from "drizzle-orm";
import { storagePut, localUploadDir } from "../storage";
import multer from "multer";
import { apiRateLimiter, authRateLimiter } from "./rateLimit";

const ROLE_RANK: Record<string, number> = { user: 0, viewer: 1, editor: 2, admin: 3 };

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
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Falhas de schema são fatais: nunca disponibilizar a aplicação parcialmente migrada.
  await ensurePasswordColumn();
  await ensureAdminUser();
  await ensureProductColumns();
  await ensureAuthSecurityColumns();
  await ensureCompanySettingsColumns();

  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1);
  app.use(compression());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use("/api", apiRateLimiter);
  app.use("/api/auth", authRateLimiter);
  app.use("/api/oauth", authRateLimiter);

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/readyz", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db.execute(sql`SELECT 1`);
      res.json({ status: "ready", database: "ok", uptime: process.uptime() });
    } catch (error) {
      res.status(503).json({
        status: "not_ready",
        database: "error",
        error: error instanceof Error ? error.message : "Falha de prontidão",
      });
    }
  });

  app.use("/uploads", express.static(localUploadDir(), { maxAge: "1d" }));
  registerOAuthRoutes(app);
  registerLocalAuthRoutes(app);

  const requireRole = (minimumRole: "user" | "viewer" | "editor" | "admin") =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = await sdk.authenticateRequest(req);
        const rank = ROLE_RANK[(user.role as string) ?? "user"] ?? 0;
        if (rank < ROLE_RANK[minimumRole]) {
          res.status(403).json({ error: `Requer perfil ${minimumRole} ou superior` });
          return;
        }
        (req as Request & { authUser?: typeof user }).authUser = user;
        next();
      } catch {
        res.status(401).json({ error: "Não autenticado" });
      }
    };

  const requireAuth = requireRole("user");
  const requireEditor = requireRole("editor");
  const requireAdmin = requireRole("admin");

  const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
      if (!allowed.has(file.mimetype)) {
        cb(new Error("Formato de imagem não permitido"));
        return;
      }
      cb(null, true);
    },
  });
  app.post("/api/upload/logo", requireAdmin, logoUpload.single("logo"), async (req: any, res: any) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }
      const extByMime: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
      };
      const ext = extByMime[req.file.mimetype];
      if (!ext) {
        res.status(415).json({ error: "Formato de imagem não permitido" });
        return;
      }
      const key = `logos/company-logo-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      await upsertCompanySettings({ logoUrl: url } as any);
      res.json({ url });
    } catch (err) {
      console.error("[Logo Upload] Error:", err);
      res.status(500).json({ error: "Erro ao fazer upload do logo" });
    }
  });

  app.get("/api/proposals/:id/pdf", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }
      if (req.query.markup !== undefined) {
        res.status(400).json({
          error: "Ajuste de margem no download foi desativado. Salve o preço de venda de cada item antes de gerar o PDF.",
        });
        return;
      }

      const proposal = await getProposalWithItems(id);
      if (!proposal) {
        res.status(404).json({ error: "Proposta não encontrada" });
        return;
      }
      const company = await getCompanySettings();
      let declarations: DeclarationTemplate[] = [];
      const declParam = String(req.query.declarations ?? "");
      if (declParam) {
        const declIds = declParam.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (declIds.length > 0) {
          const dbInst = await getDb();
          if (!dbInst) throw new Error("Banco indisponível ao carregar declarações");
          const rows = await dbInst.select().from(declarationTemplates).where(inArray(declarationTemplates.id, declIds));
          declarations = rows.map((r: typeof declarationTemplates.$inferSelect) => ({ id: r.id, title: r.title, content: r.content }));
        }
      }
      const pdfBuffer = await generateProposalPdf(proposal as any, company as any, declarations);
      const filename = `proposta-${proposal.id}-${(proposal.title ?? "proposta").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
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

  // Exportação da proposta em Excel (§11) — mesma máscara do PDF (sem custo/margem).
  app.get("/api/proposals/:id/xlsx", requireAuth, async (req, res) => {
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
      const xlsxBuffer = await generateProposalExcel({ proposal: proposal as any, company: company as any });
      const filename = `proposta-${proposal.id}-${(proposal.title ?? "proposta").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", xlsxBuffer.length);
      res.send(xlsxBuffer);
    } catch (err) {
      if (err instanceof PricingValidationError) {
        res.status(422).json({ error: err.message, issues: err.issues });
        return;
      }
      console.error("[XLSX] Erro ao gerar Excel da proposta:", err);
      res.status(500).json({ error: "Erro ao gerar Excel" });
    }
  });

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

  const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!allowed) {
        cb(new Error("Envie um arquivo XLSX válido"));
        return;
      }
      cb(null, true);
    },
  });
  app.post("/api/products/import-excel-update", requireEditor, excelUpload.single("file"), async (req: any, res: any) => {
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

  app.use("/api/trpc", (req: any, res: any, next: any) => {
    const originalSend = res.send.bind(res);
    res.send = (body: any) => {
      if (typeof body === "string" && (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html"))) {
        console.error("[tRPC Guard] HTML response intercepted on", req.method, req.url, "— converting to JSON error");
        res.setHeader("Content-Type", "application/json");
        return originalSend(JSON.stringify({ error: { message: "Internal server error", code: "INTERNAL_SERVER_ERROR" } }));
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
        console.error(`[tRPC Error] ${path ?? "unknown"}:`, error.message);
      },
    }),
  );

  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Porta ${preferredPort} ocupada — em produção a porta deve ser a configurada (PORT).`);
    }
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  initScheduledJobs();
}

startServer().catch(error => {
  console.error("[Boot] Falha fatal ao iniciar o S2:", error);
  process.exit(1);
});
