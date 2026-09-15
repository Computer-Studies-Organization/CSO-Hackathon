<script setup>
defineProps({
  content: {
    type: String,
    default: ' ',
  },
  url: {
    type: String,
    default: ' ',
  },
  width: {
    type: [String, Number],
    default: '300px',
  },
  height: {
    type: [String, Number],
    default: '254px',
  },
  background: {
    type: String,
    default: 'lightgrey',
  },
  showChevrons: {
    type: Boolean,
    default: true,
  },
})

const toCssSize = (v) => (typeof v === 'number' ? `${v}px` : v)
</script>

<template>
  <div
    class="rr-card text-black py-3 px-3"
    :style="{
      width: toCssSize(width),
      height: toCssSize(height),
      background,
    }"
  >
    <div class="rr-topbar">
      <div class="circles" aria-hidden="true">
        <div class="c"></div>
        <div class="c"></div>
        <div class="c"></div>
      </div>
      <div class="browser">
        <div v-if="showChevrons" class="chevrons" aria-hidden="true">
          <svg viewBox="0 0 20 20" height="16" width="16" xmlns="http://www.w3.org/2000/svg" data-name="20" id="_20">
            <path transform="translate(6.25 3.75)" d="M0,6.25,6.25,0l.875.875L1.75,6.25l5.375,5.375L6.25,12.5Z" id="Fill"></path>
          </svg>
          <svg viewBox="0 0 20 20" height="16" width="16" xmlns="http://www.w3.org/2000/svg" data-name="20" id="_20">
            <path transform="translate(6.625 3.75)" d="M7.125,6.25.875,12.5,0,11.625,5.375,6.25,0,.875.875,0Z" id="Fill"></path>
          </svg>
        </div>
        <div class="search-bar px-5">
          <svg xmlns="http://www.w3.org/2000/svg" width="7.89" height="7.887" viewBox="0 0 16.89 16.887">
            <path id="Fill" d="M16.006,16.887h0l-4.743-4.718a6.875,6.875,0,1,1,.906-.906l4.719,4.744-.88.88ZM6.887,1.262a5.625,5.625,0,1,0,5.625,5.625A5.631,5.631,0,0,0,6.887,1.262Z" transform="translate(0.003 0)"></path>
          </svg>
          <slot name="url">{{ url }}</slot>
        </div>
      </div>
    </div>
    <div class="rr-body px-5 py-5">
      <slot content="" >{{content}}</slot>
    </div>
  </div>
</template>

<style scoped>
  .rr-card {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-radius: 8px;
    background: white;
  }

  .rr-topbar {
    display: flex;
    height: 30px;
    flex-shrink: 0;
  }

  .circles,
  .browser {
    height: 30px;
    display: flex;
    align-items: center;
  }

  .circles {
    width: 20%;
    gap: 8px;
    padding: 10px;
  }

  .c {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: inset 2px 2px 5px rgba(235, 235, 235, 0.356);
  }

  .c:first-child {
    background-color: red;
  }

  .c:nth-child(2) {
    background-color: rgb(204, 167, 4);
  }

  .c:last-child {
    background-color: green;
  }

  .browser {
    width: 80%;
    padding: 5px;
    display: flex;
    gap: 10px;
  }

  .chevrons {
    display: flex;
  }

  .search-bar {
    position: relative;
    border: 0.5px solid black;
    border-radius: 5px;
    padding: 5px;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: rgb(88, 88, 88);
    box-shadow: inset 2px 2px 2px #05050525;
    gap: 4px;
  }

  .search-bar svg {
    position: absolute;
    left: 10px;
  }

  .rr-body {
    flex: 1;
    overflow: auto;
  }
</style>
