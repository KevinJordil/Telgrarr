'use strict';

const SECRET_MASK = '••••••••';

function isMasked(val) {
  return typeof val === 'string' && val.includes(SECRET_MASK);
}

function pickSecret(bodyVal, configVal) {
  return (bodyVal && !isMasked(bodyVal)) ? bodyVal : configVal;
}

function maskSecret(val) {
  if (!val || typeof val !== 'string' || val.trim() === '') return val;
  if (val.length < 8) return '••••••••';
  return val.slice(0, 3) + '••••••••' + val.slice(-4);
}

module.exports = {
  SECRET_MASK,
  isMasked,
  pickSecret,
  maskSecret
};
