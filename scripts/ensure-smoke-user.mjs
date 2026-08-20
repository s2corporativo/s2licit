#!/usr/bin/env node

import crypto from "node:crypto";
import mysql from "mysql2/promise";

const email = String(process.env.SMOKE_USER_EMAIL || "").trim().toLowerCase();
const password = String(process.env.SMOKE_USER_PASSWORD || "");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL ausente.");
if (!email || !password || password.length < 16) {
  throw new Error("SMOKE_USER_EMAIL e uma senha de smoke forte são obrigatórios.");
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const passwordHash = `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
const openId = `local:${email}`;
const connection = await mysql.createConnection(databaseUrl);

try {
  const [rows] = await connection.execute(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  const existing = rows?.[0];
  if (existing?.id) {
    await connection.execute(
      "UPDATE users SET name = ?, loginMethod = 'local', passwordHash = ?, role = 'editor', disabled = 0, mfaEnabled = 0, failedLoginAttempts = 0, lockedUntil = NULL WHERE id = ?",
      ["Smoke Produção", passwordHash, existing.id],
    );
    console.log("[SmokeUser] Conta técnica atualizada e senha rotacionada.");
  } else {
    await connection.execute(
      "INSERT INTO users (openId, name, email, loginMethod, passwordHash, role) VALUES (?, ?, ?, 'local', ?, 'editor')",
      [openId, "Smoke Produção", email, passwordHash],
    );
    console.log("[SmokeUser] Conta técnica criada com papel editor.");
  }
} finally {
  await connection.end();
}
