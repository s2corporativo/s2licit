import type { User } from "../drizzle/schema";

/**
 * Usuário completo para testes: os mocks dos testes deixavam de compilar a
 * cada coluna nova em `users`. Centraliza o objeto e permite sobrescrever só
 * o que interessa ao caso de teste.
 */
export function makeTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "test-user",
    name: "Usuário de Teste",
    email: "teste@example.com",
    loginMethod: "local",
    passwordHash: null,
    role: "user",
    failedLoginAttempts: 0,
    lockedUntil: null,
    mfaEnabled: false,
    mfaSecret: null,
    disabled: false,
    sessionVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}
