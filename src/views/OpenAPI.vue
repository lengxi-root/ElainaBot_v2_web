<script setup>
import { ref } from 'vue'
import OpenAPIOld from './openapi/OpenAPIOld.vue'
import OpenAPI from './openapi/OpenAPI.vue'

const mode = ref('old')
function setMode(m) {
  mode.value = m
}
</script>

<template>
  <div class="openapi-panel">
    <OpenAPIOld v-if="mode === 'old'" />
    <OpenAPI v-else />

    <div class="openapi-switch">
      <button :class="{ active: mode === 'old' }" @click="setMode('old')">旧版开放平台</button>
      <button :class="{ active: mode === 'new' }" @click="setMode('new')">
        新版开放平台
      </button>
    </div>
  </div>
</template>

<style scoped>
.openapi-panel { position: relative; }
.openapi-switch {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: inline-flex;
  background: var(--bg2, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(8px);
  border: 1px solid var(--border, rgba(0, 0, 0, 0.06));
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.openapi-switch button {
  border: none;
  background: none;
  padding: 8px 16px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text2, #6e6e73);
  cursor: pointer;
  transition: all 0.18s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.openapi-switch button.active {
  background: #0099ff;
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
</style>
