import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SHA_PATTERN = /^[0-9a-f]{40}$/

function buildHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
  }
}

async function fetchJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    headers: buildHeaders(token),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API request failed with ${response.status}: ${body}`)
  }

  return response.json()
}

function getSourceCommitLine(sourceSha, sourceRepo) {
  return `Source commit: [${sourceSha}](https://github.com/${sourceRepo}/commit/${sourceSha})`
}

export async function checkCustomRelease({
  apiUrl,
  fetchImpl,
  releaseRepo,
  sourceRef,
  sourceRepo,
  token,
}) {
  const sourceCommit = await fetchJson(
    fetchImpl,
    `${apiUrl}/repos/${sourceRepo}/commits/${sourceRef}`,
    token,
  )
  const sourceSha = sourceCommit?.sha

  if (!SHA_PATTERN.test(sourceSha ?? '')) {
    throw new Error(`Malformed source SHA: ${sourceSha ?? '<missing>'}`)
  }

  const sourceCommitLine = getSourceCommitLine(sourceSha, sourceRepo)

  for (let page = 1; ; page += 1) {
    const releases = await fetchJson(
      fetchImpl,
      `${apiUrl}/repos/${releaseRepo}/releases?per_page=100&page=${page}`,
      token,
    )

    for (const release of releases) {
      if (release?.prerelease !== true) {
        continue
      }

      if (typeof release.body === 'string' && release.body.includes(sourceCommitLine)) {
        return { sourceSha, shouldBuild: false }
      }
    }

    if (releases.length < 100) {
      return { sourceSha, shouldBuild: true }
    }
  }
}

async function main() {
  const {
    GITHUB_API_URL = 'https://api.github.com',
    GITHUB_OUTPUT,
    GITHUB_TOKEN,
    RELEASE_REPO,
    SOURCE_REF,
    SOURCE_REPO,
  } = process.env

  if (!GITHUB_OUTPUT || !GITHUB_TOKEN || !RELEASE_REPO || !SOURCE_REF || !SOURCE_REPO) {
    throw new Error('Missing required environment variables')
  }

  const result = await checkCustomRelease({
    apiUrl: GITHUB_API_URL,
    fetchImpl: fetch,
    releaseRepo: RELEASE_REPO,
    sourceRef: SOURCE_REF,
    sourceRepo: SOURCE_REPO,
    token: GITHUB_TOKEN,
  })

  await appendFile(
    GITHUB_OUTPUT,
    `source_sha=${result.sourceSha}\nshould_build=${result.shouldBuild}\n`,
  )
}

const isMainModule = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
