import { computed, ref, watch } from 'vue'

export function usePagination(itemsRef, options = {}) {
  const { pageSize = 3, resetOn = [] } = options

  const showAll = ref(false)
  const page = ref(1)

  const total = computed(() => itemsRef.value?.length ?? 0)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
  const start = computed(() => (showAll.value ? 0 : (page.value - 1) * pageSize))

  const pageItems = computed(() => {
    const list = itemsRef.value || []
    return showAll.value ? list : list.slice(start.value, start.value + pageSize)
  })

  const from = computed(() => (total.value === 0 ? 0 : start.value + 1))
  const to = computed(() =>
    showAll.value ? total.value : Math.min(total.value, start.value + pageSize),
  )

  const canPrev = computed(() => !showAll.value && page.value > 1)
  const canNext = computed(() => !showAll.value && page.value < pageCount.value)

  watch(total, () => {
    if (page.value > pageCount.value) page.value = pageCount.value
  })

  if (resetOn.length) {
    watch(resetOn, () => {
      page.value = 1
    })
  }

  const prev = () => {
    if (canPrev.value) page.value -= 1
  }

  const next = () => {
    if (canNext.value) page.value += 1
  }

  const toggleShowAll = () => {
    showAll.value = !showAll.value
    if (!showAll.value) page.value = 1
  }

  return {
    pageItems,
    page,
    pageCount,
    start,
    from,
    to,
    total,
    showAll,
    canPrev,
    canNext,
    pageSize,
    prev,
    next,
    toggleShowAll,
  }
}
