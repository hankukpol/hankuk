import "server-only";

export interface PasswordResetMailParams {
  to: string;
  resetUrl: string;
  expiresMinutes: number;
}

export interface PasswordResetMailResult {
  sent: boolean;
  reason?: string;
}

interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

function buildMailMessage(params: PasswordResetMailParams): MailMessage {
  const subject = process.env.PASSWORD_RESET_MAIL_SUBJECT ?? "[소방 합격예측] 비밀번호 재설정 안내";
  const text = [
    "비밀번호 재설정 요청이 접수되었습니다.",
    `아래 링크를 ${params.expiresMinutes}분 이내에 열어 새 비밀번호를 설정해 주세요.`,
    "",
    params.resetUrl,
    "",
    "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
  ].join("\n");
  const html = [
    "<p>비밀번호 재설정 요청이 접수되었습니다.</p>",
    `<p>아래 링크를 <strong>${params.expiresMinutes}분</strong> 이내에 열어 새 비밀번호를 설정해 주세요.</p>`,
    `<p><a href=\"${params.resetUrl}\">비밀번호 재설정 링크 열기</a></p>`,
    "<p>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>",
  ].join("");
  return { subject, text, html };
}

function hasResendConfig(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

function hasWebhookConfig(): boolean {
  return Boolean(process.env.PASSWORD_RESET_MAIL_WEBHOOK_URL);
}

async function sendViaResend(params: PasswordResetMailParams): Promise<PasswordResetMailResult> {
  const message = buildMailMessage(params);
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
    console.error("[mail] resend failed", response.status, bodyText);
    return { sent: false, reason: "RESEND_FAILED" };
  }

  return { sent: true };
}

async function sendViaWebhook(params: PasswordResetMailParams): Promise<PasswordResetMailResult> {
  const message = buildMailMessage(params);
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
      subject: message.subject,
      text: message.text,
      html: message.html,
      resetUrl: params.resetUrl,
      expiresMinutes: params.expiresMinutes,
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    console.error("[mail] webhook failed", response.status, bodyText);
    return { sent: false, reason: "WEBHOOK_FAILED" };
  }

  return { sent: true };
}

export async function sendPasswordResetEmail(params: PasswordResetMailParams): Promise<PasswordResetMailResult> {
  try {
    if (hasResendConfig()) {
      return await sendViaResend(params);
    }

    if (hasWebhookConfig()) {
      return await sendViaWebhook(params);
    }

    return { sent: false, reason: "MAIL_NOT_CONFIGURED" };
  } catch (error) {
    console.error("[mail] failed to send password reset email", error);
    return { sent: false, reason: "SEND_FAILED" };
  }
}
