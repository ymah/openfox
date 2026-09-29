import type { BundledPluginModes } from '@/lib/bundled-plugin-modes'

/**
 * The `writing` project function. Kept in its own component-free module so the
 * core can read the list of project functions without importing React.
 */
const modes: BundledPluginModes = {
  pluginId: 'openfox-writing',
  modes: [
    {
      value: 'writing',
      label: { en: 'Writing', fr: 'Écriture' },
      description: {
        en: 'Novel/book vault — Codex, manuscript, AI writing chat.',
        fr: 'Vault roman/livre — Codex, manuscrit, chat IA d’écriture.',
      },
      tone: 'rose',
      showsDevChrome: false,
      defaultAgent: 'writing-secretary',
      hasCustomHome: true,
    },
  ],
}

export default modes
