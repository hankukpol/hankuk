type ModalOptions = {
  onClose: () => void
  closeDisabled?: boolean
  priority?: number
}

type Entry = { panel: HTMLElement; options: ModalOptions; previousFocus: HTMLElement | null; order: number; mountedPriority: number }
const focusableSelector = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable="true"]'

function visible(element: HTMLElement) {
  if (!element.isConnected || element.closest('[hidden],[inert]')) return false
  const view = element.ownerDocument.defaultView!
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = view.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}

function focusables(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled,input[type="hidden"]') && visible(element))
}

function priority(entry: Entry) {
  if (!entry.panel.isConnected) return entry.mountedPriority
  let result = 0
  for (let node: HTMLElement | null = entry.panel; node; node = node.parentElement) {
    const z = Number.parseInt(node.ownerDocument.defaultView!.getComputedStyle(node).zIndex, 10)
    if (Number.isFinite(z)) result = Math.max(result, z)
  }
  return result || entry.options.priority || 0
}

class DialogStack {
  entries: Entry[] = []
  private inert = new Map<HTMLElement, string | null>()
  private overflow: string
  private overflowPriority: string
  private rootOverflow: string
  private rootOverflowPriority: string
  private returnFocus: HTMLElement | null
  private observer: MutationObserver
  private order = 0

  constructor(private document: Document) {
    this.overflow = document.body.style.getPropertyValue('overflow')
    this.overflowPriority = document.body.style.getPropertyPriority('overflow')
    this.rootOverflow = document.documentElement.style.getPropertyValue('overflow')
    this.rootOverflowPriority = document.documentElement.style.getPropertyPriority('overflow')
    this.returnFocus = document.activeElement as HTMLElement | null
    document.body.style.setProperty('overflow', 'hidden', 'important')
    document.documentElement.style.setProperty('overflow', 'hidden', 'important')
    document.addEventListener('keydown', this.onKeyDown, true)
    document.addEventListener('focusin', this.onFocus, true)
    this.observer = new document.defaultView!.MutationObserver(() => this.syncBackground())
    this.observer.observe(document.body, { childList: true, subtree: true })
  }

  private top(includeDetached = false) {
    return this.entries.filter((entry) => includeDetached || entry.panel.isConnected)
      .sort((a, b) => priority(a) - priority(b) || a.order - b.order).at(-1)
  }

  private restoreBackground() {
    for (const [element, original] of this.inert) {
      if (original === null) element.removeAttribute('inert')
      else element.setAttribute('inert', original)
    }
    this.inert.clear()
  }

  private syncBackground() {
    this.restoreBackground()
    const top = this.top()
    if (!top) return
    for (let node: HTMLElement | null = top.panel; node?.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        // Keep the active overlay clickable for its existing outside-click handler.
        if (sibling === node || !(sibling instanceof this.document.defaultView!.HTMLElement)
          || sibling.matches('script,style,link,.admin-dialog-backdrop')) continue
        this.inert.set(sibling, sibling.getAttribute('inert'))
        sibling.setAttribute('inert', '')
      }
      if (node.parentElement === this.document.body) break
    }
  }

  private onFocus = (event: FocusEvent) => {
    const top = this.top()
    if (top && !top.panel.contains(event.target as Node)) top.panel.focus({ preventScroll: true })
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const top = this.top()
    if (!top) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!top.options.closeDisabled) top.options.onClose()
    } else if (event.key === 'Tab') {
      const items = focusables(top.panel)
      const active = this.document.activeElement
      const index = items.indexOf(active as HTMLElement)
      if (items.length === 0 || index === -1 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
        event.preventDefault()
        const target = event.shiftKey ? items.at(-1) : items[0]
        ;(target ?? top.panel).focus({ preventScroll: true })
      }
    }
  }

  add(panel: HTMLElement, options: ModalOptions) {
    const entry: Entry = { panel, options, previousFocus: this.document.activeElement as HTMLElement | null, order: ++this.order, mountedPriority: options.priority ?? 0 }
    entry.mountedPriority = priority(entry)
    const oldTabIndex = panel.getAttribute('tabindex')
    panel.tabIndex = -1
    this.entries.push(entry)
    this.syncBackground()
    if (this.top() === entry && !panel.contains(this.document.activeElement)) panel.focus({ preventScroll: true })
    return () => {
      // React may detach the DOM before the hook cleanup runs.
      const wasTop = this.top(true) === entry
      this.entries = this.entries.filter((item) => item !== entry)
      this.syncBackground()
      if (oldTabIndex === null) panel.removeAttribute('tabindex')
      else panel.setAttribute('tabindex', oldTabIndex)
      const top = this.top()
      if (this.entries.length === 0) {
        this.observer.disconnect()
        this.document.removeEventListener('keydown', this.onKeyDown, true)
        this.document.removeEventListener('focusin', this.onFocus, true)
        if (this.overflow) this.document.body.style.setProperty('overflow', this.overflow, this.overflowPriority)
        else this.document.body.style.removeProperty('overflow')
        if (this.rootOverflow) this.document.documentElement.style.setProperty('overflow', this.rootOverflow, this.rootOverflowPriority)
        else this.document.documentElement.style.removeProperty('overflow')
        stacks.delete(this.document)
      }
      if (wasTop) {
        const previous = entry.previousFocus
        const target = previous && visible(previous) && (!top || top.panel.contains(previous))
          ? previous : top?.panel ?? this.returnFocus
        if (target && visible(target)) target.focus({ preventScroll: true })
      }
    }
  }
}

const stacks = new WeakMap<Document, DialogStack>()

export function mountModalDialog(panel: HTMLElement, options: ModalOptions) {
  const document = panel.ownerDocument
  let stack = stacks.get(document)
  if (!stack) {
    stack = new DialogStack(document)
    stacks.set(document, stack)
  }
  return stack.add(panel, options)
}
