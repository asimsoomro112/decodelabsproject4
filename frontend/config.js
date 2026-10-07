/* SynapseBridge runtime config.
 * Plain classic script (no modules): loaded in index.html BEFORE any module
 * so ES modules can read window.SYNAPSE_CONFIG safely.
 * CSP note: served from 'self', which the meta CSP allows via script-src 'self'.
 */
(function () {
  'use strict';
  window.SYNAPSE_CONFIG = Object.assign({}, window.SYNAPSE_CONFIG, {
    API_BASE_URL: window.location.hostname === 'localhost' ? 'http://localhost:4000/api/v1' : '/api/v1',
  });
})();
