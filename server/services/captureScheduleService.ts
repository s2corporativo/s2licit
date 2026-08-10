import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../db";
import { scraperConfigs } from "../../drizzle/schema";
import { enqueueCaptureJob } from "./captureCoreService";
import { logger } from "../_core/logger";

export const CAPTURE_SCHEDULE_TIMEZONE = "America/Sao_Paulo";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface ScheduledCaptureFailure {
  scraperConfigId: number;
  error: string;
}

export interface ScheduledCaptureRunResult {
  evaluated: number;
  initialized: number;
  enqueued: number;
  reused: number;
  failures: ScheduledCaptureFailure[];
}

function parseScheduleTime(value: string | null | undefined): {
  hour: number;
  minute: number;
} | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year")!,
    month: values.get("month")!,
    day: values.get("day")!,
    hour: values.get("hour")!,
    minute: values.get("minute")!,
    second: values.get("second")!,
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - date.getTime();
}

function zonedLocalToUtc(
  parts: Omit<ZonedParts, "second"> & { second?: number },
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );

  const firstOffset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let resolved = utcGuess - firstOffset;
  const secondOffset = timeZoneOffsetMs(new Date(resolved), timeZone);
  if (secondOffset !== firstOffset) resolved = utcGuess - secondOffset;

  return new Date(resolved);
}

function addCalendarDays(
  date: Pick<ZonedParts, "year" | "month" | "day">,
  days: number,
): Pick<ZonedParts, "year" | "month" | "day"> {
  const cursor = new Date(Date.UTC(date.year, date.month - 1, date.day));
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
    day: cursor.getUTCDate(),
  };
}

function recurrenceDays(scraperType: string): number {
  return scraperType.trim().toLowerCase() === "tambasa" ? 7 : 1;
}

function scheduledInstantForLocalDate(
  localDate: Pick<ZonedParts, "year" | "month" | "day">,
  scheduleTime: { hour: number; minute: number },
): Date {
  return zonedLocalToUtc(
    {
      ...localDate,
      hour: scheduleTime.hour,
      minute: scheduleTime.minute,
      second: 0,
    },
    CAPTURE_SCHEDULE_TIMEZONE,
  );
}

export function computeInitialCaptureNextRun(input: {
  scraperType: string;
  scheduleTime: string;
  lastRunAt?: Date | null;
  now?: Date;
}): Date {
  const schedule = parseScheduleTime(input.scheduleTime);
  if (!schedule) {
    throw new Error(`Horário de captura inválido: ${input.scheduleTime}`);
  }

  const now = input.now ?? new Date();
  const intervalDays = recurrenceDays(input.scraperType);

  if (input.lastRunAt) {
    const lastLocal = zonedParts(input.lastRunAt, CAPTURE_SCHEDULE_TIMEZONE);
    const nextLocalDate = addCalendarDays(lastLocal, intervalDays);
    return scheduledInstantForLocalDate(nextLocalDate, schedule);
  }

  const today = zonedParts(now, CAPTURE_SCHEDULE_TIMEZONE);
  return scheduledInstantForLocalDate(today, schedule);
}

export function advanceCaptureNextRun(input: {
  scraperType: string;
  scheduleTime: string;
  currentNextRunAt: Date;
  now?: Date;
}): Date {
  const schedule = parseScheduleTime(input.scheduleTime);
  if (!schedule) {
    throw new Error(`Horário de captura inválido: ${input.scheduleTime}`);
  }

  const now = input.now ?? new Date();
  const intervalDays = recurrenceDays(input.scraperType);
  let local = zonedParts(input.currentNextRunAt, CAPTURE_SCHEDULE_TIMEZONE);
  let next = input.currentNextRunAt;

  // Avança calendário local, não milissegundos fixos, para manter o horário
  // correto mesmo em zonas que adotem/alterem DST no futuro.
  do {
    const nextLocalDate = addCalendarDays(local, intervalDays);
    next = scheduledInstantForLocalDate(nextLocalDate, schedule);
    local = zonedParts(next, CAPTURE_SCHEDULE_TIMEZONE);
  } while (next.getTime() <= now.getTime());

  return next;
}

async function initializeMissingNextRuns(now: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const rows = await db
    .select({
      id: scraperConfigs.id,
      scraperType: scraperConfigs.scraperType,
      scheduleTime: scraperConfigs.scheduleTime,
      lastRunAt: scraperConfigs.lastRunAt,
    })
    .from(scraperConfigs)
    .where(
      and(
        eq(scraperConfigs.enabled, "yes"),
        eq(scraperConfigs.tosAprovado, true),
        isNull(scraperConfigs.nextRunAt),
      ),
    );

  let initialized = 0;
  for (const config of rows) {
    if (!config.scheduleTime) continue;

    try {
      const nextRunAt = computeInitialCaptureNextRun({
        scraperType: config.scraperType,
        scheduleTime: config.scheduleTime,
        lastRunAt: config.lastRunAt,
        now,
      });

      // Compare-and-set evita uma instância sobrescrever inicialização feita
      // simultaneamente por outra instância do S2.
      await db
        .update(scraperConfigs)
        .set({ nextRunAt })
        .where(
          and(
            eq(scraperConfigs.id, config.id),
            isNull(scraperConfigs.nextRunAt),
          ),
        );
      initialized += 1;
    } catch (error) {
      logger.warn(
        `[CaptureSchedule] Config #${config.id} não inicializada: ${(error as Error).message}`,
      );
    }
  }

  return initialized;
}

export async function runDueScheduledCaptures(
  now = new Date(),
): Promise<ScheduledCaptureRunResult> {
  const db = await getDb();
  if (!db) {
    return {
      evaluated: 0,
      initialized: 0,
      enqueued: 0,
      reused: 0,
      failures: [],
    };
  }

  const initialized = await initializeMissingNextRuns(now);

  const due = await db
    .select({
      id: scraperConfigs.id,
      scraperType: scraperConfigs.scraperType,
      scheduleTime: scraperConfigs.scheduleTime,
      nextRunAt: scraperConfigs.nextRunAt,
    })
    .from(scraperConfigs)
    .where(
      and(
        eq(scraperConfigs.enabled, "yes"),
        eq(scraperConfigs.tosAprovado, true),
        or(
          lte(scraperConfigs.nextRunAt, now),
          isNull(scraperConfigs.nextRunAt),
        ),
      ),
    )
    .orderBy(asc(scraperConfigs.nextRunAt));

  let enqueued = 0;
  let reused = 0;
  const failures: ScheduledCaptureFailure[] = [];

  for (const config of due) {
    if (!config.scheduleTime || !config.nextRunAt) continue;

    try {
      const job = await enqueueCaptureJob({
        scraperConfigId: config.id,
        mode: "full",
        trigger: "scheduled",
        priority: 30,
        meta: {
          scheduledFor: config.nextRunAt.toISOString(),
          timezone: CAPTURE_SCHEDULE_TIMEZONE,
        },
      });

      const nextRunAt = advanceCaptureNextRun({
        scraperType: config.scraperType,
        scheduleTime: config.scheduleTime,
        currentNextRunAt: config.nextRunAt,
        now,
      });

      await db
        .update(scraperConfigs)
        .set({ nextRunAt })
        .where(
          and(
            eq(scraperConfigs.id, config.id),
            eq(scraperConfigs.nextRunAt, config.nextRunAt),
          ),
        );

      if (job.reused) reused += 1;
      else enqueued += 1;

      logger.info(
        `[CaptureSchedule] Config #${config.id}: job #${job.id} ` +
          `${job.reused ? "reutilizado" : "enfileirado"}; próxima execução ${nextRunAt.toISOString()}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ scraperConfigId: config.id, error: message });
      logger.error(
        `[CaptureSchedule] Falha ao enfileirar config #${config.id}: ${message}`,
      );
    }
  }

  return {
    evaluated: due.length,
    initialized,
    enqueued,
    reused,
    failures,
  };
}
