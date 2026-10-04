/**
 * A route's project is "missing" once its fetch has settled without a project
 * (`null` for a 404, or an error) and nothing is cached. While it is merely
 * loading (`undefined`) it is not missing — that is what the spinner is for.
 */
export function isProjectMissing(projectId: string | undefined, data: unknown, error: unknown): boolean {
  return Boolean(projectId) && !data && (data === null || Boolean(error))
}
