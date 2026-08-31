# GTD Mode — Getting Started

OpenFox ships with a built-in GTD (Getting Things Done) system: agents, a skill, and four
workflows, all bundled defaults — nothing to install per folder. This page is the human-facing
walkthrough; the full technical reference (folder layout, frontmatter schema, decision tree,
`PROJECT.md` template, task → sub-agent routing) lives in the bundled **`gtd` skill**
(`src/server/skills/defaults/gtd/SKILL.md`), which the agents load on demand.

## Zero install: any folder is a vault

Open or create any folder as an OpenFox project — that folder **is** the vault. There's nothing to
copy into it; the agents, skill, and workflows are bundled with OpenFox and available everywhere.
The first time you capture an idea there, an `AGENTS.md` landing page is created automatically.

## Start in three steps

1. Open (or create) a folder as an OpenFox project.
2. Launch the **"GTD — Capture"** workflow with your idea in one sentence.
3. Launch **"GTD — Clarifier"** on it — the agent asks a few questions, writes a project document,
   and **pauses for your approval** before doing any work. Approve (or ask it to refine, or defer
   it), and it dispatches the work to the right sub-agents.

## The four workflows

| Workflow                     | Use it for                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GTD — Capture**            | Jotting down a one-line idea into the inbox. Fast, no questions asked.                                                                                                                                        |
| **GTD — Clarifier**          | Turning an inbox idea into a project (or a simple action), with a human approval gate before any work happens.                                                                                                |
| **GTD — Revue hebdomadaire** | A periodic sweep of the inbox and open projects, proposing what to archive, defer, or revisit.                                                                                                                |
| **GTD — Build**              | The code-delivery loop (`planner → builder → verifier → code_reviewer`) for a `PROJECT.md` task tagged `agent: code`. Launch it from the target repository (which may be a different project than the vault). |

## Folder layout

```
00-inbox/                captured ideas, one file each, untouched
10-projects/<slug>/      PROJECT.md + deliverables/ + notes/
20-next-actions.md       single-step actions, grouped by context
30-waiting-for.md        delegated / waiting on someone else
40-someday-maybe/        not actionable right now
50-reference/            durable reference material, weekly reviews
90-archive/<year>/       finished projects
```

## A quick example

1. **Capture**: "Redo the studio's pricing page." → `00-inbox/20260901-0900-pricing-page.md`.
2. **Clarify**: the agent asks about scope, deadline, and what "done" looks like, then writes
   `10-projects/pricing-page/PROJECT.md` with a task breakdown — say, one `gtd-writer` task for the
   copy and one `agent: code` task for the actual page change.
3. **Approve**: you review the document and click "Valider".
4. **Dispatch**: the copy task runs immediately (`call_sub_agent`); the code task creates an entry
   on the target repository's task board with the `/gtd-build` command pre-filled, ready to launch
   the build loop there.
5. **Review & close**: once every deliverable checks out, the project is archived and any leftover
   single-step actions land in `20-next-actions.md`.

## Two things to know before you start

- **The "2-minute rule" never applies to code.** Even a one-line fix always goes through the
  `agent: code` path (`gtd-build`) — code changes get automatic review/verification, however small.
- **`web_search` only works if you've configured a search engine** (Tavily API key or a SearXNG URL,
  in Settings). Without one, research tasks fall back to `web_fetch` on URLs you provide — which is
  always available and often enough on its own.
