<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import RudeRabbit from '@/components/uiverse_component/rude-rabbit.vue'
import AppLoader from '@/components/uiverse_component/apploader.vue'
import { useAuthStore } from '@/stores/auth'
import { useSubmissionStore } from '@/stores/submission'

const authStore = useAuthStore()
const submissionStore = useSubmissionStore()
const router = useRouter()

const form = reactive({
  groupName: '',
  projectName: '',
  members: [''],
  description: '',
  repositoryUrl: '',
  techStack: ''
})

const MAX_MEMBERS = 5

// One submission per user: check on mount and when auth changes.
const alreadySubmitted = ref(false)
const checkingExisting = ref(true)
const submittedProject = computed(() => submissionStore.submission)

const checkExisting = async () => {
  if (!authStore.isAuthenticated) {
    alreadySubmitted.value = false
    checkingExisting.value = false
    return
  }
  checkingExisting.value = true
  try {
    const mine = await submissionStore.fetchMine(authStore.user)
    alreadySubmitted.value = !!mine
  } catch {
    alreadySubmitted.value = false
  } finally {
    checkingExisting.value = false
  }
}

onMounted(checkExisting)
watch(() => authStore.isAuthenticated, checkExisting)

const addMember = () => {
  if (form.members.length < MAX_MEMBERS) {
    form.members.push('')
  }
}

const removeMember = (index) => {
  if (form.members.length > 1) {
    form.members.splice(index, 1)
  }
}


const Whyweneed = [
  {
    title: 'Showcase Your Project',
    description:
      'Get your project in front of students, developers, and the ACLC community. Use CODEFEST as an opportunity to demonstrate what you have built.'
  },
  {
    title: 'Get Community Feedback',
    description:
      'Share your work and receive feedback, suggestions, and ideas that can help you improve your project and make it more useful.'
  },
  {
    title: 'Contribute to Open Source',
    description:
      'Make your project available for others to explore, learn from, improve, and build upon while contributing to the open-source community.'
  },
  {
    title: 'Connect & Collaborate',
    description:
      'Meet people with similar interests, find potential contributors, and build connections that can lead to future collaborations.'
  }
]

const submitProject = async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login')
    return
  }

  try {
    const memberList = form.members.map((m) => m.trim()).filter(Boolean)

    if (!memberList.length) {
      alert('Please add at least one team member.')
      return
    }

    await submissionStore.submitProject(
      authStore.user,
      { ...form, members: memberList }
    )

    alert('Project submitted successfully!')

    alreadySubmitted.value = true
    await submissionStore.fetchMine(authStore.user).catch(() => {})

    form.groupName = ''
    form.projectName = ''
    form.members = ['']
    form.description = ''
    form.repositoryUrl = ''
    form.techStack = ''

  } catch (error) {
    console.error('Submission failed:', error)
  }
}
</script>

<template>
  <main class="container mx-auto px-6 py-10">

    <!-- Page Header -->
    <section class="mb-10 text-white">
      <p
        class="text-sm font-semibold uppercase tracking-wider
               text-yellow-400"
      >
        ACLC CODEFEST 2026
      </p>

      <h1
        class="text-4xl md:text-5xl font-extrabold
               tracking-tight mt-2"
      >
        Submit Your Project
      </h1>

      <p
        class="mt-4 max-w-2xl
               text-base md:text-lg
               leading-relaxed text-gray-400"
      >
        Have an open-source project you want to showcase?
        Submit it to the ACLC CODEFEST Pre-Hacktoberfest and
        give your project an opportunity to be discovered,
        improved, and supported by the community.
      </p>
    </section>


    <!-- Why Submit -->
    <section
      class="mb-10 rounded-3xl
             bg-gray-900/80 backdrop-blur-xl
             border border-white/10
             shadow-2xl shadow-black/20
             p-6 md:p-10 text-white"
    >

      <div class="mb-7">
        <p
          class="text-sm font-semibold uppercase
                 tracking-wider text-purple-400"
        >
          Why participate?
        </p>

        <h2 class="text-2xl md:text-3xl font-extrabold mt-1">
          Why Submit Your Project?
        </h2>

        <p class="mt-2 text-sm text-gray-400 ">
        Submitting your project is an opportunity to showcase what you built, 
        share your ideas, and contribute to a community of developers and creators.

        Your project can demonstrate your skills, become part of your portfolio, 
        and inspire others to build on your ideas. Through collaboration 
        and open-source practices, your work can continue to grow beyond the hackathon.
        </p>
      </div>


      <!-- Benefits -->
      <div class="grid md:grid-cols-2 gap-5">

        <RudeRabbit
          v-for="(reason, index) in Whyweneed"
          :key="index"
          width="auto"
          height="auto"
          background="#f8fafc"
          :url="reason.title"
        >
          <div class="p-5">
            <p class="text-sm leading-relaxed text-gray-700">
              {{ reason.description }}
            </p>
          </div>
        </RudeRabbit>

      </div>

    </section>


    <!-- Submission Requirements -->
    <section
      class="mb-10 rounded-3xl
             bg-white/5 backdrop-blur-xl
             border border-white/10
             p-6 md:p-8 text-white"
    >

      <div class="flex items-start gap-4">

        <div
          class="w-11 h-11 shrink-0
                 rounded-xl
                 bg-purple-500/10
                 border border-purple-400/20
                 flex items-center justify-center
                 text-purple-400 text-xl"
        >
          ✓
        </div>

        <div>
          <h2 class="text-xl md:text-2xl font-bold">
            Before You Submit
          </h2>

          <p class="mt-2 text-sm text-gray-400">
            Make sure your project is ready before starting
            the submission process.
          </p>
        </div>

      </div>


      <div class="grid sm:grid-cols-2 gap-3 mt-6">

        <div
          class="p-4 rounded-xl
                 bg-black/20
                 border border-white/5"
        >
          <p class="font-semibold text-sm">
            ✓ You own the project
          </p>

          <p class="text-xs text-gray-400 mt-1">
            Sign in with GitHub to verify project ownership.
          </p>
        </div>

        <div
          class="p-4 rounded-xl
                 bg-black/20
                 border border-white/5"
        >
          <p class="font-semibold text-sm">
            ✓ Project is open source
          </p>

          <p class="text-xs text-gray-400 mt-1">
            Your repository should be publicly accessible.
          </p>
        </div>

        <div
          class="p-4 rounded-xl
                 bg-black/20
                 border border-white/5"
        >
          <p class="font-semibold text-sm">
            ✓ Repository is ready
          </p>

          <p class="text-xs text-gray-400 mt-1">
            Make sure your repository contains the necessary
            project files and documentation.
          </p>
        </div>

        <div
          class="p-4 rounded-xl
                 bg-black/20
                 border border-white/5"
        >
          <p class="font-semibold text-sm">
            ✓ Project information is complete
          </p>

          <p class="text-xs text-gray-400 mt-1">
            Prepare your project name, description, repository,
            and other required details.
          </p>
        </div>

      </div>

    </section>



    <!-- Submission Section -->
<section
  class="relative overflow-hidden
         rounded-3xl
         bg-gray-900
         border border-white/10
         shadow-2xl shadow-black/20
         p-6 md:p-10 text-white"
>
  <!-- Decorative glow -->
  <div
    class="absolute -right-20 -top-20
           w-56 h-56
           rounded-full
           bg-purple-500/10
           blur-3xl"
  ></div>

  <div class="relative">

    <!-- ========================= -->
    <!-- NOT LOGGED IN -->
    <!-- ========================= -->

    <template v-if="!authStore.isAuthenticated">

      <p
        class="text-sm font-semibold uppercase
               tracking-wider text-yellow-400"
      >
        Ready?
      </p>

      <h2 class="text-2xl md:text-3xl font-extrabold mt-1">
        Submit Your Project
      </h2>

      <p
        class="mt-3 max-w-2xl
               text-sm md:text-base
               leading-relaxed text-gray-400"
      >
        Sign in with GitHub to continue with your
        project submission.
      </p>

      <!-- Sign In Notice -->
      <div
        class="mt-6 p-4 rounded-2xl
               bg-yellow-400/10
               border border-yellow-400/20"
      >
        <div class="flex gap-3">

          <span class="text-yellow-400 text-lg">
            ⚠
          </span>

          <div>

            <p class="text-sm font-bold text-yellow-300">
              GitHub Sign-In Required
            </p>

            <p
              class="text-xs text-gray-400
                     mt-1 leading-relaxed"
            >
              You must sign in with GitHub before
              submitting your project. This helps us
              verify ownership and keep submissions
              authentic.
            </p>

          </div>

        </div>
      </div>

      <!-- Login Button -->
      <div class="mt-6">

        <RouterLink
          to="/login"
          class="inline-flex items-center justify-center
                 gap-3
                 px-6 py-3
                 rounded-xl
                 bg-white
                 text-gray-950
                 font-bold
                 text-sm
                 hover:bg-gray-200
                 transition duration-200
                 shadow-lg"
        >

          <svg
            viewBox="0 0 24 24"
            class="w-5 h-5 fill-current"
            aria-hidden="true"
          >
            <path
              d="M12 .5C5.65.5.5 5.65.5 12c0 5.09
              3.29 9.41 7.86 10.94.58.11.79-.25.79-.56
              0-.27-.01-1.16-.01-2.11-3.2.69-3.88-1.36
              -3.88-1.36-.53-1.33-1.28-1.69-1.28-1.69
              -1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18
              1.75 1.18 1.02 1.75 2.68 1.24 3.34.95
              .1-.74.4-1.24.73-1.52-2.55-.29-5.23-1.28
              -5.23-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29
              -.51-1.47.11-3.06 0 0 .96-.31 3.15 1.18
              .91-.25 1.88-.38 2.85-.38.97 0 1.94.13
              2.85.38 2.18-1.49 3.14-1.18 3.14-1.18
              .62 1.59.23 2.77.11 3.06.74.81 1.18 1.84
              1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35
              .78 1.04.78 2.1 0 1.52-.01 2.75-.01 3.12
              0 .3.21.67.8.56A11.51 11.51 0 0 0 23.5 12
              C23.5 5.65 18.35.5 12 .5Z"
            />
          </svg>

          Continue with GitHub

        </RouterLink>

      </div>

    </template>


    <!-- ========================= -->
    <!-- LOGGED IN -->
    <!-- ========================= -->

    <template v-else>

      <p
        class="text-sm font-semibold uppercase
               tracking-wider text-green-400"
      >
        GitHub Verified
      </p>

      <h2 class="text-2xl md:text-3xl font-extrabold mt-1">
        Submit Your Project
      </h2>

      <p class="mt-3 text-sm text-gray-400">
        You're signed in as
        <span class="font-semibold text-white">
          {{ authStore.user?.displayName || 'GitHub User' }}
        </span>
      </p>


      <!-- Checking existing submission -->
      <div
        v-if="checkingExisting"
        class="mt-6 p-4 rounded-2xl
               bg-white/5
               border border-white/10"
      >
        <p class="text-sm text-gray-400">
          Checking your submission…
        </p>
      </div>


      <!-- Already submitted — one per user -->
      <div
        v-else-if="alreadySubmitted"
        class="mt-6 p-6 rounded-2xl
               bg-green-500/10
               border border-green-500/20"
      >
        <p class="text-sm font-bold text-green-300">
          ✓ Project already submitted
        </p>

        <p class="mt-2 text-sm text-gray-300">
          <span class="font-semibold text-white">
            {{ submittedProject?.projectName || 'Your project' }}
          </span>
          <span v-if="submittedProject?.groupName">
            · {{ submittedProject.groupName }}
          </span>
        </p>

        <a
          v-if="submittedProject?.repositoryUrl"
          :href="submittedProject.repositoryUrl"
          target="_blank"
          rel="noopener"
          class="mt-2 inline-block text-xs font-bold text-yellow-300 hover:text-yellow-200 underline"
        >
          {{ submittedProject.repositoryUrl }} ↗
        </a>

        <p class="mt-3 text-xs text-gray-400 leading-relaxed">
          One submission per account. If you need changes,
          please contact the organizers.
        </p>
      </div>


      <template v-else>


      <!-- User -->
      <div
        class="mt-6 flex items-center gap-4
               p-4 rounded-2xl
               bg-white/5
               border border-white/10"
      >

        <img
          v-if="authStore.user?.photoURL"
          :src="authStore.user.photoURL"
          alt="GitHub profile"
          class="w-12 h-12 rounded-full"
        />

        <div>

          <p class="font-semibold">
            {{ authStore.user?.displayName || 'GitHub User' }}
          </p>

          <p class="text-xs text-gray-400">
            {{ authStore.user?.email }}
          </p>

        </div>

      </div>


      <!-- Submission Form -->
      <form
        class="mt-6 space-y-5 relative"
        @submit.prevent="submitProject"
      >

        <!-- AppLoader — full screen; mawala ra kung ok na (isSubmitting = false) -->
        <Teleport to="body">
          <div
            v-if="submissionStore.isSubmitting"
            class="fixed inset-0 z-[9999] flex flex-col items-center justify-center
                   bg-black"
            aria-live="polite"
            aria-busy="true"
          >
            <AppLoader />
            <p class="mt-4 text-sm text-gray-300 text-center px-4">
              Submitting your project… please wait
            </p>
          </div>
        </Teleport>

        <!-- Group Name -->
        <div>

          <label
            for="groupName"
            class="block text-sm font-semibold mb-2"
          >
            Group Name
          </label>

          <input
            id="groupName"
            v-model="form.groupName"
            type="text"
            required
            placeholder="e.g. Code Hunters"
            class="w-full px-4 py-3 rounded-xl
                   bg-black/30
                   border border-white/10
                   text-white
                   placeholder-gray-500
                   outline-none
                   focus:border-purple-400
                   transition"
          />

        </div>


        <!-- Project Name -->
        <div>

          <label
            for="projectName"
            class="block text-sm font-semibold mb-2"
          >
            Project Name
          </label>

          <input
            id="projectName"
            v-model="form.projectName"
            type="text"
            required
            placeholder="e.g. ACLC Queuing System"
            class="w-full px-4 py-3 rounded-xl
                   bg-black/30
                   border border-white/10
                   text-white
                   placeholder-gray-500
                   outline-none
                   focus:border-purple-400
                   transition"
          />

        </div>


        <!-- Members Name -->
        <div>

          <label class="block text-sm font-semibold mb-2">
            Members Name
          </label>

          <div class="space-y-3">
            <div
              v-for="(member, index) in form.members"
              :key="index"
              class="flex gap-2"
            >
              <input
                v-model="form.members[index]"
                type="text"
                :required="index === 0"
                :placeholder="`Member ${index + 1} full name`"
                class="flex-1 px-4 py-3 rounded-xl
                       bg-black/30
                       border border-white/10
                       text-white
                       placeholder-gray-500
                       outline-none
                       focus:border-purple-400
                       transition"
              />
              <button
                v-if="form.members.length > 1"
                type="button"
                @click="removeMember(index)"
                title="Remove member"
                class="shrink-0 w-12 rounded-xl
                       bg-red-500/10
                       border border-red-500/20
                       text-red-300 font-bold
                       hover:bg-red-500/20
                       transition"
              >
                −
              </button>
            </div>
          </div>

          <button
            v-if="form.members.length < MAX_MEMBERS"
            type="button"
            @click="addMember"
            class="mt-3 inline-flex items-center gap-2
                   px-4 py-2 rounded-xl
                   bg-white/5
                   border border-white/10
                   text-sm font-semibold text-gray-200
                   hover:bg-white/10 hover:text-white
                   transition"
          >
            + Add member
          </button>

          <p class="mt-2 text-xs text-gray-500">
            One member per row — max {{ MAX_MEMBERS }} per team.
          </p>

        </div>


        <!-- Description -->
        <div>

          <label
            for="description"
            class="block text-sm font-semibold mb-2"
          >
            Project Description
          </label>

          <textarea
            id="description"
            v-model="form.description"
            rows="4"
            required
            placeholder="Describe your project..."
            class="w-full px-4 py-3 rounded-xl
                   bg-black/30
                   border border-white/10
                   text-white
                   placeholder-gray-500
                   outline-none
                   focus:border-purple-400
                   transition resize-none"
          ></textarea>

        </div>


        <!-- GitHub Repository -->
        <div>

          <label
            for="repositoryUrl"
            class="block text-sm font-semibold mb-2"
          >
            GitHub Repository
          </label>

          <input
            id="repositoryUrl"
            v-model="form.repositoryUrl"
            type="url"
            required
            placeholder="https://github.com/username/project"
            class="w-full px-4 py-3 rounded-xl
                   bg-black/30
                   border border-white/10
                   text-white
                   placeholder-gray-500
                   outline-none
                   focus:border-purple-400
                   transition"
          />

          <p class="mt-2 text-xs text-gray-500">
            Your repository must be publicly accessible. We verify that it exists before accepting your submission.
          </p>

        </div>


        <!-- Tech Stack -->
        <div>

          <label
            for="techStack"
            class="block text-sm font-semibold mb-2"
          >
            Tech Stack
          </label>

          <input
            id="techStack"
            v-model="form.techStack"
            type="text"
            required
            placeholder="Vue, Firebase, Laravel, MySQL"
            class="w-full px-4 py-3 rounded-xl
                   bg-black/30
                   border border-white/10
                   text-white
                   placeholder-gray-500
                   outline-none
                   focus:border-purple-400
                   transition"
          />

        </div>


        <!-- Submit Error -->
        <div
          v-if="submissionStore.error"
          class="p-4 rounded-xl bg-red-500/10 border border-red-500/20"
        >
          <p class="text-xs text-red-200 leading-relaxed">
            {{ submissionStore.error }}
          </p>
        </div>


        <!-- Submit Button -->
        <button
          type="submit"
          :disabled="submissionStore.isSubmitting"
          class="w-full py-3 px-5 rounded-xl
                 bg-purple-500
                 hover:bg-purple-600
                 disabled:opacity-50
                 disabled:cursor-not-allowed
                 font-bold
                 transition"
        >
          {{
          submissionStore.isSubmitting
            ? 'Submitting Project...'
            : 'Submit Project'
        }}
        </button>

      </form>
      </template>

    </template>

  </div>
</section>

  </main>
</template>