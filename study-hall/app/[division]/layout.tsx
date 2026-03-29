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
  const dark = "#0F172A";
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
  const darkMixTarget = { r: 10, g: 18, b: 40 };
  const rgb = hexToRgb(baseColor);
  const isLightAccent = pickReadableTextColor(baseColor) === "#0F172A";
  const heroStart = mixHexColor(baseColor, darkMixTarget, isLightAccent ? 0.74 : 0.34);
  const heroEnd = mixHexColor(baseColor, darkMixTarget, isLightAccent ? 0.54 : 0.14);
  const accentForeground = pickReadableTextColor(baseColor);
  const accentForegroundRgb = hexToRgb(accentForeground);
  const style = {
    "--division-color": baseColor,
    "--division-color-rgb": `${rgb.r} ${rgb.g} ${rgb.b}`,
    "--division-color-soft": mixHexColor(baseColor, { r: 255, g: 255, b: 255 }, 0.9),
    "--division-color-muted": mixHexColor(baseColor, { r: 255, g: 255, b: 255 }, 0.96),
    "--division-color-strong": heroStart,
    "--division-hero-end": heroEnd,
    "--division-on-accent": accentForeground,
    "--division-on-accent-muted": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.72)`,
    "--division-accent-surface": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.12)`,
    "--division-accent-surface-soft": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.08)`,
    "--division-accent-border": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.18)`,
    "--division-accent-outline": `rgb(${accentForegroundRgb.r} ${accentForegroundRgb.g} ${accentForegroundRgb.b} / 0.1)`,
  } as CSSProperties;

  return <div style={style}>{children}</div>;
}
