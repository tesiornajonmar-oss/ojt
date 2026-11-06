/* =====================================================================
   OJT-ERAMS — configuration  (the only file you normally need to edit)
   ===================================================================== */
window.OJT_CONFIG = {
  // true  = DEMO MODE. Everything runs in the browser using js/mock/* (fake data in localStorage).
  // false = REAL MODE. Every API.* call goes to your backend at API_BASE (see BACKEND_GUIDE.md).
  USE_MOCK: true,

  // Where the real backend lives when USE_MOCK is false.
  // Each route in js/api-contract.js is appended to this, e.g. POST {API_BASE}/auth/login
  API_BASE: '/api',

  // Face verification (browser side). The models are bundled in vendor/face-api/model.
  FACE: { MODEL_PATH: 'vendor/face-api/model/', LIB_PATH: 'vendor/face-api/face-api.js' }
};
