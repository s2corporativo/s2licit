import { describe, it, expect } from 'vitest';
import { appRouter } from '../routers';
import { TRPCError } from '@trpc/server';

describe('auditRouter', () => {
  const adminUser = { id: 1, email: 'admin@test.com', role: 'admin' as const };
  const regularUser = { id: 2, email: 'user@test.com', role: 'user' as const };

  const createContext = (user?: typeof adminUser | typeof regularUser) => ({
    user,
    req: {} as any,
    res: {} as any,
  });

  describe('checkDatabaseIntegrity', () => {
    it('should return database integrity status for admin users', async () => {
      const caller = appRouter.createCaller(createContext(adminUser));
      const result = await caller.audit.checkDatabaseIntegrity();

      expect(result).toBeDefined();
      expect(result.status).toMatch(/healthy|warning|critical/);
      expect(result.summary).toBeDefined();
      expect(Array.isArray(result.tables)).toBe(true);
      expect(result.totalTables).toBeGreaterThan(0);
    });

    it('should include missingTables array in response', async () => {
      const caller = appRouter.createCaller(createContext(adminUser));
      const result = await caller.audit.checkDatabaseIntegrity();

      expect(Array.isArray(result.missingTables)).toBe(true);
    });

    it('should include table details with exists flag', async () => {
      const caller = appRouter.createCaller(createContext(adminUser));
      const result = await caller.audit.checkDatabaseIntegrity();

      result.tables.forEach((table) => {
        expect(table).toHaveProperty('name');
        expect(table).toHaveProperty('exists');
        expect(typeof table.exists).toBe('boolean');
      });
    });

    it('should deny access to non-admin users', async () => {
      const caller = appRouter.createCaller(createContext(regularUser));

      try {
        await caller.audit.checkDatabaseIntegrity();
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError<any>).code).toBe('FORBIDDEN');
      }
    });

    it('should deny access to unauthenticated users', async () => {
      const caller = appRouter.createCaller(createContext());

      try {
        await caller.audit.checkDatabaseIntegrity();
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError<any>).code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
      }
    });
  });

  describe('checkForeignKeys', () => {
    it('should return foreign key integrity status for admin users', async () => {
      const caller = appRouter.createCaller(createContext(adminUser));
      const result = await caller.audit.checkForeignKeys();

      expect(result).toBeDefined();
      expect(result.status).toMatch(/ok|error/);
    });

    it('should deny access to non-admin users', async () => {
      const caller = appRouter.createCaller(createContext(regularUser));

      try {
        await caller.audit.checkForeignKeys();
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError<any>).code).toBe('FORBIDDEN');
      }
    });
  });

  describe('getDatabaseStats', () => {
    it('should return database statistics for admin users', async () => {
      const caller = appRouter.createCaller(createContext(adminUser));
      const result = await caller.audit.getDatabaseStats();

      expect(result).toBeDefined();
      expect(result.status).toMatch(/ok|error/);
    });

    it('should include tables array in response', async () => {
      const caller = appRouter.createCaller(createContext(adminUser));
      const result = await caller.audit.getDatabaseStats();

      if (result.status === 'ok') {
        expect(Array.isArray(result.tables)).toBe(true);
      }
    });

    it('should deny access to non-admin users', async () => {
      const caller = appRouter.createCaller(createContext(regularUser));

      try {
        await caller.audit.getDatabaseStats();
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError<any>).code).toBe('FORBIDDEN');
      }
    });
  });

  describe('logAction', () => {
    it('should deny access to unauthenticated users', async () => {
      const caller = appRouter.createCaller(createContext());

      try {
        await caller.audit.logAction({
          action: 'test_action',
          entity: 'test_entity',
        });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError<any>).code).toMatch(/UNAUTHORIZED|FORBIDDEN/);
      }
    });
  });
});
