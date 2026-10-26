/**
 * =============================================================================
 * glass/element.js — <glass-ui>: glass as an HTML element, for any framework
 * =============================================================================
 *   <glass-ui group="card">…any content…</glass-ui>
 *   <glass-ui group="menu" props='{"tint":"#e0e7ff","tintOpacity":0.7}'>…</glass-ui>
 *
 * A standard custom element (a web component), so it works the same in plain
 * HTML, React 19, Vue, Svelte, Angular, Astro, WordPress… The element is the
 * glass: it gets the `group`'s look plus the per-element `props` (JSON), and
 * follows changes to both attributes. Its content stays ordinary light DOM
 * (no shadow root), so the site's own CSS styles it.
 *
 * Registered automatically by <GlassProvider> (and so by the script build's
 * start()); defineGlassElement() does it by hand, e.g. under another name.
 * Until the glass runs — and wherever it can't — <glass-ui> is a plain block
 * element showing your CSS, like any other glass element.
 *
 * (The name has a hyphen because the HTML standard requires one in every
 * custom element name — a bare <glass> can't be registered.)
 *
 * Attributes:
 *   group   config group (default "panel")
 *   props   per-element glass props as JSON (e.g. '{"style":"crystal"}')
 * Properties: el.group, el.props (object) — the same, from JavaScript.
 * Default style: display: block (zero specificity — any CSS of yours wins).
 * For native controls (button, input) keep using the controls / attributes:
 * <glass-ui> is for containers — cards, panels, bars, chips, menus.
 * =============================================================================
 */
import { attachGlass } from './useGlass';

export const GLASS_ELEMENT = 'glass-ui';

/**
 * Register the custom element (safe to call more than once, and on the
 * server, where it does nothing).
 * @param {string} [name] the tag name (must contain a hyphen)
 * @returns {boolean} true if it is (now) registered
 */
export function defineGlassElement(name = GLASS_ELEMENT) {
  if (typeof window === 'undefined' || !window.customElements || typeof HTMLElement === 'undefined') return false;
  if (customElements.get(name)) return true;
  // Made here, not at module level: HTMLElement doesn't exist on the server.
  class GlassUIElement extends HTMLElement {
    static get observedAttributes() {
      return ['group', 'props'];
    }

    constructor() {
      super();
      this._glass = null; // attachGlass handle while connected
      this._badProps = '';
    }

    connectedCallback() {
      this._attach();
    }

    disconnectedCallback() {
      this._glass?.destroy();
      this._glass = null;
    }

    attributeChangedCallback(attr, oldValue, newValue) {
      if (oldValue === newValue || !this.isConnected) return;
      if (attr === 'props' && this._glass) this._glass.setProps(this._readProps());
      else this._attach(); // a new group: re-attach
    }

    get group() {
      return this.getAttribute('group') || 'panel';
    }

    set group(value) {
      this.setAttribute('group', String(value));
    }

    get props() {
      return this._readProps();
    }

    // An object, or a JSON string — React 19 sets a custom element's
    // PROPERTY (not the attribute) when it has one, so <glass-ui props='{…}'>
    // in JSX arrives here as the string.
    set props(value) {
      if (value == null || value === '') this.removeAttribute('props');
      else this.setAttribute('props', typeof value === 'string' ? value : JSON.stringify(value));
    }

    _attach() {
      this._glass?.destroy();
      this._glass = attachGlass(this, this.group, this._readProps());
    }

    /** The `props` attribute as an object ({} if missing or not valid JSON). */
    _readProps() {
      const raw = this.getAttribute('props');
      if (!raw) return {};
      try {
        const p = JSON.parse(raw);
        return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
      } catch {
        if (this._badProps !== raw) {
          this._badProps = raw;
          console.warn(`glass: <${name}> props must be JSON, like props='{"tint":"#e0e7ff"}' — ignoring:`, raw);
        }
        return {};
      }
    }
  }
  customElements.define(name, GlassUIElement);
  return true;
}
