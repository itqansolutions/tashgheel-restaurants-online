// license-check.js

// Generate a machine fingerprint (simple and offline-safe)
function getMachineFingerprint() {
  const userAgent = navigator.userAgent;
  const language = navigator.language;
  const screenRes = window.screen.width + 'x' + window.screen.height;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return btoa(userAgent + '|' + language + '|' + screenRes + '|' + timezone);
}

// Hashing helper (simple hash for offline license key match)
function simpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Convert to 32bit int
  }
  return hash.toString();
}

// Validate license
function isLicenseValid() {
  const storedLicense = localStorage.getItem('licenseKey');
  const fingerprint = getMachineFingerprint();
  const expectedKey = simpleHash(fingerprint + '|AliKaramPOS'); // dev-side salt
  return storedLicense === expectedKey;
}

// Save license to localStorage
function activateLicense(inputKey) {
  const fingerprint = getMachineFingerprint();
  const expectedKey = simpleHash(fingerprint + '|AliKaramPOS');
  if (inputKey === expectedKey) {
    localStorage.setItem('licenseKey', inputKey);
    return true;
  }
  return false;
}

// Dev-side function (you run it yourself to generate license key)
function generateLicenseKeyForCurrentPC() {
  const fingerprint = getMachineFingerprint();
  const key = simpleHash(fingerprint + '|AliKaramPOS');
  console.log('Generated License Key:', key);
  return key;
}

// Export globally if needed
window.License = {
  isLicenseValid,
  activateLicense,
  generateLicenseKeyForCurrentPC,
  getMachineFingerprint
};
