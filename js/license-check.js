// license-check.js
// DISABLED: Following Retail model - System relies on Server-Side Subscription/Trial dates (SaaS Model).

function isLicenseValid() {
  return true; // Always valid locally, server enforces subscription via 'auth' middleware
}

function activateLicense(inputKey) {
  return true;
}

function generateLicenseKeyForCurrentPC() {
  return "LICENSE-NOT-REQUIRED-SAAS-MODE";
}

function getMachineFingerprint() {
  return "BROWSER-FINGERPRINT";
}

window.License = {
  isLicenseValid,
  activateLicense,
  generateLicenseKeyForCurrentPC,
  getMachineFingerprint
};
