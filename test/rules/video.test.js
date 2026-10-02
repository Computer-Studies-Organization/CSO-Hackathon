import { readFileSync } from 'node:fs'
import { before, after, describe, it } from 'node:test'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'

let testEnv

const githubToken = (id) => ({
  firebase: { identities: { 'github.com': [String(id)] }, sign_in_provider: 'github.com' },
})

// Minimal valid video_submissions doc — everything else the rules leave open.
const videoDoc = (uid, extra = {}) => ({
  userId: uid,
  groupName: 'Group Alpha',
  description: 'demo',
  members: [],
  membersName: '',
  videoUrl: `https://cso-opensource.pages.dev/videos/${uid}/abc.mp4`,
  r2Key: `videos/${uid}/abc.mp4`,
  contentType: 'video/mp4',
  sizeBytes: 1000,
  ...extra,
})

const asUser = (uid) => testEnv.authenticatedContext(uid, githubToken('1')).firestore()

before(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'staff/admin1'), {
      role: 'admin',
      active: true,
      uid: 'admin1',
      githubUsername: 'alice',
      displayName: 'Alice',
    })
  })
})

after(async () => {
  await testEnv.cleanup()
})

describe('video_submissions create (reduced upload companion keys)', () => {
  it('V1: create without r2OriginalKey (raw upload): ALLOW', async () => {
    await assertSucceeds(setDoc(doc(asUser('u1'), 'video_submissions/u1'), videoDoc('u1')))
  })

  it('V2: create with a matching .original companion: ALLOW', async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser('u2'), 'video_submissions/u2'),
        videoDoc('u2', {
          r2OriginalKey: 'videos/u2/abc.mov.original',
          sizeBytesOriginal: 5000,
        }),
      ),
    )
  })

  it('V3: r2OriginalKey missing the .original suffix: DENY', async () => {
    await assertFails(
      setDoc(
        doc(asUser('u3'), 'video_submissions/u3'),
        videoDoc('u3', { r2OriginalKey: 'videos/u3/abc.mov' }),
      ),
    )
  })

  it('V4: r2OriginalKey under another user folder: DENY', async () => {
    await assertFails(
      setDoc(
        doc(asUser('u4'), 'video_submissions/u4'),
        videoDoc('u4', { r2OriginalKey: 'videos/somebody-else/abc.mov.original' }),
      ),
    )
  })

  it('V5: sizeBytesOriginal must be a number: DENY', async () => {
    await assertFails(
      setDoc(
        doc(asUser('u5'), 'video_submissions/u5'),
        videoDoc('u5', { r2OriginalKey: 'videos/u5/abc.mov.original', sizeBytesOriginal: 'big' }),
      ),
    )
  })

  it('V6: someone else writes my doc id: DENY', async () => {
    await assertFails(setDoc(doc(asUser('attacker'), 'video_submissions/u6'), videoDoc('u6')))
  })

  it('V7: legacy workers.dev playback URL still accepted: ALLOW', async () => {
    await assertSucceeds(
      setDoc(
        doc(asUser('u7'), 'video_submissions/u7'),
        videoDoc('u7', { videoUrl: 'https://cso-videos.example.workers.dev/videos/u7/abc.mp4' }),
      ),
    )
  })
})

describe('video_submissions update', () => {
  it('V8: admin attaches the .original key after a re-process: ALLOW', async () => {
    const db = testEnv.authenticatedContext('admin1', githubToken('9')).firestore()
    await assertSucceeds(
      updateDoc(doc(db, 'video_submissions/u1'), {
        r2OriginalKey: 'videos/u1/abc.mov.original',
        sizeBytesOriginal: 5000,
      }),
    )
  })

  it('V9: admin cannot smuggle a driveUrl in: DENY', async () => {
    const db = testEnv.authenticatedContext('admin1', githubToken('9')).firestore()
    await assertFails(updateDoc(doc(db, 'video_submissions/u1'), { driveUrl: 'https://x' }))
  })
})
