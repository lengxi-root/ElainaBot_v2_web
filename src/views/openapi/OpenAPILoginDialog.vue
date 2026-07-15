<script setup>
import QrCodeImage from './QrCodeImage.vue'

defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  steps: { type: Array, required: true },
  showQr: { type: Boolean, default: true },
  qrImage: { type: String, default: '' },
  qrTarget: { type: String, default: '' },
  preparing: { type: Boolean, default: false },
  statusText: { type: String, required: true },
  statusTone: { type: String, default: 'waiting' },
  openUrl: { type: String, default: '' },
  actions: { type: Array, default: () => [] },
})

const emit = defineEmits(['action', 'close'])
</script>

<template>
  <div class="login-dialog-overlay" @click.self="emit('close')">
    <div :class="['login-dialog', { selecting: !showQr }]" role="dialog" aria-modal="true">
      <div class="login-dialog-title">{{ title }}</div>
      <div class="login-dialog-desc">{{ description }}</div>
      <div class="login-dialog-progress">
        <span v-for="step in steps" :key="step.label" :class="{ active: step.active, done: step.done }">{{ step.label }}</span>
      </div>
      <div v-if="showQr" :class="['login-dialog-qr', { preparing }]">
        <QrCodeImage v-if="qrTarget" :target="qrTarget" :size="200" class="login-dialog-qr-image" />
        <img v-else-if="qrImage" :src="qrImage" class="login-dialog-qr-image" alt="登录二维码" />
        <div v-else class="login-dialog-loading"><span class="login-dialog-spinner"></span>正在生成一次性二维码...</div>
      </div>
      <slot v-else name="body" />
      <div :class="['login-dialog-status', statusTone]">{{ statusText }}</div>
      <div class="login-dialog-actions">
        <a v-if="openUrl" :href="openUrl" target="_blank" rel="noopener" class="login-dialog-action ghost">打开登录页面</a>
        <button
          v-for="action in actions"
          :key="action.key"
          :class="['login-dialog-action', action.primary ? 'primary' : 'ghost']"
          :disabled="action.disabled"
          @click="emit('action', action.key)"
        >
          {{ action.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-dialog-overlay {
  position:fixed;
  inset:0;
  z-index:1000;
  display:flex;
  align-items:center;
  justify-content:center;
  background:rgba(0,0,0,.45)
}
.login-dialog {
  width:min(460px, calc(100vw - 32px));
  padding:28px 32px;
  border-radius:20px;
  background:#fff;
  text-align:center;
  box-shadow:0 12px 40px rgba(0,0,0,.2)
}
.login-dialog.selecting {
  width:min(500px, calc(100vw - 32px))
}
.login-dialog-title {
  color:#1d1d1f;
  font-size:17px;
  font-weight:700
}
.login-dialog-desc {
  margin:6px 0 16px;
  color:#6e6e73;
  font-size:13px
}
.login-dialog-progress {
  display:grid;
  grid-template-columns:repeat(4, 1fr);
  margin:0 0 18px
}
.login-dialog-progress span {
  position:relative;
  padding-top:17px;
  color:#86868b;
  font-size:10.5px
}
.login-dialog-progress span:before {
  content:"";
  position:absolute;
  top:2px;
  left:50%;
  z-index:1;
  width:9px;
  height:9px;
  margin-left:-4.5px;
  border:2px solid #d1d1d6;
  border-radius:50%;
  background:#fff
}
.login-dialog-progress span:not(:last-child):after {
  content:"";
  position:absolute;
  top:7px;
  left:50%;
  width:100%;
  height:1px;
  background:#e5e5ea
}
.login-dialog-progress span.active {
  color:#0099ff;
  font-weight:700
}
.login-dialog-progress span.active:before {
  border-color:#0099ff;
  background:#0099ff;
  box-shadow:0 0 0 4px rgba(0,153,255,.12)
}
.login-dialog-progress span.done:before {
  border-color:#25b47e;
  background:#25b47e
}
.login-dialog-progress span.done:after {
  background:#25b47e
}
.login-dialog-qr {
  width:200px;
  height:200px;
  margin:0 auto;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
  border:1px solid #d2d2d7;
  border-radius:14px
}
.login-dialog-qr.preparing {
  border-style:dashed;
  background:#f5f5f7
}
.login-dialog-qr-image {
  width:100%;
  height:100%;
  object-fit:contain
}
.login-dialog-loading {
  display:grid;
  justify-items:center;
  gap:12px;
  color:#86868b;
  font-size:12px
}
.login-dialog-spinner {
  width:26px;
  height:26px;
  border:3px solid rgba(0,153,255,.12);
  border-top-color:#0099ff;
  border-radius:50%;
  animation:login-dialog-spin .8s linear infinite
}
@keyframes login-dialog-spin {
  to { transform:rotate(360deg) }
}
.login-dialog-status {
  margin:16px 0 12px;
  color:#0099ff;
  font-size:14px;
  font-weight:600
}
.login-dialog-status.success {
  color:#25b47e
}
.login-dialog-status.error {
  color:#ff3b30
}
.login-dialog-actions {
  display:flex;
  justify-content:center;
  flex-wrap:wrap
}
.login-dialog-action {
  box-sizing:border-box;
  margin:4px;
  padding:8px 18px;
  border-radius:8px;
  font-size:13px;
  font-weight:600;
  line-height:1.4;
  text-decoration:none;
  cursor:pointer;
  transition:all .15s
}
.login-dialog-action:disabled {
  opacity:.5;
  cursor:not-allowed
}
.login-dialog-action.primary {
  border:1px solid #0099ff;
  background:#0099ff;
  color:#fff
}
.login-dialog-action.ghost {
  border:1px solid #d2d2d7;
  background:#fff;
  color:#6e6e73
}
.login-dialog-action:hover:not(:disabled) {
  filter:brightness(.97)
}
</style>
