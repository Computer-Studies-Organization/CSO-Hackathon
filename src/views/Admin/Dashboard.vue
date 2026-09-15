<script setup>
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useSubmissionStore } from '@/stores/submission'

const submissionStore = useSubmissionStore()

onMounted(() => {
  submissionStore.fetchAll().catch(() => {})
})

const submissions = computed(() => submissionStore.submissions)
const isLoading = computed(() => submissionStore.isLoading)
const error = computed(() => submissionStore.error)

const totalCount = computed(() => submissions.value.length)

const uniqueTeams = computed(
  () => new Set(submissions.value.map((s) => s.userId)).size
)

const todayCount = computed(() => {
  const now = new Date()
  return submissions.value.filter((s) => {
    const d = s.submittedAt?.toDate?.()
    return (
      d &&
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    )
  }).length
})

const recentSubmissions = computed(() => submissions.value.slice(0, 5))

const formatDate = (ts) => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleString() : '—'
}

const displayMembers = (s) =>
  (Array.isArray(s.members) ? s.members.join(', ') : '') || s.membersName || ''

const stats = computed(() => [
  { label: 'Total Submissions', value: totalCount.value, accent: 'text-yellow-400' },
  { label: 'Teams Submitted', value: uniqueTeams.value, accent: 'text-purple-400' },
  { label: 'Submitted Today', value: todayCount.value, accent: 'text-green-400' },
])
</script>

<template>
  <main>
    <!-- Page Header -->
    <section class="mb-8 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">
        Admin
      </p>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">
        Dashboard
      </h1>
      <p class="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        Overview of project submissions for ACLC CODEFEST 2026.
      </p>
    </section>

    <!-- Stat Cards -->
    <section class="grid sm:grid-cols-3 gap-4 mb-8">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10
               shadow-2xl shadow-black/20 p-6 text-white"
      >
        <p class="text-sm text-gray-400">{{ stat.label }}</p>
        <p class="text-4xl font-extrabold tracking-tight mt-2" :class="stat.accent">
          {{ isLoading ? '…' : stat.value }}
        </p>
      </div>
    </section>

    <!-- Error -->
    <div
      v-if="error"
      class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20"
    >
      <p class="text-xs text-red-200 leading-relaxed">{{ error }}</p>
    </div>

    <!-- Recent Submissions -->
    <section
      class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10
             shadow-2xl shadow-black/20 p-6 md:p-8 text-white"
    >
      <div class="flex items-center justify-between gap-4 mb-6">
        <div>
          <p class="text-sm font-semibold uppercase tracking-wider text-purple-400">
            Latest
          </p>
          <h2 class="text-2xl md:text-3xl font-extrabold mt-1">
            Recent Submissions
          </h2>
        </div>
        <RouterLink
          to="/admin/submissions"
          class="shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition
                 bg-purple-500 hover:bg-purple-600"
        >
          View all
        </RouterLink>
      </div>

      <p v-if="isLoading" class="text-sm text-gray-400">Loading submissions…</p>

      <p
        v-else-if="!recentSubmissions.length"
        class="text-sm text-gray-400"
      >
        No submissions yet. Approved projects will appear here once teams start submitting.
      </p>

      <ul v-else class="flex flex-col gap-3">
        <li
          v-for="s in recentSubmissions"
          :key="s.id"
          class="p-4 rounded-2xl bg-white/5 border border-white/10
                 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
        >
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500">Group</p>
            <p class="font-semibold truncate">{{ s.groupName || s.projectName || 'Untitled' }}</p>
            <p v-if="s.groupName && s.projectName" class="text-xs text-gray-400 truncate">Project: {{ s.projectName }}</p>
            <p class="text-xs text-gray-400 truncate">
              Members: {{ displayMembers(s) || s.githubUsername || s.userId }} · {{ formatDate(s.submittedAt) }}
            </p>
          </div>
          <a
            :href="s.repositoryUrl"
            target="_blank"
            rel="noopener"
            class="shrink-0 text-xs font-bold text-yellow-300 hover:text-yellow-200 underline"
          >
            Repository ↗
          </a>
        </li>
      </ul>
    </section>
  </main>
</template>
