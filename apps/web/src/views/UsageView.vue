<script setup lang="ts">
import { useScrollRestore } from '@/composables/useScrollRestore'
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { apiGet } from '@/bridge/http'
import { goBack } from '@/bridge/navigation'
import PageHead from '@/components/PageHead.vue'

useScrollRestore()

const router = useRouter()
const now = new Date()
const start = ref(new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 16))
const end = ref(now.toISOString().slice(0, 16))
const tab = ref<'overview' | 'model'>('overview')
const error = ref('')
const busy = ref(false)

interface LedgerRecord {
  timestamp_ms: number
  reasoning_effort: string
  model?: string
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  total_tokens: number
  elapsed_ms: number
}
interface UsageData {
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  total_tokens: number
  requests: number
  records: LedgerRecord[]
  by_model: Array<{ model: string; input_tokens: number; cached_input_tokens: number; output_tokens: number; total_tokens: number }>
}

const data = ref<UsageData>({
  input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0, records: [], by_model: []
})

const fmt = (n: number) => n.toLocaleString('zh-CN')
const timeFmt = (n: number) => new Date(n).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

// === SVG Chart Data ===
const chartDays = computed(() => {
  const days = new Map<string, { input: number; output: number; total: number; count: number }>()
  for (const r of data.value.records) {
    const d = new Date(r.timestamp_ms)
    const key = `${d.getMonth() + 1}/${d.getDate()}`
    const e = days.get(key) ?? { input: 0, output: 0, total: 0, count: 0 }
    e.input += r.input_tokens
    e.output += r.output_tokens
    e.total += r.total_tokens
    e.count += 1
    days.set(key, e)
  }
  return Array.from(days.entries()).map(([day, v]) => ({ day, ...v }))
})

// SVG dimensions
const SVG_W = 320, SVG_H = 140, PAD_L = 36, PAD_R = 8, PAD_T = 8, PAD_B = 22
const PLOT_W = SVG_W - PAD_L - PAD_R, PLOT_H = SVG_H - PAD_T - PAD_B

const chartMax = computed(() => {
  let m = 0
  for (const d of chartDays.value) m = Math.max(m, d.total)
  return m || 1
})
const chartBarW = computed(() => {
  const n = chartDays.value.length || 1
  return Math.max(4, Math.min(28, (PLOT_W / n) * 0.7))
})
const chartStep = computed(() => {
  const n = chartDays.value.length || 1
  return PLOT_H * 0.25
})

function barRects(d: { day: string; input: number; output: number; total: number }, idx: number) {
  const cx = PAD_L + (PLOT_W / (chartDays.value.length || 1)) * (idx + 0.5)
  const bw = chartBarW.value
  const scale = PLOT_H / chartMax.value
  const hTotal = Math.max(1, d.total * scale)
  const hOut = Math.max(1, d.output * scale)
  const hIn = hTotal - hOut
  return {
    total: { x: cx - bw / 2, y: SVG_H - PAD_B - hTotal, w: bw, h: hTotal },
    input: { x: cx - bw / 2, y: SVG_H - PAD_B - hTotal, w: bw, h: hIn },
    output: { x: cx - bw / 2, y: SVG_H - PAD_B - hOut, w: bw, h: hOut },
    cx, label: d.day
  }
}

// Y-axis ticks
const yTicks = computed(() => {
  const ticks: number[] = []
  const step = chartMax.value / 3
  for (let i = 0; i <= 3; i++) ticks.push(Math.round(step * i))
  return ticks
})

function fmtToken(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

async function query() {
  busy.value = true
  error.value = ''
  try {
    data.value = await apiGet(`/api/usage?from=${Date.parse(start.value)}&to=${Date.parse(end.value)}`)
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = false
  }
}
onMounted(query)
</script>

<template>
  <div class="page">
    <PageHead title="用量统计" @back="goBack(router, 'dashboard')" />
    <main class="body">
      <!-- Filters -->
      <div class="filters">
        <label>开始<input v-model="start" type="datetime-local" /></label>
        <label>结束<input v-model="end" type="datetime-local" /></label>
        <button class="query" :disabled="busy" @click="query">{{ busy ? '查询中…' : '查询' }}</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>

      <!-- Summary Cards -->
      <section class="cards">
        <div><span>总 Token</span><strong>{{ fmt(data.total_tokens) }}</strong></div>
        <div><span>输入</span><strong class="c-in">{{ fmt(data.input_tokens) }}</strong></div>
        <div><span>输出</span><strong class="c-out">{{ fmt(data.output_tokens) }}</strong></div>
        <div><span>请求次数</span><strong>{{ fmt(data.requests) }}</strong></div>
      </section>

      <!-- Tabs -->
      <div class="tabs">
        <button :class="['tab', { on: tab === 'overview' }]" @click="tab = 'overview'">总览</button>
        <button :class="['tab', { on: tab === 'model' }]" @click="tab = 'model'">按模型</button>
      </div>

      <!-- Overview Tab -->
      <template v-if="tab === 'overview'">
        <!-- SVG Bar Chart -->
        <section class="chart-card">
          <p class="sec-label">每日用量</p>
          <svg :width="SVG_W" :height="SVG_H" viewBox="0 0 320 140" class="chart">
            <!-- Y-axis ticks -->
            <template v-for="t in yTicks" :key="'yt'+t">
              <text :x="PAD_L - 4" :y="SVG_H - PAD_B - (t / chartMax) * PLOT_H + 3" text-anchor="end" class="axis-label">{{ fmtToken(t) }}</text>
              <line :x1="PAD_L" :x2="SVG_W - PAD_R" :y1="SVG_H - PAD_B - (t / chartMax) * PLOT_H" :y2="SVG_H - PAD_B - (t / chartMax) * PLOT_H" class="grid-line" />
            </template>
            <!-- Bars -->
            <template v-for="(d, i) in chartDays" :key="'bar'+i">
              <g v-for="bar in [barRects(d, i)]" :key="'g'+i">
                <!-- Input bar (lower) -->
                <rect :x="bar.input.x" :y="bar.input.y" :width="bar.input.w" :height="bar.input.h" rx="2" class="bar-in" />
                <!-- Output bar (upper) -->
                <rect :x="bar.output.x" :y="bar.output.y" :width="bar.output.w" :height="bar.output.h" rx="2" class="bar-out" />
                <!-- X label -->
                <text :x="bar.cx" :y="SVG_H - 4" text-anchor="middle" class="axis-label">{{ bar.label }}</text>
              </g>
            </template>
            <!-- Empty state -->
            <text v-if="!chartDays.length" :x="SVG_W / 2" :y="SVG_H / 2" text-anchor="middle" class="empty-chart">暂无数据</text>
          </svg>
          <div class="legend">
            <span class="dot dot-in"></span>输入
            <span class="dot dot-out"></span>输出
          </div>
        </section>

        <!-- Ledger -->
        <p class="sec-label">用量流水</p>
        <section class="group">
          <p v-if="!data.records.length" class="empty">当前时间范围暂无记录</p>
          <div v-for="(r, i) in data.records" :key="i" class="row">
            <span class="time">{{ timeFmt(r.timestamp_ms) }}</span>
            <span class="effort">{{ r.reasoning_effort }}</span>
            <span class="tokens">{{ fmt(r.total_tokens) }}</span>
          </div>
        </section>
      </template>

      <!-- Model Tab -->
      <template v-if="tab === 'model'">
        <section class="group">
          <p v-if="!data.by_model.length" class="empty">暂无按模型统计（需新数据）</p>
          <div v-for="m in data.by_model" :key="m.model" class="model-row">
            <span class="model-name">{{ m.model }}</span>
            <div class="model-bar">
              <div class="model-bar-fill" :style="{ width: (data.total_tokens ? (m.total_tokens / data.total_tokens) * 100 : 0) + '%' }"></div>
            </div>
            <span class="model-tokens">{{ fmt(m.total_tokens) }}</span>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page{display:flex;flex-direction:column;height:100%;background:var(--page)}
.body{flex:1;overflow:auto;padding:14px 12px calc(var(--safe-bottom) + 24px);min-width:0}
.filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,auto);gap:7px;align-items:end;max-width:100%;overflow:hidden}
.filters label{display:flex;min-width:0;flex-direction:column;gap:4px;color:var(--text-3);font-size:11px}
.filters input{display:block;min-width:0;width:100%;box-sizing:border-box;height:36px;padding:0 6px;border:1px solid var(--border-strong);border-radius:6px;background:var(--bg);color:var(--text);font-size:11px}
.query{height:36px;min-width:0;padding:0 10px;border-radius:6px;background:var(--blue);color:#fff;font-size:12px;white-space:nowrap}
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:14px}
.cards div{padding:12px;border-radius:var(--r-card);background:var(--bg);box-shadow:var(--shadow-1)}
.cards span{display:block;color:var(--text-3);font-size:11px}
.cards strong{display:block;margin-top:4px;color:var(--text);font-size:18px;font-variant-numeric:tabular-nums}
.c-in{color:var(--blue)}
.c-out{color:var(--orange)}

/* Tabs */
.tabs{display:flex;gap:0;margin-top:16px;border-bottom:1px solid var(--border)}
.tab{padding:8px 14px;font-size:13px;color:var(--text-2);border:none;background:none;border-bottom:2px solid transparent}
.tab.on{color:var(--blue);border-bottom-color:var(--blue);font-weight:600}

/* Chart */
.chart-card{margin-top:10px;padding:12px;border-radius:var(--r-card);background:var(--bg);box-shadow:var(--shadow-1)}
.chart{display:block;margin:0 auto;max-width:100%}
.axis-label{font-size:8px;fill:var(--text-3)}
.grid-line{stroke:var(--border);stroke-width:.5;stroke-dasharray:3,3}
.bar-in{fill:var(--blue);opacity:.85}
.bar-out{fill:var(--orange);opacity:.85}
.empty-chart{font-size:11px;fill:var(--text-3)}
.legend{display:flex;justify-content:center;gap:16px;margin-top:6px;font-size:11px;color:var(--text-2)}
.dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:middle}
.dot-in{background:var(--blue)}
.dot-out{background:var(--orange)}

/* Sections */
.sec-label{margin:18px 0 6px;font-size:13px;color:var(--text-2);font-weight:600}
.group{overflow:hidden;border-radius:var(--r-card);background:var(--bg);box-shadow:var(--shadow-1)}
.row{display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:12px 13px;border-bottom:1px solid var(--border);font-size:12px}
.row:last-child{border-bottom:0}
.time{color:var(--text-2)}
.effort{color:var(--blue)}
.tokens{color:var(--text-3);font-variant-numeric:tabular-nums}
.empty{padding:16px;color:var(--text-3);font-size:13px}
.error{color:var(--danger);font-size:12px}

/* Model tab */
.model-row{display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,2fr) auto;gap:10px;align-items:center;padding:10px 13px;border-bottom:1px solid var(--border);font-size:12px}
.model-row:last-child{border-bottom:0}
.model-name{color:var(--text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.model-bar{height:8px;border-radius:4px;background:var(--fill);overflow:hidden}
.model-bar-fill{height:100%;border-radius:4px;background:var(--blue);transition:width .3s}
.model-tokens{color:var(--text-3);font-variant-numeric:tabular-nums;white-space:nowrap}
</style>
