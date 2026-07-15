<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  rows: { type: Array, required: true },
  columns: { type: Array, required: true },
})

const WIDTH = 960
const HEIGHT = 300
const PLOT = { left: 58, right: 18, top: 18, bottom: 42 }
const COLORS = ['#0099ff', '#34c759', '#ff9500', '#af52de', '#ff3b30']
const hoveredIndex = ref(null)

const chartRows = computed(() => [...props.rows].sort((a, b) => String(a.date).localeCompare(String(b.date))))
const metricColumns = computed(() => props.columns.filter(column => !['date', 'scene'].includes(column.key)))

function numberValue(value) {
  const parsed = Number.parseFloat(String(value ?? 0).replace('%', ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function niceMaximum(value) {
  if (value <= 0) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  const scaled = value / power
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * power
}

const maximum = computed(() => niceMaximum(Math.max(
  ...chartRows.value.flatMap(row => metricColumns.value.map(column => numberValue(row[column.key]))),
)))
const plotWidth = WIDTH - PLOT.left - PLOT.right
const plotHeight = HEIGHT - PLOT.top - PLOT.bottom

function pointX(index) {
  return chartRows.value.length === 1
    ? PLOT.left + plotWidth / 2
    : PLOT.left + (index / (chartRows.value.length - 1)) * plotWidth
}

function pointY(value) {
  return PLOT.top + (1 - value / maximum.value) * plotHeight
}

const series = computed(() => metricColumns.value.map((column, seriesIndex) => ({
  ...column,
  color: COLORS[seriesIndex % COLORS.length],
  points: chartRows.value.map((row, index) => ({
    x: pointX(index),
    y: pointY(numberValue(row[column.key])),
    value: numberValue(row[column.key]),
  })),
})))

function smoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]
    const middle = (previous.x + point.x) / 2
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`
  }, `M ${points[0].x} ${points[0].y}`)
}

const gridLines = computed(() => Array.from({ length: 5 }, (_, index) => ({
  y: PLOT.top + (index / 4) * plotHeight,
  value: maximum.value * (1 - index / 4),
})))

const dateLabels = computed(() => {
  const rows = chartRows.value
  const step = rows.length <= 7 ? 1 : rows.length <= 14 ? 2 : 5
  const indexes = rows.map((_, index) => index).filter(index => index % step === 0)
  if (indexes.at(-1) !== rows.length - 1) indexes.push(rows.length - 1)
  return indexes.map(index => ({ index, x: pointX(index), label: rows[index]?.date || '' }))
})

const hoveredRow = computed(() => (
  hoveredIndex.value === null ? null : chartRows.value[hoveredIndex.value]
))
const hoveredX = computed(() => (
  hoveredIndex.value === null ? 0 : pointX(hoveredIndex.value)
))
const tooltipStyle = computed(() => {
  const ratio = hoveredX.value / WIDTH
  const transform = ratio < 0.18 ? 'translateX(0)' : ratio > 0.82 ? 'translateX(-100%)' : 'translateX(-50%)'
  return { left: `${ratio * 100}%`, transform }
})

function formatAxis(value) {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatValue(column, value) {
  const formatted = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
  return column.key === 'nextDayRetention' ? `${formatted}%` : formatted
}

function updateHover(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH
  const ratio = Math.max(0, Math.min(1, (x - PLOT.left) / plotWidth))
  hoveredIndex.value = chartRows.value.length === 1
    ? 0
    : Math.round(ratio * (chartRows.value.length - 1))
}
</script>

<template>
  <div class="report-line-chart">
    <div class="report-chart-legend">
      <span v-for="item in series" :key="item.key">
        <i :style="{ background: item.color }"></i>{{ item.label }}
      </span>
    </div>
    <div class="report-chart-stage">
      <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" aria-label="运营数据折线图" @pointermove="updateHover" @pointerleave="hoveredIndex = null">
        <g class="report-chart-grid">
          <g v-for="line in gridLines" :key="line.y">
            <line :x1="PLOT.left" :x2="WIDTH - PLOT.right" :y1="line.y" :y2="line.y" />
            <text :x="PLOT.left - 12" :y="line.y + 4">{{ formatAxis(line.value) }}</text>
          </g>
        </g>
        <g class="report-chart-dates">
          <text v-for="date in dateLabels" :key="date.index" :x="date.x" :y="HEIGHT - 14">{{ date.label.slice(5) }}</text>
        </g>
        <g v-for="(item, seriesIndex) in series" :key="item.key">
          <path
            class="report-chart-line"
            :d="smoothPath(item.points)"
            :stroke="item.color"
            pathLength="1"
            :style="{ '--series-index': seriesIndex }"
          />
          <circle
            v-for="(point, index) in item.points"
            :key="index"
            class="report-chart-point"
            :class="{ active: hoveredIndex === index }"
            :cx="point.x"
            :cy="point.y"
            :r="hoveredIndex === index ? 4.5 : 2.2"
            :fill="item.color"
          />
        </g>
        <g v-if="hoveredIndex !== null" class="report-chart-cursor">
          <line :x1="hoveredX" :x2="hoveredX" :y1="PLOT.top" :y2="HEIGHT - PLOT.bottom" />
        </g>
      </svg>
      <div v-if="hoveredRow" class="report-chart-tooltip" :style="tooltipStyle">
        <b>{{ hoveredRow.date }}<span v-if="hoveredRow.scene"> · {{ hoveredRow.scene }}</span></b>
        <span v-for="item in series" :key="item.key">
          <i :style="{ background: item.color }"></i>
          <em>{{ item.label }}</em>
          <strong>{{ formatValue(item, numberValue(hoveredRow[item.key])) }}</strong>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-line-chart { padding: 2px 0 4px; }
.report-chart-legend { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px 18px; min-height: 24px; color: #6e6e73; font-size: 11.5px; }
.report-chart-legend span { display: inline-flex; align-items: center; gap: 6px; }
.report-chart-legend i, .report-chart-tooltip i { width: 7px; height: 7px; flex: none; border-radius: 50%; }
.report-chart-stage { position: relative; min-height: 300px; }
.report-chart-stage svg { display: block; width: 100%; height: auto; min-height: 270px; overflow: visible; touch-action: pan-y; }
.report-chart-grid line { stroke: rgba(60, 60, 67, .09); stroke-width: 1; vector-effect: non-scaling-stroke; }
.report-chart-grid text { fill: #8e8e93; font-size: 10.5px; text-anchor: end; }
.report-chart-dates text { fill: #8e8e93; font-size: 10.5px; text-anchor: middle; }
.report-chart-line { fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; stroke-dasharray: 1; stroke-dashoffset: 1; animation: report-line-draw .75s cubic-bezier(.22, .8, .32, 1) forwards; animation-delay: calc(var(--series-index) * 70ms); }
.report-chart-point { opacity: .36; stroke: #fff; stroke-width: 1.5; vector-effect: non-scaling-stroke; transition: r .16s ease, opacity .16s ease; }
.report-chart-point.active { opacity: 1; }
.report-chart-cursor line { stroke: rgba(60, 60, 67, .2); stroke-width: 1; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }
.report-chart-tooltip { position: absolute; top: 12px; z-index: 2; min-width: 190px; padding: 11px 12px; border: 1px solid rgba(60, 60, 67, .1); border-radius: 11px; background: rgba(255, 255, 255, .94); box-shadow: 0 10px 28px rgba(31, 35, 41, .13); backdrop-filter: blur(14px); pointer-events: none; animation: report-tooltip-in .14s ease-out; }
.report-chart-tooltip b { display: block; margin-bottom: 8px; color: #1d1d1f; font-size: 12px; }
.report-chart-tooltip b span { color: #8e8e93; font-weight: 500; }
.report-chart-tooltip>span { display: grid; grid-template-columns: 7px minmax(90px, 1fr) auto; align-items: center; gap: 7px; margin-top: 5px; }
.report-chart-tooltip em { color: #6e6e73; font-size: 11px; font-style: normal; }
.report-chart-tooltip strong { color: #1d1d1f; font-size: 11.5px; font-variant-numeric: tabular-nums; }
@keyframes report-line-draw { to { stroke-dashoffset: 0; } }
@keyframes report-tooltip-in { from { opacity: 0; } }
</style>
