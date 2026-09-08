"use client";

/**
 * 알림음과 브라우저 알림.
 * 대시보드 교시 알림과 직원 채팅이 공유한다.
 */

export type NotificationPermissionState = NotificationPermission | "unsupported";

const BEEP_FREQUENCY_HZ = 880;
const BEEP_DURATION_SEC = 0.5;
const BEEP_GAIN = 0.3;

let sharedAudioContext: AudioContext | null = null;

/**
 * 짧은 알림음.
 * 탭에 사용자 제스처가 한 번도 없었으면 AudioContext 가 suspended 상태라 소리가 나지 않는다.
 * 이는 브라우저 정책이므로 조용히 넘어간다.
 */
export function playNotificationBeep() {
  try {
    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContext();
    }

    const ctx = sharedAudioContext;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = BEEP_FREQUENCY_HZ;
    gain.gain.setValueAtTime(BEEP_GAIN, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + BEEP_DURATION_SEC);
    osc.start();
    osc.stop(ctx.currentTime + BEEP_DURATION_SEC);
  } catch {
    // 브라우저 미지원 시 무시
  }
}

export function getBrowserNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

/**
 * tag 를 주면 같은 tag 의 알림이 하나로 합쳐진다.
 * onClick 은 알림을 눌렀을 때 창을 앞으로 가져오고 이동시키는 데 쓴다.
 */
export function showBrowserNotification(
  title: string,
  body: string,
  options: { tag?: string; onClick?: () => void } = {},
) {
  if (getBrowserNotificationPermission() !== "granted") {
    return;
  }

  try {
    const notification = new Notification(title, { body, tag: options.tag });

    if (options.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }
  } catch {
    // 일부 브라우저는 서비스워커 없이 Notification 생성을 막는다
  }
}

/** 반드시 사용자 제스처 안에서 호출한다. Safari·Chrome 은 그 밖의 요청을 무시한다. */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  return Notification.requestPermission();
}
