// solarlunar@3.1.0 的 package.json exports 未暴露 types 入口，
// 这里按其 solarlunar.d.ts 手工声明（字段与官方一致）。
declare module 'solarlunar' {
  export interface SolarLunarResult {
    lYear: number
    lMonth: number
    lDay: number
    animal: string
    yearCn: string
    monthCn: string
    dayCn: string
    cYear: number
    cMonth: number
    cDay: number
    gzYear: string
    gzMonth: string
    gzDay: string
    isToday: boolean
    isLeap: boolean
    nWeek: number
    ncWeek: string
    isTerm: boolean
    term: string
  }

  const solarLunar: {
    lunarInfo: number[]
    lYearDays(y: number): number
    leapMonth(y: number): number
    leapDays(y: number): number
    monthDays(y: number, m: number): number
    solarDays(y: number, m: number): number
    toGanZhi(offset: number): string
    getTerm(y: number, n: number): number
    toChinaYear(y: number): string
    toChinaMonth(m: number): string
    toChinaDay(d: number): string
    getAnimal(y: number, month?: number, day?: number): string
    solar2lunar(year?: number, month?: number, day?: number): SolarLunarResult | -1
    lunar2solar(year: number, month: number, day: number, isLeapMonth?: boolean): SolarLunarResult | -1
    (year?: number, month?: number, day?: number): SolarLunarResult | -1
  }

  export default solarLunar
  export { SolarLunarResult }
}
