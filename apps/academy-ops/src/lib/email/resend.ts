import { normalizeEmail } from "@/lib/email/utils";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type ResendTag = {
  name: string;
  value: string;
};

type SendResendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tags?: ResendTag[];
  idempotencyKey?: string;
};

type ResendSuccessResponse = {
  id?: string;
};

type ResendErrorResponse = {
  error?: string;
  message?: string;
};

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const from = process.env.RESEND_FROM_EMAIL?.trim() ?? "";
  return {
    apiKey,
    from,
  };
}

export function hasResendEmailConfig() {
  const { apiKey, from } = getResendConfig();
  return Boolean(apiKey && normalizeEmail(from));
}

export async function sendResendEmail(input: SendResendEmailInput) {
  const { apiKey, from } = getResendConfig();

  if (!apiKey || !normalizeEmail(from)) {
    throw new Error("영수증 이메일 발송 설정이 아직 완료되지 않았습니다.");
  }

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: input.tags,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as ResendSuccessResponse | ResendErrorResponse | null;

  if (!response.ok) {
    const message =
      (payload && "message" in payload && payload.message) ||
      (payload && "error" in payload && payload.error) ||
      `Resend API 요청이 실패했습니다. (${response.status})`;
    throw new Error(message);
  }

  return {
    id: payload && "id" in payload && typeof payload.id === "string" ? payload.id : null,
  };
}
