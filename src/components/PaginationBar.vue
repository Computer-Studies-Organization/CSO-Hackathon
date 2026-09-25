<script setup>
defineProps({
  from: { type: Number, default: 0 },
  to: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageCount: { type: Number, default: 1 },
  showAll: { type: Boolean, default: false },
  canPrev: { type: Boolean, default: false },
  canNext: { type: Boolean, default: false },
  pageSize: { type: Number, default: 3 },
})

defineEmits(['prev', 'next', 'toggle-show-all'])
</script>

<template>
  <div
    v-if="total > pageSize || showAll"
    class="mt-5 flex flex-wrap items-center justify-between gap-3"
  >
    <p class="text-xs text-gray-400">Showing {{ from }}–{{ to }} of {{ total }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <button
        v-if="!showAll && total > pageSize"
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-500/15 border border-purple-400/30 text-purple-200 hover:bg-purple-500/25 transition"
        @click="$emit('toggle-show-all')"
      >
        Show all ({{ total }})
      </button>

      <template v-if="!showAll && pageCount > 1">
        <button
          type="button"
          :disabled="!canPrev"
          class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
          @click="$emit('prev')"
        >
          ‹ Prev
        </button>
        <span class="text-xs text-gray-500">Page {{ page }} / {{ pageCount }}</span>
        <button
          type="button"
          :disabled="!canNext"
          class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition"
          @click="$emit('next')"
        >
          Next ›
        </button>
      </template>

      <button
        v-else-if="showAll"
        type="button"
        class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition"
        @click="$emit('toggle-show-all')"
      >
        Show less
      </button>
    </div>
  </div>
</template>
