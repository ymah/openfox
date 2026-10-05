/** Server names become part of tool names and config keys: plain, short, no separators. */
export const MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9][\w.-]{0,63}$/

const isStringMap = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string')

/** The first problem with the shape of an MCP server definition, or null when it is well-formed. */
export function mcpFieldError(body: {
  name?: unknown
  command?: unknown
  args?: unknown
  env?: unknown
  url?: unknown
  headers?: unknown
}): string | null {
  if (typeof body.name !== 'string' || !MCP_SERVER_NAME_PATTERN.test(body.name)) {
    return 'name must be 1-64 characters: letters, digits, "_", "-" or "."'
  }
  if (body.command !== undefined && typeof body.command !== 'string') return 'command must be a string'
  if (body.args !== undefined && (!Array.isArray(body.args) || body.args.some((a) => typeof a !== 'string'))) {
    return 'args must be an array of strings'
  }
  if (body.env !== undefined && !isStringMap(body.env)) return 'env must be a string/string object'
  if (body.url !== undefined && typeof body.url !== 'string') return 'url must be a string'
  if (body.headers !== undefined && !isStringMap(body.headers)) return 'headers must be a string/string object'
  return null
}
