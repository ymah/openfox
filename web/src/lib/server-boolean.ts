/**
 * A boolean setting as the server stores it: 'true' / 'false', or undefined when
 * there is no usable value yet. A setting that has not loaded reads as '' through
 * its fallback, and that must never be mistaken for "false".
 */
export function parseServerBoolean(value: string | undefined): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined
}
