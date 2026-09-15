// Runs in the browser. Input groups are atomic controls; their icons are adornments.
export function inspectOverlaps() {
  const visible = el => {
    if (!el.getClientRects().length || getComputedStyle(el).visibility === "hidden") return false;
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches("details:not([open])") && !parent.querySelector(":scope > summary")?.contains(el)) return false;
    }
    return true;
  };
  const name = el => `${el.tagName}.${String(el.className).slice(0, 100)} ${el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 60) || ""}`;
  const rect = el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  };
  const issues = [];
  const selector = '.admin-input-group, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), select, textarea';
  const controls = [...document.querySelectorAll(selector)].filter(el => visible(el) && !el.closest('.sr-only, [role="listbox"], .admin-seat-grid') && !(el.matches("input") && el.closest(".admin-input-group")));
  for (const control of controls) {
    const field = control.closest("label.admin-label, .admin-filter-bar > label, .admin-field, .admin-form-row-control");
    if (!field || !visible(field) || getComputedStyle(field).display === "inline") continue;
    const a = rect(control), b = rect(field);
    if (a.left < b.left - 1 || a.right > b.right + 1) issues.push({ rule: "field-overflow", element: name(control), actual: { control: a, field: b, parent: name(field) } });
  }
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j];
    if (a.contains(b) || b.contains(a) || a.closest('[role="dialog"]') !== b.closest('[role="dialog"]')) continue;
    const x = rect(a), y = rect(b);
    if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) issues.push({ rule: "control-overlap", element: name(a), actual: { other: name(b), first: x, second: y } });
  }
  return { issues, checkedControls: controls.length };
}
