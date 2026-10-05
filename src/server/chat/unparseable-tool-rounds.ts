import type { ToolCall } from '../../shared/types.js'

/** Consecutive model turns whose every tool call was unparseable before the turn is stopped. */
export const MAX_UNPARSEABLE_TOOL_ROUNDS = 8

/**
 * Counts model turns in a row that only produced tool calls with unparseable
 * arguments. A model stuck re-sending the same truncated call would otherwise loop
 * forever, each round costing a full request.
 */
export function createUnparseableRoundCounter(max = MAX_UNPARSEABLE_TOOL_ROUNDS) {
  let rounds = 0
  return {
    /** Record one round of tool calls; true once `max` such rounds happened in a row. */
    record(toolCalls: Pick<ToolCall, 'parseError'>[]): boolean {
      const allUnparseable = toolCalls.length > 0 && toolCalls.every((call) => Boolean(call.parseError))
      rounds = allUnparseable ? rounds + 1 : 0
      return rounds >= max
    },
  }
}
