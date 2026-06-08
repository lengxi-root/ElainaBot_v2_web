import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from '../utils/axios'

export const useAppStore = defineStore('app', () => {
  const bots = ref([])
  const currentBotId = ref('')
  const currentBot = computed(() =>
    (currentBotId.value && bots.value.find(b => b.appid === currentBotId.value)) || null
  )
  const isAllBots = computed(() => !currentBotId.value)
  const systemInfo = ref(null)
  const sidebarCollapsed = ref(false)
  const webPages = ref([])

  async function fetchBots() {
    try {
      const res = await axios.get('/api/bots')
      bots.value = res.data.bots || []
      if (bots.value.length === 1 && !currentBotId.value) {
        switchBot(bots.value[0].appid)
      }
    } catch {}
  }

  function switchBot(appid) {
    currentBotId.value = appid
    localStorage.setItem('elaina_bot', appid)
  }

  async function fetchSystemInfo() {
    try {
      const res = await axios.get('/api/system/info')
      systemInfo.value = res.data
    } catch {}
  }

  async function fetchWebPages() {
    try {
      const res = await axios.get('/api/web-pages')
      webPages.value = res.data.pages || []
    } catch {}
  }

  return {
    bots, currentBotId, currentBot, isAllBots,
    systemInfo, sidebarCollapsed, webPages,
    fetchBots, switchBot, fetchSystemInfo, fetchWebPages,
  }
})
