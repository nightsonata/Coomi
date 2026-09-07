import { onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 页面滚动位置恢复。
 *
 * 离开页面时把 `.body` 容器的 scrollTop 写入 sessionStorage，
 * 路由返回时恢复。纯增量 composable，不改页面逻辑。
 */
export function useScrollRestore(selector = '.body') {
  const route = useRoute()
  const key = () => `scroll:${route.name}`

  onMounted(() => {
    // 恢复上次滚动位置
    const stored = sessionStorage.getItem(key())
    const el = document.querySelector<HTMLElement>(selector)
    if (stored && el) {
      // 等待布局完成后再设置，避免被后续渲染重置
      requestAnimationFrame(() => {
        el.scrollTop = Number(stored)
      })
    }
  })

  onBeforeUnmount(() => {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) {
      sessionStorage.setItem(key(), String(el.scrollTop))
    }
  })
}
