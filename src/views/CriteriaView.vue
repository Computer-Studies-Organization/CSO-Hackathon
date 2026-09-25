<script setup>
  import WarmHound from '@/components/uiverse_component/warm-hound.vue'
  import { CRITERIA, RULES } from '@/config/criteria'

  const criteria = CRITERIA
  const rules = RULES
</script>

<template>
  <main class="container mx-auto py-8 px-6">
    <div class="mb-10 text-white">
      <h3 class="text-3xl font-bold underline">
        ACLC CODE FEST PRE-HACKATHON 2026
      </h3>
      <h1 class="text-4xl font-extrabold mt-2">JUDGING CRITERIA</h1>
      <p class="mt-3 text-lg">
        5 categories. Equal weight. 100% total — 5 × 20%.
      </p>

      <div class="grid md:grid-cols-2 gap-4 mt-6">
        <div v-for="(c, i) in criteria" :key="i" class="p-4 rounded-md border border-gray-700 bg-white/5">
          <div class="flex justify-between items-center gap-3 mb-2">
            <strong>{{ (i+1) + '. ' + c.title }}</strong>
            <span class="text-xs font-bold px-2 py-1 rounded bg-yellow-400 text-gray-900 shrink-0">{{ c.weight }}</span>
          </div>
          <p class="text-sm text-gray-300">{{ c.description }}</p>
        </div>
      </div>
    </div>

    <WarmHound
      meet="Competition Rules"
      title="Ground Rules"
      subtitle="Fair play, original work, and proper version control — same standards as the hacking window."
      :points="rules"
      class="mb-10"
    />
  </main>
</template>
