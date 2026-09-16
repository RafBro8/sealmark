/**
 * Minimal terminal styling.
 *
 * Escape sequences are built from a char code rather than written inline so the
 * source stays free of raw control characters. Styling is skipped when output
 * is piped or when NO_COLOR is set.
 */
const ESC = String.fromCharCode(27);
const enabled = process.stdout.isTTY === true && !process.env['NO_COLOR'];

function wrap(code: string): (text: string) => string {
  return (text: string) => (enabled ? `${ESC}[${code}m${text}${ESC}[0m` : text);
}

export const dim = wrap('2');
export const bold = wrap('1');
export const green = wrap('32');
export const red = wrap('31');
export const yellow = wrap('33');
