<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import axios from '../../utils/axios'
import AppIcon from './AppIcon.vue'
import OpenAPILoginDialog from './OpenAPILoginDialog.vue'
import QrCodeImage from './QrCodeImage.vue'
import ReportLineChart from './ReportLineChart.vue'
import { ADVANCED_MOCK_APIS, runAdvancedMock } from './advancedMocks'
import './qqdash.css'

const UID = 'web_user'

/* ── 鉴权状态 ── */
const status = reactive({
  loggedIn: false,
  ready: false,
  developerId: '',
  uin: '',
  subjectName: '',
  subjectEmail: '',
  subjectType: 0,
  userType: 0,
})
const statusLoaded = ref(false)
const toast = ref('')
let toastTimer = null
function pushToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2600)
}

async function loadStatus() {
  try {
    const { data } = await axios.post('/api/openapi/v2/status', { user_id: UID })
    if (data.success) {
      status.loggedIn = !!data.logged_in
      status.ready = !!data.ready
      status.developerId = data.developer_id || ''
      status.uin = data.uin || ''
      if (status.ready) {
        await loadCurrentDeveloper()
        await checkPc2Status()
      } else {
        resetPc2Status()
      }
    }
  } catch (e) { /* ignore */ }
  statusLoaded.value = true
}

/* ── 扫码登录 ── */
const showQR = ref(false)
const qrImg = ref('')
const scanStatus = ref('preparing')
const scanMessage = ref('')
const scanDevelopers = ref([])
const selectedDeveloperId = ref('')
const scanLoading = ref(false)
let scanTimer = null
let scanRequestId = 0
const SCAN_TEXT = {
  preparing: '正在创建安全登录会话...',
  waiting: '等待扫码...',
  scanned: '已扫码，请在手机上确认',
  confirming: '确认中...',
  selecting: '请选择要登录的开发者主体',
  expired: '二维码已过期，请刷新',
  rejected: '已取消登录，请刷新重试',
  failed: '登录失败，请刷新重试',
  not_started: '登录任务已失效，请刷新重试',
  logged_in: '登录成功！',
}
const scanText = computed(() => scanMessage.value || SCAN_TEXT[scanStatus.value] || '获取中...')
const scanEnded = computed(() => ['expired', 'rejected', 'failed', 'not_started'].includes(scanStatus.value))
const scanSteps = computed(() => [
  { label: '准备会话', active: scanStatus.value === 'preparing', done: scanStatus.value !== 'preparing' },
  { label: '扫码确认', active: ['waiting', 'scanned', 'confirming'].includes(scanStatus.value), done: ['selecting', 'logged_in'].includes(scanStatus.value) },
  { label: '选择主体', active: scanStatus.value === 'selecting', done: scanStatus.value === 'logged_in' },
  { label: '完成登录', active: scanStatus.value === 'logged_in', done: false },
])
const scanActions = computed(() => [
  ...(scanStatus.value === 'selecting' ? [{ key: 'select', label: scanLoading.value ? '登录中...' : '登录所选主体', primary: true, disabled: !selectedDeveloperId.value || scanLoading.value }] : []),
  ...(scanEnded.value ? [{ key: 'refresh', label: '刷新二维码', primary: true }] : []),
  { key: 'close', label: '关闭' },
])

function stopScanPoll() { if (scanTimer) { clearInterval(scanTimer); scanTimer = null } }

async function startScan() {
  const requestId = ++scanRequestId
  showQR.value = true
  qrImg.value = ''
  scanStatus.value = 'preparing'
  scanMessage.value = ''
  scanDevelopers.value = []
  selectedDeveloperId.value = ''
  scanLoading.value = true
  try {
    const { data } = await axios.post('/api/openapi/v2/start-login', { user_id: UID })
    if (requestId !== scanRequestId) return
    if (data.success && data.qr_image) {
      qrImg.value = data.qr_image
      scanStatus.value = 'waiting'
      scanMessage.value = ''
      pollScan()
    } else {
      scanStatus.value = 'failed'
      scanMessage.value = data.message || '获取二维码失败'
    }
  } catch (e) {
    if (requestId !== scanRequestId) return
    scanStatus.value = 'failed'
    scanMessage.value = '登录服务请求失败，请稍后重试'
  }
  if (requestId === scanRequestId) scanLoading.value = false
}

let scanBusy = false
async function applyScanResponse(data) {
  const st = data.status || (data.success === false ? 'failed' : 'waiting')
  scanStatus.value = st
  scanMessage.value = ['expired', 'rejected', 'failed', 'not_started'].includes(st) ? (data.message || '') : ''
  if (st === 'logged_in') {
    stopScanPoll()
    setTimeout(() => { showQR.value = false }, 800)
    await loadStatus()
    if (status.ready) { pushToast('新版开放平台已授权'); loadBots() }
  } else if (st === 'selecting') {
    stopScanPoll()
    scanDevelopers.value = data.developers || []
    selectedDeveloperId.value = scanDevelopers.value.length === 1 ? scanDevelopers.value[0].id : ''
  } else if (st === 'waiting' && data.qr_image) {
    qrImg.value = data.qr_image
  } else if (['expired', 'rejected', 'failed', 'not_started'].includes(st)) {
    stopScanPoll()
  }
}

function pollScan() {
  stopScanPoll()
  scanTimer = setInterval(async () => {
    if (scanBusy) return
    scanBusy = true
    try {
      const { data } = await axios.post('/api/openapi/v2/check-login', { user_id: UID })
      await applyScanResponse(data)
    } catch (e) { /* ignore */ } finally { scanBusy = false }
  }, 2000)
}

async function selectDeveloper() {
  if (!selectedDeveloperId.value || scanLoading.value) return
  scanLoading.value = true
  scanStatus.value = 'confirming'
  try {
    const { data } = await axios.post('/api/openapi/v2/check-login', {
      user_id: UID,
      developer_id: selectedDeveloperId.value,
    })
    await applyScanResponse(data)
  } catch (e) {
    scanStatus.value = 'failed'
    scanMessage.value = '选择开发者主体失败，请刷新重试'
  }
  scanLoading.value = false
}

function subjectTypeText(type) {
  return ({ 0: '未认证', 1: '个人', 2: '企业', 3: '企业', 4: '未认证' })[type] || '开发者'
}

function refreshScan() { stopScanPoll(); startScan() }
function closeScan() {
  scanRequestId += 1
  stopScanPoll()
  scanLoading.value = false
  showQR.value = false
}
function handleScanAction(action) {
  if (action === 'select') selectDeveloper()
  else if (action === 'refresh') refreshScan()
  else closeScan()
}

/* ── 通用 v2 代理 ── */
async function v2(path, payload, method = 'POST', params) {
  const { data } = await axios.post('/api/openapi/v2/proxy', { user_id: UID, path, payload, method, params })
  if (data.relogin === true) {
    stopScanPoll()
    showQR.value = false
    status.loggedIn = false
    status.ready = false
    await loadStatus()
  }
  if (data.success === false) throw new Error(data.message || '请求失败')
  const r = data || {}
  const code = [r.code, r.ret, r.retcode, r.common?.code, r.common?.retcode, r.res?.ret]
    .find(v => typeof v === 'number')
  if (typeof code === 'number' && code !== 0) {
    throw new Error(r.message || r.msg || r.common?.msg || r.res?.msg || `code=${code}`)
  }
  return r.data && typeof r.data === 'object' ? { ...r, ...r.data } : r
}

const pc2 = reactive({
  loading: false,
  checked: false,
  hit: null,
  error: '',
})

function resetPc2Status() {
  pc2.loading = false
  pc2.checked = false
  pc2.hit = null
  pc2.error = ''
}

function applyPc2Result(result) {
  const value = result?.r ?? result?.data?.r
  if (![0, 1, '0', '1'].includes(value)) throw new Error('PC2 灰度接口未返回有效状态')
  pc2.checked = true
  pc2.hit = Number(value) === 1
  pc2.error = ''
}

async function checkPc2Status() {
  if (!status.ready || pc2.loading) return
  pc2.loading = true
  pc2.checked = false
  pc2.hit = null
  pc2.error = ''
  try {
    const result = await v2('/cgi-bin/v2/info/hit', { t: 1 })
    applyPc2Result(result)
  } catch (e) {
    pc2.checked = false
    pc2.hit = null
    pc2.error = e.message || 'PC2 灰度状态检测失败'
  }
  pc2.loading = false
}

async function loadCurrentDeveloper() {
  try {
    const r = await v2('/bopen/v2/get_audit_developer_info', {})
    const info = r.audit_developer_info || r.data?.audit_developer_info || {}
    const developer = info.developer_info || {}
    status.subjectName = developer.subject_name || ''
    status.subjectEmail = developer.subject_email || ''
    status.subjectType = developer.subject_type ?? 0
    status.userType = info.user_type ?? 0
  } catch (e) {
    status.subjectName = ''
    status.subjectEmail = ''
    status.subjectType = 0
    status.userType = 0
  }
}

const developers = ref([])
const showDeveloperPicker = ref(false)
const developersLoading = ref(false)
const developerSwitching = ref(false)
const selectedSwitchDeveloperId = ref('')
const currentDeveloper = computed(() => developers.value.find(item => item.id === status.developerId) || {
  id: status.developerId,
  name: status.subjectName,
  email: status.subjectEmail,
  subjectType: status.subjectType,
})

function developerMark(developer) {
  return (developer.name || developer.email || '主体').trim().charAt(0)
}

async function loadDevelopers() {
  developersLoading.value = true
  try {
    const { data } = await axios.post('/api/openapi/v2/developers', { user_id: UID })
    if (data.success === false) throw new Error(data.message || '获取主体列表失败')
    developers.value = (data.developers || []).map(item => ({
      id: item.id || '',
      name: item.name === '快速注册开发者' ? '未认证主体' : (item.name || '开发者主体'),
      email: item.email || '',
      subjectType: item.subject_type ?? 0,
    })).filter(item => item.id)
    selectedSwitchDeveloperId.value = data.current_developer_id || status.developerId
  } catch (e) { pushToast(e.message) }
  developersLoading.value = false
}

async function openDeveloperPicker() {
  showDeveloperPicker.value = true
  await loadDevelopers()
}

async function switchDeveloper() {
  if (!selectedSwitchDeveloperId.value || selectedSwitchDeveloperId.value === status.developerId || developerSwitching.value) return
  developerSwitching.value = true
  try {
    const { data } = await axios.post('/api/openapi/v2/switch-developer', {
      user_id: UID,
      developer_id: selectedSwitchDeveloperId.value,
    })
    if (data.success === false) throw new Error(data.message || '切换主体失败')
    status.developerId = data.developer_id || selectedSwitchDeveloperId.value
    await loadCurrentDeveloper()
    await checkPc2Status()
    view.value = 'list'
    activeSec.value = 'account-info'
    officialAvatars.value = []
    createDraft.avatarId = ''
    await loadBots()
    showDeveloperPicker.value = false
    pushToast(`已切换到「${status.subjectName || '当前主体'}」`)
  } catch (e) { pushToast(e.message) }
  developerSwitching.value = false
}

/* ── 视图路由 ── */
const view = ref('list') // list | manage
const activeSec = ref('account-info')
const activeSub = ref('')
const SECS = [
  { key: 'account-info', label: '账号信息' },
  { key: 'usage-scope', label: '服务范围' },
  { key: 'data', label: '运营数据' },
  { key: 'dev-settings', label: '开发设置' },
  { key: 'advanced', label: '高级功能' },
]

/* ── 机器人列表 ── */
const bots = ref([])
const createRemain = ref(0)
const botsLoading = ref(false)
const PALETTE = ['#5b8def', '#7c6cf0', '#f0794b', '#25b47e', '#e05a8c', '#3aa1d8']
const isMember = computed(() => status.userType === 2)

function botStatusText(bot) {
  if (bot.revoking) return '注销中'
  if (bot.status === 3) return '已删除'
  if (bot.status === 4) return '已封禁'
  if (bot.status !== 1) return '未知'
  return bot.online ? '在线' : '离线（服务不可用）'
}

function openBotCard(bot) {
  if (isMember.value) {
    pushToast('成员身份，暂不支持管理机器人设置')
    return
  }
  if (bot.revoking) {
    pushToast('该机器人正在注销中，撤回后可恢复正常')
    return
  }
  if (bot.status === 4) {
    pushToast('该机器人已被封禁')
    return
  }
  openBot(bot)
}

async function loadBots() {
  if (!status.ready) return
  botsLoading.value = true
  try {
    const r = await v2('/cgi-bin/v2/info/list_bots', {
      developer_id: status.developerId,
      filter: { create_remain: 1, online_state: 1, page_limit: 100 },
    })
    const list = r.bots || (r.data && r.data.bots) || []
    createRemain.value = r.create_remain ?? 0
    bots.value = list.map((b, i) => ({
      appid: b.bot_appid === undefined ? '' : String(b.bot_appid),
      name: b.bot_name || '',
      avatar: b.bot_avatar || '',
      uin: b.bot_uin === undefined ? '' : String(b.bot_uin),
      online: ((b.online_state && b.online_state.online_state) || 0) === 1,
      status: b.bot_status ?? 0,
      revoking: (b.bot_status ?? 0) === 2,
      finalDeleteTime: Number(b.final_delete_time || 0),
      color: PALETTE[i % PALETTE.length],
    }))
  } catch (e) { pushToast(e.message) }
  botsLoading.value = false
}

/* ── 机器人详情 ── */
const cur = reactive({
  appid: '',
  name: '',
  avatar: '',
  desc: '',
  uin: '',
  online: false,
  status: 0,
  revoking: false,
  finalDeleteTime: 0,
  color: '#5b8def',
})
const detailLoading = ref(false)
const baseInfo = reactive({ name: '', desc: '', avatar: '', uin: '' })
const developerInfo = reactive({ developerId: '', subjectName: '', subjectType: 0 })
const privateProto = reactive({ status: 0, url: '', effectiveDate: '', email: '' })
const isCertified = computed(() => [1, 2].includes(developerInfo.subjectType))
const certificationDescription = computed(() => {
  if (developerInfo.subjectType === 2) return '当前主体为企业认证，可开放好友（私聊）、群聊、频道全部场景。'
  if (developerInfo.subjectType === 1) return ''
  return '未认证账号状态下的机器人，仅限账号管理员使用，无法提供公开服务。'
})
const editor = reactive({
  visible: false,
  field: 'name',
  value: '',
  loading: false,
})
const showAvatarPicker = ref(false)
const selectedAvatarId = ref('')
const avatarSaving = ref(false)
const avatarFileInput = ref(null)
const customAvatarFile = ref(null)
const customAvatarUrl = ref('')
const cropper = reactive({
  visible: false,
  source: '',
  fileName: 'avatar.png',
  fileType: 'image/png',
  naturalWidth: 0,
  naturalHeight: 0,
  baseScale: 1,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
})
const CROP_VIEW_SIZE = 320
let cropImage = null
const cropImageStyle = computed(() => {
  const scale = cropper.baseScale * cropper.zoom
  const width = cropper.naturalWidth * scale
  const height = cropper.naturalHeight * scale
  return {
    width: `${width}px`,
    height: `${height}px`,
    left: `${(CROP_VIEW_SIZE - width) / 2 + cropper.offsetX}px`,
    top: `${(CROP_VIEW_SIZE - height) / 2 + cropper.offsetY}px`,
  }
})
const cropPreviewStyle = computed(() => {
  const previewScale = 96 / CROP_VIEW_SIZE
  const style = cropImageStyle.value
  return {
    width: `${parseFloat(style.width) * previewScale}px`,
    height: `${parseFloat(style.height) * previewScale}px`,
    left: `${parseFloat(style.left) * previewScale}px`,
    top: `${parseFloat(style.top) * previewScale}px`,
  }
})
const privacyDialog = reactive({
  visible: false,
  editing: false,
  email: '',
  loading: false,
})
const revokeDialog = reactive({
  visible: false,
  input: '',
  quick: false,
  loading: false,
})

const botShareTarget = computed(() => {
  const params = new URLSearchParams({
    robot_appid: cur.appid,
    robot_uin: cur.uin,
    biz_type: '0',
    jumpsource: 'shorturl',
  })
  return `https://qun.qq.com/qunpro/robot/qunshare?${params.toString()}`
})
const friendShareTarget = computed(() => {
  const params = new URLSearchParams({ robot_appid: cur.appid })
  return `https://qun.qq.com/qunpro/robot/share?${params.toString()}`
})
const groupShareTarget = computed(() => {
  const params = new URLSearchParams({ robot_appid: cur.appid, robot_uin: cur.uin })
  return `https://qun.qq.com/qunpro/robot/qunshare?${params.toString()}`
})
const channelShareTarget = computed(() => {
  const params = new URLSearchParams({ robot_appid: cur.appid })
  return `https://qun.qq.com/qunpro/robot/share?${params.toString()}`
})

function openBot(b) {
  Object.assign(cur, b)
  view.value = 'manage'
  activeSec.value = 'account-info'
  activeSub.value = ''
  loadSection()
}
function backToList() { view.value = 'list' }

function selectSec(k) {
  activeSec.value = k
  activeSub.value = ''
  loadSection()
}

async function loadSection() {
  const k = activeSec.value
  if (k === 'account-info') await loadAccount()
  else if (k === 'usage-scope') await loadScope()
  else if (k === 'data') await loadAllReports()
  else if (k === 'dev-settings') await loadDevSettings()
  else if (k === 'advanced') resetAdvancedPayload()
}

async function loadAccount() {
  detailLoading.value = true
  try {
    const r = await v2('/cgi-bin/v2/info/query', {
      bot_appid: Number(cur.appid),
      filter: { base_info: 1, private_proto: 1, developer_info: 1, online_state: 1 },
    })
    const bi = r.base_info || {}
    baseInfo.name = bi.bot_name || cur.name
    baseInfo.desc = bi.bot_desc || ''
    baseInfo.avatar = bi.bot_avatar || ''
    baseInfo.uin = bi.bot_uin ? String(bi.bot_uin) : ''
    cur.name = baseInfo.name
    cur.avatar = baseInfo.avatar
    cur.uin = baseInfo.uin
    cur.online = bi.online_state?.online_state === 1
    cur.status = bi.bot_status ?? cur.status
    cur.revoking = cur.status === 2
    cur.desc = baseInfo.desc
    const di = r.developer_info || {}
    developerInfo.developerId = di.developer_id || status.developerId
    developerInfo.subjectName = status.subjectName
    developerInfo.subjectType = di.subject_type ?? status.subjectType
    const pp = r.private_proto || {}
    privateProto.status = pp.status ?? 0
    privateProto.url = pp.private_proto_url || ''
    privateProto.effectiveDate = pp.effective_date || ''
    privateProto.email = pp.private_proto_template?.email || ''
  } catch (e) { pushToast(e.message) }
  detailLoading.value = false
}

function openBotEditor(field) {
  editor.field = field
  editor.value = field === 'name' ? baseInfo.name : baseInfo.desc
  editor.visible = true
}

async function submitBotEditor() {
  const field = editor.field
  const value = editor.value.trim()
  if (field === 'name' && !value) {
    pushToast('昵称不能为空')
    return
  }
  editor.loading = true
  try {
    await v2('/cgi-bin/v2/info/modify', {
      bot_appid: Number(cur.appid),
      filter: { name: field === 'name' ? 1 : 0, avatar: 0, desc: field === 'desc' ? 1 : 0 },
      name: field === 'name' ? value : '',
      avatar_id: '',
      desc: field === 'desc' ? value : '',
    })
    if (field === 'name') {
      baseInfo.name = value
      cur.name = value
    } else {
      baseInfo.desc = value
      cur.desc = value
    }
    editor.visible = false
    pushToast(field === 'name' ? '昵称已更新' : '简介已更新')
  } catch (e) { pushToast(e.message) }
  editor.loading = false
}

async function openAvatarEditor() {
  clearCustomAvatar()
  showAvatarPicker.value = true
  if (!officialAvatars.value.length) await loadOfficialAvatars()
  selectedAvatarId.value = officialAvatars.value.find(item => item.url === baseInfo.avatar)?.id
    || officialAvatars.value[0]?.id
    || ''
}

function clearCustomAvatar() {
  if (customAvatarUrl.value) URL.revokeObjectURL(customAvatarUrl.value)
  customAvatarFile.value = null
  customAvatarUrl.value = ''
}

function closeAvatarEditor() {
  showAvatarPicker.value = false
  clearCustomAvatar()
}

function selectOfficialAvatar(avatar) {
  clearCustomAvatar()
  selectedAvatarId.value = avatar.id
}

function clampCropOffset() {
  const scale = cropper.baseScale * cropper.zoom
  const maxX = Math.max((cropper.naturalWidth * scale - CROP_VIEW_SIZE) / 2, 0)
  const maxY = Math.max((cropper.naturalHeight * scale - CROP_VIEW_SIZE) / 2, 0)
  cropper.offsetX = Math.min(Math.max(cropper.offsetX, -maxX), maxX)
  cropper.offsetY = Math.min(Math.max(cropper.offsetY, -maxY), maxY)
}

function closeCropper() {
  cropper.visible = false
  cropImage = null
  if (cropper.source) URL.revokeObjectURL(cropper.source)
  cropper.source = ''
}

function resetCropper() {
  cropper.zoom = 1
  cropper.offsetX = 0
  cropper.offsetY = 0
}

function openCropper(file) {
  closeCropper()
  const source = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => {
    cropImage = image
    cropper.source = source
    cropper.fileName = file.name || 'avatar.png'
    cropper.fileType = file.type || 'image/png'
    cropper.naturalWidth = image.naturalWidth
    cropper.naturalHeight = image.naturalHeight
    cropper.baseScale = Math.max(CROP_VIEW_SIZE / image.naturalWidth, CROP_VIEW_SIZE / image.naturalHeight)
    resetCropper()
    cropper.visible = true
  }
  image.onerror = () => {
    URL.revokeObjectURL(source)
    pushToast('图片读取失败')
  }
  image.src = source
}

function startCropDrag(event) {
  if (!cropImage) return
  event.preventDefault()
  const startX = event.clientX
  const startY = event.clientY
  const originX = cropper.offsetX
  const originY = cropper.offsetY
  const move = moveEvent => {
    cropper.offsetX = originX + moveEvent.clientX - startX
    cropper.offsetY = originY + moveEvent.clientY - startY
    clampCropOffset()
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}

function confirmCropper() {
  if (!cropImage) return
  const scale = cropper.baseScale * cropper.zoom
  const width = cropper.naturalWidth * scale
  const height = cropper.naturalHeight * scale
  const left = (CROP_VIEW_SIZE - width) / 2 + cropper.offsetX
  const top = (CROP_VIEW_SIZE - height) / 2 + cropper.offsetY
  const sourceX = -left / scale
  const sourceY = -top / scale
  const sourceSize = CROP_VIEW_SIZE / scale
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) {
    pushToast('头像处理失败')
    return
  }
  context.drawImage(cropImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 512, 512)
  canvas.toBlob(blob => {
    if (!blob) {
      pushToast('头像处理失败')
      return
    }
    const cropped = new File([blob], 'avatar.png', { type: 'image/png' })
    clearCustomAvatar()
    customAvatarFile.value = cropped
    customAvatarUrl.value = URL.createObjectURL(cropped)
    selectedAvatarId.value = ''
    closeCropper()
  }, 'image/png', .92)
}

function selectCustomAvatar(event) {
  const input = event.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    pushToast('请选择图片文件')
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    pushToast('图片需小于 2MB')
    return
  }
  openCropper(file)
}

async function submitAvatar() {
  if (!selectedAvatarId.value && !customAvatarFile.value) return
  avatarSaving.value = true
  try {
    let avatarId = selectedAvatarId.value
    if (customAvatarFile.value) {
      const form = new FormData()
      form.append('user_id', UID)
      form.append('bot_appid', cur.appid)
      form.append('file', customAvatarFile.value)
      const response = await axios.post('/api/openapi/v2/upload-avatar', form)
      if (response.data?.success === false || !response.data?.upload_id) {
        throw new Error(response.data?.message || '头像上传失败')
      }
      avatarId = response.data.upload_id
    }
    await v2('/cgi-bin/v2/info/modify', {
      bot_appid: Number(cur.appid),
      filter: { name: 0, avatar: 1, desc: 0 },
      name: '',
      avatar_id: avatarId,
      desc: '',
    })
    closeAvatarEditor()
    await loadAccount()
    pushToast('头像已更新')
  } catch (e) { pushToast(e.message) }
  avatarSaving.value = false
}

function openPrivateProtocol() {
  privacyDialog.email = privateProto.email || status.subjectEmail
  privacyDialog.editing = privateProto.status !== 0
  privacyDialog.visible = true
}

async function updatePrivateProtocol() {
  const email = privacyDialog.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    pushToast('请输入有效邮箱')
    return
  }
  privacyDialog.loading = true
  try {
    await v2('/cgi-bin/v2/info/private_proto/modify', {
      bot_appid: Number(cur.appid),
      contact_email: email,
    })
    privateProto.email = email
    privacyDialog.visible = false
    pushToast('隐私协议已提交')
    await loadAccount()
  } catch (e) { pushToast(e.message) }
  privacyDialog.loading = false
}

async function openRevokeDialog() {
  revokeDialog.input = ''
  revokeDialog.loading = true
  revokeDialog.visible = true
  try {
    const check = await v2('/cgi-bin/v2/info/delete', {
      op: 3,
      bot_appid: Number(cur.appid),
    })
    revokeDialog.quick = !!(check.is_quick_delete ?? check.data?.is_quick_delete)
  } catch (e) {
    revokeDialog.visible = false
    pushToast(e.message)
  }
  revokeDialog.loading = false
}

async function revokeCurrentBot() {
  if (revokeDialog.input.trim() !== cur.appid) return
  revokeDialog.loading = true
  try {
    await v2('/cgi-bin/v2/info/delete', {
      op: 1,
      bot_appid: Number(cur.appid),
      ...(revokeDialog.quick ? { is_quick_delete: true } : {}),
    })
    revokeDialog.visible = false
    pushToast('已提交注销')
    backToList()
    await loadBots()
  } catch (e) { pushToast(e.message) }
  revokeDialog.loading = false
}

async function recoverBot(bot) {
  try {
    await v2('/cgi-bin/v2/info/delete', { op: 2, bot_appid: Number(bot.appid) })
    pushToast('已撤回注销')
    await loadBots()
  } catch (e) { pushToast(e.message) }
}

function formatDeleteDate(value) {
  if (!value) return ''
  const date = new Date(value < 1e12 ? value * 1000 : value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

/* ── 服务范围 ── */
const scope = reactive({
  allowFriend: false,
  allowGroup: false,
  allowChannel: false,
  friendRange: 'all',
  friendInfos: [],
  loaded: false,
})
const authExpanded = ref(false)
async function loadScope() {
  detailLoading.value = true
  try {
    const r = await v2('/cgi-bin/v2/bot_scope_manager/scope_cfg/query', {
      bot_appid: Number(cur.appid),
      query_filter: { scope_config: 1, white_list: 1, search_config: 1 },
    })
    const f = r.friend_scope_config || {}
    const g = r.group_scope_config || {}
    const c = r.channel_scope_config || {}
    scope.allowFriend = (f.allow_others_add_friend || 0) === 2
    scope.friendRange = (f.friend_add_scope || 0) === 2 ? 'all' : 'friend'
    scope.allowGroup = (g.allow_be_added_to_group || 0) === 2
    scope.allowChannel = (c.allow_be_added_to_channel || 0) === 2
    scope.friendInfos = (r.friend_infos || []).map(item => ({
      uin: item.uin === undefined ? '' : String(item.uin),
      name: decodeNickname(item.nick_name),
    }))
    scope.loaded = true
  } catch (e) { pushToast(e.message) }
  detailLoading.value = false
}
async function toggleScope(which) {
  if (!isCertified.value) {
    pushToast('当前主体未认证，无法开启公开服务范围')
    return
  }
  const payload = { bot_appid: Number(cur.appid), set_scope_filter: { set_friend_scope: 0, set_group_scope: 0, set_channel_scope: 0 } }
  if (which === 'friend') {
    payload.set_scope_filter.set_friend_scope = 1
    payload.friend_scope_config = {
      allow_others_add_friend: scope.allowFriend ? 1 : 2,
      friend_add_scope: scope.friendRange === 'all' ? 2 : 1,
    }
  } else if (which === 'group') {
    payload.set_scope_filter.set_group_scope = 1
    payload.group_scope_config = { allow_be_added_to_group: scope.allowGroup ? 1 : 2 }
  } else {
    payload.set_scope_filter.set_channel_scope = 1
    payload.channel_scope_config = { allow_be_added_to_channel: scope.allowChannel ? 1 : 2 }
  }
  try {
    await v2('/cgi-bin/v2/bot_scope_manager/usage_scope/modify', payload)
    if (which === 'friend') scope.allowFriend = !scope.allowFriend
    else if (which === 'group') scope.allowGroup = !scope.allowGroup
    else scope.allowChannel = !scope.allowChannel
    pushToast('操作成功')
  } catch (e) { pushToast(e.message) }
}

function decodeNickname(value) {
  if (!value) return ''
  try {
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch (e) {
    return value
  }
}

async function addDeveloperTester() {
  const uin = testerInput.value.trim()
  if (!/^\d{5,11}$/.test(uin)) {
    pushToast('QQ 号需为 5~11 位纯数字')
    return
  }
  try {
    await v2('/cgi-bin/v2/bot_scope_manager/white_list/modify', {
      bot_appid: Number(cur.appid),
      whitelist_filter: { set_friend_whitelist: 1 },
      friend_whitelist: { white_ids: [Number(uin)] },
    })
    showAddTester.value = false
    testerInput.value = ''
    pushToast('已添加用户')
    await loadScope()
  } catch (e) { pushToast(e.message) }
}

async function removeDeveloperTester(uin) {
  if (!confirm(`确认移除用户 ${uin}？`)) return
  try {
    await v2('/cgi-bin/v2/bot_scope_manager/white_list/modify', {
      bot_appid: Number(cur.appid),
      whitelist_filter: { set_friend_whitelist: 2 },
      friend_whitelist: { white_ids: [Number(uin)] },
    })
    pushToast('已删除用户')
    await loadScope()
  } catch (e) { pushToast(e.message) }
}

/* ── 运营数据 ── */
const DATA_TYPES = [
  { key: 'friend', title: '单聊数据', type: 3 },
  { key: 'group', title: '群数据', type: 2 },
  { key: 'guild', title: '频道数据', type: 0 },
  { key: 'msg', title: '消息数据', type: 1 },
]
const RANGES = [{ v: 0, label: '最近7天' }, { v: 1, label: '最近14天' }, { v: 2, label: '最近30天' }]
const reports = reactive({})
const reportChartMode = ref(false)
const REPORT_PAGE_SIZE = 10
DATA_TYPES.forEach(d => (reports[d.key] = { range: 0, sceneId: 1, page: 1, rows: [], loading: false, version: 0 }))

const REPORT_COLS = {
  friend: [
    { key: 'date', label: '时间' }, { key: 'stock', label: '存量添加用户数' },
    { key: 'active', label: '使用用户数' }, { key: 'newAdd', label: '新添加用户数' }, { key: 'newRemove', label: '新移除用户数' },
  ],
  guild: [
    { key: 'date', label: '时间' }, { key: 'stock', label: '存在频道数' },
    { key: 'active', label: '使用频道数' }, { key: 'newAdd', label: '新增频道数' }, { key: 'newRemove', label: '减少频道数' },
  ],
  group: [
    { key: 'date', label: '时间' }, { key: 'stock', label: '存在群数' },
    { key: 'active', label: '使用群数' }, { key: 'newAdd', label: '新添加群数' }, { key: 'newRemove', label: '新移除群数' },
  ],
  msg: [
    { key: 'date', label: '时间' }, { key: 'scene', label: '场景' }, { key: 'upMsgCnt', label: '上行消息量' },
    { key: 'upMsgUv', label: '上行消息人数' }, { key: 'downMsgCnt', label: '下行消息量' },
    { key: 'botMsgCnt', label: '总消息量' }, { key: 'nextDayRetention', label: '对话用户次日留存' },
  ],
}
function fmtDate(s) { const t = String(s); return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : t }
function mapRows(key, data) {
  if (key === 'friend') return (data.friend_data || []).map(i => ({
    date: fmtDate(i.report_date ?? i.reportDate),
    stock: i.stock_added_friends ?? i.stockAddedFriends ?? 0,
    active: i.used_friends ?? i.usedFriends ?? 0,
    newAdd: i.new_added_friends ?? i.newAddedFriends ?? 0,
    newRemove: i.new_removed_friends ?? i.newRemovedFriends ?? 0,
  }))
  if (key === 'guild') return (data.guild_data || []).map(i => ({
    date: fmtDate(i.report_date ?? i.reportDate),
    stock: i.in_guild_cnt ?? i.inGuildCnt ?? 0,
    active: i.used_guild_cnt ?? i.usedGuildCnt ?? 0,
    newAdd: i.add_guild_cnt ?? i.addGuildCnt ?? 0,
    newRemove: i.removed_guild_cnt ?? i.removedGuildCnt ?? 0,
  }))
  if (key === 'group') return (data.group_data || []).map(i => ({
    date: fmtDate(i.report_date ?? i.reportDate),
    stock: i.existing_groups ?? i.existingGroups ?? 0,
    active: i.used_groups ?? i.usedGroups ?? 0,
    newAdd: i.added_groups ?? i.addedGroups ?? 0,
    newRemove: i.removed_groups ?? i.removedGroups ?? 0,
  }))
  return (data.msg_data || []).map(i => ({
    date: fmtDate(i.report_date ?? i.reportDate),
    scene: i.scene_name ?? i.sceneName ?? '',
    upMsgCnt: i.up_msg_cnt ?? i.upMsgCnt ?? 0,
    upMsgUv: i.up_msg_uv ?? i.upMsgUv ?? 0,
    downMsgCnt: i.down_msg_cnt ?? i.downMsgCnt ?? 0,
    botMsgCnt: i.bot_msg_cnt ?? i.botMsgCnt ?? 0,
    nextDayRetention: `${i.next_day_retention ?? i.nextDayRetention ?? 0}%`,
  }))
}
async function loadReport(d) {
  const st = reports[d.key]
  st.loading = true
  try {
    const r = await v2('/cgi-bin/v2/datareport/query', { bot_appid: Number(cur.appid), data_range: st.range, data_type: d.type, scene_id: st.sceneId })
    st.rows = mapRows(d.key, r.data && typeof r.data === 'object' ? r.data : r)
    st.page = 1
    st.version++
  } catch (e) { pushToast(e.message) }
  st.loading = false
}
async function loadAllReports() { await Promise.all(DATA_TYPES.map(loadReport)) }
function changeRange(d, v) { reports[d.key].range = v; loadReport(d) }
function changeScene(d, v) { reports[d.key].sceneId = v; loadReport(d) }
function reportPageCount(key) { return Math.max(1, Math.ceil(reports[key].rows.length / REPORT_PAGE_SIZE)) }
function reportPageRows(key) {
  const start = (reports[key].page - 1) * REPORT_PAGE_SIZE
  return reports[key].rows.slice(start, start + REPORT_PAGE_SIZE)
}
async function downloadReport(d) {
  try {
    const resp = await axios.post('/api/openapi/v2/proxy', {
      user_id: UID, method: 'GET', path: '/cgi-bin/v2/datareport/export',
      params: { bot_appid: Number(cur.appid), data_type: d.type, data_range: reports[d.key].range, scene_id: reports[d.key].sceneId },
    }, { responseType: 'blob' })
    let blob = resp.data
    if ((resp.headers['content-type'] || blob.type || '').includes('application/json')) {
      const result = JSON.parse(await blob.text())
      if (result.retcode !== 0 || typeof result.data !== 'string') {
        throw new Error(result.msg || '下载失败')
      }
      const content = result.data.startsWith('\uFEFF') ? result.data : `\uFEFF${result.data}`
      blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${d.title}.csv`; a.click()
    URL.revokeObjectURL(url)
  } catch (e) { pushToast('下载失败') }
}

/* ── 开发设置 ── */
const dev = reactive({
  appid: '',
  secret: '****************',
  secretShown: false,
  mode: 'WebSocket',
  webhook: '',
  ips: [],
  events: [],
  loaded: false,
})
const connectionDraft = reactive({
  mode: 'WebSocket',
  webhook: '',
  saving: false,
})
const showAddTester = ref(false)
const testerInput = ref('')
const secretResetDialog = ref(false)

async function loadDevSettings() {
  detailLoading.value = true
  dev.appid = cur.appid
  try {
    const r = await v2('/cgi-bin/v2/bot_dev_setting/query', { bot_appid: Number(cur.appid), filter: { ip_whitelist_info: 1, connect_info: 1 } })
    const s = r.data && typeof r.data === 'object' ? r.data : r
    dev.ips = (s.ip_whitelist_info && s.ip_whitelist_info.ip_addresses) || []
    const ci = s.connect_info || {}
    dev.mode = (ci.mode || 0) === 1 ? 'WebSocket' : 'Webhook'
    dev.webhook = ci.webhook_url || ''
    connectionDraft.mode = dev.mode
    connectionDraft.webhook = dev.webhook
    const eventResult = await v2('/cgi-bin/v2/event_subscirption/list', {
      bot_appid: Number(cur.appid),
    })
    const eventData = eventResult.data && typeof eventResult.data === 'object'
      ? eventResult.data
      : eventResult
    dev.events = (eventData.events || []).map(event => ({
      id: event.id || '',
      name: event.name || '',
      description: event.description || '',
      type: event.type || '其他',
      selected: !!event.is_subscribed,
      weight: event.weight || 0,
    })).sort((a, b) => a.weight - b.weight)
    const whitelistResult = await v2('/cgi-bin/v2/bot_scope_manager/scope_cfg/query', {
      bot_appid: Number(cur.appid),
      query_filter: { scope_config: 0, white_list: 1, search_config: 0 },
    })
    scope.friendInfos = (whitelistResult.friend_infos || []).map(item => ({
      uin: item.uin === undefined ? '' : String(item.uin),
      name: decodeNickname(item.nick_name),
    }))
    dev.loaded = true
  } catch (e) { pushToast(e.message) }
  detailLoading.value = false
}
const ipInput = ref('')
const showAddIp = ref(false)
async function addIp() {
  const ip = ipInput.value.trim()
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split('.').some(v => Number(v) > 255)) {
    pushToast('请输入有效 IPv4 地址')
    return
  }
  if (dev.ips.includes(ip)) {
    pushToast('该 IP 已存在')
    return
  }
  try {
    await v2('/cgi-bin/v2/bot_dev_setting/ip_whitelist/modify', {
      bot_appid: Number(cur.appid),
      action: 1,
      ip_addresses: [ip],
    })
    dev.ips.push(ip)
    ipInput.value = ''
    showAddIp.value = false
    pushToast('添加成功')
  } catch (e) { pushToast(e.message) }
}
async function removeIp(ip) {
  try {
    await v2('/cgi-bin/v2/bot_dev_setting/ip_whitelist/modify', {
      bot_appid: Number(cur.appid),
      action: 2,
      ip_addresses: [ip],
    })
    dev.ips = dev.ips.filter(i => i !== ip)
    pushToast('删除成功')
  } catch (e) { pushToast(e.message) }
}

function openConnectionSettings() {
  connectionDraft.mode = dev.mode
  connectionDraft.webhook = dev.webhook
  activeSub.value = 'event-callback'
}

async function saveConnection() {
  if (connectionDraft.mode === 'Webhook') {
    if (!connectionDraft.webhook.trim().startsWith('https://')) {
      pushToast('回调地址必须以 https:// 开头')
      return
    }
    connectionDraft.saving = true
    try {
      await v2('/cgi-bin/v2/bot_dev_setting/connect_info/modify', {
        bot_appid: Number(cur.appid),
        action: 1,
        webhook_url: connectionDraft.webhook.trim(),
      })
      dev.webhook = connectionDraft.webhook.trim()
      dev.mode = 'Webhook'
      pushToast('已切换为 Webhook')
    } catch (e) { pushToast(e.message) }
    connectionDraft.saving = false
    return
  }
  connectionDraft.saving = true
  try {
    await v2('/cgi-bin/v2/bot_dev_setting/connect_info/modify', {
      bot_appid: Number(cur.appid),
      action: 3,
    })
    dev.mode = 'WebSocket'
    pushToast('已切换为 WebSocket')
  } catch (e) { pushToast(e.message) }
  connectionDraft.saving = false
}

async function saveEvents() {
  try {
    await v2('/cgi-bin/v2/event_subscirption/modify', {
      bot_appid: Number(cur.appid),
      event_ids: dev.events.filter(event => event.selected).map(event => event.id),
    })
    pushToast(`接收事件配置已保存（共 ${dev.events.filter(event => event.selected).length} 个）`)
  } catch (e) { pushToast(e.message) }
}
const eventGroups = computed(() => {
  const groups = new Map()
  dev.events.forEach(event => {
    if (!groups.has(event.type)) groups.set(event.type, [])
    groups.get(event.type).push(event)
  })
  return Array.from(groups, ([name, items]) => ({ name, items }))
})
const selectedEventCount = computed(() => dev.events.filter(event => event.selected).length)
function selectAllEvents(selected) {
  dev.events.forEach(event => { event.selected = selected })
}

/* ── 高级功能 ── */
const REAL_ADVANCED_APIS = [
  {
    key: 'pc2-status',
    name: 'PC2 灰度状态',
    description: '只读检测当前主体是否命中新版 PC2 面板灰度。',
    method: 'POST',
    path: '/cgi-bin/v2/info/hit',
    payload: () => ({ t: 1 }),
  },
  {
    key: 'developer-list',
    name: '关联主体列表',
    description: '读取当前 QQ 账号可切换的全部开发者主体。',
    method: 'GET',
    path: '/api/v3/login/bopen/developer_list',
    payload: () => ({}),
  },
  {
    key: 'developer-profile',
    name: '当前主体详情',
    description: '读取当前主体、登录用户和主体权限信息。',
    method: 'POST',
    path: '/bopen/v2/get_audit_developer_info',
    payload: () => ({}),
  },
  {
    key: 'bot-profile',
    name: '机器人完整信息',
    description: '读取基础信息、隐私协议、开发者信息和在线状态。',
    method: 'POST',
    path: '/cgi-bin/v2/info/query',
    payload: () => ({
      bot_appid: Number(cur.appid),
      filter: { base_info: 1, private_proto: 1, developer_info: 1, online_state: 1 },
    }),
  },
  {
    key: 'developer-settings',
    name: '开发接入配置',
    description: '读取 IP 白名单和 WebSocket/Webhook 接入方式。',
    method: 'POST',
    path: '/cgi-bin/v2/bot_dev_setting/query',
    payload: () => ({
      bot_appid: Number(cur.appid),
      filter: { ip_whitelist_info: 1, connect_info: 1 },
    }),
  },
  {
    key: 'event-list',
    name: '事件订阅列表',
    description: '读取机器人支持的事件及当前订阅状态。',
    method: 'POST',
    path: '/cgi-bin/v2/event_subscirption/list',
    payload: () => ({ bot_appid: Number(cur.appid) }),
  },
  {
    key: 'scope-config',
    name: '服务范围原始配置',
    description: '读取好友、群聊、频道、白名单和搜索配置。',
    method: 'POST',
    path: '/cgi-bin/v2/bot_scope_manager/scope_cfg/query',
    payload: () => ({
      bot_appid: Number(cur.appid),
      query_filter: { scope_config: 1, white_list: 1, search_config: 1 },
    }),
  },
  {
    key: 'data-report',
    name: '运营数据原始响应',
    description: '读取最近一天的全部场景消息数据。',
    method: 'POST',
    path: '/cgi-bin/v2/datareport/query',
    payload: () => ({
      bot_appid: Number(cur.appid),
      data_range: 1,
      data_type: 1,
      scene_id: 1,
    }),
  },
  {
    key: 'official-avatars',
    name: '官方头像资源',
    description: '读取平台当前提供的官方机器人头像列表。',
    method: 'POST',
    path: '/cgi-bin/v2/info/official/query',
    payload: () => ({}),
  },
].map(api => ({ ...api, source: 'real' }))
const ADVANCED_APIS = [...REAL_ADVANCED_APIS, ...ADVANCED_MOCK_APIS]
const advanced = reactive({
  key: ADVANCED_APIS[0].key,
  payload: JSON.stringify(ADVANCED_APIS[0].payload(), null, 2),
  result: '',
  loading: false,
  error: '',
  lastRun: '',
})
const advancedApi = computed(() => ADVANCED_APIS.find(item => item.key === advanced.key) || ADVANCED_APIS[0])

function advancedMockContext() {
  return {
    accountId: status.developerId,
    botId: cur.appid,
    bot: { ...cur },
    bots: bots.value.map(bot => ({ ...bot })),
  }
}

function resetAdvancedPayload() {
  advanced.payload = JSON.stringify(advancedApi.value.payload(advancedMockContext()), null, 2)
  advanced.result = ''
  advanced.error = ''
  advanced.lastRun = ''
}

async function runAdvancedApi() {
  if (advanced.loading) return
  let payload
  try {
    payload = JSON.parse(advanced.payload || '{}')
  } catch (e) {
    advanced.error = '请求参数不是有效的 JSON'
    return
  }
  advanced.loading = true
  advanced.error = ''
  try {
    const result = advancedApi.value.source === 'mock'
      ? await runAdvancedMock(advancedApi.value.rpc, payload, advancedMockContext())
      : await v2(advancedApi.value.path, payload, advancedApi.value.method)
    if (advancedApi.value.key === 'pc2-status') applyPc2Result(result)
    advanced.result = JSON.stringify(result, null, 2)
    advanced.lastRun = new Date().toLocaleString('zh-CN', { hour12: false })
  } catch (e) {
    advanced.result = ''
    advanced.error = e.message || '接口调用失败'
  }
  advanced.loading = false
}

async function copyAdvancedResult() {
  if (!advanced.result) return
  await copyText(advanced.result)
}

async function resetSecret() {
  try {
    const r = await v2('/cgi-bin/v2/bot_dev_setting/secret/reset', { bot_appid: Number(cur.appid) })
    dev.secret = r.secret || r.app_secret || '重置成功, 请在弹窗查看'
    dev.secretShown = true
    secretResetDialog.value = false
    pushToast('AppSecret 已重置')
  } catch (e) { pushToast(e.message) }
}

/* ── 创建机器人 ── */
const showCreate = ref(false)
const createLoading = ref(false)
const officialAvatars = ref([])
const createDraft = reactive({ name: '', desc: '', avatarId: '' })

async function loadOfficialAvatars() {
  if (officialAvatars.value.length) return
  try {
    const r = await v2('/cgi-bin/v2/info/official/query', {})
    officialAvatars.value = (r.avatars || []).map(item => ({
      id: item.avatar_id || '',
      url: item.avatar_url || '',
    })).filter(item => item.id && item.url)
    createDraft.avatarId ||= officialAvatars.value[0]?.id || ''
  } catch (e) { pushToast(e.message) }
}

async function openCreate() {
  if (isMember.value) {
    pushToast('你不是主体账号的管理员，无法创建机器人')
    return
  }
  if (createRemain.value <= 0) {
    pushToast('当前主体机器人数量已达上限')
    return
  }
  showCreate.value = true
  await loadOfficialAvatars()
}

async function submitCreate() {
  if (!createDraft.name.trim() || !createDraft.avatarId || createLoading.value) return
  createLoading.value = true
  try {
    const result = await v2('/cgi-bin/v2/bot/create', {
      name: createDraft.name.trim(),
      avatar_id: createDraft.avatarId,
      desc: createDraft.desc.trim(),
    })
    const createId = result.create_id || ''
    const interval = Math.max(Number(result.poll_interval_ms || 1000), 500)
    const maxTimes = Math.max(Number(result.poll_max_times || 10), 1)
    let created = false
    for (let i = 0; i < maxTimes; i += 1) {
      await new Promise(resolve => setTimeout(resolve, interval))
      const query = await v2('/cgi-bin/v2/bot/create/query_result', { create_id: createId })
      if (query.ret_code === 3) {
        created = true
        break
      }
      if ([0, 2].includes(query.ret_code)) {
        throw new Error(query.msg || '创建机器人失败')
      }
    }
    if (!created) throw new Error('创建机器人超时，请稍后刷新查看')
    showCreate.value = false
    Object.assign(createDraft, { name: '', desc: '', avatarId: officialAvatars.value[0]?.id || '' })
    pushToast('机器人创建成功')
    await loadBots()
  } catch (e) { pushToast(e.message) }
  createLoading.value = false
}

function copyText(t) {
  if (!t) return
  navigator.clipboard?.writeText(t).then(() => pushToast('已复制')).catch(() => {})
}

onMounted(async () => {
  await loadStatus()
  if (status.ready) loadBots()
})
onUnmounted(() => {
  stopScanPoll()
  closeCropper()
  clearCustomAvatar()
})
defineExpose({ reload: loadStatus })
</script>

<template>
  <div class="qqdash">
    <div class="app-shell">
      <!-- 主区 -->
      <main class="main">
        <!-- 未授权提示 -->
        <div v-if="statusLoaded && !status.ready" class="page">
          <div class="v2-gate">
            <div class="v2-gate-badge">开放平台内测</div>
            <div class="v2-gate-hero">
              <div class="v2-gate-icon"><AppIcon name="robot" :size="34" /></div>
              <div>
                <h2 class="page-title">新版 QQ 机器人管理面板</h2>
                <p class="page-sub">连接 QQ 开放平台账号后，可在 Elaina 中管理机器人、服务范围、运营数据与开发设置。</p>
              </div>
            </div>
            <div class="v2-beta-notice">
              <AppIcon name="info" :size="18" />
              <div>
                <b>“内测”指开放平台邀请部分用户参与新版功能测试</b>
                <span>普通用户暂时无法访问此面板；该说明与机器人测试账号、开发体验号码无关。</span>
              </div>
            </div>
            <div class="v2-login-overview">
              <div class="v2-login-step">
                <span class="v2-login-step-num">1</span>
                <div><b>创建安全会话</b><span>由 Elaina 启动一次性扫码登录流程</span></div>
              </div>
              <div class="v2-login-step">
                <span class="v2-login-step-num">2</span>
                <div><b>使用 QQ 扫码确认</b><span>如有多个主体，可在扫码后选择登录主体</span></div>
              </div>
              <div class="v2-login-step">
                <span class="v2-login-step-num">3</span>
                <div><b>自动完成授权</b><span>登录凭证仅在服务端内部保存，不在页面展示</span></div>
              </div>
            </div>
            <div class="v2-gate-actions">
              <button class="btn primary large" :disabled="scanLoading" @click="startScan">
                <AppIcon name="qr" :size="17" />
                {{ scanLoading ? '正在准备...' : '使用 QQ 扫码登录' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 机器人列表 -->
        <div v-else-if="view === 'list'" class="page page-bots">
          <div class="page-head">
            <div>
              <h1 class="page-title">我的机器人</h1>
              <p class="page-sub">管理开发者账号名下与你关联的 QQ 机器人账号</p>
              <div class="current-subject-card" :data-auth-type="status.subjectType === 2 ? 'enterprise' : status.subjectType === 1 ? 'personal' : 'unverified'">
                <span class="current-subject-mark">{{ developerMark(currentDeveloper) }}</span>
                <span class="current-subject-text">
                  <strong>{{ status.subjectName || '未认证主体' }}</strong>
                  <small>{{ status.subjectEmail || '暂无主体邮箱' }}</small>
                </span>
                <span class="current-subject-tag">{{ subjectTypeText(status.subjectType) }}</span>
              </div>
            </div>
            <div class="page-actions">
              <button class="btn ghost subject-switch-button" type="button" @click="openDeveloperPicker">
                <AppIcon name="group" :size="15" />
                切换主体
              </button>
              <button class="btn primary" :disabled="isMember || createRemain <= 0" @click="openCreate"><AppIcon name="plus" :size="15" /> 创建机器人</button>
            </div>
          </div>
          <div v-if="pc2.checked && pc2.hit === false" class="pc2-warning">
            <AppIcon name="info" :size="17" />
            <div>
              <strong>当前主体未进入 PC2 灰度</strong>
              <span>QQ 官方新版面板可能将该主体跳回应用列表；此提示会在每次登录或切换主体后自动检测。</span>
            </div>
          </div>
          <div v-if="isMember || createRemain <= 0" class="bots-meta">
            {{ isMember ? '你不是主体账号的管理员，无法创建机器人' : '可创建的机器人已达上限' }}
          </div>
          <div v-if="botsLoading" class="empty-hint">加载中...</div>
          <div v-else class="bots-grid">
            <div v-for="b in bots" :key="b.appid" :class="['bot-card', { 'revoke-card': b.revoking }]" @click="openBotCard(b)">
              <div class="bot-head">
                <div class="bot-avatar" :style="{ background: b.avatar ? 'transparent' : b.color }">
                  <img v-if="b.avatar" :src="b.avatar" alt="" />
                  <span v-else>{{ (b.name || 'B').charAt(0) }}</span>
                </div>
                <div class="bot-info">
                  <div class="bot-name-row">
                    <span class="bot-name">{{ b.name }}</span>
                    <span :class="['bot-role-tag', isMember ? 'role-member' : 'role-admin']">
                      <AppIcon :name="isMember ? 'group' : 'safe'" :size="12" class="role-icon" />
                      <span class="role-text">{{ isMember ? '成员' : '管理员' }}</span>
                    </span>
                  </div>
                  <div class="bot-status">
                    <span class="status-dot" :class="{ offline: !b.online && !b.revoking && b.status !== 4, revoking: b.revoking || b.status === 4 }"></span>
                    <span :class="{ dangerText: b.revoking || b.status === 4 }">{{ botStatusText(b) }}</span>
                  </div>
                </div>
                <span v-if="!b.revoking && b.status !== 4 && !isMember" class="bot-action"><AppIcon name="chevron" :size="18" /></span>
              </div>
              <div v-if="b.revoking" class="bot-card-foot">
                <span>将于 <b>{{ formatDeleteDate(b.finalDeleteTime) }}</b> 永久删除</span>
                <button v-if="!isMember" class="btn ghost sm" @click.stop="recoverBot(b)">撤回注销</button>
              </div>
            </div>
            <div v-if="!bots.length" class="empty-state">
              <figure class="empty-hero-art">
                <img class="empty-hero-img" src="https://qq-ai.cdn-go.cn/web/neon/-/11f457fa/q.qq.com_qqbot_dashboard/assets/empty-hero-shot.png" alt="QQ 机器人形象" draggable="false" />
              </figure>
              <div class="empty-copy">
                <h2 class="empty-title">创建你的 QQ 机器人</h2>
                <p class="empty-desc">个性化创建，灵活使用管理</p>
              </div>
              <figure class="empty-feature-art">
                <img class="empty-feature-img" src="https://qq-ai.cdn-go.cn/web/neon/-/11f457fa/q.qq.com_qqbot_dashboard/assets/empty-intro-cards-shot.png" alt="机器人能力介绍" draggable="false" />
              </figure>
            </div>
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
                <button v-if="cur.appid && cur.uin" class="connect-profile-qr-trigger bot-manage-qr-trigger" type="button" aria-label="查看添加机器人二维码">
                  <AppIcon name="qr" :size="15" />
                  <span class="connect-profile-qr-pop">
                    <span class="create-friend-qr-img"><QrCodeImage :target="botShareTarget" /></span>
                    <span class="connect-profile-qr-tip">使用 QQ 扫一扫添加机器人</span>
                  </span>
                </button>
                <div class="manage-status-pill" :data-state="cur.revoking ? 'revoking' : cur.status === 4 ? 'banned' : cur.online ? 'online' : 'offline'">
                  <span class="manage-status-dot"></span>
                  <span>{{ botStatusText(cur) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="manage-layout">
            <nav class="manage-nav">
              <button v-for="s in SECS" :key="s.key" type="button" class="mn-item" :class="{ active: activeSec === s.key }" @click="selectSec(s.key)">{{ s.label }}</button>
            </nav>
            <div class="manage-body">
              <div v-if="detailLoading" class="empty-hint">加载中...</div>

              <!-- 账号信息 -->
              <template v-else-if="activeSec === 'account-info'">
                <div class="sec-group">
                  <div class="sec-group-title">基本信息</div>
                  <div class="row editable-row" @click="openAvatarEditor">
                    <div class="row-main"><div class="row-label">头像</div></div>
                    <div class="row-value">
                      <div class="row-avatar" :style="{ background: baseInfo.avatar ? 'transparent' : cur.color }">
                        <img v-if="baseInfo.avatar" :src="baseInfo.avatar" alt="" /><span v-else>{{ (baseInfo.name || 'B').charAt(0) }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="row editable-row" @click="openBotEditor('name')">
                    <div class="row-main"><div class="row-label">昵称</div></div>
                    <div class="row-value">{{ baseInfo.name }} <AppIcon name="chevron" :size="15" /></div>
                  </div>
                  <div class="row editable-row" @click="openBotEditor('desc')">
                    <div class="row-main"><div class="row-label">简介</div></div>
                    <div class="row-value" :class="{ 'is-placeholder': !baseInfo.desc }">{{ baseInfo.desc || '点击设置机器人简介' }} <AppIcon name="chevron" :size="15" /></div>
                  </div>
                </div>
                <div class="danger-actions-grid">
                  <button class="danger-action remove" type="button" @click="openRevokeDialog">注销机器人</button>
                </div>
              </template>

              <!-- 服务范围 -->
              <template v-else-if="activeSec === 'usage-scope'">
                <div class="sec-group">
                  <div class="row static">
                    <div class="row-main">
                      <div class="row-label">主体认证状态</div>
                      <div v-if="certificationDescription" class="row-sub">{{ certificationDescription }}</div>
                    </div>
                    <div class="row-value ok">{{ developerInfo.subjectType === 1 ? '已认证（个人）' : developerInfo.subjectType === 2 ? '已认证（企业）' : '未认证' }}</div>
                  </div>
                  <div class="row static">
                    <div class="row-main"><div class="row-label">认证主体</div></div>
                    <div class="row-value">{{ developerInfo.subjectName || '未认证' }}{{ developerInfo.subjectType === 1 ? '（个人开发者）' : '' }}</div>
                  </div>
                  <div class="sec-group-title auth-title">
                    <span></span>
                    <span class="auth-intro-trigger" @click="authExpanded = !authExpanded">
                      <span class="auth-intro-trigger-text">查看不同认证状态下的使用说明</span>
                      <AppIcon name="chevron" :size="14" :style="{ transform: authExpanded ? 'rotate(90deg)' : '' }" />
                    </span>
                  </div>
                  <div v-if="authExpanded" class="auth-intro-body">
                    <p>对于不同账号认证状态下，服务范围的限制如下，详细可查看 <a href="https://bot.q.qq.com/wiki/develop/api-v2/" target="_blank" rel="noopener noreferrer">开发者文档</a> 说明。</p>
                    <ul>
                      <li><b>未认证</b>：机器人仅管理员使用，可添加到管理员作为群主的群内。</li>
                      <li><b>个人认证</b>：可设置为公开使用，机器人进群数量添加上限为 500 个。</li>
                      <li><b>企业认证</b>：所有场景均可设置为公开被使用的服务范围。</li>
                    </ul>
                    <p>备注：历史通过旧版开放平台审核上架的机器人不受群上限数量影响。</p>
                  </div>
                </div>
                <div class="sec-group scope-card">
                  <div class="sec-group-title friend-title">
                    <span>好友（私聊）</span>
                    <button v-if="isCertified" class="connect-profile-qr-trigger friend-qr-trigger" type="button" aria-label="查看添加好友二维码">
                      <AppIcon name="qr" :size="14" />
                      <span class="connect-profile-qr-pop">
                        <span class="create-friend-qr-img"><QrCodeImage :target="friendShareTarget" /></span>
                        <span class="connect-profile-qr-tip">使用 QQ 扫一扫添加好友</span>
                      </span>
                    </button>
                  </div>
                  <div :class="['row', 'static', { 'scope-row-disabled': !isCertified }]">
                    <div class="row-main">
                      <div class="row-label">允许被其他 QQ 用户添加使用</div>
                      <div class="row-sub">关闭后，仅机器人账号管理员或开发体验成员可添加机器人为好友</div>
                    </div>
                    <div class="switch" :class="{ on: scope.allowFriend, 'is-disabled': !isCertified }" @click="toggleScope('friend')"></div>
                  </div>
                </div>
                <div class="sec-group scope-card">
                  <div class="sec-group-title group-title">
                    <span>群聊</span>
                    <button v-if="isCertified" class="connect-profile-qr-trigger group-qr-trigger" type="button" aria-label="查看添加到群聊二维码">
                      <AppIcon name="qr" :size="14" />
                      <span class="connect-profile-qr-pop">
                        <span class="create-friend-qr-img"><QrCodeImage :target="groupShareTarget" /></span>
                        <span class="connect-profile-qr-tip">使用 QQ 扫一扫添加到群聊</span>
                      </span>
                    </button>
                  </div>
                  <div :class="['row', 'static', { 'scope-row-disabled': !isCertified }]">
                    <div class="row-main">
                      <div class="row-label">允许机器人被添加到任意群聊使用（提供公开服务）</div>
                      <div class="row-sub">开启后，所有 QQ 用户可把机器人邀请添加到自己的群内</div>
                    </div>
                    <div class="switch" :class="{ on: scope.allowGroup, 'is-disabled': !isCertified }" @click="toggleScope('group')"></div>
                  </div>
                </div>
                <div class="sec-group scope-card">
                  <div class="sec-group-title channel-title">
                    <span>频道</span>
                    <button v-if="isCertified" class="connect-profile-qr-trigger channel-qr-trigger" type="button" aria-label="查看添加到频道二维码">
                      <AppIcon name="qr" :size="14" />
                      <span class="connect-profile-qr-pop">
                        <span class="create-friend-qr-img"><QrCodeImage :target="channelShareTarget" /></span>
                        <span class="connect-profile-qr-tip">使用 QQ 扫一扫添加到频道</span>
                      </span>
                    </button>
                  </div>
                  <div :class="['row', 'static', { 'scope-row-disabled': !isCertified }]">
                    <div class="row-main">
                      <div class="row-label">允许机器人被添加到任意频道使用（提供公开服务）</div>
                      <div class="row-sub">开启后，任意频道主/管理员可直接把机器人添加到自己的频道内</div>
                    </div>
                    <div class="switch" :class="{ on: scope.allowChannel, 'is-disabled': !isCertified }" @click="toggleScope('channel')"></div>
                  </div>
                </div>
                <div class="sec-group">
                  <div class="sec-group-title">隐私与安全</div>
                  <div class="row editable-row" @click="openPrivateProtocol">
                    <div class="row-main">
                      <div class="row-label">隐私协议</div>
                      <div class="row-sub">{{ privateProto.effectiveDate ? `已生效，最近一次更新于 ${privateProto.effectiveDate}` : '填写表单信息，平台将自动生成完整协议' }}</div>
                    </div>
                    <div>
                      <span :class="['agreement-tag', privateProto.status ? 'approved' : 'none']">{{ privateProto.status ? '已提交' : '未提交' }}</span>
                      <AppIcon name="chevron" :size="15" class="row-chev" />
                    </div>
                  </div>
                </div>
              </template>

              <!-- 运营数据 -->
              <template v-else-if="activeSec === 'data'">
                <div class="sec-group report-view-setting">
                  <div class="row static">
                    <div class="row-main">
                      <div class="row-label">是否以折线图显示</div>
                      <div class="row-sub">开启后，运营数据将切换为平滑趋势图</div>
                    </div>
                    <button
                      type="button"
                      :class="['switch', { on: reportChartMode }]"
                      role="switch"
                      :aria-checked="reportChartMode"
                      aria-label="是否以折线图显示"
                      @click="reportChartMode = !reportChartMode"
                    ></button>
                  </div>
                </div>
                <div v-for="d in DATA_TYPES" :key="d.key" class="sec-group data-report">
                  <div class="report-header">
                    <div class="report-title-wrap">
                      <span class="report-title">{{ d.title }}</span>
                      <span class="report-tip"><AppIcon name="info" :size="12" /></span>
                    </div>
                    <div class="report-actions">
                      <select v-if="d.key === 'msg'" class="report-range-select" :value="reports[d.key].sceneId" @change="changeScene(d, Number($event.target.value))">
                        <option value="1">全部</option>
                        <option value="2">单聊</option>
                        <option value="3">群</option>
                        <option value="4">频道</option>
                      </select>
                      <select class="report-range-select" :value="reports[d.key].range" @change="changeRange(d, Number($event.target.value))">
                        <option v-for="r in RANGES" :key="r.v" :value="r.v">{{ r.label }}</option>
                      </select>
                      <button class="report-download-btn" @click="downloadReport(d)">下载表格</button>
                    </div>
                  </div>
                  <Transition name="report-view" mode="out-in">
                    <div :key="reportChartMode ? `chart-${reports[d.key].version}` : 'table'">
                      <div v-if="reports[d.key].loading" class="report-empty report-visual-state">加载中...</div>
                      <div v-else-if="!reports[d.key].rows.length" class="report-empty report-visual-state">暂无数据</div>
                      <ReportLineChart v-else-if="reportChartMode" :rows="reports[d.key].rows" :columns="REPORT_COLS[d.key]" />
                      <template v-else>
                        <div class="report-table-wrap">
                          <table class="report-table">
                            <thead><tr><th v-for="c in REPORT_COLS[d.key]" :key="c.key">{{ c.label }}</th></tr></thead>
                            <tbody>
                              <tr v-for="(row, i) in reportPageRows(d.key)" :key="i">
                                <td v-for="c in REPORT_COLS[d.key]" :key="c.key">{{ row[c.key] }}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div class="report-footer">
                          <span class="report-count">共 {{ reports[d.key].rows.length }} 项数据</span>
                          <div class="report-pager">
                            <span class="pager-size">10 条/页</span>
                            <button class="pager-btn" type="button" :disabled="reports[d.key].page <= 1" @click="reports[d.key].page--">&lt;</button>
                            <button v-for="page in reportPageCount(d.key)" :key="page" :class="['pager-btn', { active: reports[d.key].page === page }]" type="button" @click="reports[d.key].page = page">{{ page }}</button>
                            <button class="pager-btn" type="button" :disabled="reports[d.key].page >= reportPageCount(d.key)" @click="reports[d.key].page++">&gt;</button>
                          </div>
                        </div>
                      </template>
                    </div>
                  </Transition>
                </div>
              </template>

              <!-- 高级功能 -->
              <template v-else-if="activeSec === 'advanced'">
                <div class="advanced-intro">
                  <div>
                    <span class="advanced-eyebrow">实验性能力</span>
                    <h2>高级接口调试</h2>
                    <p>调用已确认的真实只读接口，或运行官方源码中的本地 Mock 方法。</p>
                  </div>
                  <AppIcon name="code" :size="34" />
                </div>
                <div class="sec-group pc2-status-panel">
                  <div>
                    <span>PC2 灰度状态</span>
                    <strong v-if="pc2.loading">检测中...</strong>
                    <strong v-else-if="pc2.checked" :class="pc2.hit ? 'is-hit' : 'not-hit'">
                      {{ pc2.hit ? '已命中灰度' : '未命中灰度' }}
                    </strong>
                    <strong v-else class="is-unknown">{{ pc2.error || '尚未检测' }}</strong>
                  </div>
                  <button class="btn ghost" type="button" :disabled="pc2.loading" @click="checkPc2Status">
                    {{ pc2.loading ? '检测中...' : '重新检测' }}
                  </button>
                </div>
                <div class="sec-group advanced-console">
                  <div class="advanced-console-head">
                    <label>
                      <span>接口能力</span>
                      <select v-model="advanced.key" @change="resetAdvancedPayload">
                        <optgroup label="真实接口">
                          <option v-for="api in REAL_ADVANCED_APIS" :key="api.key" :value="api.key">{{ api.name }}</option>
                        </optgroup>
                        <optgroup label="官方源码 Mock（本地模拟）">
                          <option v-for="api in ADVANCED_MOCK_APIS" :key="api.key" :value="api.key">{{ api.name }}</option>
                        </optgroup>
                      </select>
                    </label>
                    <span :class="['advanced-method', { mock: advancedApi.source === 'mock' }]">{{ advancedApi.method }}</span>
                  </div>
                  <div class="advanced-path">{{ advancedApi.path }}</div>
                  <p class="advanced-description">{{ advancedApi.description }}</p>
                  <div v-if="advancedApi.source === 'mock'" class="advanced-mock-warning">
                    该方法仅在当前网页内存中模拟，不会请求或修改 QQ 服务端数据，刷新页面后状态重置。
                  </div>
                  <label class="advanced-payload">
                    <span>请求参数</span>
                    <textarea v-model="advanced.payload" rows="9" spellcheck="false"></textarea>
                  </label>
                  <div class="advanced-actions">
                    <span v-if="advanced.lastRun">最后调用：{{ advanced.lastRun }}</span>
                    <button class="btn primary" type="button" :disabled="advanced.loading" @click="runAdvancedApi">
                      {{ advanced.loading ? '调用中...' : advancedApi.source === 'mock' ? '运行 Mock' : '调用接口' }}
                    </button>
                  </div>
                </div>
                <div v-if="advanced.error || advanced.result" class="sec-group advanced-response">
                  <div class="advanced-response-head">
                    <div class="sec-group-title">原始响应</div>
                    <button v-if="advanced.result" class="sec-group-action" type="button" @click="copyAdvancedResult"><AppIcon name="copy" :size="14" /> 复制 JSON</button>
                  </div>
                  <div v-if="advanced.error" class="advanced-error">{{ advanced.error }}</div>
                  <pre v-else>{{ advanced.result }}</pre>
                </div>
              </template>

              <!-- 开发设置 -->
              <template v-else-if="activeSec === 'dev-settings'">
                <template v-if="activeSub !== 'event-callback'">
                <div class="sec-group">
                  <div class="sec-group-title">AppID 接入凭证</div>
                  <div class="row static">
                    <div class="row-main">
                      <div class="row-label">AppID</div>
                    </div>
                    <div class="row-value mono">{{ dev.appid }}<button class="guide-copy-btn" type="button" aria-label="复制 AppID" @click="copyText(dev.appid)"><AppIcon name="copy" :size="15" class="guide-copy-icon" /></button></div>
                  </div>
                  <div class="row static">
                    <div class="row-main">
                      <div class="row-label">AppSecret</div>
                      <div class="row-sub">用于服务接入鉴权，请妥善保管。</div>
                    </div>
                    <div class="row-value mono">
                      <span>{{ dev.secretShown ? dev.secret : '****************' }}</span>
                      <button class="guide-copy-btn" type="button" aria-label="重置并查看 AppSecret" @click="secretResetDialog = true"><AppIcon name="eye" :size="15" class="guide-copy-icon" /></button>
                    </div>
                  </div>
                </div>
                <div class="sec-group">
                  <div class="sec-group-title">事件与回调配置</div>
                  <div class="row editable-row" @click="openConnectionSettings">
                    <div class="row-main">
                      <div class="row-label">事件订阅与回调地址</div>
                      <div class="row-sub">当前以 {{ dev.mode }} 方式接收事件推送</div>
                    </div>
                    <div class="row-value link">{{ dev.mode }} <AppIcon name="chevron" :size="15" /></div>
                  </div>
                </div>
                <div class="sec-group">
                  <div class="sec-group-head">
                    <div>
                      <div class="sec-group-title">服务器 IP 白名单</div>
                    </div>
                    <button class="sec-group-action" @click="showAddIp = true"><AppIcon name="plus" :size="14" /> 添加 IP</button>
                  </div>
                  <div class="sec-group-desc">设置白名单后，仅白名单地址允许调通平台 API，支持最多 50 个 IP 地址</div>
                  <div v-if="!dev.ips.length" class="ip-whitelist-empty">
                    <AppIcon name="info" :size="22" />
                    <div class="ip-whitelist-empty-title">尚未添加 IP 白名单</div>
                    <div class="ip-whitelist-empty-sub">未设置时所有请求来源 IP 都会被允许调用 API 接口，建议提供公开服务的机器人使用</div>
                  </div>
                  <ul v-else class="ip-whitelist-list">
                    <li v-for="ip in dev.ips" :key="ip" class="ip-whitelist-item">
                      <span class="mono">{{ ip }}</span>
                      <button class="btn ghost sm" @click="removeIp(ip)">删除</button>
                    </li>
                  </ul>
                </div>
                <div class="sec-group">
                  <div class="sec-group-head">
                    <div>
                      <div class="dev-tester-block-title">开发体验号码设置</div>
                    </div>
                    <div></div>
                  </div>
                  <div class="sec-group-desc">用于内部开发与内邀体验的场景。配置后，不受服务范围的设置影响，测试体验机器人在不同场景的对话能力。</div>
                  <div class="dev-tester-block">
                    <div class="dev-tester-block-head">
                      <div class="dev-tester-label">可添加机器人为好友的开发体验用户 <span class="dev-tester-count">{{ scope.friendInfos.length }} / 20</span></div>
                      <button class="sec-group-action" @click="showAddTester = true"><AppIcon name="plus" :size="14" /> 添加用户</button>
                    </div>
                  <div v-if="!scope.friendInfos.length" class="dev-tester-empty">尚未添加用户</div>
                  <ul v-else class="ip-whitelist-list">
                    <li v-for="tester in scope.friendInfos" :key="tester.uin" class="ip-whitelist-item">
                      <span>{{ tester.name || 'QQ 用户' }} <span class="mono">{{ tester.uin }}</span></span>
                      <button class="btn ghost sm" @click="removeDeveloperTester(tester.uin)">删除</button>
                    </li>
                  </ul>
                  </div>
                </div>
                </template>
                <template v-else>
                  <button class="panel-breadcrumb" type="button" @click="activeSub = ''">
                    <AppIcon name="back" :size="15" /> 开发设置 <span>/ 事件订阅与回调</span>
                  </button>
                  <div class="sec-group event-config">
                    <div class="event-config-title">接入方式 <span>（当前为：{{ dev.mode }}）</span></div>
                    <p class="sec-group-desc">提示：切换后立刻生效，请谨慎操作，避免影响在线服务。原创机器人开发者请阅读开发者文档：<a href="https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html" target="_blank" rel="noopener noreferrer">事件订阅与通知</a></p>
                    <div class="event-channel-grid">
                      <button :class="['event-channel-card', { active: connectionDraft.mode === 'WebSocket' }]" type="button" @click="connectionDraft.mode = 'WebSocket'">
                        <AppIcon name="robot" :size="23" />
                        <span><b>WebSocket</b><small>不依赖公网服务器部署，适合个人单机使用，需维护长连接状态</small></span>
                        <i>✓</i>
                      </button>
                      <button :class="['event-channel-card', { active: connectionDraft.mode === 'Webhook' }]" type="button" @click="connectionDraft.mode = 'Webhook'">
                        <AppIcon name="external" :size="23" />
                        <span><b>Webhook</b><small>事件推送至你配置的 HTTPS 服务上，适合提供公开服务的机器人使用，运维更可靠</small></span>
                        <i>✓</i>
                      </button>
                    </div>
                    <div v-if="connectionDraft.mode === 'WebSocket'" class="event-note">
                      <AppIcon name="info" :size="15" /> 如果你是想用于连接 OpenClaw 等类似的 AI Agent 服务，在服务提供方没有明确说明和指引的前提下，选用 WebSocket 即可。
                    </div>
                    <label v-else class="event-webhook-field">
                      <span>回调地址（HTTPS 地址）</span>
                      <input v-model="connectionDraft.webhook" type="url" placeholder="设置回调地址并切换至 Webhook 接入" />
                      <small>回调地址需公开可访问，修改地址时平台会校验返回签名，可查阅开发者文档了解签名算法</small>
                    </label>
                    <div class="event-save-mode"><button class="btn primary" type="button" :disabled="connectionDraft.saving" @click="saveConnection">{{ connectionDraft.saving ? '保存中...' : `切换为 ${connectionDraft.mode}` }}</button></div>
                  </div>
                  <div v-if="connectionDraft.mode === 'Webhook'" class="sec-group event-config">
                    <div class="event-config-head">
                      <div class="event-config-title">接收的事件 <span>{{ selectedEventCount }} / {{ dev.events.length }}</span></div>
                      <div><button class="event-quick-btn" type="button" @click="selectAllEvents(true)">全选</button><button class="event-quick-btn" type="button" @click="selectAllEvents(false)">全部取消</button></div>
                    </div>
                    <p class="sec-group-desc">只有勾选的事件才会触发回调推送，开发者可按需选择。</p>
                    <div v-if="eventGroups.length" class="event-groups">
                      <section v-for="group in eventGroups" :key="group.name">
                        <h4>{{ group.name }}</h4>
                        <label v-for="event in group.items" :key="event.id" class="event-item">
                          <input v-model="event.selected" type="checkbox" />
                          <span><b>{{ event.name }}</b><small>{{ event.description }}</small></span>
                          <code>{{ event.id }}</code>
                        </label>
                      </section>
                    </div>
                    <div v-else class="report-empty">暂无可订阅事件</div>
                    <div class="event-save-mode"><button class="btn primary" type="button" @click="saveEvents">保存接收事件</button></div>
                  </div>
                </template>
              </template>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 主体切换 -->
    <div v-if="showDeveloperPicker" class="v2-qr-overlay" @click.self="showDeveloperPicker = false">
      <div class="form-modal developer-picker-modal">
        <div class="v2-qr-title">选择主体账号</div>
        <div class="v2-qr-desc">请选择你要登录的开发者主体账号</div>
        <div v-if="developersLoading" class="report-empty">正在加载主体...</div>
        <div v-else class="developer-picker-list">
          <button
            v-for="developer in developers"
            :key="developer.id"
            type="button"
            :class="['developer-picker-item', { selected: selectedSwitchDeveloperId === developer.id }]"
            @click="selectedSwitchDeveloperId = developer.id"
          >
            <span class="developer-picker-mark">{{ developerMark(developer) }}</span>
            <span class="developer-picker-info">
              <strong>{{ developer.name }}</strong>
              <small>{{ developer.email || '暂无主体邮箱' }}</small>
            </span>
            <span class="developer-picker-type">{{ subjectTypeText(developer.subjectType) }}</span>
          </button>
          <div v-if="!developers.length" class="report-empty">暂无可切换主体</div>
        </div>
        <div class="create-actions">
          <button class="btn ghost" type="button" @click="showDeveloperPicker = false">取消</button>
          <button
            class="btn primary"
            type="button"
            :disabled="developerSwitching || !selectedSwitchDeveloperId || selectedSwitchDeveloperId === status.developerId"
            @click="switchDeveloper"
          >
            {{ developerSwitching ? '切换中...' : '切换主体' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 创建机器人弹窗 -->
    <div v-if="showCreate" class="v2-qr-overlay" @click.self="showCreate = false">
      <div class="create-modal">
        <div class="v2-qr-title">创建机器人</div>
        <div class="v2-qr-desc">个性化创建，灵活使用管理</div>
        <label class="create-field">
          <span>机器人头像</span>
          <div class="avatar-options">
            <button v-for="avatar in officialAvatars" :key="avatar.id" type="button" :class="['avatar-option', { active: createDraft.avatarId === avatar.id }]" @click="createDraft.avatarId = avatar.id">
              <img :src="avatar.url" alt="" />
            </button>
          </div>
        </label>
        <label class="create-field">
          <span>机器人昵称</span>
          <input v-model="createDraft.name" maxlength="20" placeholder="请输入机器人昵称" />
        </label>
        <label class="create-field">
          <span>机器人简介</span>
          <textarea v-model="createDraft.desc" maxlength="100" rows="3" placeholder="请输入机器人简介"></textarea>
        </label>
        <div class="create-actions">
          <button class="btn ghost" @click="showCreate = false">取消</button>
          <button class="btn primary" :disabled="createLoading || !createDraft.name.trim() || !createDraft.avatarId" @click="submitCreate">{{ createLoading ? '创建中...' : '创建机器人' }}</button>
        </div>
      </div>
    </div>

    <!-- 编辑基础信息 -->
    <div v-if="editor.visible" class="v2-qr-overlay" @click.self="editor.visible = false">
      <div class="form-modal">
        <div class="v2-qr-title">设置机器人{{ editor.field === 'name' ? '昵称' : '简介' }}</div>
        <div class="v2-qr-desc">{{ editor.field === 'name' ? '昵称将展示在 QQ 会话与机器人资料中' : '简洁说明机器人的主要能力和服务内容' }}</div>
        <label class="create-field">
          <span>{{ editor.field === 'name' ? '机器人昵称' : '机器人简介' }}</span>
          <input v-if="editor.field === 'name'" v-model="editor.value" maxlength="20" placeholder="请输入机器人昵称" />
          <textarea v-else v-model="editor.value" maxlength="100" rows="4" placeholder="请输入机器人简介"></textarea>
          <small>{{ editor.value.length }} / {{ editor.field === 'name' ? 20 : 100 }}</small>
        </label>
        <div class="create-actions">
          <button class="btn ghost" type="button" @click="editor.visible = false">取消</button>
          <button class="btn primary" type="button" :disabled="editor.loading || (editor.field === 'name' && !editor.value.trim())" @click="submitBotEditor">{{ editor.loading ? '保存中...' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- 头像选择 -->
    <div v-if="showAvatarPicker" class="v2-qr-overlay" @click.self="closeAvatarEditor">
      <div class="form-modal">
        <div class="v2-qr-title">设置机器人头像</div>
        <div class="v2-qr-desc">使用官方推荐或上传自定义头像</div>
        <div v-if="officialAvatars.length" class="avatar-picker-grid">
          <button v-for="avatar in officialAvatars" :key="avatar.id" type="button" :class="['avatar-option', { active: selectedAvatarId === avatar.id }]" @click="selectOfficialAvatar(avatar)"><img :src="avatar.url" alt="" /></button>
        </div>
        <div v-else class="report-empty">暂无可用头像</div>
        <div v-if="customAvatarUrl" class="custom-avatar-preview">
          <img :src="customAvatarUrl" alt="自定义头像预览" />
          <span>自定义头像</span>
        </div>
        <div class="avatar-upload-row">
          <input ref="avatarFileInput" class="avatar-file-input" type="file" accept="image/*" @change="selectCustomAvatar" />
          <button class="btn ghost" type="button" :disabled="avatarSaving" @click="avatarFileInput?.click()">上传自定义头像</button>
          <small>图片小于 2MB，可拖动和缩放裁剪</small>
        </div>
        <div class="create-actions">
          <button class="btn ghost" type="button" @click="closeAvatarEditor">取消</button>
          <button class="btn primary" type="button" :disabled="avatarSaving || (!selectedAvatarId && !customAvatarFile)" @click="submitAvatar">{{ avatarSaving ? '保存中...' : '保存' }}</button>
        </div>
      </div>
    </div>

    <!-- 自定义头像裁剪 -->
    <div v-if="cropper.visible" class="v2-qr-overlay cropper-overlay">
      <div class="form-modal avatar-cropper-modal" role="dialog" aria-modal="true" aria-label="编辑头像">
        <div class="v2-qr-title">编辑头像</div>
        <div class="v2-qr-desc">拖动图片调整位置，使用滑杆缩放头像</div>
        <div class="avatar-cropper-body">
          <div class="avatar-cropper-stage" @pointerdown="startCropDrag">
            <img :src="cropper.source" :style="cropImageStyle" alt="头像裁剪预览" draggable="false" />
            <span class="avatar-cropper-grid horizontal one"></span>
            <span class="avatar-cropper-grid horizontal two"></span>
            <span class="avatar-cropper-grid vertical one"></span>
            <span class="avatar-cropper-grid vertical two"></span>
          </div>
          <div class="avatar-cropper-preview">
            <span>预览</span>
            <div>
              <img :src="cropper.source" :style="cropPreviewStyle" alt="" draggable="false" />
            </div>
          </div>
        </div>
        <label class="avatar-cropper-zoom">
          <span>缩放</span>
          <input v-model.number="cropper.zoom" type="range" min="1" max="3" step="0.01" @input="clampCropOffset" />
          <button class="btn ghost sm" type="button" @click="resetCropper">重置</button>
        </label>
        <div class="create-actions">
          <button class="btn ghost" type="button" @click="closeCropper">取消</button>
          <button class="btn primary" type="button" @click="confirmCropper">确定</button>
        </div>
      </div>
    </div>

    <!-- 隐私协议 -->
    <div v-if="privacyDialog.visible" class="v2-qr-overlay" @click.self="privacyDialog.visible = false">
      <div class="form-modal privacy-modal">
        <div class="v2-qr-title">机器人隐私保护协议</div>
        <div v-if="!privacyDialog.editing" class="privacy-empty">
          <div class="privacy-empty-icon"><AppIcon name="safe" :size="28" /></div>
          <b>暂未生成隐私保护协议</b>
          <p>填写联系信息后，平台将根据机器人和开发者主体信息自动生成完整协议。</p>
          <button class="btn primary" type="button" @click="privacyDialog.editing = true">填写协议信息</button>
        </div>
        <template v-else>
          <label class="create-field">
            <span>联系邮箱</span>
            <input v-model="privacyDialog.email" type="email" placeholder="请输入有效联系邮箱" />
          </label>
          <div class="privacy-preview">
            <b>协议预览</b>
            <p>本机器人由 {{ developerInfo.subjectName || '当前开发者主体' }} 提供服务。用户可通过上述邮箱联系开发者，申请查询、更正或删除与机器人服务相关的信息。</p>
          </div>
          <div class="create-actions">
            <button class="btn ghost" type="button" @click="privacyDialog.visible = false">取消</button>
            <button class="btn primary" type="button" :disabled="privacyDialog.loading || !privacyDialog.email.trim()" @click="updatePrivateProtocol">{{ privacyDialog.loading ? '提交中...' : '提交协议' }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- 删除机器人 -->
    <div v-if="revokeDialog.visible" class="v2-qr-overlay" @click.self="revokeDialog.visible = false">
      <div class="form-modal delete-modal">
        <div class="v2-qr-title">确认立即删除机器人</div>
        <div class="delete-warning">当前机器人仅你在使用，确认删除后，将立即永久删除该账号，无法找回，请谨慎操作。</div>
        <div class="delete-bot-card">
          <div class="bot-avatar" :style="{ background: cur.avatar ? 'transparent' : cur.color }"><img v-if="cur.avatar" :src="cur.avatar" alt="" /><span v-else>{{ (cur.name || 'B').charAt(0) }}</span></div>
          <div><b>{{ cur.name }}</b><span>AppID：{{ cur.appid }}</span></div>
        </div>
        <label class="create-field">
          <span>请输入机器人 AppID</span>
          <input v-model="revokeDialog.input" :placeholder="cur.appid" autocomplete="off" />
        </label>
        <div class="create-actions">
          <button class="btn ghost" type="button" @click="revokeDialog.visible = false">取消</button>
          <button class="btn danger" type="button" :disabled="revokeDialog.loading || revokeDialog.input.trim() !== cur.appid" @click="revokeCurrentBot">{{ revokeDialog.loading ? '处理中...' : '确认删除' }}</button>
        </div>
      </div>
    </div>

    <!-- 添加 IP -->
    <div v-if="showAddIp" class="v2-qr-overlay" @click.self="showAddIp = false">
      <div class="form-modal compact-modal">
        <div class="v2-qr-title">添加 IP 白名单</div>
        <div class="v2-qr-desc">仅支持单个 IPv4；不支持 CIDR 网段。</div>
        <label class="create-field"><span>IPv4</span><input v-model="ipInput" placeholder="请输入 IPv4" @keyup.enter="addIp" /></label>
        <div class="create-actions"><button class="btn ghost" type="button" @click="showAddIp = false">取消</button><button class="btn primary" type="button" :disabled="!ipInput.trim()" @click="addIp">添加</button></div>
      </div>
    </div>

    <!-- 添加体验用户 -->
    <div v-if="showAddTester" class="v2-qr-overlay" @click.self="showAddTester = false">
      <div class="form-modal compact-modal">
        <div class="v2-qr-title">添加用户</div>
        <div class="v2-qr-desc">请输入用户的 QQ 号</div>
        <label class="create-field"><span>QQ 号</span><input v-model="testerInput" inputmode="numeric" maxlength="11" placeholder="请输入 QQ 号" @keyup.enter="addDeveloperTester" /></label>
        <div class="create-actions"><button class="btn ghost" type="button" @click="showAddTester = false">取消</button><button class="btn primary" type="button" :disabled="!/^\d{5,11}$/.test(testerInput.trim())" @click="addDeveloperTester">保存</button></div>
      </div>
    </div>

    <!-- 重置 AppSecret -->
    <div v-if="secretResetDialog" class="v2-qr-overlay" @click.self="secretResetDialog = false">
      <div class="form-modal compact-modal">
        <div class="v2-qr-title">重置 AppSecret</div>
        <div class="delete-warning">重置后旧的 AppSecret 立即失效。请及时更新已部署服务中的接入凭证。</div>
        <div class="create-actions"><button class="btn ghost" type="button" @click="secretResetDialog = false">取消</button><button class="btn danger" type="button" @click="resetSecret">重置并查看</button></div>
      </div>
    </div>

    <!-- 扫码登录弹窗 -->
    <OpenAPILoginDialog
      v-if="showQR"
      :title="scanStatus === 'selecting' ? '选择登录主体' : '扫码登录 QQ 开放平台'"
      :description="scanStatus === 'selecting' ? '请选择你要登录的开发者主体帐号' : '登录会话仅用于连接新版 QQ 机器人管理面板'"
      :steps="scanSteps"
      :show-qr="scanStatus !== 'selecting'"
      :qr-image="qrImg"
      :preparing="scanStatus === 'preparing'"
      :status-text="scanText"
      :status-tone="scanStatus === 'logged_in' ? 'success' : scanEnded ? 'error' : 'waiting'"
      :actions="scanActions"
      @action="handleScanAction"
      @close="closeScan"
    >
      <template #body>
        <div class="v2-entity-list">
          <label v-for="developer in scanDevelopers" :key="developer.id" :class="['v2-entity-item', { selected: selectedDeveloperId === developer.id }]">
            <input v-model="selectedDeveloperId" type="radio" :value="developer.id" />
            <span class="v2-entity-info">
              <strong>{{ developer.name }}</strong>
              <small>{{ subjectTypeText(developer.subject_type) }}{{ developer.email ? ` · ${developer.email}` : '' }}</small>
            </span>
          </label>
        </div>
      </template>
    </OpenAPILoginDialog>

    <transition name="toast-fade"><div v-if="toast" class="qq-toast">{{ toast }}</div></transition>
  </div>
</template>

<style scoped>
.v2-gate { max-width: 820px; margin: 36px auto 0; padding: 38px; border: 1px solid var(--line); border-radius: 26px; background: rgba(255, 255, 255, .94); box-shadow: 0 18px 44px rgba(31, 35, 41, .08); }
.v2-gate-badge { display: inline-flex; padding: 5px 10px; border: 1px solid rgba(255, 149, 0, .28); border-radius: 999px; background: rgba(255, 149, 0, .1); color: #d97800; font-size: 11px; font-weight: 800; letter-spacing: .04em; }
.v2-gate-hero { display: flex; align-items: center; gap: 18px; margin-top: 18px; }
.v2-gate-icon { width: 62px; height: 62px; flex: none; display: grid; place-items: center; border-radius: 18px; background: linear-gradient(145deg, #049fff, #6ec9ff); color: #fff; box-shadow: 0 10px 24px rgba(0, 153, 255, .24); }
.v2-gate .page-title { margin: 0; font-size: 27px; }
.v2-gate .page-sub { margin: 7px 0 0; color: var(--ink-3); font-size: 13.5px; line-height: 1.65; }
.v2-beta-notice { display: flex; align-items: flex-start; gap: 11px; margin-top: 24px; padding: 15px 17px; border: 1px solid rgba(255, 149, 0, .22); border-radius: 14px; background: rgba(255, 149, 0, .07); color: #c66c00; }
.v2-beta-notice div { display: grid; gap: 4px; }
.v2-beta-notice b { font-size: 13.5px; }
.v2-beta-notice span { color: #88633b; font-size: 12.5px; line-height: 1.55; }
.v2-login-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 22px; }
.v2-login-step { display: flex; gap: 10px; padding: 15px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg-sunken); }
.v2-login-step-num { width: 24px; height: 24px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 800; }
.v2-login-step div { display: grid; gap: 4px; }
.v2-login-step b { color: var(--ink-2); font-size: 12.5px; }
.v2-login-step div span { color: var(--ink-4); font-size: 11.5px; line-height: 1.45; }
.v2-gate-actions { display: flex; align-items: center; gap: 15px; margin-top: 24px; }
.v2-gate-security { color: var(--ink-4); font-size: 12px; }
.v2-qr-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.v2-qr-title { font-size: 17px; font-weight: 700; color: #1d1d1f; }
.v2-qr-desc { font-size: 13px; color: #6e6e73; margin: 6px 0 16px; }
.v2-entity-list { max-height: 280px; overflow-y: auto; display: grid; gap: 8px; text-align: left; }
.v2-entity-item { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--line-strong); border-radius: 10px; cursor: pointer; }
.v2-entity-item.selected { border-color: var(--accent); background: var(--accent-soft); }
.v2-entity-info { min-width: 0; display: grid; gap: 3px; }
.v2-entity-info strong { color: var(--ink); font-size: 14px; }
.v2-entity-info small { color: var(--ink-3); font-size: 12px; overflow-wrap: anywhere; }
.qqdash .empty-hint { color: var(--ink-3); font-size: 14px; padding: 40px 0; text-align: center; }
.qqdash .icon-btn { border: none; background: none; cursor: pointer; color: var(--ink-4); padding: 0 4px; display: inline-flex; }
.qqdash .icon-btn:hover { color: var(--accent); }
.qqdash .btn.sm { padding: 4px 10px; font-size: 12px; }
.qqdash .row-value.mono, .qqdash .mono { font-family: var(--font-mono); display: inline-flex; align-items: center; gap: 8px; }
.qqdash .row-value.is-placeholder { color: var(--ink-4); }
.qqdash .range-select { display: inline-flex; background: var(--bg-sunken); border-radius: 10px; padding: 3px; gap: 2px; }
.qqdash .range-opt { border: none; background: none; padding: 5px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; color: var(--ink-3); }
.qqdash .range-opt.active { background: #fff; color: var(--ink); box-shadow: var(--shadow-sm); }
.qqdash .report-actions { display: flex; align-items: center; gap: 10px; }
.qqdash .report-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.qqdash .report-table-wrap { overflow-x: auto; }
.qqdash .report-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.qqdash .report-table th { text-align: left; color: var(--ink-3); font-weight: 600; padding: 10px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.qqdash .report-table td { padding: 12px 8px; border-bottom: 1px solid var(--line); color: var(--ink-2); white-space: nowrap; }
.qqdash .report-empty { text-align: center; color: var(--ink-4); padding: 24px 0 !important; }
.qqdash .report-view-setting { overflow: hidden; }
.qqdash .report-view-setting .row { border-bottom: 0; }
.qqdash .report-view-setting .switch { border: 0; }
.qqdash .report-view-setting .switch:focus-visible { outline: 3px solid var(--accent-soft); outline-offset: 3px; }
.qqdash .report-visual-state { min-height: 276px; display: grid; place-items: center; }
.report-view-enter-active, .report-view-leave-active { transition: opacity .2s ease, transform .28s cubic-bezier(.22, .8, .32, 1); }
.report-view-enter-from { opacity: 0; transform: translateY(8px); }
.report-view-leave-to { opacity: 0; transform: translateY(-4px); }
.qqdash .editable-row { cursor: pointer; }
.qqdash .editable-row:hover { background: var(--bg-sunken); }
.qqdash .dangerText { color: var(--danger); font-weight: 600; }
.qqdash .revoke-card { cursor: default; }
.qqdash .bot-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--line); color: var(--ink-3); font-size: 12px; }
.qqdash .empty-state { grid-column: 1 / -1; min-height: 490px; display: grid; justify-items: center; align-content: center; text-align: center; overflow: hidden; }
.qqdash .empty-state figure { margin: 0; }
.qqdash .empty-hero-img { width: min(250px, 62vw); display: block; }
.qqdash .empty-copy { margin-top: 12px; }
.qqdash .empty-title { margin: 0; color: var(--ink); font-size: 22px; font-weight: 720; }
.qqdash .empty-desc { margin: 7px 0 0; color: var(--ink-4); font-size: 13px; }
.qqdash .empty-feature-art { margin-top: 24px !important; }
.qqdash .empty-feature-img { width: min(570px, 85vw); display: block; }
.qqdash .connection-actions { display: flex; align-items: center; gap: 8px; }
.qqdash .event-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px 16px; }
.qqdash .event-item { display: flex; align-items: flex-start; gap: 9px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.qqdash .event-item span { display: grid; gap: 3px; }
.qqdash .event-item strong { color: var(--ink-2); font-size: 13px; }
.qqdash .event-item small { color: var(--ink-4); font-size: 11px; line-height: 1.45; }
.qqdash .event-actions { display: flex; justify-content: flex-end; padding: 0 16px 16px; }
.create-modal { width: min(520px, calc(100vw - 32px)); padding: 26px; border-radius: 14px; background: #fff; box-shadow: var(--shadow-lg); }
.create-field { display: grid; gap: 8px; margin-top: 18px; color: var(--ink-2); font-size: 13px; font-weight: 600; }
.create-field input, .create-field textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); font: inherit; font-weight: 400; resize: vertical; outline: none; }
.create-field input:focus, .create-field textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.avatar-options { display: flex; gap: 10px; overflow-x: auto; padding: 3px; }
.avatar-option { width: 54px; height: 54px; flex: none; padding: 2px; border: 2px solid transparent; border-radius: 50%; background: transparent; cursor: pointer; }
.avatar-option.active { border-color: var(--accent); }
.avatar-option img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.create-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
.form-modal { width: min(520px, calc(100vw - 32px)); padding: 28px; border-radius: 18px; background: #fff; box-shadow: var(--shadow-lg); }
.compact-modal { width: min(420px, calc(100vw - 32px)); }
.form-modal .create-field small { color: var(--ink-4); font-size: 11px; font-weight: 400; text-align: right; }
.avatar-picker-grid { display: grid; grid-template-columns: repeat(auto-fill, 62px); gap: 12px; justify-content: center; margin: 22px 0 8px; max-height: 310px; overflow-y: auto; }
.avatar-file-input { display: none; }
.avatar-upload-row { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.avatar-upload-row small { color: var(--ink-4); font-size: 11.5px; }
.custom-avatar-preview { display: flex; align-items: center; gap: 10px; margin-top: 18px; color: var(--ink-3); font-size: 12px; }
.custom-avatar-preview img { width: 54px; height: 54px; border: 2px solid var(--accent); border-radius: 50%; object-fit: cover; }
.privacy-empty { display: grid; justify-items: center; gap: 10px; padding: 34px 20px 16px; text-align: center; }
.privacy-empty-icon { width: 60px; height: 60px; display: grid; place-items: center; border-radius: 18px; background: var(--accent-soft); color: var(--accent); }
.privacy-empty b { color: var(--ink); font-size: 15px; }
.privacy-empty p { max-width: 360px; margin: 0 0 8px; color: var(--ink-4); font-size: 12.5px; line-height: 1.65; }
.privacy-preview { margin-top: 18px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--bg-sunken); }
.privacy-preview b { color: var(--ink-2); font-size: 12.5px; }
.privacy-preview p { margin: 7px 0 0; color: var(--ink-4); font-size: 12px; line-height: 1.7; }
.delete-warning { margin-top: 18px; padding: 13px 14px; border: 1px solid rgba(255, 59, 48, .18); border-radius: 10px; background: rgba(255, 59, 48, .06); color: #bb2c24; font-size: 12.5px; line-height: 1.6; }
.delete-bot-card { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; }
.delete-bot-card .bot-avatar { width: 46px; height: 46px; }
.delete-bot-card>div:last-child { display: grid; gap: 4px; }
.delete-bot-card b { color: var(--ink); font-size: 14px; }
.delete-bot-card span { color: var(--ink-4); font-family: var(--font-mono); font-size: 11.5px; }
.panel-breadcrumb { display: inline-flex; align-items: center; gap: 7px; width: max-content; padding: 4px 2px; border: 0; background: transparent; color: var(--ink-3); font: inherit; font-size: 13px; cursor: pointer; }
.panel-breadcrumb span { color: var(--ink-4); }
.event-config { padding: 20px !important; }
.event-config-title { color: var(--ink); font-size: 15px; font-weight: 700; }
.event-config-title span { color: var(--ink-4); font-size: 12px; font-weight: 500; }
.event-config .sec-group-desc { padding: 0; margin: 8px 0 16px; }
.event-config .sec-group-desc a { color: var(--accent); text-decoration: none; }
.event-channel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.event-channel-card { position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 17px; border: 1px solid var(--line-strong); border-radius: 14px; background: #fff; color: var(--ink-3); text-align: left; cursor: pointer; }
.event-channel-card>span { display: grid; gap: 5px; }
.event-channel-card b { color: var(--ink); font-size: 13.5px; }
.event-channel-card small { color: var(--ink-4); font-size: 11.5px; line-height: 1.55; }
.event-channel-card i { position: absolute; top: 10px; right: 11px; display: none; color: var(--accent); font-style: normal; }
.event-channel-card.active { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 4px 16px rgba(0, 153, 255, .1); }
.event-channel-card.active i { display: block; }
.event-note { display: flex; align-items: flex-start; gap: 7px; margin-top: 14px; padding: 12px; border-radius: 10px; background: var(--accent-soft); color: #416c8d; font-size: 11.5px; line-height: 1.55; }
.event-webhook-field { display: grid; gap: 8px; margin-top: 16px; color: var(--ink-2); font-size: 12.5px; font-weight: 650; }
.event-webhook-field input { padding: 11px 12px; border: 1px solid var(--line-strong); border-radius: 9px; font: inherit; font-weight: 400; outline: none; }
.event-webhook-field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.event-webhook-field small { color: var(--ink-4); font-size: 11px; font-weight: 400; line-height: 1.5; }
.event-save-mode { display: flex; justify-content: flex-end; margin-top: 18px; }
.event-config-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.event-quick-btn { margin-left: 7px; padding: 3px 5px; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; }
.event-groups { display: grid; gap: 18px; }
.event-groups section { display: grid; gap: 7px; }
.event-groups h4 { margin: 0; color: var(--ink-4); font-size: 11px; letter-spacing: .04em; }
.event-groups .event-item { display: grid; grid-template-columns: 18px minmax(0, 1fr) minmax(120px, auto); align-items: center; gap: 9px; padding: 11px 12px; }
.event-groups .event-item span { display: grid; gap: 3px; }
.event-groups .event-item b { color: var(--ink-2); font-size: 12.5px; }
.event-groups .event-item small { color: var(--ink-4); font-size: 11px; line-height: 1.45; }
.event-groups .event-item code { color: var(--ink-4); font-size: 10.5px; text-align: right; overflow-wrap: anywhere; }
.connect-profile-qr-pop .create-friend-qr-img img { width: 100%; height: 100%; object-fit: contain; }
.advanced-intro { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 16px; padding: 20px 22px; border: 1px solid var(--accent-border); border-radius: 16px; background: linear-gradient(135deg, var(--accent-soft), rgba(124, 108, 240, .08)); color: var(--accent); }
.advanced-intro h2 { margin: 5px 0 6px; color: var(--ink); font-size: 18px; }
.advanced-intro p { margin: 0; color: var(--ink-3); font-size: 12.5px; line-height: 1.6; }
.advanced-eyebrow { font-size: 10px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }
.advanced-console { padding: 20px !important; }
.advanced-console-head { display: flex; align-items: flex-end; gap: 12px; }
.advanced-console-head label { min-width: 0; display: grid; flex: 1; gap: 7px; color: var(--ink-3); font-size: 11.5px; }
.advanced-console-head select { width: 100%; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 9px; background: #fff; color: var(--ink); font: inherit; outline: none; }
.advanced-console-head select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.advanced-method { padding: 6px 9px; border-radius: 7px; background: rgba(37, 180, 126, .12); color: #149665; font-family: var(--font-mono); font-size: 10.5px; font-weight: 750; }
.advanced-method.mock { background: rgba(124, 108, 240, .12); color: #6455d9; }
.advanced-path { margin-top: 13px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg-sunken); color: var(--ink-2); font-family: var(--font-mono); font-size: 11.5px; overflow-wrap: anywhere; }
.advanced-description { margin: 9px 0 16px; color: var(--ink-4); font-size: 11.5px; line-height: 1.55; }
.advanced-mock-warning { margin: -5px 0 16px; padding: 10px 12px; border: 1px solid rgba(124, 108, 240, .2); border-radius: 9px; background: rgba(124, 108, 240, .07); color: #665c9d; font-size: 11px; line-height: 1.55; }
.advanced-payload { display: grid; gap: 7px; color: var(--ink-3); font-size: 11.5px; }
.advanced-payload textarea { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: #17202b; color: #d8e5f2; font: 11.5px/1.65 var(--font-mono); resize: vertical; outline: none; }
.advanced-payload textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.advanced-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.advanced-actions>span { color: var(--ink-4); font-size: 10.5px; }
.advanced-response { padding: 20px !important; }
.advanced-response-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.advanced-response pre { max-height: 480px; margin: 0; padding: 14px; overflow: auto; border-radius: 10px; background: #17202b; color: #d8e5f2; font: 11px/1.65 var(--font-mono); white-space: pre-wrap; word-break: break-word; }
.advanced-error { padding: 13px 14px; border: 1px solid rgba(255, 59, 48, .2); border-radius: 10px; background: rgba(255, 59, 48, .06); color: #bb2c24; font-size: 12px; }
.pc2-status-panel { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 18px !important; }
.pc2-status-panel>div { display: grid; gap: 5px; }
.pc2-status-panel span { color: var(--ink-4); font-size: 11px; }
.pc2-status-panel strong { color: var(--ink-2); font-size: 13px; }
.pc2-status-panel .is-hit { color: #149665; }
.pc2-status-panel .not-hit { color: #c47713; }
.pc2-status-panel .is-unknown { color: var(--ink-4); }
.qqdash .page-actions { display: flex; align-items: center; gap: 10px; }
.qqdash .pc2-warning { display: flex; align-items: flex-start; gap: 10px; margin: -2px 0 16px; padding: 12px 14px; border: 1px solid rgba(229, 145, 34, .26); border-radius: 12px; background: rgba(255, 176, 64, .1); color: #a86511; }
.qqdash .pc2-warning>div { display: grid; gap: 3px; }
.qqdash .pc2-warning strong { font-size: 12.5px; }
.qqdash .pc2-warning span { color: #8f6a39; font-size: 11px; line-height: 1.5; }
.qqdash .current-subject-card { display: inline-flex; align-items: center; gap: 9px; min-width: 230px; max-width: 360px; margin-top: 13px; padding: 8px 10px 8px 8px; border: 1px solid var(--accent-border); border-radius: 12px; background: var(--accent-soft); }
.qqdash .current-subject-mark, .developer-picker-mark { width: 30px; height: 30px; display: grid; flex: none; place-items: center; border-radius: 50%; background: #fff; color: var(--accent); font-size: 13px; font-weight: 750; box-shadow: 0 2px 8px rgba(0, 153, 255, .12); }
.qqdash .current-subject-text { min-width: 0; display: grid; flex: 1; gap: 2px; text-align: left; }
.qqdash .current-subject-text strong, .developer-picker-info strong { overflow: hidden; color: var(--ink); font-size: 12px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.qqdash .current-subject-text small, .developer-picker-info small { overflow: hidden; color: var(--ink-4); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.qqdash .current-subject-tag, .developer-picker-type { flex: none; padding: 3px 7px; border-radius: 999px; background: rgba(0, 153, 255, .14); color: var(--accent); font-size: 10px; font-weight: 700; }
.qqdash .current-subject-card[data-auth-type="enterprise"] .current-subject-tag { background: rgba(41, 183, 128, .12); color: #149665; }
.developer-picker-modal { width: min(460px, calc(100vw - 32px)); }
.developer-picker-list { display: grid; gap: 8px; max-height: min(430px, 55vh); margin-top: 20px; overflow-y: auto; }
.developer-picker-item { width: 100%; display: flex; align-items: center; gap: 11px; padding: 11px; border: 1px solid var(--line); border-radius: 12px; background: #fff; font: inherit; text-align: left; cursor: pointer; transition: border-color .18s, background .18s, box-shadow .18s; }
.developer-picker-item:hover { border-color: var(--accent-border); background: var(--accent-soft); }
.developer-picker-item.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 3px rgba(0, 153, 255, .08); }
.developer-picker-info { min-width: 0; display: grid; flex: 1; gap: 3px; }
.developer-picker-mark { border: 1px solid var(--line); background: var(--bg-sunken); box-shadow: none; }
.cropper-overlay { z-index: 1001; }
.avatar-cropper-modal { width: min(560px, calc(100vw - 32px)); }
.avatar-cropper-body { display: flex; align-items: center; justify-content: center; gap: 34px; margin-top: 22px; }
.avatar-cropper-stage { position: relative; width: 320px; height: 320px; flex: none; overflow: hidden; border-radius: 16px; background: #20242b; cursor: grab; touch-action: none; user-select: none; }
.avatar-cropper-stage:active { cursor: grabbing; }
.avatar-cropper-stage img, .avatar-cropper-preview img { position: absolute; max-width: none; pointer-events: none; user-select: none; }
.avatar-cropper-stage::after { position: absolute; inset: 0; border: 2px solid rgba(255, 255, 255, .9); border-radius: inherit; box-shadow: inset 0 0 0 999px rgba(0, 0, 0, .08); content: ""; pointer-events: none; }
.avatar-cropper-grid { position: absolute; z-index: 1; background: rgba(255, 255, 255, .35); pointer-events: none; }
.avatar-cropper-grid.horizontal { right: 0; left: 0; height: 1px; }
.avatar-cropper-grid.vertical { top: 0; bottom: 0; width: 1px; }
.avatar-cropper-grid.horizontal.one { top: 33.333%; }
.avatar-cropper-grid.horizontal.two { top: 66.666%; }
.avatar-cropper-grid.vertical.one { left: 33.333%; }
.avatar-cropper-grid.vertical.two { left: 66.666%; }
.avatar-cropper-preview { display: grid; justify-items: center; gap: 9px; color: var(--ink-4); font-size: 11px; }
.avatar-cropper-preview>div { position: relative; width: 96px; height: 96px; overflow: hidden; border: 1px solid var(--line-strong); border-radius: 50%; background: #20242b; }
.avatar-cropper-zoom { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; margin-top: 20px; color: var(--ink-3); font-size: 12px; }
.avatar-cropper-zoom input { width: 100%; accent-color: var(--accent); }
@media (max-width: 720px) {
  .qqdash .page { padding: 24px 16px 40px; }
  .qqdash .page-head { align-items: flex-start; flex-direction: column; }
  .qqdash .page-actions { width: 100%; }
  .qqdash .page-actions .btn { flex: 1; justify-content: center; }
  .qqdash .current-subject-card { width: 100%; max-width: none; box-sizing: border-box; }
  .qqdash .manage-layout { grid-template-columns: 1fr; }
  .qqdash .manage-nav { position: static; display: flex; overflow-x: auto; }
  .qqdash .mn-item { white-space: nowrap; }
  .qqdash .event-list { grid-template-columns: 1fr; }
  .v2-gate { padding: 24px; }
  .v2-gate-hero { align-items: flex-start; }
  .v2-login-overview, .event-channel-grid { grid-template-columns: 1fr; }
  .v2-gate-actions { align-items: flex-start; flex-direction: column; }
  .event-groups .event-item { grid-template-columns: 18px minmax(0, 1fr); }
  .event-groups .event-item code { grid-column: 2; text-align: left; }
  .avatar-cropper-modal { width: min(560px, calc(100vw - 16px)); padding: 12px; }
  .avatar-cropper-body { justify-content: flex-start; gap: 14px; overflow-x: auto; }
  .avatar-cropper-preview { display: none; }
}
.qqdash .switch-row { display: flex; align-items: center; justify-content: space-between; }
.qqdash .row-desc { color: var(--ink-3); font-size: 12px; margin-top: 4px; }
.qqdash .ip-whitelist-head, .qqdash .dev-tester-block-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.qqdash .ip-add-row { display: flex; gap: 10px; margin-bottom: 14px; }
.qqdash .ip-input { flex: 1; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 10px; font-family: var(--font-mono); font-size: 13px; }
.qqdash .ip-whitelist-list { list-style: none; padding: 0; margin: 0; }
.qqdash .ip-whitelist-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--line); }
.qqdash .auth-intro-body { color: var(--ink-3); font-size: 13px; margin-top: 10px; line-height: 1.6; }
.qqdash .bot-avatar.sm { width: 44px; height: 44px; font-size: 18px; }
.qqdash .head-right { margin-left: auto; }
.qqdash .danger-action-title { font-weight: 600; color: var(--danger); }
.qqdash .danger-action-desc { color: var(--ink-3); font-size: 12px; margin-top: 4px; }
.qq-toast { position: fixed; left: 50%; bottom: 48px; transform: translateX(-50%); background: rgba(0,0,0,.82); color: #fff; padding: 10px 20px; border-radius: 10px; font-size: 13px; z-index: 9999; }
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity .25s; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; }
</style>
