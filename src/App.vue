<script setup>
import { RouterLink, RouterView } from 'vue-router'
// import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <header>
    <div class="wrapper">
      <nav>
        <RouterLink to="/">Open-source</RouterLink>
        <RouterLink to="/">Critera</RouterLink>
        <RouterLink to="/about">Overview</RouterLink>
      </nav>
    </div>
  </header>

  <!-- <RouterView /> -->
</template>

