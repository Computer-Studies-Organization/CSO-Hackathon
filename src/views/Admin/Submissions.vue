<script setup>
import { computed, onMounted, ref } from 'vue'
import { useSubmissionStore } from '@/stores/submission'

const submissionStore = useSubmissionStore()
const search = ref('')

onMounted(() => {
  submissionStore.fetchAll().catch(() => {})
})

const submissions = computed(() => submissionStore.submissions)
const isLoading = computed(() => submissionStore.isLoading)
const error = computed(() => submissionStore.error)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return submissions.value
  return submissions.value.filter((s) =>
    [s.groupName, s.projectName, displayMembers(s), s.githubUsername, s.techStack, s.repositoryUrl]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  )
})

const formatDate = (ts) => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString() : '—'
}

const displayMembers = (s) =>
  (Array.isArray(s.members) ? s.members.join(', ') : '') || s.membersName || ''

const memberList = (s) =>
  Array.isArray(s.members) && s.members.length
    ? s.members
    : s.membersName
      ? String(s.membersName).split(',').map((m) => m.trim()).filter(Boolean)
      : []
</script>

<template>
  <main>
    <!-- Page Header -->
    <section class="mb-8 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">
        Admin
      </p>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">
        Submissions
      </h1>
      <p class="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        {{ submissions.length }} project{{ submissions.length === 1 ? '' : 's' }} submitted so far.
      </p>
    </section>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="Search by project, username, tech stack…"
        class="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10
               text-white placeholder-gray-500 outline-none
               focus:border-purple-400 transition text-sm"
      />
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20"
    >
      <p class="text-xs text-red-200 leading-relaxed">{{ error }}</p>
    </div>

    <!-- Table Card -->
    <section
      class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10
             shadow-2xl shadow-black/20 p-6 md:p-8 text-white overflow-hidden"
    >
      <p v-if="isLoading" class="text-sm text-gray-400">Loading submissions…</p>

      <p v-else-if="!filtered.length" class="text-sm text-gray-400">
        No submissions found.
      </p>

      <div v-else class="overflow-x-auto -mx-6 md:-mx-8 px-6 md:px-8">
        <table class="w-full text-sm min-w-[860px]">
          <thead>
            <tr class="text-left text-xs uppercase tracking-wider text-gray-500">
              <th class="pb-3 pr-4 font-semibold">Group / Project</th>
              <th class="pb-3 pr-4 font-semibold">Members</th>
              <th class="pb-3 pr-4 font-semibold">Owner</th>
              <th class="pb-3 pr-4 font-semibold">Tech Stack</th>
              <th class="pb-3 pr-4 font-semibold">Submitted</th>
              <th class="pb-3 font-semibold text-right">Repo</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in filtered"
              :key="s.id"
              class="border-t border-white/5 align-top"
            >
              <td class="py-4 pr-4">
                <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500">Group</p>
                <p class="font-semibold">{{ s.groupName || '—' }}</p>
                <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-2">Project</p>
                <p class="text-sm text-gray-100">{{ s.projectName || '—' }}</p>
                <p class="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-2">Description</p>
                <p class="text-xs text-gray-400 mt-0.5 max-w-xs line-clamp-3">
                  {{ s.description || '—' }}
                </p>
              </td>
              <td class="py-4 pr-4">
                <div v-if="memberList(s).length" class="flex flex-col gap-1 max-w-[220px]">
                  <span
                    v-for="(m, i) in memberList(s)"
                    :key="i"
                    class="text-xs text-gray-200 truncate"
                  >
                    {{ i + 1 }}. {{ m }}
                  </span>
                </div>
                <span v-else class="text-xs text-gray-500">—</span>
              </td>
              <td class="py-4 pr-4 text-gray-300 whitespace-nowrap">
                {{ s.githubUsername || '—' }}
              </td>
              <td class="py-4 pr-4 text-gray-300 max-w-[180px] truncate">
                {{ s.techStack || '—' }}
              </td>
              <td class="py-4 pr-4 text-gray-400 text-xs whitespace-nowrap">
                {{ formatDate(s.submittedAt) }}
              </td>
              <td class="py-4 text-right">
                <a
                  :href="s.repositoryUrl"
                  target="_blank"
                  rel="noopener"
                  class="text-xs font-bold text-yellow-300 hover:text-yellow-200 underline whitespace-nowrap"
                >
                  Open ↗
                </a>
                <p
                  v-if="s.repoVerified"
                  class="mt-1 text-[11px] font-bold text-green-300 whitespace-nowrap"
                >
                  ✓ Verified
                </p>
                <p
                  v-else-if="!s.repoCheckedAt"
                  class="mt-1 text-[11px] font-bold text-yellow-300 whitespace-nowrap"
                  :title="s.repoCheckNote || ''"
                >
                  ⚠ {{ s.repoCheckNote || 'Unverified — check link' }}
                </p>
                <p
                  v-else
                  class="mt-1 text-[11px] font-bold text-red-300 whitespace-nowrap"
                  :title="s.repoCheckNote || ''"
                >
                  ⚠ {{ s.repoCheckNote || 'Not verified' }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
