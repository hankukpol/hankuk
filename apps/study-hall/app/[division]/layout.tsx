import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { getDivisionBySlug } from "@/lib/services/division.service";

export const revalidate = 300;

function normalizeHexColor(value: string) {
  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }

  return "#1B4FBB";
}

function hexToRgb(value: string) {
  const normalized = normalizeHexColor(value);

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function mixChannel(left: number, right: number, weight: number) {
  return Math.round(left * (1 - weight) + right * weight);
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHexColor(value: string, mixWith: { r: number; g: number; b: number }, weight: number) {
  const rgb = hexToRgb(value);

  return rgbToHex(
    mixChannel(rgb.r, mixWith.r, weight),
    mixChannel(rgb.g, mixWith.g, weight),
    mixChannel(rgb.b, mixWith.b, weight),
  );
}

function toLinearChannel(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(rgb: { r: number; g: number; b: number }) {
  return (
    0.2126 * toLinearChannel(rgb.r) +
    0.7152 * toLinearChannel(rgb.g) +
    0.0722 * toLinearChannel(rgb.b)
  );
}

function getContrastRatio(leftHex: string, rightHex: string) {
  const left = getRelativeLuminance(hexToRgb(leftHex));
  const right = getRelativeLuminance(hexToRgb(rightHex));
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);

  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableTextColor(backgroundHex: string) {
  const dark = "#0a0a0a";
  const light = "#FFFFFF";

  return getContrastRatio(backgroundHex, dark) >= getContrastRatio(backgroundHex, light)
    ? dark
    : light;
}

type DivisionLayoutProps = {
  children: ReactNode;
  params: {
    division: string;
  };
};

export default async function DivisionLayout({ children, params }: DivisionLayoutProps) {
  const division = await getDivisionBySlug(params.division);

  if (!division) {
    notFound();
  }

  const baseColor = normalizeHexColor(division.color);
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const darkMixTarget = { r: 10, g: 18, b: 40 };
  const rgb = hexToRgb(baseColor);
  const isLightAccent = pickReadableTextColor(baseColor) === "#0a0a0a";
  const heroStart = mixHexColor(baseColor, darkMixTarget, isLightAccent ? 0.74 : 0.34);
  const heroEnd = mixHexColor(baseColor, darkMixTarget, isLightAccent ? 0.54 : 0.14);
  const accentForeground = pickReadableTextColor(baseColor);
  const accentForegroundRgb = hexToRgb(accentForeground);

  // DESIGN.md 2절: 강조색은 DB 직렬 색상 하나에서 파생한다.
  // 컴포넌트는 --admin-accent* 변수만 사용하고 경찰/소방을 판단해 색을 하드코딩하지 않는다.
  const accentHover = mixHexColor(baseColor, black, 0.15);
  const accentSoft = mixHexColor(baseColor, white, 0.95);
  const accentTint = mixHexColor(baseColor, white, 0.88);
  const accentLine = mixHexColor(baseColor, white, 0.75);
  const toTriple = (value: string) => {
    const parsed = hexToRgb(value);
    return `${parsed.r} ${parsed.g} ${parsed.b}`;
  };

  const style = {
    "--admin-accent": baseColor,
    "--admin-chart-1": baseColor,
    "--admin-accent-rgb": `${rgb.r} ${rgb.g} ${rgb.b}`,
    "--admin-accent-hover": accentHover,
    "--admin-accent-hover-rgb": toTriple(accentHover),
    "--admin-accent-soft": accentSoft,
    "--admin-accent-soft-rgb": toTriple(accentSoft),
    "--admin-accent-tint": accentTint,
    "--admin-accent-tint-rgb": toTriple(accentTint),
    "--admin-accent-line": accentLine,
    "--admin-accent-line-rgb": toTriple(accentLine),
    "--admin-on-accent": accentForeground,

    // 레거시 별칭 (기존 마크업의 var(--division-*) 참조 유지)
    "--division-color": baseColor,
    "--division-color-rgb": `${rgb.r} ${rgb.g} ${rgb.b}`,
    "--division-color-light": accentTint,
    "--division-color-soft": accentSoft,
    "--division-color-muted": accentSoft,
    "--division-color-dark": accentHover,
    "--division-color-strong": heroStart,
    "--division-hero-end": heroEnd,
    "--division-on-accent": accentForeground,
    "--division-on-accent-muted": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.72)`,
    "--division-accent-surface": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.12)`,
    "--division-accent-surface-soft": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.08)`,
    "--division-accent-border": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.18)`,
    "--division-accent-outline": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.1)`,
  } as CSSProperties;

  return (
    <div style={style} data-division={division.slug}>
      {children}
    </div>
  );
}
