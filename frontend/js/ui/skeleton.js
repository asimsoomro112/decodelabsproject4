/**
 * Loading skeletons with a shimmer animation.
 *
 * @module ui/skeleton
 */

import { h } from '../core/dom.js';

/**
 * A card-shaped skeleton placeholder.
 * @returns {HTMLElement} Skeleton card element.
 */
export function skeletonCard() {
  const el = h('div', { class: 'card skeleton', 'aria-hidden': 'true' });
  el.append(
    h('div', { class: 'shimmer shimmer--title' }),
    h('div', { class: 'shimmer shimmer--line' }),
    h('div', { class: 'shimmer shimmer--line shimmer--short' }),
  );
  return el;
}

/**
 * A table-row-shaped skeleton placeholder.
 * @returns {HTMLElement} Skeleton row element.
 */
export function skeletonRow() {
  const el = h('div', { class: 'skeleton-row', 'aria-hidden': 'true' });
  el.append(
    h('div', { class: 'shimmer shimmer--avatar' }),
    h('div', { class: 'shimmer shimmer--line shimmer--grow' }),
    h('div', { class: 'shimmer shimmer--pill' }),
  );
  return el;
}

/**
 * N skeleton cards in a tile grid.
 * @param {number} n Number of tiles.
 * @returns {HTMLElement} Grid of skeleton cards.
 */
export function skeletonTiles(n) {
  const grid = h('div', { class: 'tiles', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i += 1) grid.append(skeletonCard());
  return grid;
}
