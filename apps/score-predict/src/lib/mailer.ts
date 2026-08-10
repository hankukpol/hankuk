import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { TenantType } from "@/lib/tenant";

export type AccountEmailPurpose =
  | "PASSWORD_RESET"
  | "EMAIL_VERIFICATION"
  | "PASSWORD_CHANGED";

interface AccountCodeEmailParams {
  tenantType: TenantType;
  purpose: AccountEmailPurpose;
  to: string;
  name?: string | null;
  identity?: string | null;
  code?: string;
  expireMinutes?: number;
}

interface AccountCodeEmailResult {
  previewFile?: string;
}

interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

interface TenantSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  appPassword: string;
  from: string;
}

function getMailFrom(tenantType: TenantType): string {
  const tenantFrom =
    tenantType === "police" ? process.env.POLICE_MAIL_FROM : process.env.FIRE_MAIL_FROM;
  return tenantFrom?.trim() || process.env.MAIL_FROM?.trim() || "";
}

function hasResendConfig(tenantType: TenantType): boolean {
  return Boolean(process.env.RESEND_API_KEY && getMailFrom(tenantType));
}

function getTenantSmtpEnv(
  tenantType: TenantType,
  key: "HOST" | "PORT" | "SECURE" | "USER" | "APP_PASSWORD"
): string {
  const prefix = tenantType === "police" ? "POLICE" : "FIRE";
  return process.env[`${prefix}_SMTP_${key}`]?.trim() || "";
}

function getTenantSmtpConfig(tenantType: TenantType): TenantSmtpConfig | null {
  const host = getTenantSmtpEnv(tenantType, "HOST");
  const portText = getTenantSmtpEnv(tenantType, "PORT");
  const user = getTenantSmtpEnv(tenantType, "USER");
  const appPassword = getTenantSmtpEnv(tenantType, "APP_PASSWORD");
  const from = getMailFrom(tenantType);
  const port = Number(portText);

  if (
    !host ||
    !portText ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !appPassword ||
    !from
  ) {
    return null;
  }

  const secureText = getTenantSmtpEnv(tenantType, "SECURE").toLowerCase();
  const secure = secureText ? secureText === "true" : port === 465;

  return { host, port, secure, user, appPassword, from };
}

function hasTenantSmtpConfig(tenantType: TenantType): boolean {
  return getTenantSmtpConfig(tenantType) !== null;
}

function hasWebhookConfig(): boolean {
  return Boolean(process.env.PASSWORD_RESET_MAIL_WEBHOOK_URL);
}

export function isMailerConfigured(tenantType: TenantType): boolean {
  return hasResendConfig(tenantType) || hasTenantSmtpConfig(tenantType) || hasWebhookConfig();
}

export function isLocalMailPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.PASSWORD_RESET_DEBUG_LINK === "true";
}

function getServiceName(tenantType: TenantType): string {
  return tenantType === "police" ? "경찰 합격예측" : "소방 합격예측";
}

function buildMessage(params: AccountCodeEmailParams): MailMessage {
  const serviceName = getServiceName(params.tenantType);
  const greetingName = params.name?.trim() || params.identity?.trim() || "회원";

  if (params.purpose === "PASSWORD_CHANGED") {
    const subject = `[${serviceName}] 비밀번호 변경 안내`;
    const text = [
      `${greetingName}님, 비밀번호가 변경되었습니다.`,
      "",
      "본인이 변경하지 않았다면 즉시 학원 관리자에게 문의해 주세요.",
    ].join("\n");
    const html = [
      `<p>${greetingName}님, 비밀번호가 변경되었습니다.</p>`,
      "<p>본인이 변경하지 않았다면 즉시 학원 관리자에게 문의해 주세요.</p>",
    ].join("");
    return { subject, text, html };
  }

  const isVerification = params.purpose === "EMAIL_VERIFICATION";
  const actionText = isVerification ? "이메일 확인" : "비밀번호 재설정";
  const subject = `[${serviceName}] ${actionText} 인증코드 안내`;
  const text = [
    `${greetingName}님, ${actionText} 인증코드를 안내드립니다.`,
    "",
    `인증코드: ${params.code ?? ""}`,
    `유효시간: ${params.expireMinutes ?? 15}분`,
    "",
    "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
  ].join("\n");
  const html = [
    `<p>${greetingName}님, ${actionText} 인증코드를 안내드립니다.</p>`,
    `<p><strong>인증코드:</strong> ${params.code ?? ""}</p>`,
    `<p><strong>유효시간:</strong> ${params.expireMinutes ?? 15}분</p>`,
    "<p>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>",
  ].join("");

  return { subject, text, html };
}

async function sendViaResend(params: AccountCodeEmailParams): Promise<void> {
  const message = buildMessage(params);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getMailFrom(params.tenantType),
      to: [params.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`[mailer] resend failed (${response.status}): ${bodyText}`);
  }
}

async function sendViaTenantSmtp(params: AccountCodeEmailParams): Promise<void> {
  const config = getTenantSmtpConfig(params.tenantType);
  if (!config) {
    throw new Error(`[mailer] ${params.tenantType} SMTP configuration is incomplete.`);
  }

  const message = buildMessage(params);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.appPassword,
    },
    authMethod: "LOGIN",
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    const result = await transporter.sendMail({
      from: config.from,
      to: params.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (result.rejected.length > 0) {
      throw new Error(`recipient rejected: ${result.rejected.join(", ")}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown SMTP error";
    throw new Error(`[mailer] ${params.tenantType} SMTP delivery failed: ${reason}`);
  } finally {
    transporter.close();
  }
}

async function sendViaWebhook(params: AccountCodeEmailParams): Promise<void> {
  const message = buildMessage(params);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.PASSWORD_RESET_MAIL_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.PASSWORD_RESET_MAIL_WEBHOOK_TOKEN}`;
  }

  const response = await fetch(String(process.env.PASSWORD_RESET_MAIL_WEBHOOK_URL), {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: params.to,
      tenantType: params.tenantType,
      purpose: params.purpose,
      name: params.name,
      identity: params.identity,
      code: params.code,
      expireMinutes: params.expireMinutes,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`[mailer] webhook failed (${response.status}): ${bodyText}`);
  }
}

async function writePreviewFile(params: AccountCodeEmailParams): Promise<string> {
  const previewDir = path.join(process.cwd(), ".mail-preview");
  const fileName = `password-reset-code-${Date.now()}-${randomUUID()}.txt`;
  const previewPath = path.join(previewDir, fileName);
  const message = buildMessage(params);

  await mkdir(previewDir, { recursive: true });
  await writeFile(
    previewPath,
    [
      `To: ${params.to}`,
      `Subject: ${message.subject}`,
      "",
      message.text,
    ].join("\n"),
    "utf8"
  );

  return path.join(".mail-preview", fileName);
}

export async function sendAccountCodeEmail(
  params: AccountCodeEmailParams
): Promise<AccountCodeEmailResult> {
  if (hasResendConfig(params.tenantType)) {
    await sendViaResend(params);
    return {};
  }

  if (hasTenantSmtpConfig(params.tenantType)) {
    await sendViaTenantSmtp(params);
    return {};
  }

  if (hasWebhookConfig()) {
    await sendViaWebhook(params);
    return {};
  }

  if (isLocalMailPreviewEnabled()) {
    return {
      previewFile: await writePreviewFile(params),
    };
  }

  throw new Error(`[mailer] ${params.tenantType} mail delivery is not configured.`);
}

export async function sendPasswordResetCodeEmail(
  params: Omit<AccountCodeEmailParams, "purpose">
): Promise<AccountCodeEmailResult> {
  return sendAccountCodeEmail({ ...params, purpose: "PASSWORD_RESET" });
}
