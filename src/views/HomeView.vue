<script setup>

  import RudeRabbit from '@/components/uiverse_component/rude-rabbit.vue'
  import WarmHound from '@/components/uiverse_component/warm-hound.vue'

  const hackathonHighlights = [
    { title: 'Real Problem, Real Solution', 
        description: 'Not random software. Build a practical solution that answers the given brief — problem.md, audience.md, objective.md.' },
    { title: 'Max 5 per Team', description: 'Discuss ideas, divide tasks, pair, review, and merge often. Roles (Dev, UI/UX, Docs/Testing) are suggestions only.' },
    { title: 'Any Tech Stack', description: 'Web, Mobile, Desktop, Extension, Web3/DApp, AI tool, API — as long as it is original and built within the hacking window.' },
    { title: 'Code Freeze: Sep 23, 2026 — 12:00 Midnight', description: 'All pushes after freeze are not evaluated. GitHub activity is judged + primary tie-breaker.' },
  ]

    const summaries = [
    {
      id: 'open-source-hackathon-intro',
      meet: '1st Meet — Discussion & Lesson',
      title: 'Summary: Open-Source & Hackathon Intro',
      subtitle: 'Codefest 2026: The ACLC Mandaue Hackathon — Pre-Hacktoberfest Edition. Building the Future through Collaboration and Code.',
      pdfUrl: '/assets/pdf/Open-Source-Hackathon-Intro-1.pdf',
      pdfLabel: 'Open full Open-Source & Hackathon Intro PDF',
      points: [
        { term: 'What is a Hackathon', detail: 'High-energy, concentrated event where teams collaborate intensively to turn ideas into working prototypes in hours or days. Focus: problem-solving, teamwork, execution.' },
        { term: 'What is Open-Source', detail: 'Software distributed with source code — free to use, modify, and distribute. Transparent, decentralized, community-driven via peer review and maintainers.' },
        { term: 'Evolution', detail: '1985 Stallman → Free Software Foundation, 1991 Torvalds → Linux Kernel, 1998 OSI coined “open source”, Present: 90%+ of cloud + leading AI runs on OSS.' },
        { term: 'Scale today', detail: '1.12B+ contributions in 2025, 180M+ developers on GitHub (Octoverse). OSS is how modern software is built and scaled.' },
        { term: 'Core benefits', detail: 'Rapid Innovation (thousands solve at once), Security & Quality (“all bugs are shallow”), Global Community (mentorship, no borders).' },
        { term: 'Why engage', detail: 'Accelerate career (public portfolio, learn from maintainers) + Network & Impact (give back, mentorship, jobs, future co-founders). Ready to build? Form teams and start hacking.' },
      ],
    },
    {
      id: 'git-workshop',
      meet: '1st Meet — Workshop Lesson',
      title: 'Summary: Git & GitHub Workshop (PPT 1)',
      subtitle: 'From Version Control to Collaboration — Learn Git, Manage Repositories, Create Branches, Push to GitHub, Collaborate.',
      pdfUrl: '/assets/pdf/git.pdf',
      pdfLabel: 'Open full Git Workshop PDF',
      points: [
        { term: 'Git vs GitHub', detail: 'Git = version control on your computer, GitHub = online platform for hosting & collaboration.' },
        { term: 'Config', detail: 'git config --global / --local user.name & user.email, --list, --unset.' },
        { term: 'Basic flow', detail: 'git init → git add → git commit -m → git branch -M main → git remote add origin → git push -u origin main.' },
        { term: 'Branches & checkout', detail: 'Separate work via git checkout -b feature/*, switch via git checkout main.' },
        { term: 'Add & commit', detail: 'Working Directory → (git add) → Staging Area → (git commit) → Repository history.' },
        { term: 'Fetch / Merge / Pull', detail: 'Fetch = download, merge = combine, pull = fetch + merge.' },
        { term: 'Log & status', detail: 'git status = current changes, git log = commit history.' },
        { term: 'Reset', detail: '--soft = undo commit + keep changes staged, --hard = undo commit + delete changes.' },
        { term: 'Hands-on', detail: 'Fork → clone → new branch → add / commit / push → Pull Request → review → merge → sync fork.' },
      ],
    },
    {
      id: 'codefest-mechanics',
      meet: '1st Meet  — Mechanics Briefing',
      title: 'Summary: Codefest Mechanics (PPT 2)',
      subtitle: 'The Hackathon Begins — Solve the problem, do not just build software.',
      pdfUrl: '/assets/pdf/CodefestMechanics.pdf',
      pdfLabel: 'Open full Codefest Mechanics PDF',
      points: [
        { term: 'Theme', detail: 'FROM LEARNING → BUILDING — “Helpful from school”.' },
        { term: 'Plan first', detail: 'Understand → Brainstorm → Define MVP → Plan → Design → Choose Stack → Setup GitHub → Build.' },
        { term: 'Allowed', detail: 'Boilerplates, libraries, external APIs, AI models. Prohibited: major pre-existing codebases.' },
        { term: 'GitHub is part of competition', detail: 'Meaningful commits, branches, PRs, proper .gitignore. NEVER PUSH .env / keys / tokens.' },
        { term: 'Judging 5 × 20%', detail: 'Functional & UX, UI/Design, Code Quality & Architecture, Docs & Video Demo, GitHub/version control.' },
        { term: 'Ground rules', detail: 'Original work, academic integrity, max 5/team, video required (min 1 minute), organizers may showcase projects.' },
      ],
    },
  ]

  const timeline = [
    {
      id: 1,
      time: 'September 14 | 9:00 AM - Auditorium',
      status: 'Done',
      morning: ['Git & GitHub Workshop', 'Git fundamentals', 'GitHub basics', 'Basic Git commands', 'Git & GitHub demonstration'],
      afternoon: ['Identify the problem & proposed solution', 'Define project concept & objectives', 'Identify innovative approach', 'Select appropriate technologies', 'Organize project tasks'],
      afternoonTitle: 'Project Planning',
    },
    {
      id: 2,
      time: 'September 24 | 9:00 AM - Auditorium',
      status: 'Done',
      morning: ['Documentation', 'Learn required documentation format', 'Organize project documentation', 'Prepare project documentation'],
      afternoon: ['Present project idea (PPT required before)', 'Explain problem and solution', "Highlight key features", 'Explain technology/approach'],
      afternoonTitle: 'Pitching Day',
    },
    {
      id: 3,
      time: 'September 30 | 1:00 PM - Auditorium',
      status: 'Upcoming',
      morning: [],
      afternoon: ['Present via demo video (min 1 minute, video required before)', 'Explain implementation experience', 'Showcase key features', 'Technical Q&A', 'Final evaluation', 'Announcement of winning team'],
      afternoonTitle: 'Final Demo & Judging',
    },
  ]
</script>

<template>
  <main class="container mx-auto py-8 px-6">


    <!-- Timeline -->

    <div
  class="w-full mb-10 rounded-3xl
         bg-gray-900/80 backdrop-blur-xl
         border border-white/10
         shadow-2xl shadow-black/20
         p-6 md:p-10 text-white"
>
  <!-- Header -->
  <div class="mb-8">
    <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-yellow-400 uppercase tracking-wider">
          Event Roadmap
        </p>

        <h2 class="text-3xl md:text-4xl font-extrabold mt-1">
          Event Timeline
        </h2>

        <p class="mt-2 text-sm md:text-base text-gray-400 max-w-2xl">
          Three meets designed to take participants from learning the tools,
          to planning and pitching, then finally presenting their solution.
        </p>
      </div>

      <div
        class="self-start md:self-auto px-3 py-2 rounded-xl
               bg-white/5 border border-white/10
               text-xs text-gray-400"
      >
        3 Meets · 3 Stages · 1 Project
      </div>
    </div>
  </div>

  <!-- Next Meet Highlight -->
  <div
    class="relative overflow-hidden mb-8 p-5 md:p-6 rounded-2xl
           bg-yellow-400 text-gray-950
           shadow-lg shadow-yellow-400/10"
  >
    <div
      class="absolute -right-10 -top-10 w-32 h-32
             rounded-full bg-white/20 blur-2xl"
    ></div>

    <div class="relative">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span
          class="px-2.5 py-1 rounded-full
                 bg-gray-950 text-yellow-400
                 text-[11px] font-extrabold uppercase tracking-wide"
        >
          Next Meet
        </span>

        <span class="text-xs font-semibold">
          Meet 2
        </span>
      </div>

      <h3 class="text-xl md:text-2xl font-extrabold">
        Documentation & Pitching Day
      </h3>

      <p class="mt-1 text-sm font-medium">
        September 24 · 9:00 AM · Auditorium
      </p>

      <div class="grid md:grid-cols-2 gap-3 mt-4">
        <div class="p-3 rounded-xl bg-black/10">
          <p class="text-xs font-bold uppercase tracking-wide">
            Morning
          </p>
          <p class="text-sm mt-1">
            Documentation structure, format, organization, and preparation.
          </p>
        </div>

        <div class="p-3 rounded-xl bg-black/10">
          <p class="text-xs font-bold uppercase tracking-wide">
            Afternoon
          </p>
          <p class="text-sm mt-1">
            Project pitching — present your problem, solution, features,
            and technology approach.
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Timeline -->
  <div class="relative">

    <!-- Connecting Line -->
    <div
      class="hidden md:block absolute left-1/2 top-6 bottom-6
             w-px bg-gradient-to-b from-green-400
             via-yellow-400 to-gray-700"
    ></div>

    <div class="grid md:grid-cols-3 gap-5 relative">

      <!-- Meet Cards -->
      <div
        v-for="m in timeline"
        :key="m.id"
        class="relative p-5 rounded-2xl
               border transition duration-200
               hover:-translate-y-1 hover:shadow-xl"
        :class="
          m.status === 'Next'
            ? 'border-yellow-400/60 bg-yellow-400/10 shadow-lg shadow-yellow-400/5'
            : m.status === 'Done'
              ? 'border-green-400/30 bg-green-400/5'
              : 'border-white/10 bg-white/5'
        "
      >

        <!-- Meet Number -->
        <div class="flex items-start justify-between gap-3 mb-5">
          <div class="flex items-center gap-3">

            <div
              class="w-10 h-10 shrink-0 rounded-xl
                     flex items-center justify-center
                     font-extrabold text-sm"
              :class="
                m.status === 'Next'
                  ? 'bg-yellow-400 text-gray-950'
                  : m.status === 'Done'
                    ? 'bg-green-400 text-gray-950'
                    : 'bg-white/10 text-gray-300'
              "
            >
              {{ m.id }}
            </div>

            <div>
              <p class="text-xs text-gray-400 uppercase tracking-wide">
                Stage
              </p>

              <h3 class="font-bold">
                Meet {{ m.id }}
              </h3>
            </div>

          </div>

          <!-- Status -->
          <span
            class="text-[11px] font-extrabold
                   px-2.5 py-1 rounded-full"
            :class="
              m.status === 'Next'
                ? 'bg-yellow-400 text-gray-950'
                : m.status === 'Done'
                  ? 'bg-green-400 text-gray-950'
                  : 'bg-white/10 text-gray-400'
            "
          >
            {{ m.status }}
          </span>
        </div>

        <!-- Date -->
        <div
          class="mb-5 p-3 rounded-xl
                 bg-black/20 border border-white/5"
        >
          <p class="text-xs text-gray-400">
            Schedule
          </p>

          <p class="text-sm font-semibold mt-1">
            {{ m.time }}
          </p>
        </div>

        <!-- Morning -->
        <div v-if="m.morning.length" class="mb-5">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-yellow-400 text-sm">☀</span>

            <h4 class="text-sm font-bold">
              Morning
            </h4>
          </div>

          <ul class="space-y-2">
            <li
              v-for="(x, i) in m.morning"
              :key="i"
              class="flex gap-2 text-xs text-gray-400"
            >
              <span class="text-gray-600">•</span>
              <span>{{ x }}</span>
            </li>
          </ul>
        </div>

        <!-- Afternoon -->
        <div>
          <div class="flex items-center gap-2 mb-2">
            <span class="text-purple-400 text-sm">◐</span>

            <h4 class="text-sm font-bold">
              Afternoon
            </h4>
          </div>

          <p
            class="text-xs font-semibold
                   text-gray-300 mb-2"
          >
            {{ m.afternoonTitle }}
          </p>

          <ul class="space-y-2">
            <li
              v-for="(x, i) in m.afternoon"
              :key="i"
              class="flex gap-2 text-xs text-gray-400"
            >
              <span class="text-gray-600">•</span>
              <span>{{ x }}</span>
            </li>
          </ul>
        </div>

      </div>

    </div>
  </div>
</div>

    <div class="mb-10 text-white">
      <h3 class="text-3xl font-bold underline">
        ACLC CODE FEST 2026
      </h3>
      <h1 class="text-4xl font-extrabold mt-2">WHAT IS THE HACKATHON?</h1>
      <p class="mt-3 text-lg">
        The <strong>CODEFEST 2026: The ACLC Mandaue Hackathon </strong>
        is an ACLC College of Mandaue CSO hackathon. From learning to building:
        tools are learned in the morning (Git & GitHub Workshop), then immediately used in the afternoon
        to build a real solution — not a toy or demo only.
      </p>

      <div class="grid md:grid-cols-2 gap-4 mt-6">
        <RudeRabbit width="auto" height="auto" :content="item.description" background="bg-white/60" :url="item.title" v-for="(item, index) in hackathonHighlights" :key="index" >
        </RudeRabbit>
      </div>
    </div>

    <!-- Summary Cards -->
    <WarmHound
        v-for="summary in summaries"
        :key="summary.id"
        :meet="summary.meet"
        :title="summary.title"
        :subtitle="summary.subtitle"
        :points="summary.points"
        :pdf-url="summary.pdfUrl"
        :pdf-label="summary.pdfLabel"
        class="mb-10"
        />

  </main>
</template>
