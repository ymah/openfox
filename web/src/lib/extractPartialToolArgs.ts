/**
 * Extract the value of a string field from a POSSIBLY INCOMPLETE JSON object
 * — the shape tool-call arguments are in while they're still streaming in
 * token by token from the LLM, before the call is complete. Generalizes the
 * single-purpose command extraction ToolCallPreparing.tsx already had for
 * run_command, for reuse across edit_file/write_file's path/content/
 * old_string/new_string fields.
 *
 * Tolerates:
 * - the field's value being unterminated (still streaming) — returns
 *   everything captured so far
 * - the string ending mid-escape-sequence (a lone trailing backslash)
 * - the standard JSON string escapes (\n, \t, \r, \", \\, \/)
 *
 * Does not attempt to decode \uXXXX escapes (rare in real file paths/content,
 * and this is only ever a transient live preview — the final render always
 * comes from the fully-parsed arguments once the tool call completes).
 *
 * Returns null if `"fieldName":"` hasn't appeared in the string yet.
 */
export function extractGrowingJsonField(partialJson: string, fieldName: string): string | null {
  const marker = `"${fieldName}":"`
  const markerStart = partialJson.indexOf(marker)
  if (markerStart === -1) return null

  let result = ''
  let i = markerStart + marker.length
  while (i < partialJson.length) {
    const ch = partialJson[i]
    if (ch === '\\') {
      const next = partialJson[i + 1]
      if (next === undefined) break // trailing escape char — still streaming, stop here
      switch (next) {
        case 'n':
          result += '\n'
          break
        case 't':
          result += '\t'
          break
        case 'r':
          result += '\r'
          break
        case '"':
          result += '"'
          break
        case '\\':
          result += '\\'
          break
        case '/':
          result += '/'
          break
        default:
          result += next
      }
      i += 2
      continue
    }
    if (ch === '"') break // unescaped quote — the field's value is complete
    result += ch
    i += 1
  }
  return result
}
