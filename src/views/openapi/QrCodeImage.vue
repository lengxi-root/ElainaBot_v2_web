<script setup>
import { onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({
  target: { type: String, required: true },
  size: { type: Number, default: 148 },
})

const source = ref('')

async function render() {
  source.value = await QRCode.toDataURL(props.target, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: props.size,
    color: { dark: '#1d1d1f', light: '#ffffff' },
  })
}

watch(() => [props.target, props.size], render)
onMounted(render)
</script>

<template>
  <img :src="source" alt="" />
</template>
