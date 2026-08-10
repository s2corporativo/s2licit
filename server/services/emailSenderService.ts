import { createHash } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { getEmailRuntimeConfig } from "../integrations/core/credentialResolver";

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_SUBJECT_CHARS = 512;
const MAX_TEXT_CHARS = 200_000;

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

interface TransportGeneration {
  fingerprint: string;
  transport: Transporter;
  inFlight: number;
  stale: boolean;
}

let activeGeneration: TransportGeneration | null = null;
const retiredGenerations = new Set<TransportGeneration>();

function configFingerprint(config: Awaited<ReturnType<typeof getEmailRuntimeConfig>>["smtp"]): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        secure: config.secure,
        from: config.from,
      }),
    )
    .digest("hex");
}

function createTransport(config: Awaited<ReturnType<typeof getEmailRuntimeConfig>>["smtp"]): Transporter {
  return nodemailer.createTransport({
    pool: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
}

function closeGeneration(generation: TransportGeneration): void {
  try {
    generation.transport.close();
  } finally {
    retiredGenerations.delete(generation);
    if (activeGeneration === generation) activeGeneration = null;
  }
}

function rotateTransport(
  config: Awaited<ReturnType<typeof getEmailRuntimeConfig>>["smtp"],
): TransportGeneration {
  const fingerprint = configFingerprint(config);
  if (activeGeneration?.fingerprint === fingerprint && !activeGeneration.stale) {
    activeGeneration.inFlight += 1;
    return activeGeneration;
  }

  if (activeGeneration) {
    activeGeneration.stale = true;
    retiredGenerations.add(activeGeneration);
    if (activeGeneration.inFlight === 0) closeGeneration(activeGeneration);
  }

  const next: TransportGeneration = {
    fingerprint,
    transport: createTransport(config),
    inFlight: 1,
    stale: false,
  };
  activeGeneration = next;
  return next;
}

function releaseTransport(generation: TransportGeneration): void {
  generation.inFlight = Math.max(0, generation.inFlight - 1);
  if (generation.stale && generation.inFlight === 0) closeGeneration(generation);
}

function validateInput(input: SendEmailInput): void {
  if (!input.to.trim()) throw new Error("Destinatário de e-mail é obrigatório.");
  if (!input.subject.trim()) throw new Error("Assunto do e-mail é obrigatório.");
  if (input.subject.length > MAX_SUBJECT_CHARS) {
    throw new Error(`Assunto excede ${MAX_SUBJECT_CHARS} caracteres.`);
  }
  if (input.text.length > MAX_TEXT_CHARS) {
    throw new Error(`Corpo do e-mail excede ${MAX_TEXT_CHARS} caracteres.`);
  }

  const attachments = input.attachments ?? [];
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`E-mail suporta no máximo ${MAX_ATTACHMENTS} anexos.`);
  }
  let totalBytes = 0;
  for (const attachment of attachments) {
    if (!attachment.filename.trim()) throw new Error("Anexo sem nome de arquivo.");
    if (attachment.content.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `Anexo ${attachment.filename} excede o limite de ${MAX_ATTACHMENT_BYTES} bytes.`,
      );
    }
    totalBytes += attachment.content.length;
  }
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error(`Anexos excedem o limite agregado de ${MAX_TOTAL_ATTACHMENT_BYTES} bytes.`);
  }
}

export async function isSmtpConfigured(): Promise<boolean> {
  const config = (await getEmailRuntimeConfig()).smtp;
  return Boolean(config.host && config.user && config.password);
}

/**
 * Reutiliza conexões SMTP com pool bounded (3 conexões, 100 mensagens por
 * conexão). Mudança de configuração cria uma nova geração; a anterior só é
 * fechada após seus envios em voo terminarem, evitando interrupção durante
 * rotação administrativa de credenciais.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  validateInput(input);
  const config = (await getEmailRuntimeConfig()).smtp;
  if (!config.host || !config.user || !config.password) {
    throw new Error(
      "SMTP não configurado. Cadastre servidor, usuário e senha na Central de Integrações.",
    );
  }

  const generation = rotateTransport(config);
  try {
    const info = await generation.transport.sendMail({
      from: config.from || config.user,
      to: input.to.trim(),
      subject: input.subject.trim(),
      text: input.text,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
    const messageId = typeof info.messageId === "string" ? info.messageId.trim() : "";
    if (!messageId) throw new Error("SMTP aceitou a operação sem retornar Message-ID.");
    return { messageId };
  } finally {
    releaseTransport(generation);
  }
}

/** Fecha pools explicitamente em shutdown/testes. */
export function closeEmailTransports(): void {
  if (activeGeneration) {
    activeGeneration.stale = true;
    retiredGenerations.add(activeGeneration);
    if (activeGeneration.inFlight === 0) closeGeneration(activeGeneration);
  }
  for (const generation of Array.from(retiredGenerations)) {
    generation.stale = true;
    if (generation.inFlight === 0) closeGeneration(generation);
  }
}
