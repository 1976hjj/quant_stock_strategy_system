export type StockIdentityValue = {
  ts_code: string; security_name?: string; industry_name?: string | null;
  industry_l3_name?: string | null; industry_in_date?: string; industry_out_date?: string | null;
}

export default function StockIdentity({ position: p }: { position: StockIdentityValue }) {
  return <><b>{p.security_name || p.ts_code}</b>
    {p.security_name && p.security_name !== p.ts_code && <small>{p.ts_code}</small>}
    <span className="qs-holding-industry" title={p.industry_name
      ? `申万行业${p.industry_l3_name ? ` · ${p.industry_l3_name}` : ''}；归属自 ${p.industry_in_date || '未记录'}${p.industry_out_date ? ` 至 ${p.industry_out_date}（不含当日）` : ''}`
      : '该日暂无可匹配的行业归属记录'}>{p.industry_name || '板块未记录'}</span>
  </>
}
