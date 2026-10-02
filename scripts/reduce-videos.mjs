#!/usr/bin/env node
/**
 * scripts/reduce-videos.mjs — batch-compress the big objects already in R2.
 *
 * For every `videos/**` object over the size floor it:
 *   1. downloads the object to a temp file
 *   2. re-encodes it with ffmpeg (README recipe: 1080p / 30fps H.264 CRF 23,
 *      +faststart) — never upscales
 *   3. server-side copies the untouched source to `<key>.original`
 *   4. overwrites `<key>` with the reduced file (the public playback URL never
 *      changes)
 *   5. drops the edge-cache entry so the next viewer gets the new bytes
 *
 * Objects that already have a `*.original` companion are skipped, so the run
 * is idempotent. Anything that did not get smaller is left alone.
 *
 * Usage:
 *   node scripts/reduce-videos.mjs                 # process everything ≥ 100MB
 *   node scripts/reduce-videos.mjs --dry-run       # list what it would touch
 *   node scripts/reduce-videos.mjs --min-mb 500    # size floor
 *   node scripts/reduce-videos.mjs --limit 3       # first 3 candidates only
 *
 * Reads R2 S3 credentials from worker/.dev.vars (or the R2_* environment
 * variables) and PURGE_SECRET from the same file (or the environment).
 */
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { AwsClient } from 'aws4fetch'

// ---------------------------------------------------------------------------
// CLI + config
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)

function flag(name, fallback = null) {
  const i = argv.indexOf(name)
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1]
}

const DRY_RUN = argv.includes('--dry-run')
const MIN_MB = Number(flag('--min-mb', '100'))
const LIMIT = Number(flag('--limit', '0')) // 0 = no limit

function parseVars(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return out
}

const devVars = parseVars('worker/.dev.vars')
const env = { ...devVars, ...process.env }

const ACCOUNT_ID = env.R2_ACCOUNT_ID
const ACCESS_KEY = env.R2_ACCESS_KEY_ID
const SECRET_KEY = env.R2_SECRET_ACCESS_KEY
const BUCKET = env.R2_BUCKET || 'cso-video-submissions'

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  console.error('Missing R2 credentials — set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /')
  console.error('R2_SECRET_ACCESS_KEY in worker/.dev.vars or the environment.')
  process.exit(1)
}

const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`
const signer = new AwsClient({
  region: 'auto',
  accessKeyId: ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  service: 's3',
})

const MIN_BYTES = MIN_MB * 1024 * 1024

// ---------------------------------------------------------------------------
// ffmpeg (README recipe)
// ---------------------------------------------------------------------------

let encoder = null
let supportsProfile = false

function detectEncoder() {
  let out = ''
  try {
    out = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
  } catch (err) {
    console.error('ffmpeg not found on PATH:', err.message)
    process.exit(1)
  }
  if (/(^|\s)libx264\s/.test(out)) {
    encoder = 'libx264'
    supportsProfile = true
  } else if (/(^|\s)libopenh264\s/.test(out)) {
    // Fedora's ffmpeg-free build ships openh264 only — no -profile/-level.
    encoder = 'libopenh264'
    supportsProfile = false
  } else {
    console.error('No usable H.264 encoder (need libx264 or libopenh264).')
    console.error('Install the full ffmpeg build, e.g. `sudo dnf install ffmpeg`.')
    process.exit(1)
  }
}

const FILTER = 'scale=-2:min(1080\\,ih),fps=30'

function encodeArgs(input, output) {
  const args = ['-y', '-v', 'error', '-nostdin', '-i', input, '-vf', FILTER, '-c:v', encoder]
  if (supportsProfile) {
    // README recipe — libx264 constant-quality + faststart.
    args.push('-preset', 'medium', '-crf', '23', '-profile:v', 'high', '-level:v', '4.1')
  } else {
    // openh264 (Fedora ffmpeg-free) has no CRF: quality-mode rate control.
    args.push('-rc_mode', 'quality', '-q:v', '32')
  }
  args.push(
    '-pix_fmt',
    'yuv420p',
    '-g',
    '60',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    output,
  )
  return args
}

function runFfmpeg(args) {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let tail = ''
    child.stderr.on('data', (chunk) => {
      tail = (tail + chunk.toString()).slice(-2000)
    })
    child.on('error', (err) => resolve({ code: 127, tail: err.message }))
    child.on('close', (code) => resolve({ code, tail }))
  })
}

// ---------------------------------------------------------------------------
// S3 helpers (path-style, query-signed)
// ---------------------------------------------------------------------------

async function listObjects() {
  const objects = []
  let token = null
  do {
    const url = new URL(endpoint)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('prefix', 'videos/')
    url.searchParams.set('max-keys', '1000')
    if (token) url.searchParams.set('continuation-token', token)

    const res = await fetch(await signer.sign(url.toString(), { method: 'GET' }))
    if (!res.ok)
      throw new Error(`ListObjects failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
    const xml = await res.text()

    for (const block of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([\s\S]*?)<\/Key>/.exec(block[1])?.[1]
      const size = Number(/<Size>(\d+)<\/Size>/.exec(block[1])?.[1])
      if (key) objects.push({ key, size })
    }
    token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] || null
  } while (token)
  return objects
}

async function download(key, dest) {
  const url = new URL(`${endpoint}/${key}`)
  const res = await fetch(await signer.sign(url.toString(), { method: 'GET' }))
  if (!res.ok || !res.body) throw new Error(`GET ${key} failed (${res.status})`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

/** Server-side copy — no re-upload of the multi-hundred-MB original. */
async function copyTo(srcKey, destKey) {
  const url = new URL(`${endpoint}/${destKey}`)
  const req = await signer.sign(url.toString(), {
    method: 'PUT',
    headers: { 'x-amz-copy-source': `/${BUCKET}/${encodeURI(srcKey)}` },
  })
  const res = await fetch(req)
  if (!res.ok) throw new Error(`CopyObject ${srcKey} → ${destKey} failed (${res.status})`)
}

async function upload(key, file) {
  const body = await fs.readFile(file)
  const url = new URL(`${endpoint}/${key}`)
  const req = await signer.sign(url.toString(), {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body,
  })
  const res = await fetch(req)
  if (!res.ok) throw new Error(`PUT ${key} failed (${res.status})`)
}

async function purgeEdge(key) {
  const origin = env.PLAYBACK_ORIGIN || parseWranglerPlaybackOrigin()
  const secret = env.PURGE_SECRET
  if (!origin || !secret) {
    console.warn(`  ! purge skipped for ${key} (set PLAYBACK_ORIGIN + PURGE_SECRET to enable)`)
    return
  }
  try {
    const res = await fetch(`${origin.replace(/\/$/, '')}/videos/__purge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Purge-Secret': secret },
      body: JSON.stringify({ keys: [key] }),
    })
    if (!res.ok) console.warn(`  ! purge failed for ${key} (${res.status})`)
  } catch (err) {
    console.warn(`  ! purge failed for ${key}: ${err.message}`)
  }
}

function parseWranglerPlaybackOrigin() {
  if (!existsSync('worker/wrangler.toml')) return null
  const src = readFileSync('worker/wrangler.toml', 'utf8')
  return /PLAYBACK_ORIGIN\s*=\s*"([^"]+)"/.exec(src)?.[1] || null
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function baseName(key) {
  const dot = key.lastIndexOf('.')
  return dot === -1 ? key : key.slice(0, dot)
}

function plan(objects) {
  // Base names of every `*.original` already in the bucket — one pass instead
  // of an O(n²) scan per candidate.
  const reducedBases = new Set(
    objects
      .filter((o) => o.key.endsWith('.original'))
      .map((o) => baseName(o.key.slice(0, -'.original'.length))),
  )

  const candidates = []
  const skipped = { original: 0, processed: 0, small: 0, probe: 0 }

  for (const { key, size } of objects) {
    if (key.endsWith('.original')) {
      skipped.original++
      continue
    }
    if (key.startsWith('videos/__probe/')) {
      // health-check objects, not submissions
      skipped.probe++
      continue
    }
    if (reducedBases.has(baseName(key))) {
      skipped.processed++
      continue
    }
    if (size < MIN_BYTES) {
      skipped.small++
      continue
    }
    candidates.push({ key, size })
  }
  return { candidates, skipped }
}

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  detectEncoder()
  console.log(`encoder: ${encoder}${supportsProfile ? ' (libx264)' : ' (openh264 fallback)'}`)
  console.log(`bucket:  ${BUCKET}`)
  console.log(`floor:   ${MIN_MB} MB${DRY_RUN ? '  [dry run]' : ''}\n`)

  const objects = await listObjects()
  const { candidates, skipped } = plan(objects)

  console.log(`objects: ${objects.length}  →  candidates: ${candidates.length}`)
  console.log(
    `skipped: ${skipped.processed} already reduced, ${skipped.small} under floor, ${skipped.probe} probes, ${skipped.original} originals\n`,
  )

  const queue = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates
  if (queue.length === 0) {
    console.log('Nothing to do.')
    return
  }

  if (DRY_RUN) {
    for (const { key, size } of queue) console.log(`  would reduce ${key} (${mb(size)})`)
    console.log(`\n${queue.length} file(s) would be processed.`)
    return
  }

  await fs.mkdir(join(tmpdir(), 'cso-reduce'), { recursive: true })

  let processed = 0
  let failed = 0
  let unchanged = 0
  let savedTotal = 0

  for (const [index, { key, size }] of queue.entries()) {
    const tag = `[${index + 1}/${queue.length}]`
    const slot = join(tmpdir(), 'cso-reduce', `${index}`)
    const src = join(slot, 'source')
    const out = join(slot, 'reduced.mp4')

    console.log(`${tag} ${key}  ${mb(size)}`)

    try {
      await fs.mkdir(slot, { recursive: true })
      await download(key, src)

      const result = await runFfmpeg(encodeArgs(src, out))
      if (result.code !== 0) throw new Error(`ffmpeg exited ${result.code}\n${result.tail.trim()}`)

      const reducedSize = (await fs.stat(out)).size
      if (reducedSize >= size) {
        console.log(`  = no gain (${mb(reducedSize)} ≥ ${mb(size)}) — left untouched`)
        unchanged++
        await fs.rm(slot, { recursive: true, force: true })
        continue
      }

      // Order matters: the companion is written first, so a crash between the
      // two writes leaves the public key holding the ORIGINAL (still playable)
      // instead of a half-written reduced file.
      const originalKey = `${key}.original`
      await copyTo(key, originalKey)
      await upload(key, out)
      await purgeEdge(key)

      const saved = size - reducedSize
      savedTotal += saved
      processed++
      console.log(
        `  ✓ ${mb(size)} → ${mb(reducedSize)}  (${Math.round((1 - reducedSize / size) * 100)}% smaller) · original kept at ${originalKey}`,
      )
    } catch (err) {
      failed++
      console.error(`  ✗ ${err.message}`)
    } finally {
      await fs.rm(slot, { recursive: true, force: true })
    }
  }

  console.log(
    `\ndone: ${processed} reduced (${mb(savedTotal)} saved), ${unchanged} skipped, ${failed} failed`,
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
