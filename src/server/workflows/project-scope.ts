/**
 * Whether a workflow may run in a project of the given function. Mirrors what the
 * interface already hides (`filterByProjectType`), so a stale tab, an MCP client or a
 * task cannot start a chat workflow in a dev project or the dev build loop in a GTD one.
 *
 * Workflows without a category (custom user/project ones) run anywhere, except the
 * built-in `default`, which is the dev build-and-verify loop.
 */
export function workflowFitsProject(
  workflow: { id: string; category?: string | undefined },
  projectType: string,
  isBuiltIn: boolean,
): boolean {
  const category = workflow.category?.trim() || (isBuiltIn && workflow.id === 'default' ? 'dev' : '')
  return !category || category === projectType
}
