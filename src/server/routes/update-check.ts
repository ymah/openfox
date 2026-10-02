/**
 * Whether the in-app "update available" banner should show.
 *
 * A fork build (`2.0.160-fox.4`) is never offered an update: the check compares
 * against the upstream npm package, so it could only ever say "different", and
 * installing upstream would replace the fork with it. A fork is updated by
 * rebuilding from its own repository. `OPENFOX_DISABLE_AUTO_UPDATE=true` turns the
 * banner off for any deployment that is updated some other way (a Docker image).
 */
export function isUpdateAvailable(current: string, latest: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env['OPENFOX_DISABLE_AUTO_UPDATE'] === 'true') return false
  if (/-fox\.\d+/.test(current)) return false
  if (latest === 'unknown' || latest === '') return false
  return current !== latest
}
