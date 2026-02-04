/**
 * License Crypto Module
 * Shared logic for Generating and Validating License Keys
 * Uses a custom XOR-based encryption with rotation and obfuscation for offline security.
 */

const LicenseCrypto = {
    // 🔒 SECRET MASTER KEY (Must match between Generator and App)
    SECRET_KEY: "Tashgheel_Services_Secure_2025_#$#",

    // Encrypts a payload object into a license key string
    generateKey: function (payload) {
        try {
            // 1. Add Random Salt & Timestamp
            const enrichedPayload = {
                ...payload,
                _salt: Math.random().toString(36).substring(7),
                _gen: Date.now()
            };

            const jsonStr = JSON.stringify(enrichedPayload);
            const encrypted = this._encryptString(jsonStr, this.SECRET_KEY);
            // 2. Signature of the Encrypted info (for integrity)
            const signature = this._hashString(encrypted + this.SECRET_KEY);

            // Format: Base64( Signature.EncryptedData )
            return btoa(signature + "." + encrypted);
        } catch (e) {
            console.error("Key Gen Failed:", e);
            return null;
        }
    },

    // Decrypts and validates a license key string
    validateKey: function (keyString, currentMachineId) {
        try {
            if (!keyString) return { valid: false, error: "Empty Key" };

            // CLEANUP: Remove whitespace/newlines that might come from copy-paste
            keyString = keyString.replace(/\s/g, '');

            // 1. Decode Wrapper
            let decoded;
            try {
                decoded = atob(keyString);
            } catch (e) {
                return { valid: false, error: "Invalid Key Format (Base64)" };
            }

            const parts = decoded.split('.');
            if (parts.length !== 2) return { valid: false, error: "Invalid Key Structure" };

            const [signature, encrypted] = parts;

            // 2. Verify Signature
            const expectedSig = this._hashString(encrypted + this.SECRET_KEY);
            if (signature !== expectedSig) return { valid: false, error: "Invalid Signature (Tampered)" };

            // 3. Decrypt
            const jsonStr = this._decryptString(encrypted, this.SECRET_KEY);
            if (!jsonStr) return { valid: false, error: "Decryption Failed" };

            let payload;
            try {
                payload = JSON.parse(jsonStr);
            } catch (e) {
                return { valid: false, error: "Corrupt License Data" };
            }

            // 4. Check Machine ID
            if (payload.mid !== currentMachineId) {
                return { valid: false, error: "Machine ID Mismatch", payload };
            }

            // 5. Check Expiration
            const now = Date.now();
            let isExpired = false;
            let daysLeft = 0;

            if (payload.type === 'TRIAL' || payload.type === 'FULL_TIME') {
                const genDate = payload._gen;
                const durationMs = (payload.days || 0) * 24 * 60 * 60 * 1000;
                const expiryDate = genDate + durationMs;

                daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

                if (now > expiryDate) {
                    isExpired = true;
                }
            } else {
                daysLeft = 9999; // Lifetime
            }

            if (isExpired) return { valid: false, error: "License Expired", payload, daysLeft };

            return { valid: true, payload, daysLeft };

        } catch (e) {
            console.error("Validation Error:", e);
            return { valid: false, error: "System Error" };
        }
    },

    // Internal: Unicode-Safe Encryption
    _encryptString: function (text, key) {
        // UTF-8 Safe Encoding
        const utf8 = unescape(encodeURIComponent(text));

        let result = "";
        for (let i = 0; i < utf8.length; i++) {
            const charCode = utf8.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return btoa(result);
    },

    _decryptString: function (encoded, key) {
        try {
            const text = atob(encoded);
            let result = "";
            for (let i = 0; i < text.length; i++) {
                const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                result += String.fromCharCode(charCode);
            }
            return decodeURIComponent(escape(result));
        } catch (e) { return null; }
    },

    // Internal: Simple DJB2 Hash
    _hashString: function (str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
        }
        return (hash >>> 0).toString(16);
    }
};

// Export to window
window.LicenseCrypto = LicenseCrypto;
