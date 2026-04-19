# Class-pass Local Instructions

These instructions apply when working inside `apps/class-pass`.

## Design Defaults

- For UI, layout, styling, component polish, or prototype work in this app, read `DESIGN.md` before making visual changes.
- Preserve the current Apple-inspired visual direction unless the user explicitly asks for a new direction.
- Prefer adapting existing components, spacing, and interaction patterns over introducing a disconnected visual language.
- Ground design changes in real context first: inspect the current route, relevant components, existing screenshots, and Figma references before redesigning.
- When context is missing, ask for the smallest missing artifact that will unblock good design work, usually a screenshot, route, or Figma node.

## Design Execution

- Default to one strong implementation that fits the product. Explore 2-3 distinct directions only when the user asks for options or the task is explicitly exploratory.
- Use placeholders instead of weak fake assets when imagery or icons are missing.
- Keep desktop and mobile behavior intentional; do not ship a design change that only works at one breakpoint.
- Visually verify meaningful UI changes in a browser before finalizing.

## Skill

- For larger design-system or front-end design work, use `$claude-design-codex`.
