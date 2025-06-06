/**
 * Tunable thresholds for the collab package.
 */

/**
 * Length of the public room identifier in bytes (hex string =
 * 2× chars). 10 bytes = 80 bits = ~1 in 2^80 collision odds at
 * realistic concurrency; matches standard's 20-hex format.
 */
export const ROOM_ID_BYTES = 10;

/**
 * AES key length in bits. AES-128 is the modern default for
 * symmetric session keys — fast on every platform and
 * cryptographically equivalent to AES-256 against any practical
 * attacker (the 256-bit version's marginal extra security
 * matters only for offline attacks against a long-lived key,
 * not for ephemeral session keys).
 */
export const ENCRYPTION_KEY_BITS = 128;

/**
 * Initialisation-vector length for AES-GCM. NIST SP 800-38D
 * recommends 96 bits (12 bytes) — the construction is most
 * efficient at that length, longer IVs go through an extra
 * hashing step.
 */
export const ENCRYPTION_IV_BYTES = 12;
