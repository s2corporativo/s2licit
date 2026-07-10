/**
 * Logger utility for system actions and debugging
 */

export interface LogEntry {
  timestamp: Date;
  action: string;
  userId?: number;
  details?: Record<string, any>;
  level: "info" | "warn" | "error";
}

const logs: LogEntry[] = [];

export function createLogger(namespace: string) {
  return {
    info: (action: string, details?: Record<string, any>) => {
      const entry: LogEntry = {
        timestamp: new Date(),
        action: `[${namespace}] ${action}`,
        details,
        level: "info",
      };
      logs.push(entry);
      console.log(`[INFO] ${entry.action}`, details);
    },
    warn: (action: string, details?: Record<string, any>) => {
      const entry: LogEntry = {
        timestamp: new Date(),
        action: `[${namespace}] ${action}`,
        details,
        level: "warn",
      };
      logs.push(entry);
      console.warn(`[WARN] ${entry.action}`, details);
    },
    error: (action: string, details?: Record<string, any>) => {
      const entry: LogEntry = {
        timestamp: new Date(),
        action: `[${namespace}] ${action}`,
        details,
        level: "error",
      };
      logs.push(entry);
      console.error(`[ERROR] ${entry.action}`, details);
    },
  };
}

export async function logAction(
  action: string,
  userId?: number,
  details?: Record<string, any>
): Promise<void> {
  const entry: LogEntry = {
    timestamp: new Date(),
    action,
    userId,
    details,
    level: "info",
  };
  logs.push(entry);
  console.log(`[ACTION] ${action}`, { userId, ...details });
}

export function getLogs(): LogEntry[] {
  return logs;
}

export function clearLogs(): void {
  logs.length = 0;
}
