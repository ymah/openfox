# Chat

The **Chat** project function turns OpenFox into a general-purpose assistant, in the
spirit of a desktop chat app, on top of your own models. It ships as the bundled plugin
`openfox-chat` and can be disabled in Settings → Plugins, which removes the mode, its
agents, its workflows and its home together.

A **Chat project** is a conversation space, not a code repository: creating one does not
run `git init`, and the composer drops the permission selector that only makes sense for an
agent working on files. Conversations are ordinary sessions, so favourites, search, export,
fork and statistics all work as usual.

## Assistants

| Assistant               | For                                                        | Web |
| ----------------------- | ---------------------------------------------------------- | --- |
| **Assistant** (default) | General questions, explanations, drafting                  | yes |
| **Researcher**          | Multi-step research with cross-checked, cited sources      | yes |
| **Tutor**               | Step-by-step teaching, checks understanding with questions | yes |
| **Translator**          | Faithful translation with tone and register control        | no  |
| **Editor**              | Proofreading and rewriting, shows what changed             | no  |
| **Brainstorm**          | Diverge, then sort and stress-test ideas                   | no  |

None of them can read or write files or run commands. They use a conversational base
prompt (`basePrompt: assistant`) and only receive the tool definitions they may use
(`filterTools: true`), so a local model is not shown twenty coding tools it must not call.

## Workflows

Type `/` in a conversation to launch one.

- **Recherche approfondie** — breaks a question down, reads real sources, cites them.
- **Vérifier des affirmations** — verdict per claim: confirmed, nuanced, refuted, not found.
- **Résumer un document** — one sentence, key points, detail; then a fidelity check.
- **Rédiger puis critiquer** — draft, critique by the Editor, revision, as many rounds as you want.
- **Traduire avec contrôle** — translation, back-translation to catch drift, final version.
- **Décider** — clarify, options, weighted criteria, matrix, recommendation and risks.
- **Apprendre un sujet** — diagnosis, learning plan, first lesson, quiz.

## Rich rendering

Available in every conversation, chat project or not:

- **Math** — `$inline$`, `$$display$$`, `\(…\)` and `\[…\]` are rendered with KaTeX. A `$` followed by a
  digit that does not close like a formula (`$5 and $10`) is treated as a price.
- **Diagrams** — a `mermaid` code block becomes a diagram, loaded on first use. Invalid source is shown as code.
- **Artifacts** — `html` and `svg` blocks get a **Preview** button and a download button. The preview runs in a
  frame sandboxed **without** `allow-same-origin`, under a policy that forbids every network request: a
  generated page cannot read the app's data or call its API. Inline scripts and styles work; external ones do not.

## Per-conversation settings

`GET/PUT /api/sessions/:id/chat-settings` gives a conversation its own persona (a free-form
system prompt, appended to the session's instructions) and sampling (temperature, top-p,
max tokens). They override the per-model settings, which override the built-in model
profile. Changing the persona flags the session as needing a context rebase, like editing
project instructions.
