(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AsAmount = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const message = '금액은 0 이상 9,007,199,254,740,991 이하의 원 단위 정수로 입력하세요.';
  function parse(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string') {
      value = value.trim();
      if (!value) return null;
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) throw new Error(message);
      value = Number(value.replace(/,/g, ''));
    }
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(message);
    return value;
  }
  function read(value) {
    try { return parse(value); } catch (_) { return null; }
  }
  function format(value) {
    const amount = read(value);
    return amount === null ? '' : amount.toLocaleString('ko-KR');
  }
  return { parse, read, format };
});
