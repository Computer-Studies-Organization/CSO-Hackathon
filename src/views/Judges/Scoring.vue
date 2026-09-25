<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ChevronDown, ExternalLink, Save } from 'lucide-vue-next'

import { useAuthStore } from '@/stores/auth'
import { useSubmissionStore } from '@/stores/submission'
import { useVideoSubmissionStore } from '@/stores/videosubmission'
import { useScoresStore, totalOf, percentOf } from '@/stores/scores'
import { CRITERIA, TOTAL_MAX } from '@/config/criteria'
import PaginationBar from '@/components/PaginationBar.vue'
import { usePagination } from '@/composables/usePagination'

const authStore = useAuthStore()
const submissionStore = useSubmissionStore()
const videoStore = useVideoSubmissionStore()
const scoresStore = useScoresStore()

const search = ref('')
const openUid = ref(null)
const notice = ref(null)

const draft = reactive({
  scores: Object.fromEntries(CRITERIA.map((c) => [c.key, null])),
  comments: '',
})

const judgeUid = computed(() => authStore.user?.uid || '')

onMounted(() => {
  submissionStore.fetchAll().catch(() => {})
  videoStore.fetchAll().catch(() => {})
  if (judgeUid.value) {
    scoresStore.fetchMine(judgeUid.value).catch(() => {})
  }
})

// One row per participant uid: a team's repo sheet and video sheet share
// the uid, so they merge into a single scoring row.
const rows = computed(() => {
  const map = new Map()

  for (const s of submissionStore.submissions) {
    map.set(s.id, { uid: s.id, repo: s, video: null })
  }

  for (const v of videoStore.submissions) {
    const row = map.get(v.id)
    if (row) row.video = v
    else map.set(v.id, { uid: v.id, repo: null, video: v })
  }

  return [...map.values()]
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = rows.value
  if (!q) return list

  return list.filter((r) =>
    [
      r.repo?.groupName,
      r.repo?.projectName,
      r.repo?.githubUsername,
      r.repo?.techStack,
      r.video?.groupName,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  )
})

const {
  pageItems,
  page,
  pageCount,
  from,
  to,
  total,
  showAll,
  canPrev,
  canNext,
  pageSize,
  prev,
  next,
  toggleShowAll,
} = usePagination(filtered, { resetOn: [search] })

const label = (r) => r.repo?.groupName || r.video?.groupName || r.repo?.projectName || 'Untitled'

const savedFor = (uid) => scoresStore.mine[uid] || null

const judgedCount = computed(() => rows.value.filter((r) => savedFor(r.uid)?.total > 0).length)

const avgPercent = computed(() => {
  const entries = rows.value.map((r) => savedFor(r.uid)).filter((e) => e && e.total > 0)

  if (!entries.length) return 0
  return (
    Math.round((entries.reduce((sum, e) => sum + (e.percent || 0), 0) / entries.length) * 10) / 10
  )
})

const toggle = (r) => {
  if (openUid.value === r.uid) {
    openUid.value = null
    return
  }

  const existing = savedFor(r.uid)

  for (const c of CRITERIA) {
    draft.scores[c.key] = existing?.scores?.[c.key] ?? null
  }
  draft.comments = existing?.comments || ''
  notice.value = null
  openUid.value = r.uid
}

const draftTotal = computed(() => totalOf(draft.scores))
const draftPercent = computed(() => percentOf(draft.scores))

// Every criterion must be an actual number (empty string from a cleared
// input counts as unfilled) before the sheet can be written.
const canSave = computed(() =>
  CRITERIA.every((c) => {
    const v = draft.scores[c.key]
    return typeof v === 'number' && Number.isFinite(v)
  }),
)

const save = async () => {
  notice.value = null

  if (!canSave.value) {
    notice.value = {
      type: 'error',
      text: `Score all ${CRITERIA.length} criteria before saving.`,
    }
    return
  }

  try {
    await scoresStore.saveScore(judgeUid.value, openUid.value, draft.scores, draft.comments)
    notice.value = {
      type: 'success',
      text: `Saved — ${draftTotal.value}/${TOTAL_MAX} (${draftPercent.value}%).`,
    }
  } catch {
    // error already in store
  }
}

const clear = async () => {
  if (!confirm('Clear your score for this entry?')) return

  try {
    await scoresStore.clearScore(judgeUid.value, openUid.value)
    for (const c of CRITERIA) draft.scores[c.key] = null
    draft.comments = ''
    notice.value = { type: 'success', text: 'Score cleared.' }
  } catch {
    // error already in store
  }
}

const error = computed(() => scoresStore.error || submissionStore.error || videoStore.error)
</script>

<template>
  <main>
    <!-- Page Header -->
    <section class="mb-8 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">Judges</p>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">Scoring</h1>
      <p class="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        Score each criterion 0–10 —
        <span class="font-semibold text-white">{{ CRITERIA.length }} × 10 = {{ TOTAL_MAX }}</span>
        points, shown as a percentage. Your scores are private to you until you submit them.
      </p>
    </section>

    <!-- Progress -->
    <section class="mb-6 grid sm:grid-cols-3 gap-4">
      <div
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">Scored</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2 text-yellow-400">
          {{ judgedCount }}<span class="text-xl text-gray-500"> / {{ rows.length }}</span>
        </p>
      </div>
      <div
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">Your average</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2 text-purple-400">{{ avgPercent }}%</p>
      </div>
      <div
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">Maximum per entry</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2 text-sky-400">
          {{ TOTAL_MAX }}
        </p>
      </div>
    </section>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="Search by group, project, username…"
        class="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 outline-none focus:border-purple-400 transition text-sm"
      />
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
      <p class="text-xs text-red-200 leading-relaxed">{{ error }}</p>
    </div>

    <p v-if="scoresStore.isLoading" class="text-sm text-gray-400">Loading your scores…</p>

    <p v-else-if="!filtered.length" class="text-sm text-gray-400">No entries found.</p>

    <!-- Entries -->
    <section class="flex flex-col gap-3">
      <article
        v-for="r in pageItems"
        :key="r.uid"
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 text-white overflow-hidden"
        :class="openUid === r.uid ? 'ring-1 ring-purple-400/40' : ''"
      >
        <!-- Row -->
        <button
          type="button"
          @click="toggle(r)"
          class="w-full text-left p-5 md:p-6 flex items-start gap-4 hover:bg-white/[0.03] transition"
        >
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500">Group</p>
            <p class="font-semibold truncate">{{ label(r) }}</p>
            <p v-if="r.repo?.projectName" class="text-xs text-gray-400 truncate">
              Project: {{ r.repo.projectName }}
            </p>
            <p class="text-xs text-gray-400 truncate">
              <template v-if="r.repo?.githubUsername"> {{ r.repo.githubUsername }} · </template>
              {{ r.video ? 'repo + video' : r.repo ? 'repo only' : 'video only' }}
            </p>
          </div>

          <div class="shrink-0 text-right">
            <template v-if="savedFor(r.uid)">
              <p class="text-2xl font-extrabold text-yellow-400">
                {{ savedFor(r.uid).total
                }}<span class="text-sm text-gray-500">/{{ TOTAL_MAX }}</span>
              </p>
              <p class="text-xs font-bold text-gray-400">{{ savedFor(r.uid).percent }}%</p>
            </template>
            <p v-else class="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Not scored
            </p>
          </div>

          <ChevronDown
            :size="18"
            class="shrink-0 text-gray-500 transition"
            :class="openUid === r.uid ? 'rotate-180 text-purple-400' : ''"
          />
        </button>

        <!-- Expanded: score sheet -->
        <div v-if="openUid === r.uid" class="border-t border-white/10 p-5 md:p-6 bg-black/20">
          <!-- Links -->
          <div class="flex flex-wrap gap-3 mb-5">
            <a
              v-if="r.repo?.repositoryUrl"
              :href="r.repo.repositoryUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1.5 text-xs font-bold text-yellow-300 hover:text-yellow-200 underline"
            >
              Repository <ExternalLink :size="13" />
            </a>
            <a
              v-if="r.video?.videoUrl"
              :href="r.video.videoUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1.5 text-xs font-bold text-sky-300 hover:text-sky-200 underline"
            >
              Watch video <ExternalLink :size="13" />
            </a>
            <span v-else class="text-xs font-bold text-gray-500"> No video submitted </span>
          </div>

          <!-- Criteria -->
          <div class="flex flex-col gap-4">
            <div
              v-for="c in CRITERIA"
              :key="c.key"
              class="rounded-2xl bg-white/5 border border-white/10 p-4"
            >
              <div class="flex items-start justify-between gap-4 mb-3">
                <div class="min-w-0">
                  <p class="font-semibold text-sm">{{ c.title }}</p>
                  <p class="text-xs text-gray-400 mt-0.5">{{ c.description }}</p>
                </div>

                <div class="shrink-0 flex items-center gap-2">
                  <input
                    v-model.number="draft.scores[c.key]"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    :max="c.max"
                    step="1"
                    :aria-label="`${c.title} score (0-${c.max})`"
                    class="w-20 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-center text-sm outline-none focus:border-purple-400 transition"
                  />
                  <span class="text-xs font-bold text-gray-500">/ {{ c.max }}</span>
                </div>
              </div>

              <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  class="h-full rounded-full bg-yellow-400/70 transition-all"
                  :style="{
                    width:
                      (Math.min(Math.max(Number(draft.scores[c.key]) || 0, 0), c.max) / c.max) *
                        100 +
                      '%',
                  }"
                ></div>
              </div>
            </div>
          </div>

          <!-- Comments -->
          <div class="mt-4">
            <label
              for="score-comments"
              class="block mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              Comments <span class="normal-case font-normal">(optional, max 2000 characters)</span>
            </label>
            <textarea
              id="score-comments"
              v-model="draft.comments"
              rows="3"
              maxlength="2000"
              placeholder="Notes on this entry…"
              class="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 outline-none text-sm focus:border-purple-400 transition resize-y"
            ></textarea>
          </div>

          <!-- Totals + actions -->
          <div class="mt-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div class="flex items-baseline gap-2">
              <p class="text-3xl font-extrabold text-yellow-400">
                {{ draftTotal }}<span class="text-lg text-gray-500">/{{ TOTAL_MAX }}</span>
              </p>
              <p class="text-sm font-bold text-gray-400">{{ draftPercent }}%</p>
            </div>

            <div class="sm:ml-auto flex flex-wrap items-center gap-3">
              <button
                v-if="savedFor(r.uid)"
                type="button"
                @click="clear"
                :disabled="scoresStore.isSaving"
                class="px-4 py-2.5 rounded-xl text-xs font-bold transition bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
              >
                Clear
              </button>

              <button
                type="button"
                @click="save"
                :disabled="scoresStore.isSaving || !canSave"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save :size="16" />
                {{ scoresStore.isSaving ? 'Saving…' : 'Save score' }}
              </button>
            </div>
          </div>

          <p v-if="!canSave" class="mt-3 text-xs text-yellow-200/80">
            Fill in all {{ CRITERIA.length }} criteria to save.
          </p>

          <div
            v-if="notice"
            class="mt-4 p-4 rounded-2xl border"
            :class="
              notice.type === 'success'
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-red-500/10 border-red-500/20'
            "
          >
            <p
              class="text-xs leading-relaxed"
              :class="notice.type === 'success' ? 'text-green-200' : 'text-red-200'"
            >
              {{ notice.text }}
            </p>
          </div>
        </div>
      </article>
    </section>

    <PaginationBar
      v-if="!scoresStore.isLoading"
      :from="from"
      :to="to"
      :total="total"
      :page="page"
      :page-count="pageCount"
      :show-all="showAll"
      :can-prev="canPrev"
      :can-next="canNext"
      :page-size="pageSize"
      @prev="prev"
      @next="next"
      @toggle-show-all="toggleShowAll"
    />
  </main>
</template>
