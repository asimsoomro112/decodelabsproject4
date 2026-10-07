/**
 * DOM helpers. `h()` builds elements with textContent for string children —
 * never innerHTML — so API data can never inject markup.
 *
 * @module core/dom
 */

/**
 * Create an element. The return type follows the tag name, so
 * `h('input', …)` is an `HTMLInputElement` (`.value` type-checks).
 *
 * Attribute handling:
 * - `class`: string or string[] → className
 * - `dataset`: object → assigned onto el.dataset
 * - `on*` + function (e.g. `onclick`) → addEventListener
 * - `text`: sets textContent
 * - boolean true → valueless attribute; null/undefined/false → skipped
 * - everything else → setAttribute
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag Tag name.
 * @param {Record<string, any>} [attrs] Attributes/props.
 * @param {...(string|number|Node|null|undefined|false|(string|Node|null|undefined|false)[])} children
 *   Strings/numbers become text nodes (textContent — never innerHTML).
 * @returns {HTMLElementTagNameMap[K]} The created element.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') {
        el.className = Array.isArray(value) ? value.join(' ') : String(value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(el.dataset, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2), value);
      } else if (key === 'text') {
        el.textContent = String(value);
      } else if (value === true) {
        el.setAttribute(key, '');
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  const flat = children.flat(Infinity);
  for (const child of flat) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/**
 * Query the first matching element (throws when missing — no null checks at
 * call sites).
 * @param {string} sel CSS selector.
 * @param {ParentNode} [root] Root to search (defaults to document).
 * @returns {HTMLElement} Match.
 */
export function qs(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`qs: no element matches "${sel}"`);
  return /** @type {HTMLElement} */ (el);
}

/**
 * Query all matching elements as an array.
 * @param {string} sel CSS selector.
 * @param {ParentNode} [root] Root to search (defaults to document).
 * @returns {HTMLElement[]} Matches.
 */
export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)].map((el) => /** @type {HTMLElement} */ (el));
}

/**
 * Typed query helpers — cast to the expected control type so `.value`,
 * `.disabled` etc. type-check under `tsc --checkJs`.
 * @param {string} sel CSS selector.
 * @param {ParentNode} [root] Root to search.
 * @returns {HTMLInputElement} Match.
 */
export function qsInput(sel, root = document) {
  return /** @type {HTMLInputElement} */ (qs(sel, root));
}

/**
 * @param {string} sel CSS selector.
 * @param {ParentNode} [root] Root to search.
 * @returns {HTMLSelectElement} Match.
 */
export function qsSelect(sel, root = document) {
  return /** @type {HTMLSelectElement} */ (qs(sel, root));
}

/**
 * @param {string} sel CSS selector.
 * @param {ParentNode} [root] Root to search.
 * @returns {HTMLTextAreaElement} Match.
 */
export function qsTextarea(sel, root = document) {
  return /** @type {HTMLTextAreaElement} */ (qs(sel, root));
}

/**
 * @param {string} sel CSS selector.
 * @param {ParentNode} [root] Root to search.
 * @returns {HTMLButtonElement} Match.
 */
export function qsButton(sel, root = document) {
  return /** @type {HTMLButtonElement} */ (qs(sel, root));
}

/**
 * Remove all children from an element.
 * @param {Element} el Element to empty.
 * @returns {void}
 */
export function clear(el) {
  el.replaceChildren();
}

/**
 * Render a list efficiently: builds into a DocumentFragment and appends once.
 * @template T
 * @param {Element} container Container to fill.
 * @param {T[]} items Items to render.
 * @param {(item: T, index: number) => Node|null} renderItem Builds a node per item.
 * @returns {void}
 */
export function renderList(container, items, renderItem) {
  clear(container);
  const frag = document.createDocumentFragment();
  items.forEach((item, index) => {
    const node = renderItem(item, index);
    if (node) frag.appendChild(node);
  });
  container.appendChild(frag);
}
