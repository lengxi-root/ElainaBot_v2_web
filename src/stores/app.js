import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from '../utils/axios'
import { responsePayload } from '../utils/api'

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

  let _botsPromise = null
  async function fetchBots() {
    try {
      const data = responsePayload(await axios.get('/api/bots'))
      bots.value = data.bots || []
      if (bots.value.length === 1 && !currentBotId.value) {
        switchBot(bots.value[0].appid)
      }
    } catch {}
  }
  // 首次加载去重: 保证只请求一次 /api/bots, 并在视图发起统计请求前确定 currentBotId
  function ensureBots() {
    if (!_botsPromise) _botsPromise = fetchBots()
    return _botsPromise
  }

  function switchBot(appid) {
    currentBotId.value = appid
    localStorage.setItem('elaina_bot', appid)
  }

  async function fetchSystemInfo() {
    try {
      systemInfo.value = responsePayload(await axios.get('/api/system/info'))
    } catch {}
  }

  async function fetchWebPages() {
    try {
      const data = responsePayload(await axios.get('/api/web-pages'))
      webPages.value = data.pages || []
    } catch {}
  }

  async function toggleBot(appid, enabled) {
    try {
      await axios.post('/api/bots/toggle', { appid, enabled })
      await fetchBots()
      return true
    } catch {
      return false
    }
  }

  return {
    bots, currentBotId, currentBot, isAllBots,
    systemInfo, sidebarCollapsed, webPages,
    fetchBots, ensureBots, switchBot, fetchSystemInfo, fetchWebPages, toggleBot,
  }
})
