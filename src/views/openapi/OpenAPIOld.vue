<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import axios from '../../utils/axios'
import AppIcon from './AppIcon.vue'
import OpenAPILoginDialog from './OpenAPILoginDialog.vue'
import './qqdash.css'

const loggedIn = ref(false)
const loginInfo = reactive({ uin: '', appId: '' })
const loginLoading = ref(false)
const showLoginQR = ref(false)
const loginUrl = ref('')
const qrCode = ref('')
const loginStatus = ref('preparing')
const loginMessage = ref('')
let loginTimer = null
let loginRequestId = 0
let loginBusy = false

const LOGIN_STATUS_TEXT = {
  preparing: '正在创建安全登录会话...',
  waiting: '等待扫码...',
  logged_in: '登录成功！',
  failed: '登录失败，请刷新重试',
  not_started: '登录任务已失效，请刷新重试',
}
const loginStatusText = computed(() => loginMessage.value || LOGIN_STATUS_TEXT[loginStatus.value] || '正在确认登录...')
const loginEnded = computed(() => ['failed', 'not_started'].includes(loginStatus.value))
const loginSteps = computed(() => [
  { label: '准备会话', active: loginStatus.value === 'preparing', done: ['waiting', 'logged_in'].includes(loginStatus.value) },
  { label: '扫码确认', active: loginStatus.value === 'waiting', done: loginStatus.value === 'logged_in' },
  { label: '同步账号', active: loginStatus.value === 'logged_in', done: loginStatus.value === 'logged_in' },
  { label: '完成登录', active: loginStatus.value === 'logged_in', done: false },
])
const loginActions = computed(() => [
  ...(loginEnded.value ? [{ key: 'refresh', label: '刷新二维码', primary: true }] : []),
  { key: 'close', label: '关闭' },
])

const bots = ref([])
const selectedBot = ref('')
const botsLoading = ref(false)
const PALETTE = ['#5b8def', '#7c6cf0', '#f0794b', '#25b47e', '#e05a8c', '#3aa1d8']
const TABS = [{ key: 'data', label: '数据总览' }, { key: 'notifications', label: '平台通知' }, { key: 'whitelist', label: 'IP 白名单' }, { key: 'events', label: '事件订阅' }, { key: 'webhook', label: '回调配置' }]
const tab = ref('data')
const view = ref('list') // list | manage
const cur = reactive({ appid: '', name: '', avatar: '', color: '#5b8def' })
const showBotSwitcher = ref(false)

function openBot(b) {
  Object.assign(cur, { appid: b.appid, name: b.name || b.appid, avatar: b.avatar || '', color: b.color || '#5b8def' })
  selectedBot.value = b.appid
  view.value = 'manage'
}
function backToList() { view.value = 'list' }
function switchBot(b) {
  showBotSwitcher.value = false
  if (b.appid === cur.appid) return
  openBot(b)
}

const dataLoading = ref(false)
const days = ref(30)
const dayData = ref([])
const stats = reactive({ avgDau: 0, totalUp: 0, currentGroups: 0, currentFriends: 0 })

const notiLoading = ref(false)
const notifications = ref([])

const wlLoading = ref(false)
const wlProcessing = ref(false)
const whitelist = ref([])
const newIp = ref('')
const pendingIps = ref([])
const showAuthQR = ref(false)
const authQrUrl = ref('')
const authQrCode = ref('')
const authStatus = ref('waiting')
const authAction = ref('')
const deleteIp = ref('')
let authTimer = null

const eventsLoading = ref(false)
const eventsProcessing = ref(false)
const events = ref([])
const groupedEvents = computed(() => {
  const groups = {}
  for (const e of events.value) { (groups[e.type] ||= []).push(e) }
  return Object.entries(groups).map(([type, list]) => ({ type, list }))
})
const eventsDirty = computed(() => events.value.some(e => !!e.checked !== !!e.is_subscribed))

const webhookLoading = ref(false)
const webhookProcessing = ref(false)
const webhookUrl = ref('')
const webhookInput = ref('')
const webhookDirty = computed(() => webhookInput.value.trim() && webhookInput.value.trim() !== webhookUrl.value)
const webhookSuggest = reactive({ available: false, url: '' })
const webhookCheck = reactive({ checking: false, ok: null, msg: '' })

async function checkLoginStatus() {
  try { const { data } = await axios.post('/api/openapi/login-status', { user_id: 'web_user' }); if (data.success && data.logged_in) { loggedIn.value = true; loginInfo.uin = data.uin || ''; loginInfo.appId = data.appid || '' } } catch {}
}

async function startLogin() {
  const requestId = ++loginRequestId
  stopLoginPoll()
  showLoginQR.value = true
  loginUrl.value = ''
  qrCode.value = ''
  loginStatus.value = 'preparing'
  loginMessage.value = ''
  loginLoading.value = true
  try {
    const { data } = await axios.post('/api/openapi/start-login', { user_id: 'web_user' })
    if (requestId !== loginRequestId) return
    if (data.success && data.login_url) {
      loginUrl.value = data.login_url
      qrCode.value = data.qr_code || ''
      loginStatus.value = 'waiting'
      pollLogin()
    } else {
      loginStatus.value = 'failed'
      loginMessage.value = data.message || '获取二维码失败'
    }
  } catch {
    if (requestId !== loginRequestId) return
    loginStatus.value = 'failed'
    loginMessage.value = '登录服务请求失败，请稍后重试'
  } finally {
    if (requestId === loginRequestId) loginLoading.value = false
  }
}

function pollLogin() {
  stopLoginPoll()
  loginTimer = setInterval(async () => {
    if (loginBusy) return
    loginBusy = true
    try {
      const { data } = await axios.post('/api/openapi/check-login', { user_id: 'web_user', qr_code: qrCode.value })
      const status = data.status || (data.success === false ? 'failed' : 'waiting')
      loginStatus.value = status
      loginMessage.value = loginEnded.value ? (data.message || '') : ''
      if (data.success && status === 'logged_in') {
        loggedIn.value = true
        loginInfo.uin = data.data?.uin || ''
        loginInfo.appId = data.data?.appId || ''
        stopLoginPoll()
        setTimeout(() => { showLoginQR.value = false }, 800)
        fetchBots()
      } else if (loginEnded.value) {
        stopLoginPoll()
      }
    } catch {
      loginStatus.value = 'failed'
      loginMessage.value = '登录状态请求失败，请刷新重试'
      stopLoginPoll()
    } finally {
      loginBusy = false
    }
  }, 2000)
}
function stopLoginPoll() { if (loginTimer) { clearInterval(loginTimer); loginTimer = null } }
function closeLogin() {
  loginRequestId += 1
  stopLoginPoll()
  loginLoading.value = false
  showLoginQR.value = false
}
function handleLoginAction(action) {
  if (action === 'refresh') startLogin()
  else closeLogin()
}

async function logout() {
  try { await axios.post('/api/openapi/logout', { user_id: 'web_user' }) } catch {}
  loggedIn.value = false; loginInfo.uin = ''; loginInfo.appId = ''; bots.value = []; selectedBot.value = ''; view.value = 'list'
}

async function fetchBots() {
  botsLoading.value = true
  try { const { data } = await axios.post('/api/openapi/botlist', { user_id: 'web_user' }); if (data.success) { const apps = data.data?.apps || []; bots.value = apps.map((a, i) => ({ appid: a.app_id || a.appid || a.bot_appid || '', name: a.app_name || a.name || '', avatar: a.icon_url || '', desc: a.app_desc || '', color: PALETTE[i % PALETTE.length] })) } else if (data.message?.includes('失效')) loggedIn.value = false } catch {}
  botsLoading.value = false
}

function switchTab(k) { tab.value = k; if (k === 'data' && !dayData.value.length) fetchData(); if (k === 'notifications' && !notifications.value.length) fetchNotifications(); if (k === 'whitelist' && !whitelist.value.length) fetchWhitelist(); if (k === 'events' && !events.value.length) fetchEvents(); if (k === 'webhook' && !webhookUrl.value) fetchWebhook() }

async function fetchData() {
  if (!selectedBot.value) return; dataLoading.value = true
  try { const { data } = await axios.post('/api/openapi/botdata', { user_id: 'web_user', appid: selectedBot.value, days: days.value }); if (data.success) { dayData.value = data.data?.days_data || []; stats.avgDau = data.data?.avg_dau ?? 0; const d0 = dayData.value[0] || {}; stats.currentGroups = d0.current_groups || 0; stats.currentFriends = d0.current_friends || 0; stats.totalUp = dayData.value.reduce((s, d) => s + parseInt(d.up_messages || 0), 0) } } catch {}
  dataLoading.value = false
}

async function fetchNotifications() {
  notiLoading.value = true
  try { const { data } = await axios.post('/api/openapi/notifications', { user_id: 'web_user', appid: selectedBot.value }); if (data.success) notifications.value = data.data?.messages || [] } catch {}
  notiLoading.value = false
}

async function fetchWhitelist() {
  wlLoading.value = true
  try { const { data } = await axios.post('/api/openapi/whitelist', { user_id: 'web_user', appid: selectedBot.value }); if (data.success) whitelist.value = data.data?.ip_list || [] } catch {}
  wlLoading.value = false
}

function addPendingIp() { const ip = newIp.value.trim(); if (!ip) return; if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return alert('IP 格式无效'); if (pendingIps.value.includes(ip)) return alert('已在列表中'); pendingIps.value.push(ip); newIp.value = '' }
function confirmDeleteIp(ip) { if (confirm(`确定删除 IP: ${ip}？`)) { deleteIp.value = ip; startAuthQR('del') } }

function setAuthProcessing(v) { if (authAction.value === 'events') eventsProcessing.value = v; else if (authAction.value === 'webhook') webhookProcessing.value = v; else wlProcessing.value = v }

async function startAuthQR(action) {
  authAction.value = action; setAuthProcessing(true); authStatus.value = 'waiting'; authQrUrl.value = ''; authQrCode.value = ''
  const qrApi = action === 'events' ? '/api/openapi/events/auth-qr' : action === 'webhook' ? '/api/openapi/webhook/auth-qr' : '/api/openapi/whitelist/delete-qr'
  try { const { data } = await axios.post(qrApi, { user_id: 'web_user', appid: selectedBot.value }); if (!data.success || !data.qrcode) { alert(data.message || '获取授权二维码失败'); setAuthProcessing(false); return }; authQrCode.value = data.qrcode; authQrUrl.value = data.url || ''; showAuthQR.value = true; pollAuth() } catch { alert('获取授权二维码失败'); setAuthProcessing(false) }
}

function pollAuth() {
  stopAuthPoll()
  authTimer = setInterval(async () => { try { const { data } = await axios.post('/api/openapi/whitelist/check-delete-auth', { user_id: 'web_user', appid: selectedBot.value, qrcode: authQrCode.value }); if (data.success && data.authorized) { authStatus.value = 'authorized'; stopAuthPoll(); await executeAuth() } } catch {} }, 3000)
}
function stopAuthPoll() { if (authTimer) { clearInterval(authTimer); authTimer = null } }
function closeAuthQR() { stopAuthPoll(); showAuthQR.value = false; setAuthProcessing(false) }

async function executeAuth() {
  try {
    if (authAction.value === 'events') {
      const event_ids = events.value.filter(e => e.checked).map(e => e.id)
      const { data } = await axios.post('/api/openapi/events/modify', { user_id: 'web_user', appid: selectedBot.value, event_ids, qrcode: authQrCode.value })
      if (data.success) { alert('订阅更新成功！'); fetchEvents() } else alert(data.message || '操作失败')
    } else if (authAction.value === 'webhook') {
      const { data } = await axios.post('/api/openapi/webhook/set', { user_id: 'web_user', appid: selectedBot.value, webhook_url: webhookInput.value.trim(), qrcode: authQrCode.value })
      if (data.success) { alert('回调地址设置成功！'); fetchWebhook() } else alert(data.message || '操作失败')
    } else {
      let res
      if (authAction.value === 'del') res = await axios.post('/api/openapi/whitelist/execute-delete', { user_id: 'web_user', appid: selectedBot.value, ip: deleteIp.value, qrcode: authQrCode.value })
      else { const all = [...whitelist.value.map(i => typeof i === 'string' ? i : i.ip), ...pendingIps.value]; res = await axios.post('/api/openapi/whitelist/batch-add', { user_id: 'web_user', appid: selectedBot.value, ip_list: all, qrcode: authQrCode.value }) }
      const { data } = res; if (data.success) { alert(authAction.value === 'add' ? '添加成功！' : 'IP 删除成功！'); pendingIps.value = []; fetchWhitelist() } else alert(data.message || '操作失败')
    }
  } catch { alert('操作失败') }
  showAuthQR.value = false; setAuthProcessing(false)
}

async function fetchEvents() {
  if (!selectedBot.value) return; eventsLoading.value = true
  try { const { data } = await axios.post('/api/openapi/events', { user_id: 'web_user', appid: selectedBot.value }); if (data.success) events.value = (data.data?.events || []).map(e => ({ ...e, checked: !!e.is_subscribed })); else alert(data.message || '获取事件列表失败') } catch { alert('获取事件列表失败') }
  eventsLoading.value = false
}
function saveEvents() { if (!eventsDirty.value) return alert('没有需要保存的更改'); startAuthQR('events') }

async function fetchWebhook() {
  if (!selectedBot.value) return; webhookLoading.value = true
  webhookSuggest.available = false; webhookSuggest.url = ''; webhookCheck.ok = null; webhookCheck.msg = ''
  try { const { data } = await axios.post('/api/openapi/webhook', { user_id: 'web_user', appid: selectedBot.value }); if (data.success) { webhookUrl.value = data.data?.webhook_url || ''; webhookInput.value = webhookUrl.value } else alert(data.message || '获取回调地址失败') } catch { alert('获取回调地址失败') }
  try { const { data } = await axios.post('/api/openapi/webhook/suggest', { user_id: 'web_user', appid: selectedBot.value }); if (data.success) { webhookSuggest.available = !!data.available; webhookSuggest.url = data.url || '' } } catch {}
  webhookLoading.value = false
}
function saveWebhook() { if (!webhookInput.value.trim()) return alert('请输入回调地址'); startAuthQR('webhook') }
async function checkWebhook() {
  const url = webhookInput.value.trim(); if (!url) return alert('请输入回调地址')
  webhookCheck.checking = true; webhookCheck.ok = null; webhookCheck.msg = ''
  try { const { data } = await axios.post('/api/openapi/webhook/check', { user_id: 'web_user', appid: selectedBot.value, webhook_url: url }); if (data.success) { webhookCheck.ok = !!data.valid; webhookCheck.msg = data.message || (data.valid ? '地址校验通过' : '地址校验未通过') } else { webhookCheck.ok = false; webhookCheck.msg = data.message || '校验失败' } } catch { webhookCheck.ok = false; webhookCheck.msg = '校验请求失败' }
  webhookCheck.checking = false
}

watch(selectedBot, v => { if (v) { dayData.value = []; notifications.value = []; whitelist.value = []; events.value = []; webhookUrl.value = ''; webhookInput.value = ''; tab.value === 'data' ? fetchData() : tab.value === 'notifications' ? fetchNotifications() : tab.value === 'whitelist' ? fetchWhitelist() : tab.value === 'events' ? fetchEvents() : tab.value === 'webhook' && fetchWebhook() } })
onMounted(async () => { await checkLoginStatus(); if (loggedIn.value) fetchBots() })
onUnmounted(() => stopLoginPoll())
</script>

<template>
  <div class="qqdash openapi-old">
    <div class="app-shell">
      <main class="main">
        <!-- 未登录 -->
        <div v-if="!loggedIn" class="page">
          <div class="v2-gate">
            <div class="v2-gate-badge">旧版开放平台</div>
            <div class="v2-gate-hero">
              <div class="v2-gate-icon"><AppIcon name="robot" :size="34" /></div>
              <div>
                <h2 class="page-title">旧版 QQ 机器人管理面板</h2>
                <p class="page-sub">登录后可查看机器人运营数据、平台通知，管理 IP 白名单、事件订阅与回调配置。</p>
              </div>
            </div>
            <div class="v2-login-overview">
              <div class="v2-login-step">
                <span class="v2-login-step-num">1</span>
                <div><b>创建安全会话</b><span>由 Elaina 启动一次性登录流程</span></div>
              </div>
              <div class="v2-login-step">
                <span class="v2-login-step-num">2</span>
                <div><b>扫码或点击链接登录</b><span>支持在登录设备上直接打开登录页面确认</span></div>
              </div>
              <div class="v2-login-step">
                <span class="v2-login-step-num">3</span>
                <div><b>自动完成登录</b><span>登录凭证仅在服务端内部保存，不在页面展示</span></div>
              </div>
            </div>
            <div class="v2-gate-actions">
              <button class="btn primary large" :disabled="loginLoading" @click="startLogin">
                <AppIcon name="qr" :size="17" />
                {{ loginLoading ? '正在准备...' : '登录开放平台' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 机器人列表 -->
        <div v-else-if="view === 'list'" class="page page-bots">
          <div class="page-head">
            <div>
              <div class="current-subject-card">
                <span class="developer-picker-mark">Q</span>
                <span class="current-subject-text">
                  <strong>已登录开放平台</strong>
                  <small class="mono">UIN: {{ loginInfo.uin }}</small>
                </span>
                <span class="developer-picker-type">旧版</span>
              </div>
            </div>
            <div class="page-actions">
              <button class="btn ghost" :disabled="botsLoading" @click="fetchBots">{{ botsLoading ? '刷新中...' : '刷新列表' }}</button>
              <button class="btn ghost" @click="logout">登出</button>
            </div>
          </div>
          <div v-if="botsLoading && !bots.length" class="empty-hint">加载中...</div>
          <div v-else class="bots-grid">
            <div v-for="b in bots" :key="b.appid" class="bot-card" @click="openBot(b)">
              <div class="bot-head">
                <div class="bot-avatar" :style="{ background: b.avatar ? 'transparent' : b.color }">
                  <img v-if="b.avatar" :src="b.avatar" alt="" />
                  <span v-else>{{ (b.name || 'B').charAt(0) }}</span>
                </div>
                <div class="bot-info">
                  <div class="bot-name">{{ b.name || b.appid }}</div>
                  <div class="bot-status"><span class="mono">AppID: {{ b.appid }}</span></div>
                </div>
                <span class="bot-action"><AppIcon name="chevron" :size="18" /></span>
              </div>
            </div>
            <div v-if="!bots.length" class="empty-hint">暂无机器人，点击右上角“刷新列表”重试</div>
          </div>
        </div>

        <!-- 管理页 -->
        <div v-else class="page page-manage">
          <div class="page-head has-back">
            <div class="page-head-main">
              <div class="page-title-row">
                <button class="back-link-inline" type="button" aria-label="返回" @click="backToList"><AppIcon name="back" :size="18" /></button>
                <div class="manage-title-avatar" :style="{ background: cur.avatar ? 'transparent' : cur.color }">
                  <img v-if="cur.avatar" :src="cur.avatar" alt="" /><span v-else>{{ (cur.name || 'B').charAt(0) }}</span>
                </div>
                <h1 class="page-title">{{ cur.name }}</h1>
                <button v-if="bots.length > 1" class="bot-switch-trigger" type="button" aria-label="切换机器人" title="切换机器人" @click="showBotSwitcher = true">
                  <AppIcon name="group" :size="14" />
                  <span>切换</span>
                </button>
                <div class="manage-status-pill" data-state="offline">
                  <span class="mono">AppID: {{ cur.appid }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="manage-layout">
            <nav class="manage-nav">
              <button v-for="t in TABS" :key="t.key" type="button" class="mn-item" :class="{ active: tab === t.key }" @click="switchTab(t.key)">{{ t.label }}</button>
            </nav>
            <div class="manage-body">
      <!-- Data panel -->
      <div v-if="tab === 'data' && selectedBot" class="sec-group panel">
        <div class="report-header">
          <div class="report-title-wrap"><span class="report-title">数据总览</span></div>
          <div class="report-actions">
            <select v-model="days" class="report-range-select" @change="fetchData"><option :value="7">最近7天</option><option :value="14">最近14天</option><option :value="30">最近30天</option></select>
            <button class="btn ghost sm" @click="fetchData" :disabled="dataLoading">{{ dataLoading ? '加载中...' : '刷新' }}</button>
          </div>
        </div>
        <div class="report-stat-cards">
          <div class="report-stat-card accent"><b>{{ stats.avgDau }}</b><span>日均 DAU（30 天均值）</span></div>
          <div class="report-stat-card"><b>{{ stats.totalUp }}</b><span>总上行消息</span></div>
          <div class="report-stat-card"><b>{{ stats.currentGroups }}</b><span>现有群组</span></div>
          <div class="report-stat-card"><b>{{ stats.currentFriends }}</b><span>现有好友</span></div>
        </div>
        <div class="report-table-wrap">
          <table v-if="dayData.length" class="report-table">
            <thead><tr><th>日期</th><th>上行消息</th><th>上行人数</th><th>下行消息</th><th>现有群组</th><th>新增群组</th><th>现有好友</th><th>新增好友</th></tr></thead>
            <tbody><tr v-for="d in dayData" :key="d.date"><td class="mono">{{ d.date }}</td><td>{{ d.up_messages }}</td><td>{{ d.up_users }}</td><td>{{ d.down_messages }}</td><td>{{ d.current_groups }}</td><td>{{ d.new_groups }}</td><td>{{ d.current_friends }}</td><td>{{ d.new_friends }}</td></tr></tbody>
          </table>
          <div v-else-if="!dataLoading" class="report-empty">暂无数据</div>
        </div>
      </div>

      <!-- Notifications panel -->
      <div v-if="tab === 'notifications' && selectedBot" class="sec-group panel">
        <div class="report-header">
          <div class="report-title-wrap"><span class="report-title">平台通知</span></div>
          <button class="btn ghost sm" @click="fetchNotifications" :disabled="notiLoading">{{ notiLoading ? '加载中...' : '刷新' }}</button>
        </div>
        <div v-if="notifications.length" class="noti-list">
          <div v-for="(n, i) in notifications" :key="i" class="noti-item">
            <div class="noti-title">{{ n.title || '通知' }}</div>
            <div class="noti-content">{{ n.content }}</div>
            <div class="noti-time">{{ n.send_time }}</div>
          </div>
        </div>
        <div v-else-if="!notiLoading" class="report-empty">暂无通知</div>
      </div>

      <!-- Whitelist panel -->
      <div v-if="tab === 'whitelist' && selectedBot" class="sec-group panel">
        <div class="report-header">
          <div class="report-title-wrap"><span class="report-title">IP 白名单</span></div>
          <div class="report-actions"><button class="btn ghost sm" @click="fetchWhitelist" :disabled="wlLoading">{{ wlLoading ? '加载中...' : '刷新' }}</button></div>
        </div>
        <div class="webhook-input-row wl-add-row">
          <input v-model="newIp" class="ctrl-input" placeholder="输入 IP 地址 (如 1.2.3.4)" @keyup.enter="addPendingIp" />
          <button class="btn primary sm" @click="addPendingIp" :disabled="!newIp.trim()">添加到列表</button>
        </div>
        <div v-if="pendingIps.length" class="wl-pending">
          <div class="wl-pending-title">待添加 ({{ pendingIps.length }})</div>
          <div class="wl-pending-chips">
            <span v-for="(ip, i) in pendingIps" :key="i" class="pending-chip">{{ ip }} <button class="chip-remove" @click="pendingIps.splice(i, 1)">×</button></span>
          </div>
          <button class="btn primary sm" @click="startAuthQR('add')" :disabled="wlProcessing">{{ wlProcessing ? '处理中...' : '提交添加（需扫码授权）' }}</button>
        </div>
        <div v-if="whitelist.length" class="ip-whitelist-list wl-list">
          <div v-for="(ip, i) in whitelist" :key="i" class="wl-item">
            <span class="wl-ip mono">{{ typeof ip === 'string' ? ip : ip.ip }}</span>
            <button class="btn ghost sm" @click="confirmDeleteIp(typeof ip === 'string' ? ip : ip.ip)">删除</button>
          </div>
        </div>
        <div v-else-if="!wlLoading" class="report-empty">暂无白名单 IP</div>
      </div>

      <!-- Events panel -->
      <div v-if="tab === 'events' && selectedBot" class="sec-group panel">
        <div class="report-header">
          <div class="report-title-wrap"><span class="report-title">事件订阅</span></div>
          <div class="report-actions">
            <button class="btn ghost sm" @click="fetchEvents" :disabled="eventsLoading">{{ eventsLoading ? '加载中...' : '刷新' }}</button>
            <button class="btn primary sm" @click="saveEvents" :disabled="eventsProcessing || !eventsDirty">{{ eventsProcessing ? '处理中...' : '保存更改（需扫码授权）' }}</button>
          </div>
        </div>
        <div class="sec-group-desc ev-tip">勾选要订阅的事件，取消勾选即代表退订。全量群消息等事件已由开放平台在「事件订阅」入口中直接提供，按需勾选即可。</div>
        <div v-if="events.length" class="ev-groups">
          <div v-for="g in groupedEvents" :key="g.type" class="ev-group">
            <div class="ev-group-title">{{ g.type }}</div>
            <div class="ev-list">
              <label v-for="e in g.list" :key="e.id" :class="['ev-item', { changed: !!e.checked !== !!e.is_subscribed }]">
                <input type="checkbox" v-model="e.checked" />
                <span class="ev-info">
                  <span class="ev-name">{{ e.name }}</span>
                  <span class="ev-id">{{ e.id }}</span>
                </span>
              </label>
            </div>
          </div>
        </div>
        <div v-else-if="!eventsLoading" class="report-empty">暂无事件</div>
      </div>

      <!-- Webhook panel -->
      <div v-if="tab === 'webhook' && selectedBot" class="sec-group panel">
        <div class="report-header">
          <div class="report-title-wrap"><span class="report-title">回调配置</span></div>
          <div class="report-actions">
            <button class="btn ghost sm" @click="fetchWebhook" :disabled="webhookLoading">{{ webhookLoading ? '加载中...' : '刷新' }}</button>
            <button class="btn ghost sm" @click="checkWebhook" :disabled="webhookCheck.checking || !webhookInput.trim()">{{ webhookCheck.checking ? '校验中...' : '校验地址' }}</button>
            <button class="btn primary sm" @click="saveWebhook" :disabled="webhookProcessing || !webhookDirty">{{ webhookProcessing ? '处理中...' : '保存更改（需扫码授权）' }}</button>
          </div>
        </div>
        <div class="sec-group-desc ev-tip">机器人事件回调（Webhook）地址，开放平台会把订阅的事件推送到该地址。当设置 Webhook 后无法转回 WebSocket（建议 WebSocket）。<br /><span class="wh-warn">提交端口必须为 80、8080、443、8443，支持 http，支持 IP 订阅（无需域名）。</span></div>
        <div class="wh-form">
          <label class="wh-label">当前回调地址</label>
          <div class="wh-current mono">{{ webhookUrl || '（未设置）' }}</div>
          <label class="wh-label">新回调地址</label>
          <div class="webhook-input-row">
            <input v-model="webhookInput" class="ctrl-input" placeholder="如 https://1.2.3.4:8080/api/102061770" @keyup.enter="saveWebhook" />
            <button v-if="webhookSuggest.available" class="btn ghost sm" @click="webhookInput = webhookSuggest.url" title="填入本机回调地址">自动填入</button>
          </div>
          <div v-if="webhookCheck.msg" :class="['webhook-check-msg', webhookCheck.ok ? 'ok' : 'fail']">{{ webhookCheck.ok ? '✓ ' : '✗ ' }}{{ webhookCheck.msg }}</div>
        </div>
      </div>

            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 登录弹窗 -->
    <OpenAPILoginDialog
      v-if="showLoginQR"
      title="扫码登录 QQ 开放平台"
      description="登录会话仅用于连接旧版 QQ 机器人管理面板"
      :steps="loginSteps"
      :qr-target="loginUrl"
      :preparing="loginStatus === 'preparing'"
      :status-text="loginStatusText"
      :status-tone="loginStatus === 'logged_in' ? 'success' : loginEnded ? 'error' : 'waiting'"
      :open-url="loginUrl"
      :actions="loginActions"
      @action="handleLoginAction"
      @close="closeLogin"
    />

    <!-- 机器人切换 -->
    <div v-if="showBotSwitcher" class="v2-qr-overlay" @click.self="showBotSwitcher = false">
      <div class="form-modal developer-picker-modal">
        <div class="v2-qr-title">切换机器人</div>
        <div class="v2-qr-desc">选择要管理的机器人，无需返回列表</div>
        <div class="developer-picker-list">
          <button
            v-for="b in bots"
            :key="b.appid"
            type="button"
            :class="['developer-picker-item', { selected: b.appid === cur.appid }]"
            @click="switchBot(b)"
          >
            <span class="developer-picker-mark bot-switch-avatar" :style="{ background: b.avatar ? 'transparent' : b.color }">
              <img v-if="b.avatar" :src="b.avatar" alt="" /><template v-else>{{ (b.name || 'B').charAt(0) }}</template>
            </span>
            <span class="developer-picker-info">
              <strong>{{ b.name || b.appid }}</strong>
              <small>AppID：{{ b.appid }}</small>
            </span>
            <span class="developer-picker-type">{{ b.appid === cur.appid ? '当前' : '切换' }}</span>
          </button>
          <div v-if="!bots.length" class="report-empty">暂无机器人</div>
        </div>
        <div class="create-actions">
          <button class="btn ghost" type="button" @click="showBotSwitcher = false">取消</button>
        </div>
      </div>
    </div>

    <!-- 扫码授权弹窗 -->
    <div v-if="showAuthQR" class="modal-overlay" @click.self="closeAuthQR">
      <div class="qr-modal">
        <div class="qr-title">扫码授权</div>
        <div class="qr-desc">请使用 QQ 扫描下方二维码以授权操作</div>
        <div class="qr-frame">
          <img v-if="authQrUrl" :src="authQrUrl" class="qr-img" alt="授权二维码" />
          <div v-else class="qr-loading">正在生成二维码...</div>
        </div>
        <div :class="['qr-status', authStatus === 'authorized' ? 'status-ok' : 'status-waiting']">{{ authStatus === 'authorized' ? '授权成功，正在执行...' : '等待扫码授权...' }}</div>
        <button class="btn ghost qr-close" @click="closeAuthQR">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.openapi-old {
  background: transparent;
}
.openapi-old .panel {
  padding: 20px;
  margin-bottom: 16px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}
.qr-modal {
  background: var(--bg-elev);
  border-radius: 18px;
  padding: 32px;
  text-align: center;
  min-width: 340px;
  box-shadow: var(--shadow-lg);
}
.qr-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 6px;
}
.qr-desc {
  font-size: 13px;
  color: var(--ink-4);
  margin-bottom: 20px;
}
.qr-frame {
  width: 260px;
  height: 260px;
  margin: 0 auto 16px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #fff;
}
.qr-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.qr-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-4);
  font-size: 14px;
}
.qr-status {
  font-size: 13px;
  margin-bottom: 16px;
  font-weight: 600;
}
.status-ok {
  color: var(--ok);
}
.status-waiting {
  color: var(--warn);
}
.qr-close {
  width: 100%;
  justify-content: center;
}
.ctrl-input {
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  background: var(--bg-elev);
  color: var(--ink);
  font-size: 13px;
  flex: 1;
  min-width: 160px;
  outline: none;
}
.ctrl-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.wl-add-row {
  margin-bottom: 16px;
}
.wl-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.wl-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-sunken);
  border-radius: 10px;
  border: 1px solid var(--line);
}
.wl-ip {
  font-weight: 600;
  color: var(--ink);
  font-size: 14px;
  flex: 1;
}
.wl-pending {
  margin-bottom: 16px;
  padding: 14px;
  background: var(--bg-sunken);
  border-radius: 12px;
  border: 1px solid var(--line);
}
.wl-pending-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  margin-bottom: 8px;
}
.wl-pending-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.pending-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--accent);
  color: #fff;
  border-radius: 12px;
  font-size: 12px;
  font-family: var(--font-mono);
}
.chip-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, .7);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.chip-remove:hover {
  color: #fff;
}
.ev-tip {
  padding: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
}
.wh-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 560px;
}
.wh-label {
  font-size: 12px;
  color: var(--ink-4);
  margin-top: 6px;
}
.wh-current {
  font-size: 13px;
  color: var(--ink-2);
  word-break: break-all;
  padding: 8px 10px;
  background: var(--bg-sunken);
  border-radius: 8px;
}
.wh-warn {
  color: var(--danger);
}
.webhook-check-msg {
  font-size: 13px;
  margin-top: 4px;
}
.ev-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ev-group-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-4);
  letter-spacing: .04em;
  margin-bottom: 8px;
}
.ev-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.ev-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-elev);
  border-radius: 10px;
  border: 1px solid var(--line);
  cursor: pointer;
}
.ev-item:hover {
  border-color: var(--accent-border-strong);
}
.ev-item.changed {
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.ev-item input {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: var(--accent);
  cursor: pointer;
}
.ev-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ev-name {
  font-size: 13px;
  color: var(--ink);
  font-weight: 500;
}
.ev-id {
  font-size: 11px;
  color: var(--ink-4);
  font-family: var(--font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media(max-width:640px) {
  .openapi-old .panel {
    padding: 14px;
  }
}
</style>
