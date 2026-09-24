<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { X, Maximize2, Play } from 'lucide-vue-next'
import { useVideoSubmissionStore } from '@/stores/videosubmission'
import { useSubmissionStore } from '@/stores/submission'

const videoStore = useVideoSubmissionStore()
const submissionStore = useSubmissionStore()
const search = ref('')

// Theater mode — fullscreen overlay player
const theater = ref(null) // { id, title, embedUrl }

onMounted(() => {
  videoStore.fetchAll().catch(() => {})
  submissionStore.fetchAll().catch(() => {})
})

onUnmounted(() => {
  document.body.style.overflow = ''
})

watch(theater, (v) => {
  document.body.style.overflow = v ? 'hidden' : ''
})

const isLoading = computed(() => videoStore.isLoading || submissionStore.isLoading)
const error = computed(() => videoStore.error || submissionStore.error)

// Merge: video_submissions + repo submissions (by userId)
const submissions = computed(() => {
  const repoByUser = new Map(submissionStore.submissions.map((r) => [r.userId, r]))

  return videoStore.submissions.map((v) => {
    const repo = repoByUser.get(v.id) || repoByUser.get(v.userId) || null

    const githubUsername =
      (v.githubUsername && v.githubUsername !== 'Unknown' && v.githubUsername) ||
      repo?.githubUsername ||
      null

    const members =
      (Array.isArray(repo?.members) && repo.members.length && repo.members) ||
      (repo?.membersName
        ? String(repo.membersName)
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean)
        : []) ||
      []

    return {
      ...v,
      githubUsername,
      members,
      projectName: repo?.projectName || null,
      repositoryUrl: repo?.repositoryUrl || null,
      techStack: repo?.techStack || null,
      email: v.email || null,
      // R2 public URL from Worker — play natively (no Drive iframe)
      embedUrl: toEmbedUrl(v.videoUrl),
    }
  })
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return submissions.value
  return submissions.value.filter((s) =>
    [
      s.groupName,
      s.projectName,
      s.githubUsername,
      s.email,
      s.description,
      s.techStack,
      ...(s.members || []),
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  )
})

const formatDate = (ts) => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleString() : '—'
}

// Direct media URL from Worker (R2) or any http(s) video — no Drive embed.
function toEmbedUrl(url) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return null
}

const openTheater = (s) => {
  if (!s.embedUrl) return
  theater.value = {
    id: s.id,
    title: s.groupName || s.projectName || 'Video submission',
    embedUrl: s.embedUrl,
  }
}

const closeTheater = () => {
  theater.value = null
}

const onKeydown = (e) => {
  if (e.key === 'Escape' && theater.value) closeTheater()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <main>
    <!-- Page Header -->
    <section class="mb-8 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">Admin</p>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">Video Submissions</h1>
      <p class="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        {{ submissions.length }} video{{ submissions.length === 1 ? '' : 's' }} submitted so far.
      </p>
    </section>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="Search by group, project, username, member…"
        class="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 outline-none focus:border-purple-400 transition text-sm"
      />
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
      <p class="text-xs text-red-200 leading-relaxed">{{ error }}</p>
    </div>

    <!-- List -->
    <section
      class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 p-6 md:p-8 text-white"
    >
      <p v-if="isLoading" class="text-sm text-gray-400">Loading video submissions…</p>

      <p v-else-if="!filtered.length" class="text-sm text-gray-400">No video submissions found.</p>

      <ul v-else class="flex flex-col gap-4">
        <li
          v-for="s in filtered"
          :key="s.id"
          class="p-5 rounded-2xl bg-white/5 border border-white/10"
        >
          <div class="flex flex-col lg:flex-row lg:items-start gap-4">
            <!-- Meta -->
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <p class="font-bold text-lg truncate">
                  {{ s.groupName || 'Untitled Group' }}
                </p>
                <span
                  v-if="s.githubUsername"
                  class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-400/20"
                >
                  @{{ s.githubUsername }}
                </span>
              </div>

              <p v-if="s.projectName" class="text-sm text-gray-200 font-semibold">
                Project: {{ s.projectName }}
              </p>

              <div v-if="s.members?.length" class="mt-1 flex flex-wrap gap-1.5">
                <span
                  v-for="(m, i) in s.members"
                  :key="i"
                  class="px-2 py-0.5 rounded-md text-[11px] bg-white/5 border border-white/10 text-gray-300"
                >
                  {{ m }}
                </span>
              </div>

              <p class="mt-1 text-xs text-gray-400">
                <template v-if="s.email">{{ s.email }} · </template>
                <template v-if="s.techStack">{{ s.techStack }} · </template>
                {{ formatDate(s.submittedAt) }}
              </p>

              <a
                v-if="s.repositoryUrl"
                :href="s.repositoryUrl"
                target="_blank"
                rel="noopener"
                class="inline-block mt-2 text-xs font-bold text-yellow-300 hover:text-yellow-200 underline"
              >
                Repository ↗
              </a>

              <p class="mt-2 text-sm text-gray-300 leading-relaxed">
                {{ s.description || 'No description provided.' }}
              </p>
            </div>

            <!-- Thumbnail → theater mode -->
            <div class="w-full lg:w-[420px] shrink-0">
              <button
                v-if="s.embedUrl"
                type="button"
                class="group relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400"
                :aria-label="`Play video — ${s.groupName || 'submission'}`"
                @click="openTheater(s)"
              >
                <div class="absolute inset-0 pointer-events-none">
                  <video
                    :src="s.embedUrl"
                    preload="metadata"
                    muted
                    playsinline
                    class="absolute inset-0 w-full h-full object-cover opacity-60"
                  />
                </div>

                <span
                  class="absolute inset-0 flex flex-col items-center justify-center bg-black/40 group-hover:bg-black/55 transition"
                >
                  <span
                    class="w-14 h-14 rounded-full bg-purple-500/90 group-hover:bg-purple-400 flex items-center justify-center shadow-lg transition group-hover:scale-105"
                  >
                    <Play :size="26" class="text-white ml-0.5" fill="currentColor" />
                  </span>
                  <span class="mt-3 text-xs font-semibold text-white/90 flex items-center gap-1.5">
                    <Maximize2 :size="13" />
                    Watch (theater)
                  </span>
                </span>
              </button>

              <div
                v-else
                class="w-full aspect-video rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-xs text-gray-500"
              >
                No video URL
              </div>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- ========================= -->
    <!-- THEATER MODE OVERLAY -->
    <!-- ========================= -->
    <Teleport to="body">
      <div
        v-if="theater"
        class="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-label="theater.title"
        @click.self="closeTheater"
      >
        <!-- Top bar -->
        <div
          class="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-white/10"
        >
          <p class="text-sm font-semibold text-white truncate">
            {{ theater.title }}
          </p>
          <button
            type="button"
            class="shrink-0 p-2 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition"
            aria-label="Close theater mode"
            @click="closeTheater"
          >
            <X :size="20" />
          </button>
        </div>

        <!-- Stage — centered player, theater-style -->
        <div class="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-6">
          <div
            class="relative w-full max-w-6xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl"
          >
            <video :src="theater.embedUrl" controls autoplay playsinline class="w-full h-full" />
          </div>
        </div>

        <!-- Bottom hint -->
        <p class="pb-4 text-center text-xs text-gray-500">
          Press <kbd class="px-1.5 py-0.5 rounded bg-white/10 text-gray-300">Esc</kbd>
          to exit theater mode
        </p>
      </div>
    </Teleport>
  </main>
</template>
