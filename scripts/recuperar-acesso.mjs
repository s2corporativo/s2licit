#!/usr/bin/env node
/**
 * Recuperação de acesso ao S2 Licit — para quando NINGUÉM consegue entrar.
 *
 * O reset de senha e o desbloqueio da interface exigem uma sessão de
 * administrador já autenticada. Se o único admin está bloqueado por tentativas
 * inválidas, esqueceu a senha ou perdeu o autenticador MFA, não havia saída
 * pelo produto — só edição manual no banco. Este script é essa saída.
 *
 * Uso (na VPS, dentro de /opt/s2licit):
 *
 *   # 1. Ver a situação das contas (não altera nada)
 *   docker compose exec -T app node scripts/recuperar-acesso.mjs --listar
 *
 *   # 2. Só destravar quem bateu no bloqueio por tentativas
 *   docker compose exec -T app node scripts/recuperar-acesso.mjs --email adm@vetmg.com.br --desbloquear
 *
 *   # 3. Destravar e definir uma senha nova
 *   docker compose exec -T app node scripts/recuperar-acesso.mjs --email adm@vetmg.com.br --senha 'NovaSenhaForte123'
 *
 *   # 4. Também desligar o MFA (autenticador perdido/trocado)
 *   docker compose exec -T app node scripts/recuperar-acesso.mjs --email adm@vetmg.com.br --senha 'NovaSenhaForte123' --sem-mfa
 *
 * Toda ação fica registrada em auditLogs com origem "recuperacao-cli".
 */

import crypto from "node:crypto";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const flag = (nome) => args.includes(nome);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL ausente. Rode dentro do container do app (docker compose exec app ...).");
  process.exit(1);
}

const listar = flag("--listar");
const email = (valor("--email") || "").trim().toLowerCase();
const senha = valor("--senha");
const desbloquear = flag("--desbloquear");
const semMfa = flag("--sem-mfa");
const reativar = flag("--reativar");

if (!listar && !email) {
  console.error("Informe --listar ou --email <endereço>. Veja o cabeçalho do arquivo para exemplos.");
  process.exit(1);
}
if (senha !== null && senha !== undefined && senha.length > 0 && senha.length < 8) {
  console.error("A senha precisa de pelo menos 8 caracteres.");
  process.exit(1);
}

const hashSenha = (texto) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(texto, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
};

const conn = await mysql.createConnection(databaseUrl);
try {
  if (listar) {
    const [rows] = await conn.execute(
      `SELECT id, email, role, disabled, mfaEnabled, failedLoginAttempts, lockedUntil, lastSignedIn
         FROM users ORDER BY role = 'admin' DESC, email`,
    );
    const agora = Date.now();
    console.log("\nContas do S2 Licit:\n");
    for (const u of rows) {
      const travada = u.lockedUntil && new Date(u.lockedUntil).getTime() > agora;
      const restante = travada
        ? ` (libera em ${Math.ceil((new Date(u.lockedUntil).getTime() - agora) / 60000)} min)`
        : "";
      const marcas = [
        `papel=${u.role}`,
        travada ? `BLOQUEADA${restante}` : "liberada",
        u.disabled ? "DESATIVADA" : "ativa",
        u.mfaEnabled ? "MFA ligado" : "sem MFA",
        `falhas=${u.failedLoginAttempts}`,
      ];
      console.log(`  #${u.id} ${u.email}\n      ${marcas.join(" · ")}`);
    }
    console.log("\nPara liberar uma conta: --email <endereço> --desbloquear [--senha '<nova>'] [--sem-mfa]\n");
    process.exit(0);
  }

  const [rows] = await conn.execute("SELECT id, email, role FROM users WHERE email = ? LIMIT 1", [email]);
  const user = rows?.[0];
  if (!user) {
    console.error(`Nenhuma conta com o e-mail ${email}. Use --listar para ver os endereços cadastrados.`);
    process.exit(1);
  }

  // Desbloquear é sempre seguro e é o motivo mais comum de rodar isto: aplica
  // por padrão, sem exigir a flag, quando uma senha nova foi passada.
  const campos = ["failedLoginAttempts = 0", "lockedUntil = NULL"];
  const valores = [];
  const feito = ["conta desbloqueada (tentativas zeradas)"];

  if (senha) {
    campos.push("passwordHash = ?", "loginMethod = 'local'");
    valores.push(hashSenha(senha));
    // Invalida sessões antigas: uma senha nova não deve conviver com tokens
    // emitidos antes dela.
    campos.push("sessionVersion = sessionVersion + 1");
    feito.push("senha redefinida", "sessões anteriores revogadas");
  }
  if (semMfa) {
    campos.push("mfaEnabled = 0", "mfaSecret = NULL");
    feito.push("MFA desligado");
  }
  if (reativar) {
    campos.push("disabled = 0");
    feito.push("conta reativada");
  }
  if (!senha && !semMfa && !reativar && !desbloquear) {
    console.error("Nada a fazer: use --desbloquear, --senha, --sem-mfa ou --reativar.");
    process.exit(1);
  }

  valores.push(user.id);
  await conn.execute(`UPDATE users SET ${campos.join(", ")} WHERE id = ?`, valores);

  try {
    await conn.execute(
      `INSERT INTO audit_logs (userId, action, entity, entityId, origin, summary)
       VALUES (?, 'recuperacao_acesso', 'user', ?, 'recuperacao-cli', ?)`,
      [user.id, user.id, `Recuperação por CLI: ${feito.join("; ")}`],
    );
  } catch (err) {
    // Auditoria é registro, não pré-requisito: a recuperação não pode falhar
    // porque a tabela mudou de forma.
    console.warn(`Aviso: não foi possível gravar a auditoria (${err.message}).`);
  }

  console.log(`\nConta ${user.email} (#${user.id}, ${user.role}):`);
  for (const item of feito) console.log(`  - ${item}`);
  console.log("\nJá pode entrar em https://<seu-domínio>/ com essas credenciais.\n");
} finally {
  await conn.end();
}
