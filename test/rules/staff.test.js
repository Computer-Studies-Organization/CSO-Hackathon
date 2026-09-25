import { readFileSync } from 'node:fs'
import { before, after, describe, it } from 'node:test'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'

let testEnv

const githubToken = (id) => ({
  firebase: { identities: { 'github.com': [String(id)] }, sign_in_provider: 'github.com' },
})

const passwordToken = {
  firebase: { identities: { email: ['someone@example.com'] }, sign_in_provider: 'password' },
}

const claim = (db, uid, githubUsername, role = 'admin') =>
  setDoc(doc(db, 'staff', uid), {
    uid,
    githubUsername,
    role,
    active: true,
  })

before(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'staff/super1'), {
      role: 'superadmin',
      active: true,
      uid: 'super1',
      displayName: 'Super',
    })
    await setDoc(doc(db, 'staff/admin1'), {
      role: 'admin',
      active: true,
      uid: 'admin1',
      githubUsername: 'alice',
      displayName: 'Alice',
    })
    await setDoc(doc(db, 'staff/judge1'), {
      role: 'judge',
      active: true,
      uid: 'judge1',
      githubUsername: 'janedoe',
      displayName: 'Judge One',
    })
    await setDoc(doc(db, 'staff/legacy1'), {
      role: 'staff',
      active: true,
      uid: null,
      githubUsername: 'olduser',
      displayName: 'Legacy',
    })
    await setDoc(doc(db, 'staff_invites/bob'), {
      githubUsername: 'bob',
      displayName: 'Bob',
      role: 'admin',
      active: true,
      githubId: '777',
    })
    await setDoc(doc(db, 'staff_invites/carol'), {
      githubUsername: 'carol',
      displayName: 'Carol',
      role: 'admin',
      active: true,
    })
  })
})

after(async () => {
  await testEnv.cleanup()
})

describe('invite claim bound to GitHub identity (3a)', () => {
  it('R1: claim with matching githubId in invite + token identity -> ALLOW', async () => {
    const db = testEnv.authenticatedContext('bobuid', githubToken('777')).firestore()
    await assertSucceeds(claim(db, 'bobuid', 'bob'))
  })

  it('R2: attacker claims bob invite with their own githubId -> DENY', async () => {
    const db = testEnv.authenticatedContext('eviluid', githubToken('999')).firestore()
    await assertFails(claim(db, 'eviluid', 'bob'))
  })

  it('R3: invite without githubId (not backfilled) -> DENY', async () => {
    const db = testEnv.authenticatedContext('caroluid', githubToken('555')).firestore()
    await assertFails(claim(db, 'caroluid', 'carol'))
  })

  it('R3b: password-provider token on a valid invite -> DENY', async () => {
    const db = testEnv.authenticatedContext('pwuid', passwordToken).firestore()
    await assertFails(claim(db, 'pwuid', 'bob'))
  })

  it('R14: no invite at all -> DENY (registration stays closed)', async () => {
    const db = testEnv.authenticatedContext('nobody', githubToken('1')).firestore()
    await assertFails(claim(db, 'nobody', 'nobody'))
  })
})

describe('role immutability + create caps (3b)', () => {
  const asAdmin = () => testEnv.authenticatedContext('admin1', githubToken('111')).firestore()

  it('R4: admin flips judge doc role -> superadmin: DENY', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'staff/judge1'), { role: 'superadmin' }))
  })

  it('R12: admin flips judge doc role -> admin: DENY', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'staff/judge1'), { role: 'admin' }))
  })

  it('R5: admin creates doc with role superadmin: DENY', async () => {
    await assertFails(
      setDoc(doc(asAdmin(), 'staff/x1'), { role: 'superadmin', active: true, uid: 'x1' }),
    )
  })

  it('R6: admin edits displayName / toggles active on judge: ALLOW', async () => {
    const ref = doc(asAdmin(), 'staff/judge1')
    await assertSucceeds(updateDoc(ref, { displayName: 'Judge Updated' }))
    await assertSucceeds(updateDoc(ref, { active: false }))
    await assertSucceeds(updateDoc(ref, { active: true }))
  })

  it('R8: admin update targeting superadmin doc: DENY', async () => {
    await assertFails(updateDoc(doc(asAdmin(), 'staff/super1'), { active: false }))
  })

  it('R9: admin creates a judge doc: ALLOW', async () => {
    await assertSucceeds(
      setDoc(doc(asAdmin(), 'staff/newjudge'), {
        role: 'judge',
        active: true,
        uid: 'newjudge',
        displayName: 'New Judge',
      }),
    )
  })

  it('R13: superadmin flips admin role -> superadmin (break-glass): ALLOW', async () => {
    const db = testEnv.authenticatedContext('super1').firestore()
    await assertSucceeds(updateDoc(doc(db, 'staff/admin1'), { role: 'superadmin' }))
    // Superadmin docs are untouchable by the rules (by design — branch 1
    // excludes them), so the flip-back runs with rules disabled to keep
    // later tests isolated.
    await testEnv.withSecurityRulesDisabled(async (ctx) =>
      updateDoc(doc(ctx.firestore(), 'staff/admin1'), { role: 'admin' }),
    )
  })
})

describe('presence touch, migration, submissions', () => {
  it('R7: any signed-in user updates only lastLoginAt: ALLOW', async () => {
    const db = testEnv.authenticatedContext('random1', githubToken('42')).firestore()
    await assertSucceeds(updateDoc(doc(db, 'staff/admin1'), { lastLoginAt: serverTimestamp() }))
  })

  it('R11: superadmin runs staff->judge role migration: ALLOW', async () => {
    const db = testEnv.authenticatedContext('super1').firestore()
    await assertSucceeds(updateDoc(doc(db, 'staff/legacy1'), { role: 'judge' }))
  })

  it('R10: participant creates own submission doc: ALLOW', async () => {
    const db = testEnv.authenticatedContext('random1', githubToken('42')).firestore()
    await assertSucceeds(
      setDoc(doc(db, 'submissions/random1'), {
        userId: 'random1',
        projectName: 'Cool Project',
        repositoryUrl: 'https://github.com/alice/cool-repo',
      }),
    )
  })
})
