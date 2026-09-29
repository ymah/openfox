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

## Web search

The Assistant, Researcher and Tutor use `web_search` and `web_fetch`. In Docker, a private SearXNG can provide
the search with no API key — see `docs/DOCKER.md` ("Web search without a key"). Without any engine configured,
`web_search` says so instead of failing obscurely.

## Memory

The Assistant, Researcher and Tutor share a memory that spans every chat project. They read it with
`memory_search` at the start of a conversation and whenever a request depends on personal context, write durable
facts with `memory_save` (and tell you when they do), and drop them with `memory_forget`.

- **Nothing is hidden.** The **Memory** page (button on the chat home) lists every entry, lets you edit or forget
  each one, wipe everything, add one by hand, and switch memory off — assistants then neither read nor write it.
- **How it works.** One JSON value in the plugin's storage, capped at 500 entries of up to 1000 characters.
  Saving a fact that repeats or rewords an existing one updates it instead of duplicating it. Search is keyword
  scoring (TF-IDF over accent-folded words, with light plural matching) — there is no embedding model.
- **Limits.** It is the assistant that decides to call memory: a small local model may forget to. It is not
  injected into the prompt automatically, which keeps the provider's prompt cache intact. The on/off switch is
  global, not per conversation.

## Regenerate and versions

Under the last reply of a turn, **Regenerate** keeps the reply you have and produces another one; `‹ 2/3 ›`
switches between them. Editing one of your messages (or replaying it) works the same way, so nothing is
overwritten. A version is a session forked just before your message: it carries the same history, persona and
sampling, is hidden from the conversation list, and is reached through its original. The controls appear where
versions diverge, in both the original and the version; a version of a version is reached by stepping back
to the session it came from. Other project types keep the classic behaviour (edit/replay truncates history).

## Rich rendering

Available in every conversation, chat project or not:

- **Math** — `$inline$`, `$$display$$`, `\(…\)` and `\[…\]` are rendered with KaTeX. A `$` followed by a
  digit that does not close like a formula (`$5 and $10`) is treated as a price.
- **Diagrams** — a `mermaid` code block becomes a diagram, loaded on first use. Invalid source is shown as code.
- **Artifacts** — `html` and `svg` blocks get a **Preview** button and a download button. The preview runs in a
  frame sandboxed **without** `allow-same-origin`, under a policy that forbids every network request: a
  generated page cannot read the app's data or call its API. Inline scripts and styles work; external ones do not.

## Per-conversation settings

In the composer of a Chat project, **Persona & sampling** opens a popover with a persona (free-form,
with presets), temperature, top-p and max tokens; a dot marks a conversation that overrides anything.
A changed persona is applied to the running context straight away. Under the hood:

`GET/PUT /api/sessions/:id/chat-settings` gives a conversation its own persona (a free-form
system prompt, appended to the session's instructions) and sampling (temperature, top-p,
max tokens). They override the per-model settings, which override the built-in model
profile. Changing the persona flags the session as needing a context rebase, like editing
project instructions.
