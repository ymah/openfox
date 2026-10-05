# OpenFox Workflows — Spec Pointer

The canonical specification for authoring OpenFox workflow files (`.workflow.json`)
lives in the built-in **`workflows` skill** at
`src/server/skills/defaults/workflows/SKILL.md`. Agents authoring or editing workflows
load it via `load_skill("workflows")` to get the full reference — step types
(`agent`/`sub_agent`/`shell`/`user`/`parallel`), transitions & conditions, runtime
semantics, template variables, sub-groups, the authoring checklist, worked examples,
and troubleshooting.

Workflow files are plain JSON, one per file named `{id}.workflow.json`, stored in
project `.openfox/workflows/` (committed; recommended for agent-authored workflows) or
user-global `{configDir}/workflows/`, overriding bundled defaults in
`src/server/workflows/defaults/`. Executor implementation: `src/server/workflows/`
(`types.ts`, `executor.ts`, `registry.ts`, `parallel.ts`, `template.ts`) and
`src/server/routes/workflows.ts`.

## Built-in dev workflows and agents

The dev project function ships these workflows (`src/server/workflows/defaults/`):

- **Build & Verify** (`default`) — where to work → **architecture review** (`architect`) → implement
  (`builder`) → verify the criteria (`verifier`) → code review (`code_reviewer`) → **security review**
  (`security_reviewer`) → finalize (`builder`) → summary. Findings from both reviews are recorded under
  `review_findings`; finalize cannot finish until each one is resolved or dismissed. A finding that is valid but
  out of scope becomes a `[suite]` / `[sécurité]` card on the task board before it is dismissed.
- The run itself is **traced on the task board by the server**: a card opens (In Progress, bound to the session)
  when the run starts working, moves to Done when it succeeds, and goes back to To Do with the reason when it is
  blocked, stopped or fails — a resumed run reuses its card. See `docs/PROJECT-TASKS-SPEC.md`.
- **Audit (architecture & security)** (`dev-audit`) — read-only: an architecture review, a security audit,
  then a prioritized report by the planner. Optional `scope` parameter (a folder or an area); without it the
  whole project is audited. It changes no file, so it is safe to launch on existing code; it does add the
  important findings (at most ten, most serious first, no duplicates) as cards on the project's task board.

Sub-agents (`src/server/agents/defaults/`), all `category: dev`, called with `call_sub_agent`:

| Sub-agent              | Tools          | Use                                                        |
| ---------------------- | -------------- | ---------------------------------------------------------- |
| `verifier`             | read-only      | Checks acceptance criteria                                 |
| `code_reviewer`        | read-only      | UX and project-quality review of a diff                    |
| `explorer`             | read-only      | Maps the codebase                                          |
| `architect`            | read-only      | Design review before building (boundaries, impact, risks)  |
| `security_reviewer`    | read-only      | Security review of a diff, triaged to exploitable findings |
| `test_runner`          | read-only      | Runs tests and returns only the failures                   |
| `debugger`             | read-only      | Reproduces a failure and finds the root cause              |
| `performance_engineer` | read-only      | Measures hot spots; no optimization without numbers        |
| `refactorer`           | can edit files | Restructures without changing behavior                     |
| `docs_writer`          | can edit files | Brings documentation in line with the code                 |

Only `refactorer` and `docs_writer` can write files, and no sub-agent can start another one. The
`architect` and `security_reviewer` benefit most from a strong model: assign one to each in
**Settings → Agents** (the per-agent model shown in the list) while keeping a lighter model for the builder.
