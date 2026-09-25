import { defineStore } from 'pinia'
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'

import { db } from '@/firebase/config'
import { CRITERIA, TOTAL_MAX } from '@/config/criteria'

// scores/{judgeUid}/entries/{participantUid}
const SCORES = 'scores'
const ENTRIES = 'entries'

export const CRITERION_KEYS = CRITERIA.map((c) => c.key)

export function emptyScores() {
  return Object.fromEntries(CRITERIA.map((c) => [c.key, null]))
}

// Clamps to each criterion's own max so a stale criterion in a saved doc
// can never push a total past 50.
function normalizeScores(raw) {
  const out = emptyScores()
  if (!raw || typeof raw !== 'object') return out

  for (const c of CRITERIA) {
    const v = Number(raw[c.key])
    out[c.key] = Number.isFinite(v) ? Math.min(c.max, Math.max(0, Math.round(v))) : null
  }
  return out
}

// Nulls count as 0, so a half-finished sheet still shows a running total.
export function totalOf(scores) {
  let total = 0
  for (const c of CRITERIA) {
    const v = Number(scores?.[c.key])
    if (Number.isFinite(v)) total += v
  }
  return total
}

// percent = total / 50 * 100 — exactly the 5 × 20% weighting.
export function percentOf(scores) {
  return Math.round((totalOf(scores) / TOTAL_MAX) * 1000) / 10
}

export const useScoresStore = defineStore('scores', {
  state: () => ({
    // Signed-in judge's own sheets: { [participantUid]: entry }
    mine: {},
    // Admin view: flat list of every judge's entries, each tagged with
    // judgeUid / judgeEmail / judgeName.
    all: [],
    isLoading: false,
    isSaving: false,
    error: null,
  }),

  getters: {
    myTotal: () => (scores) => totalOf(scores),
    myPercent: () => (scores) => percentOf(scores),

    // How many of the current submissions this judge has already scored.
    progress(state) {
      const scored = Object.values(state.mine).filter(
        (e) => e && typeof e.total === 'number' && e.total > 0,
      ).length
      return { scored }
    },
  },

  actions: {
    _entryRef(judgeUid, participantUid) {
      return doc(db, SCORES, judgeUid, ENTRIES, participantUid)
    },

    async fetchMine(judgeUid) {
      if (!judgeUid) {
        this.mine = {}
        return this.mine
      }

      this.isLoading = true
      this.error = null

      try {
        const snap = await getDocs(collection(db, SCORES, judgeUid, ENTRIES))

        const map = {}
        for (const d of snap.docs) {
          const data = d.data()
          map[d.id] = {
            id: d.id,
            ...data,
            scores: normalizeScores(data.scores),
            total: Number.isFinite(data.total) ? data.total : totalOf(data.scores),
            percent: Number.isFinite(data.percent) ? data.percent : percentOf(data.scores),
          }
        }

        this.mine = map
        return this.mine
      } catch (error) {
        console.error('Fetch own scores error:', error)
        this.error = error.message || 'Unable to load your scores.'
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async saveScore(judgeUid, participantUid, scores, comments = '') {
      if (!judgeUid) throw new Error('Missing judge uid.')

      this.isSaving = true
      this.error = null

      try {
        const clean = normalizeScores(scores)
        const total = totalOf(clean)
        const percent = percentOf(clean)
        const text = String(comments || '').slice(0, 2000)

        const ref = this._entryRef(judgeUid, participantUid)
        const now = serverTimestamp()

        await setDoc(
          ref,
          {
            uid: participantUid,
            judgeUid,
            scores: clean,
            total,
            percent,
            comments: text,
            updatedAt: now,
            // Only set on first write so a re-score keeps the original time.
            createdAt: now,
          },
          { merge: true },
        )

        this.mine = {
          ...this.mine,
          [participantUid]: {
            id: participantUid,
            uid: participantUid,
            judgeUid,
            scores: clean,
            total,
            percent,
            comments: text,
          },
        }

        return this.mine[participantUid]
      } catch (error) {
        console.error('Save score error:', error)
        this.error = error.message || 'Unable to save the score.'
        throw error
      } finally {
        this.isSaving = false
      }
    },

    async clearScore(judgeUid, participantUid) {
      if (!judgeUid) return

      this.isSaving = true
      this.error = null

      try {
        await deleteDoc(this._entryRef(judgeUid, participantUid))

        const next = { ...this.mine }
        delete next[participantUid]
        this.mine = next
      } catch (error) {
        console.error('Clear score error:', error)
        this.error = error.message || 'Unable to clear the score.'
        throw error
      } finally {
        this.isSaving = false
      }
    },

    // Admin: read every judge's subcollection. Judges come from the staff
    // store so this stays a handful of parallel reads (one per judge) and
    // needs no collection-group query.
    async fetchAllForAdmin(judges) {
      this.isLoading = true
      this.error = null
      this.all = []

      try {
        const list = (judges || []).filter((j) => j && j.uid)

        const snapshots = await Promise.all(
          list.map((j) => getDocs(collection(db, SCORES, j.uid, ENTRIES)).catch(() => null)),
        )

        const rows = []
        snapshots.forEach((snap, i) => {
          if (!snap) return
          const judge = list[i]
          for (const d of snap.docs) {
            const data = d.data()
            rows.push({
              id: `${judge.uid}:${d.id}`,
              participantUid: d.id,
              judgeUid: judge.uid,
              judgeEmail: judge.email || '',
              judgeName: judge.displayName || judge.email || judge.uid,
              ...data,
              scores: normalizeScores(data.scores),
              total: Number.isFinite(data.total) ? data.total : totalOf(data.scores),
              percent: Number.isFinite(data.percent) ? data.percent : percentOf(data.scores),
            })
          }
        })

        rows.sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() ?? 0
          const tb = b.updatedAt?.toMillis?.() ?? 0
          return tb - ta
        })

        this.all = rows
        return this.all
      } catch (error) {
        console.error('Fetch all scores error:', error)
        this.error = error.message || 'Unable to load scores.'
        throw error
      } finally {
        this.isLoading = false
      }
    },

    // Admin: collapse `all` into one row per participant — how many judges
    // scored them, plus the mean total/percent across those judges.
    leaderboard(state = this.all) {
      const byParticipant = new Map()

      for (const row of state) {
        const key = row.participantUid
        if (!key) continue

        const entry = byParticipant.get(key) || {
          participantUid: key,
          judgeCount: 0,
          totalSum: 0,
          percentSum: 0,
          best: 0,
        }

        entry.judgeCount += 1
        entry.totalSum += row.total || 0
        entry.percentSum += row.percent || 0
        entry.best = Math.max(entry.best, row.total || 0)

        byParticipant.set(key, entry)
      }

      return [...byParticipant.values()]
        .map((e) => ({
          ...e,
          avgTotal: Math.round((e.totalSum / e.judgeCount) * 10) / 10,
          avgPercent: Math.round((e.percentSum / e.judgeCount) * 10) / 10,
        }))
        .sort((a, b) => b.avgTotal - a.avgTotal)
    },
  },
})
