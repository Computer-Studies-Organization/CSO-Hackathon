<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useStaffStore } from '@/stores/staff'
import PaginationBar from '@/components/PaginationBar.vue'
import { usePagination } from '@/composables/usePagination'

const authStore = useAuthStore()
const staffStore = useStaffStore()

const search = ref('')
const form = reactive({ githubUsername: '', email: '', displayName: '' })
const notice = ref(null)
// One-time judge credentials: returned by addJudge(), rendered once, and
// dropped from state as soon as the admin dismisses it.
const createdJudge = ref(null)
const copiedPassword = ref(false)

onMounted(() => {
  staffStore.fetchStaff().catch(() => {})
})

const staff = computed(() => staffStore.staff)
const isLoading = computed(() => staffStore.isLoading)
const isSaving = computed(() => staffStore.isSaving)
const error = computed(() => staffStore.error)

// Nobody picks a role in the UI. Superadmin provisions admins, an admin
// provisions judges — firestore.rules enforces the same split server-side,
// so neither can create the other's accounts.
const isSuperadmin = computed(() => authStore.isSuperadmin)

const filterBy = (list) => {
  const q = search.value.trim().toLowerCase()
  if (!q) return list
  return list.filter((s) =>
    [s.displayName, s.githubUsername, s.email, s.role]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  )
}

const admins = computed(() =>
  filterBy(staff.value.filter((s) => ['admin', 'superadmin'].includes(s.role)))
)
const judges = computed(() =>
  filterBy(staff.value.filter((s) => s.role === 'judge'))
)

const adminPager = reactive(usePagination(admins, { resetOn: [search] }))
const judgePager = reactive(usePagination(judges, { resetOn: [search] }))
const pagers = { admins: adminPager, judges: judgePager }

// Which lists this viewer gets, and whether they may act on them:
//   superadmin -> admins (manage) + judges (read only)
//   admin      -> judges (manage) only
const listGroups = computed(() =>
  (isSuperadmin.value
    ? [
        { key: 'admins', title: 'Admin Accounts', items: admins.value, canManage: true },
        { key: 'judges', title: 'Judge Accounts', items: judges.value, canManage: false },
      ]
    : [{ key: 'judges', title: 'Judge Accounts', items: judges.value, canManage: true }]
  ).map((g) => ({ ...g, pageItems: pagers[g.key].pageItems, pager: pagers[g.key] })),
)

// Judges are identified by email (issued in Phase 3), admins by GitHub.
const memberLabel = (m) => m.email || `@${m.displayName || m.githubUsername}`

const addAccount = async () => {
  notice.value = null
  createdJudge.value = null
  try {
    if (isSuperadmin.value) {
      await staffStore.addStaff(authStore.user, {
        githubUsername: form.githubUsername,
        role: 'admin'
      })
      notice.value = {
        type: 'success',
        text: `@${form.githubUsername} invited as admin. They link on first GitHub sign-in.`
      }
      form.githubUsername = ''
      return
    }

    const created = await staffStore.addJudge(authStore.user, {
      email: form.email,
      displayName: form.displayName
    })

    createdJudge.value = created
    notice.value = {
      type: 'success',
      text: `Judge account created for ${created.email}. Copy the temporary password below — it is shown only once.`
    }
    form.email = ''
    form.displayName = ''
  } catch {
    // error already in store
  }
}

const copyTempPassword = async () => {
  if (!createdJudge.value) return
  try {
    await navigator.clipboard.writeText(createdJudge.value.tempPassword)
    copiedPassword.value = true
    setTimeout(() => {
      copiedPassword.value = false
    }, 2000)
  } catch {
    copiedPassword.value = false
  }
}

const dismissTempPassword = () => {
  createdJudge.value = null
  copiedPassword.value = false
}

// Forgotten judge passwords: superadmin handles it (button hidden from
// admin, per decision). Firebase mails the reset link to the judge.
const sendReset = async (member) => {
  notice.value = null
  try {
    const email = await staffStore.sendJudgeReset(member)
    notice.value = { type: 'success', text: `Password reset email sent to ${email}.` }
  } catch {
    // error already in store
  }
}

const migrateLegacy = async () => {
  notice.value = null
  try {
    const { migrated, backfilled, failed } = await staffStore.migrateLegacyInvites()
    if (!migrated && !backfilled && !failed.length) {
      notice.value = {
        type: 'success',
        text: 'Nothing to migrate — no legacy invites or missing githubId found.',
      }
      return
    }
    const base = `Migrated ${migrated} legacy invite(s); backfilled githubId on ${backfilled}.`
    notice.value = failed.length
      ? { type: 'error', text: `${base} Lookup failed for: ${failed.join(', ')}` }
      : { type: 'success', text: base }
  } catch {
    // error already in store
  }
}

// One-time `staff` -> `judge` role rename. Must be run by superadmin
// right after this build ships: until then role:'staff' docs resolve to
// no access (the role was removed from the allowlists in the same deploy).
const runStaffToJudge = async () => {
  notice.value = null
  try {
    const { staffConverted, invitesConverted } = await staffStore.migrateStaffToJudges()
    if (staffConverted + invitesConverted === 0) {
      notice.value = { type: 'success', text: 'No role:staff documents found — nothing to migrate.' }
    } else {
      notice.value = {
        type: 'success',
        text: `Converted ${staffConverted} staff account(s) and ${invitesConverted} invite(s) to judge.`,
      }
    }
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
  if (!confirm(`Remove ${memberLabel(member)} from the account list?`)) return
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
        {{ isSuperadmin
          ? 'Create admin accounts by GitHub username and control panel access. Admins sign in with GitHub — no passwords needed. You can also view judge accounts read-only and send their password resets.'
          : 'Create judge accounts with an email address. You get a one-time temporary password to hand over — judges sign in with email and password.' }}
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
      <h2 class="text-2xl font-extrabold mt-1 mb-5">
        {{ isSuperadmin ? 'Add Admin Account' : 'Add Judge Account' }}
      </h2>

      <!-- No role selector: the role is implied by who is signed in and
           pinned the same way in firestore.rules. Superadmin provisions
           admins by GitHub handle; an admin provisions judges by email. -->
      <form @submit.prevent="addAccount" class="flex flex-col sm:flex-row gap-3">
        <input
          v-if="isSuperadmin"
          v-model="form.githubUsername"
          type="text"
          required
          placeholder="GitHub username (e.g. octocat)"
          class="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-white/10
                 text-white placeholder-gray-500 outline-none
                 focus:border-purple-400 transition text-sm"
        />
        <template v-else>
          <input
            v-model="form.email"
            type="email"
            required
            autocomplete="off"
            placeholder="Email (e.g. judge@example.com)"
            class="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-white/10
                   text-white placeholder-gray-500 outline-none
                   focus:border-purple-400 transition text-sm"
          />
          <input
            v-model="form.displayName"
            type="text"
            autocomplete="off"
            placeholder="Display name (optional)"
            class="sm:w-56 px-4 py-3 rounded-xl bg-black/30 border border-white/10
                   text-white placeholder-gray-500 outline-none
                   focus:border-purple-400 transition text-sm"
          />
        </template>
        <button
          type="submit"
          :disabled="isSaving"
          class="px-6 py-3 rounded-xl bg-purple-500 hover:bg-purple-600
                 disabled:opacity-50 disabled:cursor-not-allowed
                 font-bold text-sm transition"
        >
          {{ isSaving ? 'Adding…' : (isSuperadmin ? 'Add Admin' : 'Create Judge') }}
        </button>
      </form>

      <p class="mt-3 text-xs text-gray-500">
        {{ isSuperadmin
          ? 'Invite-only: admins are created by GitHub username and link on first GitHub sign-in. Users without an invite are rejected — no open registration. Judges are added by an admin, and you can view them read-only and send password resets below.'
          : 'Judges are created with an email address and a one-time temporary password, which signs them up with Firebase Authentication. No open registration — only an admin can add judges.' }}
      </p>

      <!-- One-time maintenance. Hidden for admins: the tightened rules
           only let superadmin rewrite non-superadmin account docs. -->
      <p v-if="isSuperadmin" class="mt-2 text-xs text-gray-500">
        <button @click="migrateLegacy" type="button" class="underline hover:text-gray-300">
          Migrate legacy invites
        </button>
        <span class="px-1.5 text-gray-700">·</span>
        <button
          @click="runStaffToJudge"
          type="button"
          class="underline hover:text-gray-300"
          title="One-time: converts every role:'staff' document to role:'judge'. Run this immediately after deploying."
        >
          Migrate staff → judge
        </button>
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

      <!-- One-time temporary password. Never persisted — rendered straight
           from the signUp response and removed on dismiss. -->
      <div
        v-if="createdJudge"
        class="mt-4 p-4 rounded-2xl bg-yellow-400/10 border border-yellow-400/30"
      >
        <p class="text-xs font-bold uppercase tracking-wider text-yellow-300 mb-2">
          Temporary password — shown once
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <code
            class="px-3 py-2 rounded-lg bg-black/40 border border-white/10
                   font-mono text-sm tracking-[0.2em] text-white select-all"
          >
            {{ createdJudge.tempPassword }}
          </code>

          <button
            type="button"
            @click="copyTempPassword"
            class="px-3 py-2 rounded-lg text-xs font-bold transition
                   bg-white/10 border border-white/10 text-gray-200 hover:bg-white/20"
          >
            {{ copiedPassword ? 'Copied ✓' : 'Copy' }}
          </button>

          <button
            type="button"
            @click="dismissTempPassword"
            class="px-3 py-2 rounded-lg text-xs font-bold transition
                   text-gray-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>

        <p class="mt-3 text-xs text-yellow-200/80 leading-relaxed">
          Hand this to <span class="font-semibold">{{ createdJudge.email }}</span> now.
          It is not stored anywhere. If it gets lost, use
          <span class="font-semibold">Send reset</span> on their row below.
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

    <!-- Search (filters both lists) -->
    <div class="mb-6">
      <input
        v-model="search"
        type="text"
        placeholder="Search accounts…"
        class="w-full sm:w-64 px-4 py-2.5 rounded-xl bg-black/30 border border-white/10
               text-white placeholder-gray-500 outline-none
               focus:border-purple-400 transition text-sm"
      />
    </div>

    <p v-if="isLoading" class="mb-6 text-sm text-gray-400">Loading accounts…</p>

    <template v-else>
      <section
        v-for="group in listGroups"
        :key="group.key"
        class="mb-6 rounded-3xl bg-gray-900/80 backdrop-blur-xl border border-white/10
               shadow-2xl shadow-black/20 p-6 md:p-8 text-white overflow-hidden"
      >
        <div class="flex items-center justify-between gap-4 mb-6">
          <div>
            <p class="text-sm font-semibold uppercase tracking-wider text-purple-400">
              {{ group.items.length }} account{{ group.items.length === 1 ? '' : 's' }}
              <span v-if="!group.canManage"> · read only</span>
            </p>
            <h2 class="text-2xl md:text-3xl font-extrabold mt-1">{{ group.title }}</h2>
          </div>
        </div>

        <p v-if="!group.items.length" class="text-sm text-gray-400">
          {{ search
            ? 'No accounts match that search.'
            : group.key === 'admins'
              ? 'No admin accounts yet.'
              : 'No judge accounts yet. Add the first one above.' }}
        </p>

        <ul v-else class="flex flex-col gap-3">
          <li
            v-for="member in group.pageItems"
            :key="member.id"
            class="p-4 rounded-2xl bg-white/5 border border-white/10
                   flex flex-col sm:flex-row sm:items-center gap-3"
            :class="member.active === false ? 'opacity-60' : ''"
          >
            <div
              class="w-10 h-10 shrink-0 rounded-full bg-purple-500/20
                     flex items-center justify-center text-purple-300 font-bold"
            >
              {{ (member.displayName || member.githubUsername || member.email || '?')[0].toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold truncate">{{ memberLabel(member) }}</p>
              <p class="text-xs text-gray-400">
                Added {{ formatDate(member.createdAt) }}
                {{ member.lastLoginAt
                  ? '· last sign-in ' + formatDate(member.lastLoginAt)
                  : '· not yet signed in' }}
              </p>
            </div>
            <span
              class="shrink-0 text-xs font-bold px-2.5 py-1 rounded"
              :class="member.role === 'superadmin'
                ? 'bg-purple-500 text-white'
                : member.role === 'admin'
                  ? 'bg-yellow-400 text-gray-900'
                  : member.role === 'judge'
                    ? 'bg-cyan-400 text-gray-900'
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

            <div v-if="group.canManage && member.role !== 'superadmin'" class="flex gap-2 shrink-0">
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
              v-else-if="member.role === 'superadmin'"
              class="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded
                     bg-purple-500/10 border border-purple-500/20 text-purple-300"
              title="Superadmin accounts cannot be disabled or removed"
            >
              Protected
            </span>

            <!-- Superadmin sees judges read-only but owns their password
                 resets (admin does not get this button). -->
            <button
              v-else-if="group.key === 'judges' && isSuperadmin && member.email"
              @click="sendReset(member)"
              :disabled="isSaving"
              class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition
                     bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10
                     disabled:opacity-50 disabled:cursor-not-allowed"
              title="Email this judge a password reset link"
            >
              Send reset
            </button>

            <span
              v-else
              class="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded
                     bg-white/5 border border-white/10 text-gray-400"
              title="Only an admin can manage judge accounts"
            >
              Read only
            </span>
          </li>
        </ul>

        <PaginationBar
          v-if="group.items.length"
          :from="group.pager.from"
          :to="group.pager.to"
          :total="group.pager.total"
          :page="group.pager.page"
          :page-count="group.pager.pageCount"
          :show-all="group.pager.showAll"
          :can-prev="group.pager.canPrev"
          :can-next="group.pager.canNext"
          :page-size="group.pager.pageSize"
          @prev="group.pager.prev"
          @next="group.pager.next"
          @toggle-show-all="group.pager.toggleShowAll"
        />
      </section>
    </template>
  </main>
</template>
