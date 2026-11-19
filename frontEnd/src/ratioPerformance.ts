type AccountDay = { session: string; nav: number }
type Benchmark = { status: string; daily: Array<{ session: string; close: number }> }
type Style = 'GROWTH' | 'DIVIDEND' | 'WEALTH' | 'MIXED' | 'CASH' | 'UNKNOWN'

function completedHoldingPeriods(daily: AccountDay[], styles: Style[]) {
  if (styles.includes('UNKNOWN')) return null
  let previousStyle: Style | undefined
  let entry: AccountDay | undefined
  let completed = 0
  let wins = 0
  let losingStreak = 0
  let streakStart = ''
  let longestLosses = 0
  let longestLossPeriod: { start: string; end: string } | undefined

  daily.forEach((day, i) => {
    const style = styles[i]
    if (style === 'MIXED') return
    const heldStyle = style === 'CASH' || style === 'WEALTH' ? undefined : style
    if (heldStyle === previousStyle) return
    if (entry) {
      completed++
      const change = day.nav / entry.nav - 1
      if (change > 1e-10) wins++
      if (change < -1e-10) {
        if (!losingStreak) streakStart = entry.session
        losingStreak++
        if (losingStreak > longestLosses) {
          longestLosses = losingStreak
          longestLossPeriod = { start: streakStart, end: day.session }
        }
      } else {
        losingStreak = 0
      }
    }
    previousStyle = heldStyle
    entry = heldStyle ? day : undefined
  })

  return { completed, wins, longestLosses, longestLossPeriod }
}

function maxDrawdownRecovery(daily: AccountDay[], initialCash?: number) {
  let peak = initialCash && initialCash > 0 ? initialCash : daily[0].nav
  let peakIndex = 0
  let deepest = 0
  let recoveryLevel = peak
  let start = 0
  let trough = 0
  daily.forEach(({ nav }, i) => {
    if (nav >= peak) {
      peak = nav
      peakIndex = i
    }
    const drawdown = nav / peak - 1
    if (drawdown < deepest) {
      deepest = drawdown
      recoveryLevel = peak
      start = peakIndex
      trough = i
    }
  })
  if (!deepest) return null
  const recovered = daily.findIndex((row, i) => i > trough && row.nav >= recoveryLevel)
  const end = recovered < 0 ? daily.length - 1 : recovered
  return {
    peak: daily[start].session, trough: daily[trough].session, end: daily[end].session,
    recovered: recovered >= 0, recoverySessions: end - trough, underwaterSessions: end - start,
  }
}

function benchmarkRegression(daily: AccountDay[], benchmark?: Benchmark | null) {
  if (benchmark?.status !== 'OK') return null
  const closes = new Map(benchmark.daily.map(row => [row.session, row.close]))
  const pairs: Array<[number, number]> = []
  for (let i = 1; i < daily.length; i++) {
    const previous = daily[i - 1], current = daily[i]
    const before = closes.get(previous.session), after = closes.get(current.session)
    if (before == null || after == null || !Number.isFinite(before) || !Number.isFinite(after) || before <= 0 || after <= 0) continue
    pairs.push([after / before - 1, current.nav / previous.nav - 1])
  }
  if (pairs.length < 3) return null
  const xMean = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length
  const yMean = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length
  const variance = pairs.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0)
  if (variance === 0) return null
  const beta = pairs.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0) / variance
  return { alpha: (yMean - beta * xMean) * 252, beta, sessions: pairs.length }
}

export function ratioPerformance(daily: AccountDay[], styles: Style[], benchmark?: Benchmark | null, initialCash?: number) {
  if (!daily.length || daily.some(row => !Number.isFinite(row.nav) || row.nav <= 0)) return null
  return {
    periods: completedHoldingPeriods(daily, styles),
    recovery: maxDrawdownRecovery(daily, initialCash),
    regression: benchmarkRegression(daily, benchmark),
  }
}
