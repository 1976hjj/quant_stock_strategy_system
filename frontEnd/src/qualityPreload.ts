import { STRATEGY_API_ROOT } from './strategyApi'

export const QUALITY_SELECTION_KEY = 'alpha-research.quality-selection'
type Selection = { category: string; strategy_id?: string }
type Entry = { value?: unknown; expires: number; pending?: Promise<unknown> }
const entries = new Map<string, Entry>()
const TTL = 30_000
const MAX_ENTRIES = 4 // List plus at most three full accounts in this tab's memory.

export function savedQualitySelection(): Selection {
  try {
    const value = JSON.parse(window.localStorage.getItem(QUALITY_SELECTION_KEY) || 'null')
    if (value && ['SMALL_CAP', 'BANK', 'FACTOR_WEIGHTED'].includes(value.category)) {
      return { category: value.category, strategy_id: typeof value.strategy_id === 'string' ? value.strategy_id : undefined }
    }
  } catch { /* Storage can be unavailable. */ }
  return { category: 'SMALL_CAP' }
}

export const isQualityRead = (path: string) => path === 'quality-strategies' || /^quality-strategies\/[^/]+$/.test(path)
export function invalidateQualityReads() { entries.clear() }

export function readQuality<T>(path: string, fresh = false): Promise<T> {
  const previous = entries.get(path)
  if (previous?.pending) return previous.pending as Promise<T>
  if (!fresh && previous && previous.expires > Date.now()) return Promise.resolve(previous.value as T)
  const entry: Entry = { expires: 0 }
  entries.delete(path)
  entries.set(path, entry)
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!)
  const suffix = path === 'quality-strategies' ? '' : '?compact=1'
  entry.pending = fetch(`${STRATEGY_API_ROOT}/${path}${suffix}`).then(async response => {
    const data = await response.json()
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : data.detail ? JSON.stringify(data.detail) : data.error || `请求失败 ${response.status}`)
    // An invalidated in-flight read must never repopulate the current cache.
    if (entries.get(path) === entry) {
      entry.value = data; entry.expires = Date.now() + TTL; entry.pending = undefined
    }
    return data as T
  }).catch(error => {
    if (entries.get(path) === entry) entries.delete(path)
    throw error
  })
  return entry.pending as Promise<T>
}

export async function preloadQualityStrategies(): Promise<void> {
  const selection = savedQualitySelection()
  const list = readQuality<{ items: Array<{ strategy_id: string; category: string }> }>('quality-strategies')
  // Start the remembered account immediately, in parallel with the list.
  const remembered = selection.strategy_id
    ? readQuality(`quality-strategies/${encodeURIComponent(selection.strategy_id)}`).catch(() => undefined)
    : Promise.resolve(undefined)
  try {
    const data = await list
    const first = data.items.find(item => item.strategy_id === selection.strategy_id && item.category === selection.category)
      || data.items.find(item => item.category === selection.category) || data.items[0]
    if (first && first.strategy_id !== selection.strategy_id) await readQuality(`quality-strategies/${encodeURIComponent(first.strategy_id)}`)
    await remembered
  } catch { /* Background reads cannot block the current page; visible reads retry. */ }
}
