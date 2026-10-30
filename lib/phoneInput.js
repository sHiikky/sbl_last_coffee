// Presentation only. Checkout still validates and normalizes through ordering.js.
export const PHONE_INPUT_PLACEHOLDER = '+7 (___)-___-__-__';

function parseInput(value) {
  const text = String(value || '');
  const digits = text.replace(/\D/g, '');
  const explicitCountry = /^\s*\+/.test(text);
  if (explicitCountry && digits && !/^[78]/.test(digits)) return null;
  const hasCountry = /^[78]/.test(digits) && (
    explicitCountry || digits.length > 10 || digits.length === 1 || /^\s*[78][\s(]/.test(text)
  );
  return { national: (hasCountry ? digits.slice(1) : digits).slice(0, 10), hasCountry, prefix: hasCountry && !!digits };
}

function formatNational(national, prefix = true) {
  if (!national) return prefix ? '+7' : '';
  let text = `+7 (${national.slice(0, 3)}`;
  if (national.length > 3) text += `)-${national.slice(3, 6)}`;
  if (national.length > 6) text += `-${national.slice(6, 8)}`;
  if (national.length > 8) text += `-${national.slice(8, 10)}`;
  return text;
}

export function formatPhoneInput(value) {
  const parsed = parseInput(value);
  return parsed ? formatNational(parsed.national, parsed.prefix) : '';
}

export function completePhoneInput(value) {
  const parsed = parseInput(value);
  return parsed?.national.length === 10 ? `+7${parsed.national}` : null;
}

function digitsBefore(text, position) {
  return text.slice(0, position).replace(/\D/g, '').length;
}

function positionAfterNationalDigit(text, count) {
  if (!count) return text.length > 2 ? 4 : text.length;
  let seen = -1; // The first digit is the fixed +7 country code.
  for (let index = 0; index < text.length; index++) {
    if (/\d/.test(text[index]) && ++seen === count) return index + 1;
  }
  return text.length;
}

function changeRange(previous, next) {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = previous.length, nextEnd = next.length;
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
  return { start, end, nextEnd };
}

export function editPhoneInput(previousValue, nextValue, previousSelection) {
  const previous = String(previousValue || '');
  const next = String(nextValue || '');
  const selection = previousSelection || { start: previous.length, end: previous.length };
  const unchanged = () => ({ text: previous, selection: { start: Math.min(selection.start, previous.length), end: Math.min(selection.end, previous.length) } });
  if (next === previous) return unchanged();
  if (!next) return { text: '', selection: { start: 0, end: 0 } };
  const range = changeRange(previous, next);
  const before = parseInput(previous);
  // The country code is fixed while a national number is present. Removing it
  // must not silently turn the first subscriber digit into another country code.
  if (before?.national && range.start < 2 && range.end <= 2 && range.nextEnd === range.start) return unchanged();
  const parsed = parseInput(next);
  if (!parsed) return unchanged(); // A foreign international paste cannot become a different Russian number.

  let national = parsed.national;
  let ordinal = Math.max(0, digitsBefore(next, range.nextEnd) - Number(parsed.hasCountry));
  const removed = previous.slice(range.start, range.end);
  if (before?.national === national && removed && !/\d/.test(removed) && range.nextEnd === range.start && selection.start === selection.end) {
    // Backspace/Delete at a mask separator removes the adjacent real digit,
    // instead of restoring the same punctuation and leaving the user stuck.
    const forwardDelete = selection.start <= range.start;
    const digitIndex = digitsBefore(previous, range.start) - 1 - Number(!forwardDelete);
    if (digitIndex >= 0 && digitIndex < national.length) {
      national = national.slice(0, digitIndex) + national.slice(digitIndex + 1);
      ordinal = digitIndex;
    }
  }
  const text = formatNational(national, parsed.prefix);
  const caret = positionAfterNationalDigit(text, Math.min(ordinal, national.length));
  return { text, selection: { start: caret, end: caret } };
}
