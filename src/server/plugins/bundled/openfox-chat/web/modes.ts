import type { BundledPluginModes } from '@/lib/bundled-plugin-modes'

/**
 * The `chat` project function. Kept in its own component-free module so the
 * core can read the list of project functions without importing React.
 */
const modes: BundledPluginModes = {
  pluginId: 'openfox-chat',
  modes: [
    {
      value: 'chat',
      label: { en: 'Chat', fr: 'Chat' },
      description: {
        en: 'A conversation space — general assistant, research, tutor, translation, editing.',
        fr: 'Un espace de conversation — assistant général, recherche, tuteur, traduction, relecture.',
      },
      tone: 'sky',
      showsDevChrome: false,
      chatChrome: true,
      defaultAgent: 'chat-assistant',
      hasCustomHome: true,
    },
  ],
}

export default modes
