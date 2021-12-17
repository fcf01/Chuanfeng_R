import * as semver from 'semver'
import { getDotComAPIEndpoint } from './api'
import { assertNonNullable } from './fatal-error'

type VersionConstraint = {
  /** Whether this constrain will be satisfied when using GitHub.com */
  dotcom: boolean
  /**
   * Whether this constrain will be satisfied when using GitHub AE
   * Supports specifying a version constraint as a SemVer Range (ex: >= 3.1.0)
   */
  ae: boolean | string
  /**
   * Whether this constrain will be satisfied when using GitHub Enterprise
   * Server. Supports specifying a version constraint as a SemVer Range (ex: >=
   * 3.1.0)
   */
  es: boolean | string
}

/**
 * If we're connected to a GHES instance but it doesn't report a version
 * number (either because of corporate proxies that strip the version
 * header or because GHES stops sending the version header in the future)
 * we'll assume it's this version.
 *
 * This should correspond loosely with the oldest supported GHES series and
 * needs to be updated manually.
 */
const assumedGHESVersion = new semver.SemVer('3.1.0')

/**
 * If we're connected to a GHAE instance we won't know its version number
 * since it doesn't report that so we'll use this substitute GHES equivalent
 * version number.
 *
 * This should correspond loosely with the most recent GHES series and
 * needs to be updated manually.
 */
const assumedGHAEVersion = new semver.SemVer('3.3.0')

const rawVersionCache = new Map<string, string>()
const versionCache = new Map<string, semver.SemVer>()
const endpointVersionKey = (ep: string) => `endpoint-version/${ep}`

/**
 * Whether or not the given endpoint URI matches GitHub.com's
 *
 * I.e. https://api.github.com/
 *
 * Most often used to check if an endpoint _isn't_ GitHub.com meaning it's
 * either GitHub Enterprise Server or GitHub AE
 */
export const isDotCom = (ep: string) => ep === getDotComAPIEndpoint()

/**
 * Whether or not the given endpoint URI appears to point to a GitHub AE
 * instance
 */
export const isGHAE = (ep: string) => /^https:\/\/\w+\.ghe\.com$/i.test(ep)

/**
 * Whether or not the given endpoint URI appears to point to a GitHub Enterprise
 * servicer instance
 */
export const isGHES = (ep: string) => !isDotCom(ep) && !isGHAE(ep)

function getEndpointVersion(endpoint: string) {
  const cached = versionCache.get(endpoint)
  if (cached !== undefined) {
    return cached
  }

  const key = endpointVersionKey(endpoint)
  const raw = localStorage.get(key)
  const parsed = semver.parse(raw)

  if (parsed !== null) {
    rawVersionCache.set(endpoint, raw)
    versionCache.set(endpoint, parsed)
  }

  return parsed ?? assumedGHESVersion
}

/**
 * Update the known version number for a given endpoint
 */
export function updateEndpointVersion(endpoint: string, version: string) {
  if (rawVersionCache.get(endpointVersionKey(endpoint)) === version) {
    return
  }

  const parsed = semver.parse(version)

  if (parsed === null) {
    return
  }

  const key = endpointVersionKey(endpoint)
  localStorage.setItem(key, version)
  rawVersionCache.set(key, version)
  versionCache.set(key, parsed)
}

function checkConstraint(
  epConstraint: string | boolean,
  epMatchesType: boolean,
  epVersion?: semver.SemVer
) {
  // Approval of endpoint type regardless of version
  if (epConstraint === true) {
    return epMatchesType
  }

  // Denial of endpoint type regardless of version
  if (epConstraint === false) {
    return !epMatchesType
  }

  // Version number constraint
  assertNonNullable(epVersion, `Need to provide a version to compare against`)
  return epMatchesType && semver.satisfies(epVersion, epConstraint)
}

/**
 * Returns a predicate which verifies whether a given endpoint matches the
 * provided constraints.
 *
 * Note: NOT ment for direct consumption, only exported for testability reasons.
 *       Consumers should use the various `supports*` methods instead.
 */
export const endpointSatisfies = (
  { dotcom, ae, es }: VersionConstraint,
  endpointVersion?: semver.SemVer
) => (ep: string) =>
  checkConstraint(dotcom, isDotCom(ep)) ||
  checkConstraint(ae, isGHAE(ep), assumedGHAEVersion) ||
  checkConstraint(es, isGHES(ep), endpointVersion ?? getEndpointVersion(ep))

/**
 * Whether or not the endpoint supports the internal GitHub Enterprise Server
 * avatars API
 */
export const supportsAvatarsAPI = endpointSatisfies({
  dotcom: false,
  ae: '>= 3.0.0',
  es: '>= 3.0.0',
})

export const supportsRerunningChecks = endpointSatisfies({
  dotcom: true,
  ae: '>= 3.4.0',
  es: '>= 3.4.0',
})
