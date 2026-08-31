/**
 * Eval task suite.
 *
 * Each task is a small, self-contained fixture (no `npm install` required —
 * fixtures use Node's built-in `node:test` runner or plain file assertions,
 * so a task run stays fast and reproducible without network access) plus a
 * deterministic success criterion. This is a SEED set covering the audit's
 * P1 (code discovery), P2 (verification output), and general tool-use
 * failure modes — grow it by adding more entries in the same shape rather
 * than restructuring the harness.
 */

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatResponse } from '../../e2e/utils/index.js'
import type { ServerMessage } from '../../src/shared/protocol.js'

export interface EvalCheckContext {
  /** Absolute path to the task's materialized fixture directory. */
  projectDir: string
  /** The aggregated response from the single chat.send this task issues. */
  response: ChatResponse
  /** Every event observed during the run (for compaction / tool-result inspection). */
  events: ServerMessage[]
}

export interface EvalCheckResult {
  pass: boolean
  detail?: string
}

export interface EvalTask {
  id: string
  description: string
  mode?: 'builder' | 'planner'
  /** Fixture files, path → content — passed straight to createTestProject({ files }). */
  files: Record<string, string>
  prompt: string
  timeoutMs?: number
  check(ctx: EvalCheckContext): Promise<EvalCheckResult> | EvalCheckResult
}

async function readFixtureFile(projectDir: string, relPath: string): Promise<string> {
  return readFile(join(projectDir, relPath), 'utf-8')
}

export const EVAL_TASKS: EvalTask[] = [
  {
    id: 'fix-failing-test',
    description: 'Fix a one-line arithmetic bug so the accompanying node:test suite passes.',
    files: {
      'src/math.js': `function add(a, b) {\n  return a - b // bug: should add, not subtract\n}\n\nmodule.exports = { add }\n`,
      'src/math.test.js': `const { test } = require('node:test')\nconst assert = require('node:assert')\nconst { add } = require('./math.js')\n\ntest('add sums two numbers', () => {\n  assert.strictEqual(add(2, 3), 5)\n})\n`,
    },
    prompt:
      'The test in src/math.test.js is failing. Find and fix the bug in src/math.js so the test passes. Run the test with `node --test src/math.test.js` to confirm before finishing.',
    check({ projectDir }) {
      try {
        execFileSync(process.execPath, ['--test', 'src/math.test.js'], {
          cwd: projectDir,
          stdio: 'pipe',
          timeout: 15_000,
        })
        return { pass: true }
      } catch (error) {
        return { pass: false, detail: `node --test still fails: ${(error as Error).message}` }
      }
    },
  },

  {
    id: 'add-field-end-to-end',
    description: 'Thread a new field through a factory function and its one consumer.',
    files: {
      'src/user.js': `function createUser(name, age) {\n  return { name, age }\n}\n\nmodule.exports = { createUser }\n`,
      'src/format.js': `const { createUser } = require('./user.js')\n\nfunction describeUser(name, age) {\n  const user = createUser(name, age)\n  return \`\${user.name} (\${user.age})\`\n}\n\nmodule.exports = { describeUser }\n`,
    },
    prompt:
      'Add an "email" field to the user object: thread it through createUser in src/user.js, and include it in the string returned by describeUser in src/format.js (e.g. "Name (age) <email>"). Both files must stay consistent.',
    async check({ projectDir }) {
      const [userSrc, formatSrc] = await Promise.all([
        readFixtureFile(projectDir, 'src/user.js'),
        readFixtureFile(projectDir, 'src/format.js'),
      ])
      const userHasEmail = /email/i.test(userSrc)
      const formatHasEmail = /email/i.test(formatSrc)
      if (userHasEmail && formatHasEmail) return { pass: true }
      return {
        pass: false,
        detail: `email field missing from: ${[!userHasEmail && 'src/user.js', !formatHasEmail && 'src/format.js']
          .filter(Boolean)
          .join(', ')}`,
      }
    },
  },

  {
    id: 'find-where-implemented',
    description: 'Locate a function buried among decoy files with similar names — pure discovery, no edits.',
    mode: 'planner',
    files: {
      'src/utils/pricing/decoys.js': `function applyDiscount() { /* not the real one */ }\nfunction computeTotal() {}\nmodule.exports = { applyDiscount, computeTotal }\n`,
      'src/utils/pricing/rules.js': `// The actual discount calculation lives here, not in decoys.js or legacy/.\nfunction computeDiscount(price, tier) {\n  if (tier === 'gold') return price * 0.8\n  if (tier === 'silver') return price * 0.9\n  return price\n}\n\nmodule.exports = { computeDiscount }\n`,
      'src/legacy/pricing.js': `// Old implementation, kept for reference only — do not use.\nfunction computeDiscount() { throw new Error('deprecated') }\nmodule.exports = { computeDiscount }\n`,
      'src/index.js': `const { computeDiscount } = require('./utils/pricing/rules.js')\nmodule.exports = { computeDiscount }\n`,
    },
    prompt:
      'Where is the function computeDiscount actually implemented (the real, non-deprecated version)? Reply with the file path.',
    check({ response }) {
      const content = response.content.toLowerCase()
      const namedRightFile = content.includes('utils/pricing/rules.js') || content.includes('utils/pricing/rules')
      const mentionsWrongFile = content.includes('legacy/pricing') || content.includes('decoys.js')
      const pass = namedRightFile && !mentionsWrongFile
      if (pass) return { pass }
      return {
        pass,
        detail:
          namedRightFile && mentionsWrongFile
            ? 'named the correct file but also pointed at a decoy'
            : `expected src/utils/pricing/rules.js in the reply, got: ${response.content.slice(0, 200)}`,
      }
    },
  },

  {
    id: 'rename-across-files',
    description: 'Rename a function consistently across its definition and two call sites.',
    files: {
      'src/greet.js': `function sayHello(name) {\n  return \`Hello, \${name}!\`\n}\n\nmodule.exports = { sayHello }\n`,
      'src/cli.js': `const { sayHello } = require('./greet.js')\nconsole.log(sayHello(process.argv[2] || 'world'))\n`,
      'src/cli.test.js': `const { test } = require('node:test')\nconst assert = require('node:assert')\nconst { sayHello } = require('./greet.js')\n\ntest('greets by name', () => {\n  assert.strictEqual(sayHello('Ada'), 'Hello, Ada!')\n})\n`,
    },
    prompt:
      'Rename the function sayHello to greet everywhere it is defined and used (src/greet.js, src/cli.js, src/cli.test.js). Run the test afterwards to confirm nothing broke.',
    async check({ projectDir }) {
      // A no-op run would leave the original (self-consistent) fixture in
      // place and the test would still pass — so the rename actually
      // happening is checked BEFORE trusting a green test run.
      const [greetSrc, cliSrc] = await Promise.all([
        readFixtureFile(projectDir, 'src/greet.js'),
        readFixtureFile(projectDir, 'src/cli.js'),
      ])
      const stillHasOldName = /\bsayHello\b/.test(greetSrc) || /\bsayHello\b/.test(cliSrc)
      const hasNewName = /\bgreet\b/.test(greetSrc) && /\bgreet\b/.test(cliSrc)
      if (stillHasOldName || !hasNewName) {
        return { pass: false, detail: 'sayHello was not fully renamed to greet in src/greet.js and src/cli.js' }
      }
      try {
        execFileSync(process.execPath, ['--test', 'src/cli.test.js'], {
          cwd: projectDir,
          stdio: 'pipe',
          timeout: 15_000,
        })
      } catch (error) {
        return { pass: false, detail: `test suite fails after rename: ${(error as Error).message}` }
      }
      return { pass: true }
    },
  },

  {
    id: 'search-excludes-vendor',
    description:
      'Real target and a same-named decoy inside a vendor/ directory — checks that discovery favors the real source, not the vendored copy (proxy for P1: does search exclude vendor dirs by default).',
    files: {
      'src/config.js': `function parseConfig(raw) {\n  return JSON.parse(raw)\n}\n\nmodule.exports = { parseConfig }\n`,
      'vendor/some-lib/config.js': `// Vendored third-party copy — never edit this.\nfunction parseConfig(raw) {\n  return JSON.parse(raw)\n}\n\nmodule.exports = { parseConfig }\n`,
    },
    prompt:
      'Add input validation to parseConfig in src/config.js: it should throw a clear error if raw is null or undefined, before attempting to parse.',
    async check({ projectDir }) {
      const [ownSrc, vendorSrc] = await Promise.all([
        readFixtureFile(projectDir, 'src/config.js'),
        readFixtureFile(projectDir, 'vendor/some-lib/config.js'),
      ])
      const ownEdited = /throw/.test(ownSrc)
      const vendorUntouched = !/throw/.test(vendorSrc)
      if (ownEdited && vendorUntouched) return { pass: true }
      return {
        pass: false,
        detail: !ownEdited
          ? 'src/config.js was not given null/undefined validation'
          : 'vendor/some-lib/config.js was modified — should never be touched',
      }
    },
  },
]
