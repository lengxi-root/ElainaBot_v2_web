<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { useAppStore } from '../stores/app'
import { on, off } from '../utils/ws'
import axios from '../utils/axios'
import { responsePayload } from '../utils/api'
import SvgIcon from '../components/SvgIcon.vue'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend, ChartDataLabels)

const app = useAppStore()
const sys = computed(() => app.systemInfo || {})
const todayHourly = ref([])
const yesterdayHourly = ref([])
const chartLoading = ref(true)
const depsInfo = ref(null)

const STATUS_TEXT = { low: '版本偏低', high: '版本偏高', missing: '未安装' }
function depTip(status) {
  const t = STATUS_TEXT[status]
  return t ? `${t}，可能会出现某种异常` : ''
}
const abnormalDeps = computed(() => {
  if (!depsInfo.value) return 0
  let n = depsInfo.value.python?.status !== 'ok' ? 1 : 0
  n += (depsInfo.value.dependencies || []).filter(d => d.status !== 'ok').length
  return n
})
const abnormalTips = computed(() => {
  if (!depsInfo.value) return ''
  const items = []
  if (depsInfo.value.python?.status !== 'ok') items.push(`Python ${STATUS_TEXT[depsInfo.value.python?.status] || ''}`)
  for (const d of depsInfo.value.dependencies || []) {
    if (d.status !== 'ok') items.push(`${d.name} ${STATUS_TEXT[d.status] || ''}`)
  }
  return items.length ? `${items.join('、')}，可能会出现某种异常` : ''
})

let depsRetryTimer = null
async function fetchDeps() {
  try {
    depsInfo.value = responsePayload(await axios.get('/api/system/dependencies'))
  } catch {
    if (!depsRetryTimer) depsRetryTimer = setTimeout(() => { depsRetryTimer = null; fetchDeps() }, 15000)
  }
}

const statCards = computed(() => {
  const s = sys.value
  const u = s?.total_users ?? 0, au = s?.today_active ?? 0
  const g = s?.total_groups ?? 0, ag = s?.active_groups ?? 0
  return [
    { label: '今日消息', value: s?.today_messages ?? 0, icon: 'chatbubbles', color: 'c-blue' },
    { label: '插件处理器', value: s?.plugins_count ?? 0, icon: 'extension-puzzle', color: 'c-purple' },
    { label: '全部用户', value: `${u} (${au})`, icon: 'people', color: 'c-green' },
    { label: '全部群聊', value: `${g} (${ag})`, icon: 'group', color: 'c-orange' },
  ]
})

const ringColor = (v) => !v ? 'var(--accent)' : v > 90 ? 'var(--danger)' : v > 70 ? 'var(--warning)' : 'var(--success)'
const fmtMem = (v) => !v ? '-' : v > 1024 ? `${(v / 1024).toFixed(1)} GB` : `${Math.round(v)} MB`
function fmtUptime(s) {
  if (!s) return '-'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}天${h}时${m}分` : h > 0 ? `${h}时${m}分` : `${m}分`
}

const chartComputed = computed(() => {
  const hr = new Date().getHours()
  const t = todayHourly.value.length === 24 ? todayHourly.value : Array(24).fill(0)
  const y = yesterdayHourly.value.length === 24 ? yesterdayHourly.value : Array(24).fill(0)
  const labels = [], data = []
  for (let x = 11; x >= 0; x--) {
    const c = (hr - x + 24) % 24, n = (c + 1) % 24
    labels.push(`${c}:00-${n}:00`)
    data.push(hr - x < 0 ? (y[c] || 0) : (t[c] || 0))
  }
  return { labels, data }
})

const chartDataset = computed(() => ({
  labels: chartComputed.value.labels,
  datasets: [{
    label: '消息数', data: chartComputed.value.data,
    borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.1)',
    borderWidth: 2, pointRadius: 4, pointHoverRadius: 6,
    pointBackgroundColor: '#58a6ff', tension: 0.3, fill: true,
  }],
}))

const hasChart = computed(() => chartComputed.value.data.some(v => Number(v) > 0))

const chartOptions = {
  responsive: true, maintainAspectRatio: false,
  layout: { padding: { top: 14, left: 14, right: 20 } },
  plugins: {
    legend: { display: false }, tooltip: { mode: 'index', intersect: false },
    datalabels: { color: '#58a6ff', font: { size: 10, weight: 600 }, anchor: 'end', align: 'top', offset: 2, clamp: true, formatter: v => v > 0 ? v : '' },
  },
  scales: {
    x: { grid: { color: 'rgba(128,128,128,.15)' }, ticks: { color: '#8b949e', font: { size: 10 }, maxRotation: 45, minRotation: 30 } },
    y: { beginAtZero: true, grid: { color: 'rgba(128,128,128,.15)' }, ticks: { color: '#8b949e', font: { size: 11 }, precision: 0 } },
  },
}

async function fetchChart() {
  chartLoading.value = true
  try {
    const appid = app.currentBotId || ''
    const data = responsePayload(await axios.get(`/api/statistics/hourly?appid=${appid}`))
    if (data.today_hourly_distribution?.length) todayHourly.value = data.today_hourly_distribution
    if (data.yesterday_hourly_distribution?.length) { yesterdayHourly.value = data.yesterday_hourly_distribution }
  } catch {
    todayHourly.value = []
    yesterdayHourly.value = []
  } finally {
    chartLoading.value = false
  }
}

function onSysInfo(data) { app.systemInfo = data }
let timer
onMounted(() => { on('system_info', onSysInfo); timer = setInterval(() => app.fetchSystemInfo(), 10000); fetchChart(); fetchDeps() })
onUnmounted(() => { off('system_info', onSysInfo); clearInterval(timer); if (depsRetryTimer) { clearTimeout(depsRetryTimer); depsRetryTimer = null } })
</script>

<template>
  <div class="dash">
    <div class="ui-stat-grid stat-grid">
      <div v-for="s in statCards" :key="s.label" :class="['ui-stat', s.color]">
        <div class="ui-stat-top">
          <div class="ui-stat-ic"><SvgIcon :name="s.icon" :size="17" /></div>
          <div class="ui-stat-label">{{ s.label }}</div>
        </div>
        <div class="ui-stat-val">{{ s.value }}</div>
        <SvgIcon :name="s.icon" :size="68" class="ui-stat-bg" />
      </div>
    </div>

    <div class="main-row">
      <div class="sys-col">
        <!-- CPU -->
        <div class="res-card">
          <div class="res-header"><span :title="sys?.cpu_model || ''">CPU</span></div>
          <div class="res-body">
            <div class="progress-ring">
              <svg viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" />
                <circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys?.cpu_percent)" stroke-width="5" stroke-linecap="round" :stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys?.cpu_percent || 0) / 100" transform="rotate(-90 36 36)" />
              </svg>
              <span class="ring-text">{{ Math.round(sys?.cpu_percent || 0) }}%</span>
            </div>
            <div class="res-info">
              <div>系统 <b>{{ (sys?.cpu_percent || 0).toFixed(1) }}%</b></div>
              <div>框架 <b>{{ (sys?.framework_cpu_percent || 0).toFixed(1) }}%</b></div>
              <div>核心 <b>{{ sys?.cpu_cores || '-' }}</b></div>
            </div>
          </div>
        </div>

        <!-- Memory -->
        <div class="res-card">
          <div class="res-header"><span>内存</span><span class="res-sub">{{ fmtMem(sys?.memory_total) }}</span></div>
          <div class="res-body">
            <div class="progress-ring">
              <svg viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" stroke-width="5" />
                <circle cx="36" cy="36" r="30" fill="none" :stroke="ringColor(sys?.memory_percent)" stroke-width="5" stroke-linecap="round" :stroke-dasharray="188.5" :stroke-dashoffset="188.5 - 188.5 * (sys?.memory_percent || 0) / 100" transform="rotate(-90 36 36)" />
              </svg>
              <span class="ring-text">{{ Math.round(sys?.memory_percent || 0) }}%</span>
            </div>
            <div class="res-info">
              <div>系统 <b>{{ (sys?.memory_percent || 0).toFixed(1) }}%</b> · {{ fmtMem(sys?.memory_used) }}</div>
              <div>框架 <b>{{ (sys?.framework_memory_percent || 0).toFixed(1) }}%</b> · {{ (sys?.framework_memory_total || 0).toFixed(1) }} MB</div>
            </div>
          </div>
        </div>

        <!-- 运行环境 (占满两列) -->
        <div class="res-card deps-card">
          <div class="res-header">
            <span class="res-title"><SvgIcon name="cube" :size="15" class="res-title-ic" />运行环境</span>
            <span v-if="!depsInfo" class="deps-loading">加载中...</span>
            <span v-else-if="abnormalDeps" class="deps-warn" :title="abnormalTips"><SvgIcon name="alert-circle" :size="13" /><span class="deps-warn-tip">{{ abnormalTips }}</span></span>
            <span v-else class="deps-ok">版本正常</span>
          </div>
          <div v-if="!depsInfo" class="deps-empty">等待获取依赖信息...</div>
          <div v-else class="deps-grid">
            <div :class="['dep-item', { 'dep-bad': depsInfo.python?.status !== 'ok' }]" :title="depTip(depsInfo.python?.status)">
              <span :class="['dep-dot', depsInfo.python?.status === 'ok' ? 'dot-ok' : 'dot-bad']"></span>
              <span class="dep-name">Python</span>
              <span class="dep-ver">{{ depsInfo.python?.version }}</span>
              <span class="dep-req">要求 {{ depsInfo.python?.required || '不限' }}</span>
            </div>
            <div v-for="d in depsInfo.dependencies" :key="d.name" :class="['dep-item', { 'dep-bad': d.status !== 'ok' }]" :title="depTip(d.status)">
              <span :class="['dep-dot', d.status === 'ok' ? 'dot-ok' : 'dot-bad']"></span>
              <span class="dep-name">{{ d.name }}</span>
              <span class="dep-ver">{{ d.installed || '未安装' }}</span>
              <span class="dep-req">要求 {{ d.required || '不限' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="chart-col">
        <!-- 运行状态 (右侧) -->
        <div class="res-card runtime-card">
          <div class="res-header"><span class="res-title"><SvgIcon name="rocket" :size="15" class="res-title-ic" />运行状态</span></div>
          <div class="runtime-row">
            <div class="runtime-item">
              <div class="runtime-ic ic-blue"><SvgIcon name="time" :size="18" /></div>
              <div class="runtime-txt"><span class="runtime-label">启动时间</span><b>{{ sys?.start_time || '-' }}</b></div>
            </div>
            <div class="runtime-item">
              <div class="runtime-ic ic-purple"><SvgIcon name="rocket" :size="18" /></div>
              <div class="runtime-txt"><span class="runtime-label">框架运行</span><b>{{ fmtUptime(sys?.uptime) }}</b></div>
            </div>
            <div class="runtime-item">
              <div class="runtime-ic ic-green"><SvgIcon name="server" :size="18" /></div>
              <div class="runtime-txt"><span class="runtime-label">系统运行</span><b>{{ fmtUptime(sys?.system_uptime) }}</b></div>
            </div>
          </div>
        </div>

        <div class="res-card chart-card">
          <div class="res-header"><span>最近 12 小时消息分布</span></div>
          <div class="chart-wrap">
            <Line v-if="hasChart" :data="chartDataset" :options="chartOptions" :plugins="[ChartDataLabels]" />
            <div v-else class="chart-empty">{{ chartLoading ? '等待加载...' : '暂无消息' }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash {
  width:100%
}
.stat-grid {
  grid-template-columns:repeat(4,1fr)
}
.main-row {
  display:flex;
  gap:12px;
  align-items:start
}
.sys-col {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
  width:520px;
  flex-shrink:0;
  align-content:start
}
.chart-col {
  display:flex;
  flex-direction:column;
  gap:12px;
  flex:1;
  min-width:0
}
.res-card {
  background:var(--bg2);
  border:1px solid var(--border);
  border-radius:var(--radius);
  box-shadow:var(--shadow-sm);
  padding:18px
}
.res-header {
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:12px
}
.res-header span:first-child {
  color:var(--text);
  font-weight:600;
  font-size:14px
}
.res-sub {
  color:var(--text3);
  font-size:11px;
  max-width:60%;
  text-align:right;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.res-body {
  display:flex;
  align-items:center;
  gap:12px
}
.progress-ring {
  position:relative;
  width:56px;
  height:56px;
  flex-shrink:0
}
.progress-ring svg {
  width:100%;
  height:100%
}
.ring-text {
  position:absolute;
  top:0;
  right:0;
  bottom:0;
  left:0;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:11px;
  font-weight:600;
  color:var(--text)
}
.res-info {
  font-size:12px;
  color:var(--text2);
  line-height:1.7
}
.res-info b {
  color:var(--text)
}
.res-info-full {
  font-size:13px;
  color:var(--text2);
  line-height:2
}
.res-info-full b {
  color:var(--text)
}
.chart-card {
  display:flex;
  flex-direction:column
}
.chart-wrap {
  min-height:280px;
  position:relative
}
.chart-empty {
  color:var(--text3);
  text-align:center;
  padding-top:80px;
  font-size:13px
}
.deps-card {
  grid-column:1 / -1
}
.res-title {
  display:inline-flex;
  align-items:center;
  gap:6px;
  white-space:nowrap;
  flex-shrink:0
}
.res-title-ic {
  color:var(--accent)
}
.runtime-card {
  padding:14px 18px
}
.runtime-row {
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:12px
}
.runtime-item {
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 12px;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--bg);
  font-size:13px;
  min-width:0
}
.runtime-ic {
  width:34px;
  height:34px;
  border-radius:8px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0
}
.ic-blue {
  color:#58a6ff;
  background:#58a6ff1a
}
.ic-purple {
  color:#bc8cff;
  background:#bc8cff1a
}
.ic-green {
  color:#3fb950;
  background:#3fb9501a
}
.runtime-txt {
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:0
}
.runtime-label {
  color:var(--text3);
  font-size:11px
}
.runtime-item b {
  color:var(--text);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis
}
.deps-ok {
  color:var(--success);
  font-size:12px
}
.deps-loading {
  color:var(--text3);
  font-size:12px
}
.deps-empty {
  color:var(--text3);
  font-size:12px;
  text-align:center;
  padding:14px 0
}
.deps-grid {
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
  gap:8px
}
.dep-item {
  position:relative;
  display:flex;
  flex-direction:column;
  gap:2px;
  padding:8px 10px;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--bg);
  font-size:12px;
  transition:border-color .15s,box-shadow .15s
}
.dep-item:hover {
  border-color:var(--accent);
  box-shadow:var(--shadow-sm)
}
.dep-dot {
  position:absolute;
  top:10px;
  right:10px;
  width:7px;
  height:7px;
  border-radius:50%
}
.dot-ok {
  background:var(--success)
}
.dot-bad {
  background:var(--danger);
  box-shadow:0 0 0 3px #ef53501f
}
.dep-name {
  color:var(--text);
  font-weight:600
}
.dep-ver {
  color:var(--text2);
  font-family:Consolas,Monaco,monospace
}
.dep-req {
  color:var(--text3);
  font-size:11px
}
.dep-item.dep-bad {
  border-color:var(--danger);
  background:#ef53500f
}
.dep-item.dep-bad .dep-name,.dep-item.dep-bad .dep-ver {
  color:var(--danger)
}
.deps-warn {
  display:inline-flex;
  align-items:center;
  gap:5px;
  min-width:0;
  max-width:75%;
  margin-left:12px;
  padding:3px 10px;
  border-radius:12px;
  color:var(--danger);
  background:#ef535014;
  border:1px solid #ef535030
}
.deps-warn svg {
  flex-shrink:0
}
.deps-warn-tip {
  font-size:11px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
@media(min-width:1800px) {
  .sys-col {
  width:640px
}
.chart-wrap {
  min-height:340px
}
}
@media(max-width:767px) {
  .stat-grid {
  grid-template-columns:repeat(2,1fr)
}
.stat-value {
  font-size:18px
}
.stat-card {
  padding:12px
}
.main-row {
  flex-direction:column
}
.sys-col {
  width:100%;
  grid-template-columns:1fr 1fr
}
.chart-col {
  width:100%
}
.chart-wrap {
  min-height:200px
}
.res-card {
  padding:14px
}
.deps-card .res-header {
  flex-wrap:wrap;
  row-gap:8px
}
.deps-warn {
  max-width:100%;
  margin-left:0
}
.deps-grid {
  grid-template-columns:repeat(auto-fill,minmax(130px,1fr))
}
.runtime-row {
  grid-template-columns:1fr;
  gap:8px
}
.runtime-item {
  padding:8px 12px
}
}
@media(max-width:400px) {
  .sys-col {
  grid-template-columns:1fr
}
.stat-grid {
  gap:8px
}
.deps-grid {
  grid-template-columns:1fr 1fr
}
}
</style>
