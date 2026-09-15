<script setup>
defineProps({
  meet: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  points: {
    type: Array,
    default: () => [],
  },
  pdfUrl: {
    type: String,
    default: '',
  },
  pdfLabel: {
    type: String,
    default: 'Open full PDF',
  },
})
</script>

<template>
  <div class="bgblue">
    <div class="card">
      <span v-if="meet" class="inline-block text-xs font-bold px-2 py-1 rounded bg-yellow-400 text-gray-900 mb-3">{{ meet }}</span>
      <h2 class="text-2xl font-bold mb-2 text-white">{{ title }}</h2>
      <p v-if="subtitle" class="mb-4 text-sm text-gray-300">{{ subtitle }}</p>

      <ul class="flex gap-2.5 flex-col list-disc pl-5">
        <li v-for="(point, index) in points" :key="index" class="text-sm leading-relaxed">
          <template v-if="typeof point === 'object'">
            <strong v-if="point.term" class="text-white">{{ point.term }}: </strong><span>{{ point.detail }}</span>
          </template>
          <template v-else>{{ point }}</template>
        </li>
      </ul>

      <slot />

      <a
        v-if="pdfUrl"
        :href="pdfUrl"
        target="_blank"
        class="inline-block mt-4 text-blue-300 underline text-sm hover:text-blue-200"
      >
        {{ pdfLabel }}
      </a>
    </div>
  </div>
</template>

<style scoped>
  .bgblue {
    /* background: linear-gradient(135deg, #fffffff5, #3a4b8a, #ffffff98); */
    padding: 1px;
    border-radius: 1.2rem;
    /* box-shadow: 0px 1rem 1.5rem -0.9rem #000000e1; */
    max-width: 100%;
  }

  .card {
    font-size: 1rem;
    color: #bec4cf;
    background: linear-gradient(135deg, #0d1120 0%, #3a4b8a 43%, #0d1120 100%);
    padding: 1.5rem;
    border-radius: 1.2rem;
  }
</style>