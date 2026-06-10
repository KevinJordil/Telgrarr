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
 * @param {*} bodyVal
 * @param {*} configVal
 * @returns {*}
 */
function pickSecret(bodyVal, configVal) {
  return (bodyVal && !isMasked(bodyVal)) ? bodyVal : configVal;
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
