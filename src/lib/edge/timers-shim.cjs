function setImmediateShim(fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  return setTimeout(function () { fn.apply(null, args); }, 0);
}
module.exports = setImmediateShim;
module.exports.default = setImmediateShim;
