<script setup>
</script>

<template>
  <router-view />
</template>

<style>
/* Reset Global untuk memastikan Edge-to-Edge benar-benar mentok ke monitor */
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background-color: #0f172a; /* Warna slate-900 untuk dasar OS */
}

#app {
  width: 100%;
  height: 100%;
}
</style>