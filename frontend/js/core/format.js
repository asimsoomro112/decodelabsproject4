/**
 * Formatting helpers for durations, byte counts and relative times.
 *
 * @module core/format
 */

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** @type {[Intl.RelativeTimeFormatUnit, number][]} Units from largest to smallest. */
const UNITS = [
  ['year', 365 * 24 * 3600 * 1000],
  ['month', 30 * 24 * 3600 * 1000],
  ['week', 7 * 24 * 3600 * 1000],
  ['day', 24 * 3600 * 1000],
  ['hour', 3600 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
];

/**
 * Human relative time, e.g. "3 minutes ago", "in 2 hours".
 * @param {string|number|Date} iso ISO date string, epoch ms, or Date.
 * @returns {string} Relative time, or '—' for invalid input.
 */
export function timeAgo(iso) {
  const then = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = then - Date.now();
  const abs = Math.abs(diff);
  for (const [unit, ms] of UNITS) {
    if (abs >= ms || unit === 'second') {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, 'second');
}

/**
 * Format milliseconds as "42 ms" or "1.2 s".
 * @param {number} ms Milliseconds.
 * @returns {string} Formatted duration.
 */
export function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Format a byte count as "512 B", "1.2 KB", etc.
 * @param {number} n Byte count.
 * @returns {string} Formatted size.
 */
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}
