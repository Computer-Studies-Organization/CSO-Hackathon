<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

import { useStaffStore } from '@/stores/staff'
import { useSubmissionStore } from '@/stores/submission'
import { useVideoSubmissionStore } from '@/stores/videosubmission'
import { useScoresStore } from '@/stores/scores'
import { CRITERIA, TOTAL_MAX } from '@/config/criteria'
import PaginationBar from '@/components/PaginationBar.vue'
import { usePagination } from '@/composables/usePagination'

const staffStore = useStaffStore()
const submissionStore = useSubmissionStore()
const videoStore = useVideoSubmissionStore()
const scoresStore = useScoresStore()

const search = ref('')

onMounted(async () => {
  submissionStore.fetchAll().catch(() => {})
  videoStore.fetchAll().catch(() => {})

  try {
    await staffStore.fetchStaff()
  } catch {
    // staff error already surfaced by the store
  }

  const judges = staffStore.staff.filter((s) => s.role === 'judge' && s.uid)
  scoresStore.fetchAllForAdmin(judges).catch(() => {})
})

const entries = computed(() => scoresStore.all)
const isLoading = computed(
  () => scoresStore.isLoading || submissionStore.isLoading || videoStore.isLoading,
)
const error = computed(() => scoresStore.error || submissionStore.error || videoStore.error)

// uid -> display info, merged across repo + video submissions.
const labelByUid = computed(() => {
  const m = new Map()

  for (const s of submissionStore.submissions) {
    m.set(s.id, {
      group: s.groupName || '',
      project: s.projectName || '',
      owner: s.githubUsername || '',
    })
  }

  for (const v of videoStore.submissions) {
    const e = m.get(v.id)
    if (e) {
      if (!e.group) e.group = v.groupName || ''
    } else {
      m.set(v.id, {
        group: v.groupName || '',
        project: '',
        owner: '',
      })
    }
  }

  return m
})

const labelFor = (uid) => {
  const info = labelByUid.value.get(uid)
  if (!info) return uid || 'Unknown participant'
  return info.group || info.project || info.owner || uid
}

const subLabelFor = (uid) => {
  const info = labelByUid.value.get(uid)
  if (!info) return ''
  return [info.project, info.owner].filter(Boolean).join(' · ')
}

const judgeCount = computed(() => new Set(entries.value.map((e) => e.judgeUid)).size)

const avgPercent = computed(() => {
  if (!entries.value.length) return 0
  return (
    Math.round(
      (entries.value.reduce((s, e) => s + (e.percent || 0), 0) / entries.value.length) * 10,
    ) / 10
  )
})

const leaderboard = computed(() => scoresStore.leaderboard(entries.value))

const filteredLeaderboard = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return leaderboard.value

  return leaderboard.value.filter((row) =>
    [labelFor(row.participantUid), subLabelFor(row.participantUid), row.participantUid]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  )
})

// Group every sheet by judge so the log reads as "who scored what".
const byJudge = computed(() => {
  const groups = new Map()

  for (const e of entries.value) {
    const key = e.judgeUid
    if (!groups.has(key)) {
      groups.set(key, {
        judgeUid: key,
        judgeName: e.judgeName || e.judgeEmail || key,
        judgeEmail: e.judgeEmail || '',
        items: [],
      })
    }
    groups.get(key).items.push(e)
  }

  return [...groups.values()].sort((a, b) => a.judgeName.localeCompare(b.judgeName))
})

const lbPager = reactive(usePagination(filteredLeaderboard, { resetOn: [search] }))

// Paginate sheets across every judge section: flatten to (judge, sheet)
// pairs, page the flat list, then regroup only the current page's pairs.
const flatSheets = computed(() =>
  byJudge.value.flatMap((g) => g.items.map((e) => ({ judgeUid: g.judgeUid, entry: e }))),
)

const sheetPager = reactive(usePagination(flatSheets, { resetOn: [search] }))

const pageJudgeGroups = computed(() => {
  const entriesByJudge = new Map()

  for (const p of sheetPager.pageItems) {
    if (!entriesByJudge.has(p.judgeUid)) entriesByJudge.set(p.judgeUid, [])
    entriesByJudge.get(p.judgeUid).push(p.entry)
  }

  return byJudge.value
    .filter((g) => entriesByJudge.has(g.judgeUid))
    .map((g) => ({ ...g, count: g.items.length, items: entriesByJudge.get(g.judgeUid) }))
})

const formatDate = (ts) => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleString() : '—'
}
</script>

<template>
  <main>
    <!-- Page Header -->
    <section class="mb-8 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">Admin</p>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">Scores</h1>
      <p class="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        Every judge's sheet, aggregated. Each criterion is scored 0–10 —
        <span class="font-semibold text-white">{{ CRITERIA.length }} × 10 = {{ TOTAL_MAX }}</span>
        points, reported as a percentage.
      </p>
    </section>

    <!-- Summary -->
    <section class="mb-8 grid sm:grid-cols-4 gap-4">
      <div
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">Sheets submitted</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2 text-yellow-400">
          {{ entries.length }}
        </p>
      </div>
      <div
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">Judges scoring</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2 text-cyan-400">
          {{ judgeCount }}
        </p>
      </div>
      <div
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">Participants scored</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2 text-purple-400">
          {{ leaderboard.length }}
        </p>
      </div>
      <div
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">Average score</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2 text-sky-400">{{ avgPercent }}%</p>
      </div>
    </section>

    <!-- Error -->
    <div v-if="error" class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
      <p class="text-xs text-red-200 leading-relaxed">{{ error }}</p>
    </div>

    <p v-if="isLoading" class="text-sm text-gray-400">Loading scores…</p>

    <template v-else>
      <!-- Leaderboard -->
      <section
        class="mb-6 rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 md:p-8 text-white overflow-hidden"
      >
        <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
          <div>
            <p class="text-sm font-semibold uppercase tracking-wider text-purple-400">
              Averaged across judges
            </p>
            <h2 class="text-2xl md:text-3xl font-extrabold mt-1">Leaderboard</h2>
          </div>

          <input
            v-model="search"
            type="text"
            placeholder="Search participants…"
            class="w-full sm:w-64 px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 outline-none focus:border-purple-400 transition text-sm"
          />
        </div>

        <p v-if="!entries.length" class="text-sm text-gray-400">
          No scores yet. Judges' sheets will appear here once they start scoring.
        </p>

        <p v-else-if="!filteredLeaderboard.length" class="text-sm text-gray-400">
          No participants match that search.
        </p>

        <div v-else class="overflow-x-auto -mx-6 md:-mx-8 px-6 md:px-8">
          <table class="w-full text-sm min-w-[720px]">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wider text-gray-500">
                <th class="pb-3 pr-4 font-semibold">#</th>
                <th class="pb-3 pr-4 font-semibold">Participant</th>
                <th class="pb-3 pr-4 font-semibold">Judges</th>
                <th class="pb-3 pr-4 font-semibold text-right">Avg total</th>
                <th class="pb-3 pr-4 font-semibold text-right">Avg %</th>
                <th class="pb-3 font-semibold text-right">Best</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in lbPager.pageItems"
                :key="row.participantUid"
                class="border-t border-white/5 align-top"
              >
                <td class="py-4 pr-4 font-extrabold text-yellow-400">
                  {{ lbPager.start + i + 1 }}
                </td>
                <td class="py-4 pr-4">
                  <p class="font-semibold">{{ labelFor(row.participantUid) }}</p>
                  <p v-if="subLabelFor(row.participantUid)" class="text-xs text-gray-400 truncate">
                    {{ subLabelFor(row.participantUid) }}
                  </p>
                </td>
                <td class="py-4 pr-4 text-gray-300">
                  {{ row.judgeCount }}
                </td>
                <td class="py-4 pr-4 text-right font-bold text-white whitespace-nowrap">
                  {{ row.avgTotal }}<span class="text-gray-500">/{{ TOTAL_MAX }}</span>
                </td>
                <td class="py-4 pr-4 text-right font-bold text-purple-300 whitespace-nowrap">
                  {{ row.avgPercent }}%
                </td>
                <td class="py-4 text-right text-gray-400 whitespace-nowrap">
                  {{ row.best }}/{{ TOTAL_MAX }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <PaginationBar
          v-if="filteredLeaderboard.length"
          :from="lbPager.from"
          :to="lbPager.to"
          :total="lbPager.total"
          :page="lbPager.page"
          :page-count="lbPager.pageCount"
          :show-all="lbPager.showAll"
          :can-prev="lbPager.canPrev"
          :can-next="lbPager.canNext"
          :page-size="lbPager.pageSize"
          @prev="lbPager.prev"
          @next="lbPager.next"
          @toggle-show-all="lbPager.toggleShowAll"
        />
      </section>

      <!-- Per-judge log -->
      <section
        v-for="group in pageJudgeGroups"
        :key="group.judgeUid"
        class="mb-6 rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 md:p-8 text-white overflow-hidden"
      >
        <div class="flex items-center gap-3 mb-5">
          <span class="text-xs font-bold px-2.5 py-1 rounded bg-cyan-400 text-gray-900">
            judge
          </span>
          <div class="min-w-0">
            <p class="font-semibold truncate">{{ group.judgeName }}</p>
            <p v-if="group.judgeEmail" class="text-xs text-gray-400 truncate">
              {{ group.judgeEmail }}
            </p>
          </div>
          <span class="ml-auto text-xs font-bold text-gray-400 shrink-0">
            {{ group.count }} sheet{{ group.count === 1 ? '' : 's' }}
          </span>
        </div>

        <div class="overflow-x-auto -mx-6 md:-mx-8 px-6 md:px-8">
          <table class="w-full text-sm min-w-[720px]">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wider text-gray-500">
                <th class="pb-3 pr-4 font-semibold">Participant</th>
                <th
                  v-for="c in CRITERIA"
                  :key="c.key"
                  class="pb-3 pr-3 font-semibold text-center"
                  :title="c.title"
                >
                  {{ c.weight }}
                </th>
                <th class="pb-3 pr-4 font-semibold text-right">Total</th>
                <th class="pb-3 font-semibold text-right">%</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in group.items"
                :key="e.participantUid"
                class="border-t border-white/5 align-top"
              >
                <td class="py-4 pr-4">
                  <p class="font-semibold">{{ labelFor(e.participantUid) }}</p>
                  <p class="text-xs text-gray-400">Updated {{ formatDate(e.updatedAt) }}</p>
                  <p v-if="e.comments" class="text-xs text-gray-500 mt-1 max-w-xs line-clamp-2">
                    “{{ e.comments }}”
                  </p>
                </td>
                <td
                  v-for="c in CRITERIA"
                  :key="c.key"
                  class="py-4 pr-3 text-center font-bold text-gray-200"
                >
                  {{ e.scores?.[c.key] ?? '—' }}
                </td>
                <td class="py-4 pr-4 text-right font-extrabold text-white whitespace-nowrap">
                  {{ e.total }}<span class="text-gray-500">/{{ TOTAL_MAX }}</span>
                </td>
                <td class="py-4 text-right font-bold text-purple-300 whitespace-nowrap">
                  {{ e.percent }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <PaginationBar
        v-if="flatSheets.length"
        :from="sheetPager.from"
        :to="sheetPager.to"
        :total="sheetPager.total"
        :page="sheetPager.page"
        :page-count="sheetPager.pageCount"
        :show-all="sheetPager.showAll"
        :can-prev="sheetPager.canPrev"
        :can-next="sheetPager.canNext"
        :page-size="sheetPager.pageSize"
        @prev="sheetPager.prev"
        @next="sheetPager.next"
        @toggle-show-all="sheetPager.toggleShowAll"
      />
    </template>
  </main>
</template>
