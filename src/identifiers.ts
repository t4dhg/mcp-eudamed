import { EudamedError } from './errors.js';
/** Extract only an unambiguous parenthesized GS1 (01); never coerce raw identifiers. */
export function parseDeviceIdentifier(original: string) {
  const value = original.trim();
  let primaryDi = value;
  let format: 'raw' | 'gs1-parenthesized' = 'raw';
  if (value.includes('(01)')) {
    const match = /^\(01\)(\d{14})(?=\(|$)/.exec(value);
    if (!match || value.indexOf('(01)', 4) !== -1)
      throw new EudamedError(
        'SCHEMA',
        'Malformed GS1 UDI: provide one (01) followed by a 14-digit GTIN, or supply the exact standalone Primary DI.',
      );
    primaryDi = match[1];
    const sum = [...primaryDi.slice(0, 13)].reduce(
      (total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 3 : 1),
      0,
    );
    if ((10 - (sum % 10)) % 10 !== Number(primaryDi[13]))
      throw new EudamedError(
        'SCHEMA',
        'Invalid GS1 (01) check digit; confirm the identifier from the controlled label.',
      );
    format = 'gs1-parenthesized';
  }
  return { original, primaryDi, format, changed: original !== primaryDi };
}
export const emptySearchSteps = [
  'Confirm the exact Primary DI or Basic UDI-DI from the controlled label; do not substitute a product name for an SRN.',
  'Search the EUDAMED public portal at https://ec.europa.eu/tools/eudamed/#/screen/search-device and compare identifiers and record versions.',
  'Verify the registered legal manufacturer and inspect its portfolio separately. Ask the manufacturer for its public registration link if unresolved.',
  'Data Lake publication coverage and freshness are unknown. No match does not establish absence from EUDAMED or non-compliance.',
];
