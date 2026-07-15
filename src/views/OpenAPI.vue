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
        新版开放平台<span class="beta-tag">内测</span>
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
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.06);
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
  color: #6e6e73;
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
.beta-tag {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #ff9500;
  border-radius: 6px;
  padding: 1px 5px;
}
.openapi-switch button.active .beta-tag { background: rgba(255, 255, 255, 0.28); }
</style>
