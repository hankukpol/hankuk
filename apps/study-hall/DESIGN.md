# Study Hall Design Tokens

## Atmosphere / Signature

Study Hall is a dense Korean academy operations console. The interface should feel quiet, legible, and task-first, with compact controls, clear borders, and one branch accent color.

## Color

- `--background` `#F7F7F5`: app background.
- `--foreground` `#191F28`: primary text, never pure black.
- `--muted` `#6B7684`: secondary text.
- `--border` `#EBEBEB`: page and control borders.
- `--card` `#FFFFFF`: cards, modals, tables, form surfaces.
- `--division-color` `#1B4FBB`: primary action and selected state.
- `--division-color-light` `#EBF0FB`: quiet selected background.
- `--division-color-dark` `#0D2D6B`: high-emphasis branch accent.
- `--division-color-soft` `#EEF4FF`: soft accent surface.
- `--division-on-accent` `#FFFFFF`: text on primary action.
- Semantic Tailwind neutrals map to the same system: slate text, slate borders, white cards, emerald success, rose/red destructive, amber warning.

## Typography

- Font stack: `var(--font-pretendard), Pretendard, sans-serif`.
- Page title: 30px, 800, tight line height.
- Section title: 24px, 700, tight line height.
- Body: 14px to 16px, 400 to 500, 1.5 line height.
- Labels: 12px to 14px, 600, normal letter spacing except existing compact uppercase metadata.
- Numerals in dashboards use the same font with heavier weight for scan speed.

## Spacing

- Base unit: 4px.
- Compact controls: 40px to 44px height, 12px to 16px horizontal padding.
- Modal field gaps: 16px to 20px.
- Card padding: 24px on desktop, reduced by responsive container rules.
- Form radius: 10px for inputs and panels, full radius only for primary pill buttons already established in the app.

## Components

- Inputs: white background, slate 200 border, 10px radius, 14px text, focus shifts to slate 400.
- Primary button: `--division-color` background, white text, full radius, subtle opacity hover, disabled opacity.
- Secondary button: white background, slate border, slate text, subtle slate hover.
- Cards and modals: white background, slate border, restrained shadow, no decorative color bars.
- Tables and lists: dense rows with borders, muted metadata, icon buttons from lucide-react.

## Motion

- Use existing button press scale and short transitions.
- Motion is limited to transform, opacity, and color changes.
- Loading states use lucide spinner rotation only.

## Depth

- Depth is border-first with one soft operational shadow.
- Do not add glow, glass, gradient orbs, or heavy decorative shadows.
