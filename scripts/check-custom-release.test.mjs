import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import http from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modulePath = path.join(__dirname, 'check-custom-release.mjs')

function createJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body
    },
    async text() {
      return JSON.stringify(body)
    },
  }
}

async function loadModule() {
  return import(`${pathToFileURL(modulePath).href}?cacheBust=${Date.now()}`)
}

test('checkCustomRelease returns shouldBuild=true when no prereleases exist', async () => {
  const { checkCustomRelease } = await loadModule()
  const requests = []
  const sourceSha = '1234567890abcdef1234567890abcdef12345678'

  const result = await checkCustomRelease({
    apiUrl: 'https://api.github.test',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })

      if (url.endsWith('/repos/mattv8/openchamber/commits/openchamber-custom')) {
        return createJsonResponse(200, { sha: sourceSha })
      }

      if (url.endsWith('/repos/mattv8/openchamber-testing/releases?per_page=100&page=1')) {
        return createJsonResponse(200, [])
      }

      throw new Error(`Unexpected URL: ${url}`)
    },
    releaseRepo: 'mattv8/openchamber-testing',
    sourceRef: 'openchamber-custom',
    sourceRepo: 'mattv8/openchamber',
    token: 'test-token',
  })

  assert.deepEqual(result, { sourceSha, shouldBuild: true })
  assert.equal(requests.length, 2)
})

test('checkCustomRelease returns shouldBuild=false when the latest prerelease matches the source SHA', async () => {
  const { checkCustomRelease } = await loadModule()
  const sourceSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

  const result = await checkCustomRelease({
    apiUrl: 'https://api.github.test',
    fetchImpl: async (url) => {
      if (url.endsWith('/repos/mattv8/openchamber/commits/openchamber-custom')) {
        return createJsonResponse(200, { sha: sourceSha })
      }

      if (url.endsWith('/repos/mattv8/openchamber-testing/releases?per_page=100&page=1')) {
        return createJsonResponse(200, [
          {
            prerelease: true,
            body: `Source commit: [${sourceSha}](https://github.com/mattv8/openchamber/commit/${sourceSha})`,
          },
        ])
      }

      throw new Error(`Unexpected URL: ${url}`)
    },
    releaseRepo: 'mattv8/openchamber-testing',
    sourceRef: 'openchamber-custom',
    sourceRepo: 'mattv8/openchamber',
    token: 'test-token',
  })

  assert.deepEqual(result, { sourceSha, shouldBuild: false })
})

test('checkCustomRelease paginates through releases and finds a matching prerelease on page two', async () => {
  const { checkCustomRelease } = await loadModule()
  const requests = []
  const sourceSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const unrelatedReleases = Array.from({ length: 100 }, (_, index) => ({
    prerelease: true,
    body: `Source commit: [${index.toString().padStart(40, '0')}](https://github.com/mattv8/openchamber/commit/${index.toString().padStart(40, '0')})`,
  }))

  const result = await checkCustomRelease({
    apiUrl: 'https://api.github.test',
    fetchImpl: async (url) => {
      requests.push(url)

      if (url.endsWith('/repos/mattv8/openchamber/commits/openchamber-custom')) {
        return createJsonResponse(200, { sha: sourceSha })
      }

      if (url.endsWith('/repos/mattv8/openchamber-testing/releases?per_page=100&page=1')) {
        return createJsonResponse(200, unrelatedReleases)
      }

      if (url.endsWith('/repos/mattv8/openchamber-testing/releases?per_page=100&page=2')) {
        return createJsonResponse(200, [
          {
            prerelease: true,
            body: `Source commit: [${sourceSha}](https://github.com/mattv8/openchamber/commit/${sourceSha})`,
          },
        ])
      }

      throw new Error(`Unexpected URL: ${url}`)
    },
    releaseRepo: 'mattv8/openchamber-testing',
    sourceRef: 'openchamber-custom',
    sourceRepo: 'mattv8/openchamber',
    token: 'test-token',
  })

  assert.deepEqual(result, { sourceSha, shouldBuild: false })
  assert.ok(requests.some((url) => url.endsWith('page=2')))
})

test('checkCustomRelease ignores unrelated and malformed release bodies', async () => {
  const { checkCustomRelease } = await loadModule()
  const sourceSha = 'cccccccccccccccccccccccccccccccccccccccc'

  const result = await checkCustomRelease({
    apiUrl: 'https://api.github.test',
    fetchImpl: async (url) => {
      if (url.endsWith('/repos/mattv8/openchamber/commits/openchamber-custom')) {
        return createJsonResponse(200, { sha: sourceSha })
      }

      if (url.endsWith('/repos/mattv8/openchamber-testing/releases?per_page=100&page=1')) {
        return createJsonResponse(200, [
          { prerelease: true, body: null },
          { prerelease: true, body: `Source commit: [${sourceSha}](https://github.com/other/repo/commit/${sourceSha})` },
          { prerelease: true, body: `Source commit: [${sourceSha.slice(0, 39)}](https://github.com/mattv8/openchamber/commit/${sourceSha.slice(0, 39)})` },
          { prerelease: false, body: `Source commit: [${sourceSha}](https://github.com/mattv8/openchamber/commit/${sourceSha})` },
        ])
      }

      throw new Error(`Unexpected URL: ${url}`)
    },
    releaseRepo: 'mattv8/openchamber-testing',
    sourceRef: 'openchamber-custom',
    sourceRepo: 'mattv8/openchamber',
    token: 'test-token',
  })

  assert.deepEqual(result, { sourceSha, shouldBuild: true })
})

test('checkCustomRelease rejects when the source SHA is malformed', async () => {
  const { checkCustomRelease } = await loadModule()

  await assert.rejects(
    checkCustomRelease({
      apiUrl: 'https://api.github.test',
      fetchImpl: async (url) => {
        if (url.endsWith('/repos/mattv8/openchamber/commits/openchamber-custom')) {
          return createJsonResponse(200, { sha: 'ABC123' })
        }

        throw new Error(`Unexpected URL: ${url}`)
      },
      releaseRepo: 'mattv8/openchamber-testing',
      sourceRef: 'openchamber-custom',
      sourceRepo: 'mattv8/openchamber',
      token: 'test-token',
    }),
    /source SHA/i,
  )
})

test('checkCustomRelease rejects on HTTP failure', async () => {
  const { checkCustomRelease } = await loadModule()

  await assert.rejects(
    checkCustomRelease({
      apiUrl: 'https://api.github.test',
      fetchImpl: async (url) => {
        if (url.endsWith('/repos/mattv8/openchamber/commits/openchamber-custom')) {
          return createJsonResponse(503, { message: 'Service unavailable' })
        }

        throw new Error(`Unexpected URL: ${url}`)
      },
      releaseRepo: 'mattv8/openchamber-testing',
      sourceRef: 'openchamber-custom',
      sourceRepo: 'mattv8/openchamber',
      token: 'test-token',
    }),
    /503|service unavailable/i,
  )
})

test('CLI appends source_sha and should_build to GITHUB_OUTPUT', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'check-custom-release-'))
  const outputPath = path.join(tmpDir, 'github-output.txt')
  await writeFile(outputPath, 'existing=value\n')

  const sourceSha = 'dddddddddddddddddddddddddddddddddddddddd'
  const requests = []
  const server = http.createServer((req, res) => {
    requests.push(req.url)

    if (req.url === '/repos/mattv8/openchamber/commits/openchamber-custom') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ sha: sourceSha }))
      return
    }

    if (req.url === '/repos/mattv8/openchamber-testing/releases?per_page=100&page=1') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify([]))
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Not found' }))
  })

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const apiUrl = `http://127.0.0.1:${address.port}`

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [modulePath], {
        env: {
          ...process.env,
          GITHUB_API_URL: apiUrl,
          GITHUB_OUTPUT: outputPath,
          GITHUB_TOKEN: 'test-token',
          RELEASE_REPO: 'mattv8/openchamber-testing',
          SOURCE_REF: 'openchamber-custom',
          SOURCE_REPO: 'mattv8/openchamber',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(`CLI exited with ${code}: ${stderr}`))
      })
    })

    const output = await readFile(outputPath, 'utf8')
    assert.equal(
      output,
      `existing=value\nsource_sha=${sourceSha}\nshould_build=true\n`,
    )
    assert.deepEqual(requests, [
      '/repos/mattv8/openchamber/commits/openchamber-custom',
      '/repos/mattv8/openchamber-testing/releases?per_page=100&page=1',
    ])
  } finally {
    server.close()
    await rm(tmpDir, { force: true, recursive: true })
  }
})
