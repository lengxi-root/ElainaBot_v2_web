<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import axios from '../../utils/axios'
import SvgIcon from '../../components/SvgIcon.vue'
import OpenAPILoginDialog from './OpenAPILoginDialog.vue'

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
const TABS = [{ key: 'data', label: '数据总览' }, { key: 'notifications', label: '平台通知' }, { key: 'whitelist', label: 'IP 白名单' }, { key: 'events', label: '事件订阅' }, { key: 'webhook', label: '回调配置' }]
const tab = ref('data')

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
  loggedIn.value = false; loginInfo.uin = ''; loginInfo.appId = ''; bots.value = []; selectedBot.value = ''
}

async function fetchBots() {
  botsLoading.value = true
  try { const { data } = await axios.post('/api/openapi/botlist', { user_id: 'web_user' }); if (data.success) { const apps = data.data?.apps || []; bots.value = apps.map(a => ({ appid: a.app_id || a.appid || a.bot_appid || '', name: a.app_name || a.name || '' })); if (bots.value.length && !selectedBot.value) selectedBot.value = bots.value[0].appid } else if (data.message?.includes('失效')) loggedIn.value = false } catch {}
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
  <div class="openapi-page">
    <div class="ui-page-head">
      <div class="ui-page-head-main">
        <div class="ui-page-icon"><SvgIcon name="key" :size="24" /></div>
        <div>
          <h1 class="ui-page-title">开放平台</h1>
          <div class="ui-page-sub">管理 QQ 开放平台登录与机器人信息</div>
        </div>
      </div>
    </div>
    <!-- Login bar -->
    <div :class="['login-bar', { 'logged-in': loggedIn }]">
      <div class="login-info">
        <div :class="['login-dot', loggedIn ? 'on' : 'off']" />
        <template v-if="loggedIn"><span class="login-label">已登录</span><span class="login-uin">UIN: {{ loginInfo.uin }}</span></template>
        <span v-else class="login-label">未登录开放平台</span>
      </div>
      <div class="login-actions">
        <button v-if="loggedIn" class="btn btn-ghost" @click="logout">登出</button>
        <button v-else class="btn btn-primary" @click="startLogin" :disabled="loginLoading">{{ loginLoading ? '获取中...' : '扫码登录' }}</button>
      </div>
    </div>

    <!-- Login QR modal -->
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

    <template v-if="loggedIn">
      <!-- Bot select -->
      <div v-if="bots.length" class="bot-select-bar">
        <div class="bot-chips">
          <button v-for="b in bots" :key="b.appid" :class="['bot-chip', { active: selectedBot === b.appid }]" @click="selectedBot = b.appid">
            <span class="chip-name">{{ b.name || b.appid }}</span>
            <span class="chip-id">{{ b.appid }}</span>
          </button>
        </div>
        <button class="btn btn-sm btn-ghost" @click="fetchBots" :disabled="botsLoading">{{ botsLoading ? '刷新中...' : '刷新列表' }}</button>
      </div>
      <div v-else class="bot-empty">
        <button class="btn btn-primary" @click="fetchBots" :disabled="botsLoading">{{ botsLoading ? '加载中...' : '加载机器人列表' }}</button>
      </div>

      <!-- Tabs -->
      <div v-if="selectedBot" class="tab-bar">
        <button v-for="t in TABS" :key="t.key" :class="['tab-btn', { active: tab === t.key }]" @click="switchTab(t.key)">{{ t.label }}</button>
      </div>

      <!-- Data panel -->
      <div v-if="tab === 'data' && selectedBot" class="panel">
        <div class="panel-header">
          <h3>数据总览</h3>
          <div class="panel-actions">
            <select v-model="days" class="ctrl-select" @change="fetchData"><option :value="7">近 7 天</option><option :value="14">近 14 天</option><option :value="30">近 30 天</option></select>
            <button class="btn btn-sm btn-ghost" @click="fetchData" :disabled="dataLoading">{{ dataLoading ? '加载中...' : '刷新' }}</button>
          </div>
        </div>
        <div class="stat-cards">
          <div class="stat-card accent"><div class="stat-val">{{ stats.avgDau }}</div><div class="stat-label">日均 DAU</div></div>
          <div class="stat-card"><div class="stat-val">{{ stats.totalUp }}</div><div class="stat-label">总上行消息</div></div>
          <div class="stat-card"><div class="stat-val">{{ stats.currentGroups }}</div><div class="stat-label">现有群组</div></div>
          <div class="stat-card"><div class="stat-val">{{ stats.currentFriends }}</div><div class="stat-label">现有好友</div></div>
        </div>
        <div class="table-wrap">
          <table v-if="dayData.length" class="data-table">
            <thead><tr><th>日期</th><th>上行消息</th><th>上行人数</th><th>下行消息</th><th>现有群组</th><th>新增群组</th><th>现有好友</th><th>新增好友</th></tr></thead>
            <tbody><tr v-for="d in dayData" :key="d.date"><td class="date-cell">{{ d.date }}</td><td>{{ d.up_messages }}</td><td>{{ d.up_users }}</td><td>{{ d.down_messages }}</td><td>{{ d.current_groups }}</td><td>{{ d.new_groups }}</td><td>{{ d.current_friends }}</td><td>{{ d.new_friends }}</td></tr></tbody>
          </table>
          <div v-else-if="!dataLoading" class="empty-hint">暂无数据</div>
        </div>
      </div>

      <!-- Notifications panel -->
      <div v-if="tab === 'notifications' && selectedBot" class="panel">
        <div class="panel-header">
          <h3>平台通知</h3>
          <button class="btn btn-sm btn-ghost" @click="fetchNotifications" :disabled="notiLoading">{{ notiLoading ? '加载中...' : '刷新' }}</button>
        </div>
        <div v-if="notifications.length" class="noti-list">
          <div v-for="(n, i) in notifications" :key="i" class="noti-item">
            <div class="noti-title">{{ n.title || '通知' }}</div>
            <div class="noti-content">{{ n.content }}</div>
            <div class="noti-time">{{ n.send_time }}</div>
          </div>
        </div>
        <div v-else-if="!notiLoading" class="empty-hint">暂无通知</div>
      </div>

      <!-- Whitelist panel -->
      <div v-if="tab === 'whitelist' && selectedBot" class="panel">
        <div class="panel-header">
          <h3>IP 白名单</h3>
          <div class="panel-actions"><button class="btn btn-sm btn-ghost" @click="fetchWhitelist" :disabled="wlLoading">{{ wlLoading ? '加载中...' : '刷新' }}</button></div>
        </div>
        <div class="wl-add-row">
          <input v-model="newIp" class="ctrl-input" placeholder="输入 IP 地址 (如 1.2.3.4)" @keyup.enter="addPendingIp" />
          <button class="btn btn-primary btn-sm" @click="addPendingIp" :disabled="!newIp.trim()">添加到列表</button>
        </div>
        <div v-if="pendingIps.length" class="wl-pending">
          <div class="wl-pending-title">待添加 ({{ pendingIps.length }})</div>
          <div class="wl-pending-chips">
            <span v-for="(ip, i) in pendingIps" :key="i" class="pending-chip">{{ ip }} <button class="chip-remove" @click="pendingIps.splice(i, 1)">×</button></span>
          </div>
          <button class="btn btn-primary btn-sm" @click="startAuthQR('add')" :disabled="wlProcessing">{{ wlProcessing ? '处理中...' : '提交添加（需扫码授权）' }}</button>
        </div>
        <div v-if="whitelist.length" class="wl-list">
          <div v-for="(ip, i) in whitelist" :key="i" class="wl-item">
            <span class="wl-ip">{{ typeof ip === 'string' ? ip : ip.ip }}</span>
            <button class="btn-icon btn-danger-icon" @click="confirmDeleteIp(typeof ip === 'string' ? ip : ip.ip)" title="删除"> × </button>
          </div>
        </div>
        <div v-else-if="!wlLoading" class="empty-hint">暂无白名单 IP</div>
      </div>

      <!-- Events panel -->
      <div v-if="tab === 'events' && selectedBot" class="panel">
        <div class="panel-header">
          <h3>事件订阅</h3>
          <div class="panel-actions">
            <button class="btn btn-sm btn-ghost" @click="fetchEvents" :disabled="eventsLoading">{{ eventsLoading ? '加载中...' : '刷新' }}</button>
            <button class="btn btn-sm btn-primary" @click="saveEvents" :disabled="eventsProcessing || !eventsDirty">{{ eventsProcessing ? '处理中...' : '保存更改（需扫码授权）' }}</button>
          </div>
        </div>
        <div class="ev-tip">勾选要订阅的事件，取消勾选即代表退订。全量群消息等事件已由开放平台在「事件订阅」入口中直接提供，按需勾选即可。</div>
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
        <div v-else-if="!eventsLoading" class="empty-hint">暂无事件</div>
      </div>

      <!-- Webhook panel -->
      <div v-if="tab === 'webhook' && selectedBot" class="panel">
        <div class="panel-header">
          <h3>回调配置</h3>
          <div class="panel-actions">
            <button class="btn btn-sm btn-ghost" @click="fetchWebhook" :disabled="webhookLoading">{{ webhookLoading ? '加载中...' : '刷新' }}</button>
            <button class="btn btn-sm btn-ghost" @click="checkWebhook" :disabled="webhookCheck.checking || !webhookInput.trim()">{{ webhookCheck.checking ? '校验中...' : '校验地址' }}</button>
            <button class="btn btn-sm btn-primary" @click="saveWebhook" :disabled="webhookProcessing || !webhookDirty">{{ webhookProcessing ? '处理中...' : '保存更改（需扫码授权）' }}</button>
          </div>
        </div>
        <div class="ev-tip">机器人事件回调（Webhook）地址，开放平台会把订阅的事件推送到该地址。当设置 Webhook 后无法转回 WebSocket（建议 WebSocket）。<br /><span class="wh-warn">提交端口必须为 80、8080、443、8443，支持 http，支持 IP 订阅（无需域名）。</span></div>
        <div class="wh-form">
          <label class="wh-label">当前回调地址</label>
          <div class="wh-current">{{ webhookUrl || '（未设置）' }}</div>
          <label class="wh-label">新回调地址</label>
          <div class="wh-input-row">
            <input v-model="webhookInput" class="ctrl-input" placeholder="如 https://1.2.3.4:8080/api/102061770" @keyup.enter="saveWebhook" />
            <button v-if="webhookSuggest.available" class="btn btn-sm btn-ghost wh-fill-btn" @click="webhookInput = webhookSuggest.url" title="填入本机回调地址">自动填入</button>
          </div>
          <div v-if="webhookCheck.msg" :class="['wh-check', webhookCheck.ok ? 'wh-check-ok' : 'wh-check-fail']">{{ webhookCheck.ok ? '✓ ' : '✗ ' }}{{ webhookCheck.msg }}</div>
        </div>
      </div>

      <!-- Auth QR modal -->
      <div v-if="showAuthQR" class="modal-overlay" @click.self="closeAuthQR">
        <div class="qr-modal">
          <div class="qr-title">扫码授权</div>
          <div class="qr-desc">请使用 QQ 扫描下方二维码以授权操作</div>
          <div class="qr-frame">
            <img v-if="authQrUrl" :src="authQrUrl" class="qr-img" alt="授权二维码" />
            <div v-else class="qr-loading">正在生成二维码...</div>
          </div>
          <div :class="['qr-status', authStatus === 'authorized' ? 'status-ok' : 'status-waiting']">{{ authStatus === 'authorized' ? '授权成功，正在执行...' : '等待扫码授权...' }}</div>
          <button class="btn btn-ghost qr-close" @click="closeAuthQR">取消</button>
        </div>
      </div>
    </template>

    <!-- Not logged in hint -->
    <div v-if="!loggedIn && !loginLoading" class="not-logged-in">
      <div class="nli-icon"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="15.5" cy="8.5" r="5.5" /><line x1="11.5" y1="12.5" x2="2" y2="22" /><line x1="2" y1="22" x2="6" y2="22" /><line x1="6" y1="18" x2="6" y2="22" /><circle cx="15.5" cy="8.5" r="2" fill="var(--text3)" stroke="none" /></svg></div>
      <div class="nli-title">QQ 开放平台管理</div>
      <div class="nli-desc">登录后可查看机器人数据、管理消息模板和 IP 白名单</div>
    </div>
  </div>
</template>

<style scoped>
.openapi-page {
  max-width:1100px;
  margin:0 auto
}
.login-bar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:14px 20px;
  border-radius:var(--radius);
  background:var(--bg2);
  border:1px solid var(--border);
  margin-bottom:16px
}
.login-info {
  display:flex;
  align-items:center;
  gap:10px
}
.login-dot {
  width:10px;
  height:10px;
  border-radius:50%;
  flex-shrink:0
}
.login-dot.on {
  background:var(--success);
  box-shadow:0 0 8px var(--success)
}
.login-dot.off {
  background:var(--text3)
}
.login-label {
  font-weight:600;
  color:var(--text);
  font-size:14px
}
.login-uin {
  font-size:13px;
  color:var(--text2);
  font-family:monospace
}
.login-actions {
  display:flex;
  gap:8px
}
.btn {
  box-sizing:border-box;
  padding:8px 18px;
  border-radius:var(--radius-sm);
  border:none;
  font-size:13px;
  font-weight:600;
  cursor:pointer;
  transition:all .15s;
  display:inline-flex;
  align-items:center;
  gap:6px
}
.btn:disabled {
  opacity:.5;
  cursor:not-allowed
}
.btn-primary {
  background:var(--accent);
  color:#fff
}
.btn-primary:hover:not(:disabled) {
  background:var(--accent-hover)
}
.btn-ghost {
  background:transparent;
  color:var(--text2);
  border:1px solid var(--border)
}
.btn-ghost:hover:not(:disabled) {
  background:var(--bg3);
  color:var(--text)
}
.btn-danger {
  background:var(--danger);
  color:#fff
}
.btn-danger:hover:not(:disabled) {
  opacity:.85
}
.btn-sm {
  padding:5px 12px;
  font-size:12px
}
.btn-icon {
  background:none;
  border:none;
  font-size:22px;
  line-height:1;
  cursor:pointer;
  color:var(--text3);
  padding:2px 6px;
  border-radius:4px
}
.btn-icon:hover {
  color:var(--text);
  background:var(--bg3)
}
.btn-danger-icon {
  color:var(--danger)
}
.btn-danger-icon:hover {
  background:#f23f431a
}
.modal-overlay {
  position:fixed;
  top:0;
  right:0;
  bottom:0;
  left:0;
  background:#00000080;
  z-index:1000;
  display:flex;
  align-items:center;
  justify-content:center;
  -webkit-backdrop-filter:blur(4px);
  backdrop-filter:blur(4px)
}
.qr-modal {
  background:var(--bg-float);
  border-radius:var(--radius-lg);
  padding:32px;
  text-align:center;
  min-width:340px;
  box-shadow:0 20px 60px #0000004d
}
.qr-title {
  font-size:18px;
  font-weight:700;
  color:var(--text);
  margin-bottom:6px
}
.qr-desc {
  font-size:13px;
  color:var(--text3);
  margin-bottom:20px
}
.qr-frame {
  width:260px;
  height:260px;
  margin:0 auto 16px;
  border-radius:var(--radius);
  overflow:hidden;
  border:1px solid var(--border);
  background:#fff
}
.qr-img {
  width:100%;
  height:100%;
  -o-object-fit:contain;
  object-fit:contain
}
.qr-loading {
  width:100%;
  height:100%;
  display:flex;
  align-items:center;
  justify-content:center;
  color:var(--text3);
  font-size:14px
}
.qr-status {
  font-size:13px;
  margin-bottom:16px;
  font-weight:600
}
.status-ok {
  color:var(--success)
}
.status-waiting {
  color:var(--warning)
}
.status-error {
  color:var(--danger)
}
.qr-close {
  width:100%;
  justify-content:center
}
.bot-select-bar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:16px;
  gap:12px;
  flex-wrap:wrap
}
.bot-chips {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  flex:1
}
.bot-chip {
  padding:8px 16px;
  border-radius:var(--radius-sm);
  border:1px solid var(--border);
  background:var(--bg2);
  cursor:pointer;
  transition:all .15s;
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:120px
}
.bot-chip:hover {
  border-color:var(--accent-light);
  background:var(--bg3)
}
.bot-chip.active {
  border-color:var(--accent);
  background:var(--accent)
}
.bot-chip.active .chip-name,.bot-chip.active .chip-id {
  color:#fff
}
.chip-name {
  font-size:13px;
  font-weight:600;
  color:var(--text)
}
.chip-id {
  font-size:11px;
  color:var(--text3);
  font-family:monospace
}
.bot-empty {
  text-align:center;
  padding:40px
}
.tab-bar {
  display:flex;
  gap:4px;
  margin-bottom:16px;
  padding:4px;
  background:var(--bg2);
  border-radius:var(--radius);
  border:1px solid var(--border)
}
.tab-btn {
  flex:1;
  padding:10px 16px;
  border:none;
  background:transparent;
  font-size:13px;
  font-weight:600;
  color:var(--text2);
  cursor:pointer;
  border-radius:var(--radius-sm);
  transition:all .15s
}
.tab-btn:hover {
  color:var(--text);
  background:var(--bg3)
}
.tab-btn.active {
  background:var(--accent);
  color:#fff
}
.panel {
  background:var(--bg2);
  border-radius:var(--radius);
  border:1px solid var(--border);
  padding:20px;
  margin-bottom:16px
}
.panel-header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:16px
}
.panel-header h3 {
  margin:0;
  font-size:16px;
  color:var(--text)
}
.panel-actions {
  display:flex;
  align-items:center;
  gap:8px
}
.stat-cards {
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:12px;
  margin-bottom:20px
}
.stat-card {
  padding:16px 20px;
  border-radius:var(--radius-sm);
  background:var(--bg3);
  border:1px solid var(--border)
}
.stat-card.accent {
  background:var(--accent);
  border-color:var(--accent)
}
.stat-card.accent .stat-val,.stat-card.accent .stat-label {
  color:#fff
}
.stat-val {
  font-size:24px;
  font-weight:700;
  color:var(--text);
  line-height:1.2
}
.stat-label {
  font-size:12px;
  color:var(--text3);
  margin-top:4px
}
.table-wrap {
  overflow-x:auto
}
.data-table {
  width:100%;
  border-collapse:collapse;
  font-size:13px
}
.data-table th {
  text-align:left;
  padding:10px 12px;
  font-weight:600;
  color:var(--text2);
  border-bottom:2px solid var(--border);
  white-space:nowrap;
  font-size:12px
}
.data-table td {
  padding:10px 12px;
  border-bottom:1px solid var(--border);
  color:var(--text)
}
.data-table tbody tr:hover {
  background:var(--bg3)
}
.date-cell {
  font-family:monospace;
  color:var(--text2);
  white-space:nowrap
}
.empty-hint {
  text-align:center;
  padding:40px 20px;
  color:var(--text3);
  font-size:14px
}
.ctrl-select {
  padding:6px 12px;
  border-radius:var(--radius-sm);
  border:1px solid var(--border);
  background:var(--bg);
  color:var(--text);
  font-size:13px;
  cursor:pointer
}
.ctrl-input {
  padding:8px 14px;
  border-radius:var(--radius-sm);
  border:1px solid var(--border);
  background:var(--bg);
  color:var(--text);
  font-size:13px;
  flex:1;
  min-width:160px
}
.ctrl-input:focus {
  outline:none;
  border-color:var(--accent)
}
.noti-list {
  display:flex;
  flex-direction:column;
  gap:10px
}
.noti-item {
  padding:14px 16px;
  border-radius:var(--radius-sm);
  background:var(--bg3);
  border:1px solid var(--border)
}
.noti-title {
  font-weight:600;
  font-size:14px;
  color:var(--text);
  margin-bottom:4px
}
.noti-content {
  font-size:13px;
  color:var(--text2);
  line-height:1.5;
  word-break:break-all
}
.noti-time {
  font-size:11px;
  color:var(--text3);
  margin-top:6px
}
.wl-add-row {
  display:flex;
  gap:8px;
  margin-bottom:16px
}
.wl-list {
  display:flex;
  flex-direction:column;
  gap:6px
}
.wl-item {
  display:flex;
  align-items:center;
  gap:12px;
  padding:10px 14px;
  background:var(--bg3);
  border-radius:var(--radius-sm);
  border:1px solid var(--border)
}
.wl-ip {
  font-family:monospace;
  font-weight:600;
  color:var(--text);
  font-size:14px;
  flex:1
}
.wl-desc {
  font-size:12px;
  color:var(--text3)
}
.wl-pending {
  margin-bottom:16px;
  padding:14px;
  background:var(--bg3);
  border-radius:var(--radius-sm);
  border:1px solid var(--border)
}
.wl-pending-title {
  font-size:13px;
  font-weight:600;
  color:var(--text2);
  margin-bottom:8px
}
.wl-pending-chips {
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-bottom:12px
}
.pending-chip {
  display:inline-flex;
  align-items:center;
  gap:4px;
  padding:4px 10px;
  background:var(--accent);
  color:#fff;
  border-radius:12px;
  font-size:12px;
  font-family:monospace
}
.chip-remove {
  background:none;
  border:none;
  color:#ffffffb3;
  cursor:pointer;
  font-size:14px;
  line-height:1;
  padding:0 2px
}
.chip-remove:hover {
  color:#fff
}
.ev-tip {
  font-size:12px;
  color:var(--text3);
  line-height:1.6;
  margin-bottom:14px
}
.ev-tip b {
  color:var(--accent)
}
.wh-form {
  display:flex;
  flex-direction:column;
  gap:8px;
  max-width:520px
}
.wh-label {
  font-size:12px;
  color:var(--text3);
  margin-top:6px
}
.wh-current {
  font-size:13px;
  color:var(--text1);
  word-break:break-all;
  padding:8px 10px;
  background:var(--bg2);
  border-radius:8px
}
.wh-warn {
  color:#e5484d
}
.wh-input-row {
  display:flex;
  gap:8px;
  align-items:center
}
.wh-input-row .ctrl-input {
  flex:1
}
.wh-fill-btn {
  white-space:nowrap;
  flex-shrink:0
}
.wh-check {
  font-size:13px;
  margin-top:4px
}
.wh-check-ok {
  color:#46a758
}
.wh-check-fail {
  color:#e5484d
}
.ev-groups {
  display:flex;
  flex-direction:column;
  gap:18px
}
.ev-group-title {
  font-size:13px;
  font-weight:700;
  color:var(--text2);
  margin-bottom:8px
}
.ev-list {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
  gap:8px
}
.ev-item {
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 12px;
  background:var(--bg3);
  border-radius:var(--radius-sm);
  border:1px solid var(--border);
  cursor:pointer
}
.ev-item:hover {
  border-color:var(--accent)
}
.ev-item.changed {
  box-shadow:0 0 0 1px var(--accent) inset
}
.ev-item input {
  width:16px;
  height:16px;
  flex-shrink:0;
  accent-color:var(--accent);
  cursor:pointer
}
.ev-info {
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0
}
.ev-name {
  font-size:13px;
  color:var(--text);
  font-weight:500
}
.ev-id {
  font-size:11px;
  color:var(--text3);
  font-family:monospace;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.not-logged-in {
  text-align:center;
  padding:80px 20px;
  color:var(--text3)
}
.nli-icon {
  margin-bottom:20px;
  opacity:.5
}
.nli-title {
  font-size:20px;
  font-weight:700;
  color:var(--text2);
  margin-bottom:8px
}
.nli-desc {
  font-size:14px;
  color:var(--text3)
}
@media(max-width:640px) {
  .stat-cards {
  grid-template-columns:repeat(2,1fr)
}
.tpl-grid {
  grid-template-columns:1fr
}
.tab-bar {
  flex-wrap:wrap
}
.tab-btn {
  min-width:calc(50% - 4px)
}
.bot-chips {
  gap:6px
}
.bot-chip {
  min-width:100px;
  padding:6px 12px
}
.detail-modal {
  width:100vw;
  max-width:100vw;
  border-radius:var(--radius) var(--radius) 0 0
}
.panel {
  padding:14px
}
}
</style>
