<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useStaffStore } from '@/stores/staff'

const authStore = useAuthStore()
const staffStore = useStaffStore()

const search = ref('')
const form = reactive({ githubUsername: '', role: 'staff' })
const notice = ref(null)

onMounted(() => {
  staffStore.fetchStaff().catch(() => {})
})

const staff = computed(() => staffStore.staff)
const isLoading = computed(() => staffStore.isLoading)
const isSaving = computed(() => staffStore.isSaving)
const error = computed(() => staffStore.error)

const adminCount = computed(() => staff.value.filter((s) => s.role === 'admin').length)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return staff.value
  return staff.value.filter((s) =>
    [s.displayName, s.githubUsername, s.role]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  )
})

const addAccount = async () => {
  notice.value = null
  try {
    await staffStore.addStaff(authStore.user, form)
    notice.value = { type: 'success', text: `@${form.githubUsername} invited as ${form.role}. They link on first GitHub sign-in.` }
    form.githubUsername = ''
    form.role = 'staff'
  } catch {
    // error already in store
  }
}

const migrateLegacy = async () => {
  notice.value = null
  try {
    const count = await staffStore.migrateLegacyInvites()
    notice.value = { type: 'success', text: `Migrated ${count} legacy invite(s) to the invite allowlist.` }
  } catch {
    // error already in store
  }
}

const toggleMember = async (member) => {
  try {
    await staffStore.toggleActive(member)
  } catch {
    // error already in store
  }
}

const removeMember = async (member) => {
  if (!confirm(`Remove @${member.displayName || member.githubUsername} from staff?`)) return
  try {
    await staffStore.removeStaff(member)
  } catch {
    // error already in store
  }
}

const formatDate = (ts) => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString() : '—'
}
</script>

<template>
  <main>
    <!-- Page Header -->
    <section class="mb-8 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">
        Admin
      </p>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">
        Account Management
      </h1>
      <p class="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        Create staff accounts by GitHub username and control panel access.
        Staff sign in with GitHub — no passwords needed.
      </p>
    </section>

    <!-- Add Account -->
    <section
      class="mb-6 rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10
             shadow-2xl shadow-black/20 p-6 md:p-8 text-white"
    >
      <p class="text-sm font-semibold uppercase tracking-wider text-purple-400">
        New account
      </p>
      <h2 class="text-2xl font-extrabold mt-1 mb-5">Add Staff Account</h2>

      <form @submit.prevent="addAccount" class="grid sm:grid-cols-[1fr_180px_auto] gap-3">
        <input
          v-model="form.githubUsername"
          type="text"
          required
          placeholder="GitHub username (e.g. octocat)"
          class="px-4 py-3 rounded-xl bg-black/30 border border-white/10
                 text-white placeholder-gray-500 outline-none
                 focus:border-purple-400 transition text-sm"
        />
        <select
          v-model="form.role"
          class="px-4 py-3 rounded-xl bg-black/30 border border-white/10
                 text-white outline-none focus:border-purple-400 transition text-sm"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          :disabled="isSaving"
          class="px-6 py-3 rounded-xl bg-purple-500 hover:bg-purple-600
                 disabled:opacity-50 disabled:cursor-not-allowed
                 font-bold text-sm transition"
        >
          {{ isSaving ? 'Adding…' : 'Add Account' }}
        </button>
      </form>

      <p class="mt-3 text-xs text-gray-500">
        Invite-only: accounts are created by GitHub username and link on first sign-in.
        Users without an invite are rejected — no open registration.
        <span class="font-semibold text-gray-400">Staff</span> can view Dashboard + Repository Submissions + Video Submissions.
        <span class="font-semibold text-gray-400">Admin</span> and
        <span class="font-semibold text-gray-400">Superadmin</span> can also manage accounts.
        <button @click="migrateLegacy" type="button" class="underline hover:text-gray-300">Migrate legacy invites</button>
      </p>

      <div
        v-if="notice"
        class="mt-4 p-4 rounded-2xl border"
        :class="notice.type === 'success'
          ? 'bg-green-500/10 border-green-500/20'
          : 'bg-red-500/10 border-red-500/20'"
      >
        <p class="text-xs leading-relaxed"
           :class="notice.type === 'success' ? 'text-green-200' : 'text-red-200'">
          {{ notice.text }}
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

    <!-- Staff List -->
    <section
      class="rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10
             shadow-2xl shadow-black/20 p-6 md:p-8 text-white overflow-hidden"
    >
      <div class="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div class="flex-1">
          <p class="text-sm font-semibold uppercase tracking-wider text-purple-400">
            {{ staff.length }} account{{ staff.length === 1 ? '' : 's' }} · {{ adminCount }} admin{{ adminCount === 1 ? '' : 's' }}
          </p>
          <h2 class="text-2xl md:text-3xl font-extrabold mt-1">Staff Accounts</h2>
        </div>
        <input
          v-model="search"
          type="text"
          placeholder="Search staff…"
          class="sm:w-64 px-4 py-2.5 rounded-xl bg-black/30 border border-white/10
                 text-white placeholder-gray-500 outline-none
                 focus:border-purple-400 transition text-sm"
        />
      </div>

      <p v-if="isLoading" class="text-sm text-gray-400">Loading staff…</p>
      <p v-else-if="!filtered.length" class="text-sm text-gray-400">
        No staff accounts yet. Add the first one above.
      </p>

      <ul v-else class="flex flex-col gap-3">
        <li
          v-for="member in filtered"
          :key="member.id"
          class="p-4 rounded-2xl bg-white/5 border border-white/10
                 flex flex-col sm:flex-row sm:items-center gap-3"
          :class="member.active === false ? 'opacity-60' : ''"
        >
          <div
            class="w-10 h-10 shrink-0 rounded-full bg-purple-500/20
                   flex items-center justify-center text-purple-300 font-bold"
          >
            {{ (member.displayName || member.githubUsername || '?')[0].toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold truncate">
              @{{ member.displayName || member.githubUsername }}
            </p>
            <p class="text-xs text-gray-400">
              Added {{ formatDate(member.createdAt) }}
              {{ (member.uid || member.linked) ? '· linked' : '· not yet signed in' }}
            </p>
          </div>
          <span
            class="shrink-0 text-xs font-bold px-2.5 py-1 rounded"
            :class="member.role === 'superadmin'
              ? 'bg-purple-500 text-white'
              : member.role === 'admin'
                ? 'bg-yellow-400 text-gray-900'
                : 'bg-white/10 text-gray-200'"
          >
            {{ member.role }}
          </span>
          <span
            class="shrink-0 text-xs font-bold px-2.5 py-1 rounded"
            :class="member.active === false
              ? 'bg-red-500/20 text-red-300'
              : 'bg-green-500/20 text-green-300'"
          >
            {{ member.active === false ? 'disabled' : 'active' }}
          </span>
          <div v-if="member.role !== 'superadmin'" class="flex gap-2 shrink-0">
            <button
              @click="toggleMember(member)"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition
                     bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
            >
              {{ member.active === false ? 'Enable' : 'Disable' }}
            </button>
            <button
              @click="removeMember(member)"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition
                     bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20"
            >
              Remove
            </button>
          </div>
          <span
            v-else
            class="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded
                   bg-purple-500/10 border border-purple-500/20 text-purple-300"
            title="Superadmin accounts cannot be disabled or removed"
          >
            Protected
          </span>
        </li>
      </ul>
    </section>
  </main>
</template>
