import type { DataGroup } from './dataApi'

export default function LhbDataSummary({ group }: { group: DataGroup }) {
  if (!group.id.startsWith('lhb_')) return null
  return <div className="bank-data-summary">
    <span>已归档 {(group.record_count ?? 0).toLocaleString()} 条原始记录 · {group.published ? '已入库发布' : '待入库发布'}</span>
    <span>最近采集：{group.last_collected_at ? new Date(group.last_collected_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '尚未采集'}</span>
  </div>
}
