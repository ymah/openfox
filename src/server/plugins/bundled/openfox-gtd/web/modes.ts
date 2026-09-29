import type { BundledPluginModes } from '@/lib/bundled-plugin-modes'

/**
 * The `gtd` project function. GTD contributes no pages — it reuses the ordinary
 * session/chat screen — so it declares only its mode, and disabling the plugin
 * removes the GTD project type along with its agents, workflows and skill.
 */
const modes: BundledPluginModes = {
  pluginId: 'openfox-gtd',
  modes: [
    {
      value: 'gtd',
      label: { en: 'GTD', fr: 'GTD' },
      description: {
        en: 'This folder becomes a GTD vault — capture, clarify, dispatch. See docs/GTD.md.',
        fr: 'Ce dossier devient un vault GTD — capture, clarification, dispatch. Voir docs/GTD.md.',
      },
      tone: 'amber',
      showsDevChrome: false,
      defaultAgent: 'gtd-secretary',
    },
  ],
}

export default modes
