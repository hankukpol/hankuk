export const SMS_MARKETING_CONSENT_VERSION = "police-sms-marketing-v1";

export const SMS_MARKETING_CONSENT_TEXT =
  "한국경찰학원의 강의, 이벤트, 합격예측 프로모션 정보를 문자메시지로 받는 데 동의합니다. 동의하지 않아도 합격예측 서비스를 이용할 수 있으며, 언제든 문자 수신 설정에서 철회할 수 있습니다.";

export const SMS_MARKETING_CONSENT_COPY_BY_VERSION: Readonly<Record<string, string>> = {
  [SMS_MARKETING_CONSENT_VERSION]: SMS_MARKETING_CONSENT_TEXT,
};

export function isSmsMarketingConsentActive(user: {
  smsMarketingConsentAt: Date | null;
  smsMarketingConsentWithdrawnAt: Date | null;
}): boolean {
  return Boolean(user.smsMarketingConsentAt && !user.smsMarketingConsentWithdrawnAt);
}

export function buildSmsMarketingConsentUpdate(
  user: {
    smsMarketingConsentAt: Date | null;
    smsMarketingConsentVersion: string | null;
    smsMarketingConsentWithdrawnAt: Date | null;
  },
  consented: boolean,
  now: Date
) {
  if (consented) {
    const alreadyCurrent =
      isSmsMarketingConsentActive(user) &&
      user.smsMarketingConsentVersion === SMS_MARKETING_CONSENT_VERSION;
    if (alreadyCurrent) {
      return null;
    }

    return {
      smsMarketingConsentAt: now,
      smsMarketingConsentVersion: SMS_MARKETING_CONSENT_VERSION,
      smsMarketingConsentWithdrawnAt: null,
    };
  }

  if (!isSmsMarketingConsentActive(user)) {
    return null;
  }

  return {
    smsMarketingConsentWithdrawnAt: now,
  };
}
