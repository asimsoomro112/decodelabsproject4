/**
 * The 8 request-lifecycle steps visualized in the Trace view. Each step has
 * a stable id, a numbered label, and a short description.
 *
 * @module trace/lifecycle
 */

/**
 * @typedef {Object} LifecycleStepDef
 * @property {string} id Stable step id.
 * @property {string} label Numbered display label.
 * @property {string} description Short description.
 */

/** @type {LifecycleStepDef[]} The 8 lifecycle steps in order. */
export const LIFECYCLE_STEPS = [
  { id: 'click', label: '① click', description: 'User action kicks off the request' },
  { id: 'try', label: '② try', description: 'Client builds headers, timeout and idempotency key' },
  { id: 'fetch', label: '③ fetch', description: 'Network: suspected preflight, then fetch()' },
  { id: 'await', label: '④ await', description: 'Waiting on the server response' },
  { id: 'check', label: '⑤ check', description: 'Status code and ok flag' },
  { id: 'json', label: '⑥ json', description: 'Parsing the response body' },
  { id: 'dom', label: '⑦ dom', description: 'Rendering the result into the DOM' },
  { id: 'finally', label: '⑧ finally', description: 'Cleanup and trace recorded' },
];
