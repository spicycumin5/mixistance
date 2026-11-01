export const fmtDb = (db: number, digits = 1) =>
  !isFinite(db) || db <= -60 ? '-∞' : `${db > 0 ? '+' : ''}${db.toFixed(digits)}`
export const fmtHz = (hz: number) => (hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)}k` : `${Math.round(hz)}`)
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
export const fmtPan = (p: number) => (Math.abs(p) < 0.01 ? 'C' : `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`)
