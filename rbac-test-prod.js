// Teste RBAC em produção (executar DENTRO do container do app).
// Cria usuário viewer de QA, testa query (permitida) e mutation (bloqueada), remove o usuário.
// A senha é aleatória por execução e a limpeza acontece mesmo quando o teste falha.
const crypto = require("crypto");
const QA_EMAIL = "s2licit_qa_rbac_viewer@example.com";
const QA_PASSWORD = crypto.randomBytes(32).toString("base64url");
const LOOPBACK_BASE_URL = "http://127.0.0.1:3000";

const env = Object.fromEntries(
  require("fs").readFileSync("/app/.env", "utf8").split("\n")
    .filter(l => l && l[0] !== "#").map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const { Pool } = require("mysql2/promise");
const pool = new Pool({ uri: env.DATABASE_URL || `mysql://${env.MYSQL_USER}:${env.MYSQL_PASSWORD}@db:3306/${env.MYSQL_DATABASE}` });

async function main() {
  let qaCreated = false;
  try {
    // Remove resíduo de uma execução antiga interrompida antes da limpeza.
    await pool.execute(`DELETE FROM users WHERE email = ?`, [QA_EMAIL]);

    // 1. criar viewer QA (hash igual ao fluxo real)
    const { credentialEncryptionService } = require("/app/dist/server/services/credentialEncryptionService");
    const hash = credentialEncryptionService.hashPassword(QA_PASSWORD);
    await pool.execute(
      `INSERT INTO users (openId, name, email, role, loginMethod, passwordHash, disabled, failedLoginAttempts, mfaEnabled)
       VALUES (?, 'QA RBAC Viewer', ?, 'viewer', 'local', ?, 0, 0, 0)`,
      [`local:${QA_EMAIL}`, QA_EMAIL, hash]
    );
    qaCreated = true;
    console.log("viewer criado");

    // HTTP é intencional e restrito ao loopback dentro do mesmo container; não há trânsito em rede.
    // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
    const login = await fetch(`${LOOPBACK_BASE_URL}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: QA_EMAIL, password: QA_PASSWORD })
    });
    const lj = await login.json();
    console.log("login:", login.status, lj.success);
    const cookie = login.headers.get("set-cookie");
    const sid = cookie ? cookie.split(";")[0] : "";

    function trpc(path, input) {
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
      return fetch(`${LOOPBACK_BASE_URL}/api/trpc/${path}?batch=1`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: sid },
        body: JSON.stringify([{ json: input }])
      }).then(r => r.json()).then(j => j[0]?.result ?? j);
    }

    // 3. query permitida a qualquer autenticado (dashboard)
    const q = await trpc("dashboard.metrics", {});
    console.log("query dashboard:", JSON.stringify(q).slice(0, 160));

    // 4. mutation bloqueada para viewer (proposals.create)
    const m = await trpc("proposals.create", { titulo: "S2LICIT_QA_RBAC_PROPOSTA" });
    console.log("mutation proposals.create:", JSON.stringify(m).slice(0, 200));
  } finally {
    if (qaCreated) {
      await pool.execute(`DELETE FROM users WHERE email = ?`, [QA_EMAIL]);
      console.log("viewer removido — teste concluído");
    }
    await pool.end();
  }
}

main().catch(e => { console.error("ERRO:", e.message); process.exit(2); });
