import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

interface PasswordResetCodeEmailParams {
  to: string;
  name?: string | null;
  username?: string | null;
  code: string;
  expireMinutes: number;
}

interface PasswordResetCodeEmailResult {
  previewFile?: string;
}

interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

function hasResendConfig(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

function hasWebhookConfig(): boolean {
  return Boolean(process.env.PASSWORD_RESET_MAIL_WEBHOOK_URL);
}

export function isMailerConfigured(): boolean {
  return hasResendConfig() || hasWebhookConfig();
}

function buildMessage(params: PasswordResetCodeEmailParams): MailMessage {
  const subject =
    process.env.PASSWORD_RESET_CODE_MAIL_SUBJECT ?? "[합격예측] 비밀번호 재설정 인증코드 안내";
  const greetingName = params.name?.trim() || params.username?.trim() || "회원";
  const text = [
    `${greetingName}님, 비밀번호 재설정 인증코드를 안내드립니다.`,
    "",
    `인증코드: ${params.code}`,
    `유효시간: ${params.expireMinutes}분`,
    "",
    "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
  ].join("\n");
  const html = [
    `<p>${greetingName}님, 비밀번호 재설정 인증코드를 안내드립니다.</p>`,
    `<p><strong>인증코드:</strong> ${params.code}</p>`,
    `<p><strong>유효시간:</strong> ${params.expireMinutes}분</p>`,
    "<p>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>",
  ].join("");

  return { subject, text, html };
}

async function sendViaResend(params: PasswordResetCodeEmailParams): Promise<void> {
  const message = buildMessage(params);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
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

async function sendViaWebhook(params: PasswordResetCodeEmailParams): Promise<void> {
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
      name: params.name,
      username: params.username,
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

async function writePreviewFile(params: PasswordResetCodeEmailParams): Promise<string> {
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

export async function sendPasswordResetCodeEmail(
  params: PasswordResetCodeEmailParams
): Promise<PasswordResetCodeEmailResult> {
  if (hasResendConfig()) {
    await sendViaResend(params);
    return {};
  }

  if (hasWebhookConfig()) {
    await sendViaWebhook(params);
    return {};
  }

  return {
    previewFile: await writePreviewFile(params),
  };
}
