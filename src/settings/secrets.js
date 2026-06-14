// @ts-check
'use strict';

const SECRET_MASK = '••••••••';

/**
 * @param {*} val
 * @returns {boolean}
 */
function isMasked(val) {
  return typeof val === 'string' && val.includes(SECRET_MASK);
}

/**
 * EDGE-1: decide whether an incoming secret value replaces or preserves the stored one.
 * - absent (undefined/null) or the unchanged mask sentinel -> keep stored (H1/SD-6: an
 *   untouched masked field must never blank a key).
 * - any explicitly submitted value wins, INCLUDING '' which is a deliberate clear.
 * @param {*} bodyVal   request-body value (undefined when the field was omitted)
 * @param {*} configVal currently stored value
 * @returns {*}
 */
function pickSecret(bodyVal, configVal) {
  if (bodyVal == null || isMasked(bodyVal)) return configVal;
  return bodyVal;
}

/**
 * @param {*} val
 * @returns {*}
 */
function maskSecret(val) {
  if (!val || typeof val !== 'string' || val.trim() === '') return val;
  // H1 (SD-6): present secret -> constant mask sentinel (no value-derived
  // chars, any length). Empty/whitespace/undefined pass through unchanged.
  // The real value is exposed only via the auth-gated reveal endpoint
  // (H1.3 / SD-9), never in the serialized settings response.
  return SECRET_MASK;
}

module.exports = {
  SECRET_MASK,
  isMasked,
  pickSecret,
  maskSecret
};
