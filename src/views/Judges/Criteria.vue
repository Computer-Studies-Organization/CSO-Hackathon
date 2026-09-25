<script setup>
import WarmHound from '@/components/uiverse_component/warm-hound.vue'
import { CRITERIA, RULES, TOTAL_MAX } from '@/config/criteria'
</script>

<template>
  <main>
    <!-- Page Header -->
    <section class="mb-8 text-white">
      <p class="text-sm font-semibold uppercase tracking-wider text-yellow-400">Judges</p>
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight mt-2">Judging Criteria</h1>
      <p class="mt-3 max-w-2xl text-base md:text-lg leading-relaxed text-gray-400">
        5 categories. Equal weight. 100% total — 5 × 20%. Score each criterion 0–10 for a maximum of
        <span class="font-semibold text-white">{{ TOTAL_MAX }}</span> points.
      </p>
    </section>

    <!-- Criteria -->
    <div class="grid md:grid-cols-2 gap-4 mb-8">
      <div
        v-for="(c, i) in CRITERIA"
        :key="c.key"
        class="p-5 rounded-2xl bg-gray-900/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20 text-white"
      >
        <div class="flex justify-between items-center gap-3 mb-2">
          <strong class="text-sm">{{ i + 1 }}. {{ c.title }}</strong>
          <span class="text-xs font-bold px-2 py-1 rounded bg-yellow-400 text-gray-900 shrink-0">
            {{ c.weight }}
          </span>
        </div>
        <p class="text-sm text-gray-300">{{ c.description }}</p>
        <p class="mt-3 text-xs text-gray-500">
          Score 0–{{ c.max }} · worth {{ c.weight }} of the total
        </p>
      </div>
    </div>

  </main>
</template>
