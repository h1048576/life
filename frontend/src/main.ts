import './style.css'
import solarLunar, { type SolarLunarResult } from 'solarlunar'

type Me = {
  id: number
  username: string
  birthday: string
  retirement_age: number
  life_expectancy: number
}

// 参与计算的资料：登录用户来自服务端，访客在本地实时计算
type Draft = {
  birthday: string
  retirement_age: number
  life_expectancy: number
}

const app = document.querySelector<HTMLDivElement>('#app')!

// 登录功能暂隐藏：改为 true 即恢复注册/登录入口（相关代码全部保留）
const AUTH_ENABLED = false

let me: Me | null = null
let draft: Draft = { birthday: '2001-01-01', retirement_age: 60, life_expectancy: 100 }
// 访客点击「保存」时暂存，登录/注册成功后自动提交
let pendingSave: Draft | null = null
let tickTimer: number | undefined
// 生命页掩码：默认开启防偷窥，所有数据显示 **，点击按钮后显示真实值
let masked = true

// ---------- 贷款计算器状态 ----------
type LoanType = 'commercial' | 'fund' | 'combo'
type RepayMethod = 'annuity' | 'principal'

const loan = {
  type: 'commercial' as LoanType,
  repay: 'annuity' as RepayMethod,
  amount: 100, // 万：商业贷/公积金贷金额
  cAmount: 60, // 万：组合贷商业部分
  fAmount: 40, // 万：组合贷公积金部分
  term: 30, // 年
  rateCommercial: 3.05, // %
  rateFund: 2.6, // %
}

// ---------- 个税计算器状态 ----------
type TaxMode = 'salary' | 'bonus'

const tax = {
  mode: 'salary' as TaxMode,
  salary: 20000, // 月薪（税前）
  insurance: 3000, // 五险一金（月，个人部分）
  deduction: 1000, // 专项附加扣除（月）
  bonus: 36000, // 年终奖
}

// ---------- 万年历状态 ----------
// y/m 为当前展示的阳历月份，sel 为选中日期（YYYY-MM-DD），默认定位今天
const cal = { y: new Date().getFullYear(), m: new Date().getMonth() + 1, sel: fmtDate(new Date()) }

function currentPage(): 'life' | 'tax' | 'loan' | 'calendar' {
  if (location.hash === '#tax') return 'tax'
  if (location.hash === '#calendar') return 'calendar'
  return location.hash === '#loan' ? 'loan' : 'life'
}

function defaultDraft(): Draft {
  return { birthday: '2001-01-01', retirement_age: 60, life_expectancy: 100 }
}

// 访客资料缓存到 localStorage，下次打开自动恢复（登录用户以服务端为准）
const DRAFT_KEY = 'life-draft'

function saveDraftLocal(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // 隐私模式等场景写入失败可忽略
  }
}

function loadDraftLocal(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<Draft>
    if (
      typeof d.birthday === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(d.birthday) &&
      typeof d.retirement_age === 'number' &&
      d.retirement_age >= 1 &&
      d.retirement_age <= 120 &&
      typeof d.life_expectancy === 'number' &&
      d.life_expectancy >= 1 &&
      d.life_expectancy <= 150 &&
      d.life_expectancy >= d.retirement_age
    ) {
      return { birthday: d.birthday, retirement_age: d.retirement_age, life_expectancy: d.life_expectancy }
    }
  } catch {
    // 缓存损坏则忽略，退回默认值
  }
  return null
}

const mark = `<svg class="mark" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`

const mark15 = mark.replace('width="18" height="18"', 'width="15" height="15"')

const calcIcon15 = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>`

const taxIcon15 = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`

const calIcon15 = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`

const eyeIcon15 = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`

const eyeOffIcon15 = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

// ---------- 浅色/深色主题 ----------
type Theme = 'light' | 'dark'

const moonIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`

const sunIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`

// 用 Cookie 而非 localStorage 存偏好，避免部分环境清空 storage 后丢失
function currentTheme(): Theme {
  const m = document.cookie.match(/(?:^|;\s*)life-theme=(light|dark)/)
  return m && m[1] === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.cookie = `life-theme=${theme}; path=/; max-age=31536000; samesite=lax`
}

function renderThemeToggle(): void {
  const btn = document.getElementById('theme-toggle')
  if (!btn) return
  const theme = currentTheme()
  btn.innerHTML = theme === 'light' ? moonIcon : sunIcon
  btn.setAttribute('aria-label', theme === 'light' ? '切换到深色模式' : '切换到浅色模式')
}

// ---------- 工具 ----------
async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  })
  let data: unknown = {}
  try {
    data = await res.json()
  } catch {
    // 空响应体
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `请求失败（HTTP ${res.status}）`
    throw new Error(msg)
  }
  return data as T
}

function esc(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return s.replace(/[&<>"']/g, (c) => map[c])
}

const DAY_MS = 86_400_000

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

function addYears(d: Date, years: number): Date {
  const x = new Date(d)
  x.setFullYear(x.getFullYear() + years)
  return x
}

function diffDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

// 周年按日历计算：先取完整的年数，再算距上一个生日的天数
function ageParts(birth: Date, now: Date): { years: number; days: number } {
  let years = now.getFullYear() - birth.getFullYear()
  if (startOfDay(addYears(birth, years)).getTime() > startOfDay(now).getTime()) years--
  years = Math.max(years, 0)
  return { years, days: Math.max(diffDays(addYears(birth, years), now), 0) }
}

function setText(id: string, v: string): void {
  const el = document.getElementById(id)
  if (el && el.textContent !== v) el.textContent = v
}

function setStyle(id: string, prop: string, v: string): void {
  document.getElementById(id)?.style.setProperty(prop, v)
}

function draftFromUser(user: Me): Draft {
  return {
    // 账户还没填生日时，展示层退回默认生日
    birthday: user.birthday || '2001-01-01',
    retirement_age: user.retirement_age,
    life_expectancy: user.life_expectancy,
  }
}

// 掩码：设置项变 ** 只读，统计由 tick() 统一显示 **；再点一次恢复真实值
function applyMask(): void {
  const b = document.getElementById('s-birthday') as HTMLInputElement | null
  const r = document.getElementById('s-retire') as HTMLInputElement | null
  const l = document.getElementById('s-life') as HTMLInputElement | null
  if (b && r && l) {
    if (masked) {
      b.type = 'text'
      b.readOnly = true
      b.value = '**/**/**'
      r.type = 'text'
      r.readOnly = true
      r.value = '**'
      l.type = 'text'
      l.readOnly = true
      l.value = '**'
    } else {
      b.type = 'date'
      b.readOnly = false
      b.value = draft.birthday
      r.type = 'number'
      r.readOnly = false
      r.value = String(draft.retirement_age)
      l.type = 'number'
      l.readOnly = false
      l.value = String(draft.life_expectancy)
    }
  }
  const btn = document.getElementById('mask-toggle')
  if (btn) btn.innerHTML = masked ? eyeOffIcon15 : eyeIcon15
}

// ---------- 视图 ----------
function navRightHtml(): string {
  return `
      <button id="theme-toggle" class="btn-icon" type="button"></button>${
        me
          ? `
        <span class="badge-pill">${esc(me.username)}</span>
        <button id="logout-btn" class="btn btn-secondary btn-sm" type="button">退出登录</button>`
          : AUTH_ENABLED
            ? `
        <button id="login-btn" class="btn btn-primary btn-sm" type="button">登录</button>`
            : ''
      }`
}

function renderApp(): void {
  if (tickTimer !== undefined) clearInterval(tickTimer)
  app.innerHTML = `
  <header class="top-nav">
    <div class="container nav-inner">
      <nav class="nav-menu">
        <a class="nav-link${currentPage() === 'life' ? ' active' : ''}" href="#life">${mark15}生命刻度</a>
        <a class="nav-link${currentPage() === 'calendar' ? ' active' : ''}" href="#calendar">${calIcon15}日月历书</a>
        <a class="nav-link${currentPage() === 'tax' ? ' active' : ''}" href="#tax">${taxIcon15}个税计算</a>
        <a class="nav-link${currentPage() === 'loan' ? ' active' : ''}" href="#loan">${calcIcon15}贷款计算</a>
      </nav>
      <div class="nav-right">${navRightHtml()}</div>
    </div>
  </header>
  <main class="container" id="main"></main>
  <footer class="footer">
    <div class="container footer-inner">
      <span class="brand-lockup" id="footer-brand">${footerBrandHtml()}</span>
      <span id="footer-tagline">${footerTagline()}</span>
    </div>
  </footer>
  <div id="auth-modal" class="modal-overlay" hidden>
    <div class="modal-card" id="auth-modal-card"></div>
  </div>`

  renderThemeToggle()
  document.getElementById('theme-toggle')!.addEventListener('click', () => {
    applyTheme(currentTheme() === 'light' ? 'dark' : 'light')
    renderThemeToggle()
  })

  const loginBtn = document.getElementById('login-btn')
  if (loginBtn) loginBtn.addEventListener('click', () => openAuthModal('login'))

  const logoutBtn = document.getElementById('logout-btn')
  if (logoutBtn)
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/api/logout', { method: 'POST' })
      } catch {
        // 忽略登出失败，本地清状态即可
      }
      me = null
      draft = defaultDraft()
      renderApp()
    })

  const overlay = document.getElementById('auth-modal')!
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAuthModal()
  })

  renderPage()
  tick()
  tickTimer = window.setInterval(tick, 1000)
}

// ---------- 页面分发 ----------
function footerTagline(): string {
  if (currentPage() === 'tax') return 'Tax Calc — 综合所得与年终奖，税前税后一目了然。'
  if (currentPage() === 'calendar') return 'Almanac — 阳历阴历同览，节气时令有数。'
  return currentPage() === 'loan'
    ? 'Loan Calc — 月供与总利息实时计算，贷前心里有数。'
    : 'Life in Days — 记录已走过的时间，珍惜剩下的每一天。'
}

function footerBrandHtml(): string {
  if (currentPage() === 'tax') return `${taxIcon15}<span>个税计算</span>`
  if (currentPage() === 'calendar') return `${calIcon15}<span>日月历书</span>`
  return currentPage() === 'loan'
    ? `${calcIcon15}<span>贷款计算</span>`
    : `${mark15}<span>生命刻度</span>`
}

function renderPage(): void {
  const main = document.getElementById('main')!
  if (currentPage() === 'loan') renderLoanPage(main)
  else if (currentPage() === 'tax') renderTaxPage(main)
  else if (currentPage() === 'calendar') renderCalendarPage(main)
  else renderLifePage(main)
  document.querySelectorAll<HTMLAnchorElement>('.nav-link').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#${currentPage()}`)
  })
  setText('footer-tagline', footerTagline())
  const fb = document.getElementById('footer-brand')
  if (fb) fb.innerHTML = footerBrandHtml()
  // 立即填充生命页数据，避免等下一个 1 秒 tick 出现占位符
  tick()
}

function renderLifePage(main: HTMLElement): void {
  main.innerHTML = `
  <section class="hero">
    <p class="caption-uppercase">LIFE CLOCK</p>
    <h1 class="display-xl"><span id="age-years">–</span><span class="hero-unit">年</span><span id="age-days">–</span><span class="hero-unit">天</span></h1>
  </section>
  <section class="card settings-card">
    <form id="settings-form" class="settings-grid">
      <label class="field">
        <span class="field-label">生日</span>
        <input type="date" id="s-birthday" required max="${fmtDate(new Date())}" value="${draft.birthday}" />
      </label>
      <label class="field">
        <span class="field-label">退休</span>
        <input type="number" id="s-retire" min="1" max="120" required value="${draft.retirement_age}" />
      </label>
      <label class="field">
        <span class="field-label">寿命</span>
        <input type="number" id="s-life" min="1" max="150" required value="${draft.life_expectancy}" />
      </label>
      <button id="mask-toggle" class="btn btn-secondary" type="button" aria-label="切换掩码"></button>
      ${me || AUTH_ENABLED ? `<div class="settings-actions">
        <button type="submit" class="btn btn-primary">保存</button>
        <span id="settings-msg" class="save-msg" hidden>已保存</span>
        <span id="settings-error" class="save-msg error" hidden></span>
      </div>` : ''}
    </form>
  </section>
  <section class="stats-grid">
    <article class="card feature-card">
      <p class="card-label">来时岁月</p>
      <p class="card-date placeholder" aria-hidden="true">&nbsp;</p>
      <p class="stat-num"><span id="ticker-days">–</span><span class="stat-unit">天</span></p>
    </article>
    <article class="card feature-card">
      <p class="card-label">迈向退休</p>
      <p class="card-date"><span id="retire-label">–</span></p>
      <p class="stat-num"><span id="retire-days">–</span><span class="stat-unit">天</span></p>
    </article>
    <article class="card feature-card">
      <p class="card-label">余生可期</p>
      <p class="card-date"><span id="life-label">–</span></p>
      <p class="stat-num"><span id="life-days">–</span><span class="stat-unit">天</span></p>
    </article>
  </section>
  <section class="card dark-card">
    <div class="dark-head">
      <p class="dark-title">人生几何</p>
      <p class="dark-pct"><span id="pct">–</span><span class="dark-pct-unit">%</span></p>
    </div>
    <div class="bar">
      <div class="bar-fill" id="bar-fill"></div>
      <div class="bar-marker" id="bar-marker"></div>
    </div>
    <div class="bar-legend">
      <div class="legend-item"><span class="legend-word">启程</span><span class="legend-date" id="legend-birth">–</span></div>
      <div class="legend-item bar-marker-label" id="marker-label"><span class="legend-word">退休</span><span class="legend-date" id="legend-retire">–</span></div>
      <div class="legend-item"><span class="legend-word">归宿</span><span class="legend-date" id="legend-death">–</span></div>
    </div>
    <p class="dark-note">已度过 <span id="pct-detail">–</span> 的时间，进度条每天前进 <span id="pct-day">–</span>。</p>
  </section>`

  // 输入即算：改动草稿后实时刷新统计，不打断输入
  const birthdayInput = document.getElementById('s-birthday') as HTMLInputElement
  const retireInput = document.getElementById('s-retire') as HTMLInputElement
  const lifeInput = document.getElementById('s-life') as HTMLInputElement
  birthdayInput.addEventListener('change', () => {
    // 清空日期时回填当前值，统计不中断
    if (!birthdayInput.value) birthdayInput.value = draft.birthday
    else draft.birthday = birthdayInput.value
    saveDraftLocal()
    tick()
  })
  retireInput.addEventListener('change', () => {
    const v = Number(retireInput.value)
    if (Number.isFinite(v) && v >= 1) draft.retirement_age = Math.min(Math.round(v), 120)
    saveDraftLocal()
    tick()
  })
  lifeInput.addEventListener('change', () => {
    const v = Number(lifeInput.value)
    if (Number.isFinite(v) && v >= 1) draft.life_expectancy = Math.min(Math.round(v), 150)
    saveDraftLocal()
    tick()
  })

  document.getElementById('mask-toggle')!.addEventListener('click', () => {
    masked = !masked
    applyMask()
  })
  applyMask()

  document.getElementById('settings-form')!.addEventListener('submit', onSubmitSettings)
}

async function onSubmitSettings(e: Event): Promise<void> {
  e.preventDefault()
  // 掩码态下输入框是占位的 **，不读真实值
  if (masked) return
  const payload: Draft = {
    birthday: (document.getElementById('s-birthday') as HTMLInputElement).value,
    retirement_age: Number((document.getElementById('s-retire') as HTMLInputElement).value),
    life_expectancy: Number((document.getElementById('s-life') as HTMLInputElement).value),
  }
  draft = payload
  saveDraftLocal()
  tick()
  if (!me) {
    if (!AUTH_ENABLED) return
    pendingSave = payload
    openAuthModal('login', true)
    return
  }
  await saveProfile(payload)
}

async function saveProfile(payload: Draft): Promise<void> {
  const errBox = document.getElementById('settings-error')
  const okBox = document.getElementById('settings-msg')
  try {
    me = await api<Me>('/api/profile', { method: 'PUT', body: JSON.stringify(payload) })
    draft = draftFromUser(me)
    if (okBox) okBox.hidden = false
    if (errBox) errBox.hidden = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('登录')) {
      // 会话已失效：转为访客并引导重新登录
      me = null
      pendingSave = payload
      renderApp()
      openAuthModal('login', true)
      return
    }
    if (errBox) {
      errBox.textContent = msg
      errBox.hidden = false
    }
    if (okBox) okBox.hidden = true
  }
}

// ---------- 登录/注册弹框 ----------
function openAuthModal(mode: 'login' | 'register', withPendingHint = false): void {
  const overlay = document.getElementById('auth-modal')
  const card = document.getElementById('auth-modal-card')
  if (!overlay || !card) return
  card.innerHTML = `
    <button id="modal-close" class="modal-close" type="button" aria-label="关闭">×</button>
    <h2 class="auth-title">${mode === 'login' ? '欢迎回来' : '创建你的账户'}</h2>
    <p class="auth-sub">${
      withPendingHint
        ? '登录或注册后，你刚才填写的内容会自动保存到账户。'
        : '记录你已走过多少年月，距离退休与终点还剩多少天。'
    }</p>
    <div class="auth-tabs">
      <button class="auth-tab${mode === 'login' ? ' active' : ''}" data-mode="login" type="button">登录</button>
      <button class="auth-tab${mode === 'register' ? ' active' : ''}" data-mode="register" type="button">注册</button>
    </div>
    <form id="auth-form" class="auth-form">
      <label class="field">
        <span class="field-label">用户名</span>
        <input id="auth-username" maxlength="32" autocomplete="username" placeholder="用户名" required />
      </label>
      <label class="field">
        <span class="field-label">密码</span>
        <input id="auth-password" type="password" minlength="6"
          autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="至少 6 位" required />
      </label>
      <div id="auth-error" class="form-error" hidden></div>
      <button type="submit" class="btn btn-primary btn-block">确认</button>
    </form>`

  card.querySelectorAll<HTMLButtonElement>('.auth-tab').forEach((btn) => {
    btn.addEventListener('click', () => openAuthModal(btn.dataset.mode as 'login' | 'register', withPendingHint))
  })
  document.getElementById('modal-close')!.addEventListener('click', closeAuthModal)

  const form = document.getElementById('auth-form') as HTMLFormElement
  const errBox = document.getElementById('auth-error')!
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const username = (document.getElementById('auth-username') as HTMLInputElement).value.trim()
    const password = (document.getElementById('auth-password') as HTMLInputElement).value
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type=submit]')!
    errBox.hidden = true
    submitBtn.disabled = true
    try {
      me = await api<Me>(mode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      await onAuthSuccess(me)
    } catch (err) {
      errBox.textContent = err instanceof Error ? err.message : String(err)
      errBox.hidden = false
      submitBtn.disabled = false
    }
  })

  overlay.hidden = false
}

function closeAuthModal(): void {
  const overlay = document.getElementById('auth-modal')
  if (overlay) overlay.hidden = true
}

async function onAuthSuccess(user: Me): Promise<void> {
  me = user
  draft = draftFromUser(user)
  closeAuthModal()
  if (pendingSave) {
    const payload = pendingSave
    pendingSave = null
    try {
      me = await api<Me>('/api/profile', { method: 'PUT', body: JSON.stringify(payload) })
      draft = draftFromUser(me)
    } catch {
      // 保存失败不阻塞登录，用户可在设置里重试
    }
  }
  renderApp()
}

// ---------- 贷款计算页 ----------
function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 单笔贷款的还款测算：等额本息每月固定，等额本金首月最高、逐月递减
function loanSchedule(P: number, annualRate: number, months: number, method: RepayMethod) {
  const r = annualRate / 100 / 12
  if (method === 'annuity') {
    const pay = r === 0 ? P / months : (P * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
    return { first: pay, last: pay, decrease: 0, totalInterest: pay * months - P, totalPay: pay * months }
  }
  const principalMonthly = P / months
  return {
    first: principalMonthly + P * r,
    last: principalMonthly + principalMonthly * r,
    decrease: principalMonthly * r,
    totalInterest: ((months + 1) / 2) * P * r,
    totalPay: P + ((months + 1) / 2) * P * r,
  }
}

function renderLoanPage(main: HTMLElement): void {
  main.innerHTML = `
  <section class="hero">
    <p class="caption-uppercase">LOAN CALC</p>
    <h1 class="display-lg">岁月与月供</h1>
  </section>
  <section class="card settings-card">
    <div class="loan-rows">
      <div class="loan-row">
        <div class="field">
          <span class="field-label">贷款类型</span>
          <div class="seg-tabs" id="loan-type-tabs">
            <button class="seg-tab${loan.type === 'commercial' ? ' active' : ''}" data-type="commercial" type="button">商业贷</button>
            <button class="seg-tab${loan.type === 'fund' ? ' active' : ''}" data-type="fund" type="button">公积金贷</button>
            <button class="seg-tab${loan.type === 'combo' ? ' active' : ''}" data-type="combo" type="button">组合贷</button>
          </div>
        </div>
      </div>
      <div class="loan-row">
        <div class="field">
          <span class="field-label">还款方式</span>
          <div class="seg-tabs" id="repay-tabs">
            <button class="seg-tab${loan.repay === 'annuity' ? ' active' : ''}" data-repay="annuity" type="button">等额本息</button>
            <button class="seg-tab${loan.repay === 'principal' ? ' active' : ''}" data-repay="principal" type="button">等额本金</button>
          </div>
        </div>
      </div>
      <div id="loan-fields"></div>
    </div>
  </section>
  <section class="stats-grid" id="loan-results"></section>`

  const typeTabs = document.getElementById('loan-type-tabs')!
  typeTabs.querySelectorAll<HTMLButtonElement>('.seg-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      loan.type = btn.dataset.type as LoanType
      typeTabs.querySelectorAll('.seg-tab').forEach((b) => b.classList.toggle('active', b === btn))
      renderLoanFields()
      renderLoanResults()
    })
  })
  const repayTabs = document.getElementById('repay-tabs')!
  repayTabs.querySelectorAll<HTMLButtonElement>('.seg-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      loan.repay = btn.dataset.repay as RepayMethod
      repayTabs.querySelectorAll('.seg-tab').forEach((b) => b.classList.toggle('active', b === btn))
      renderLoanResults()
    })
  })

  renderLoanFields()
  renderLoanResults()
}

function renderLoanFields(): void {
  const wrap = document.getElementById('loan-fields')!
  const moneyField = (id: string, label: string, value: number) => `
    <label class="field">
      <span class="field-label">${label}</span>
      <input type="number" id="${id}" min="1" max="10000" step="1" required value="${value}" />
    </label>`
  const rateField = (id: string, label: string, value: number) => `
    <label class="field">
      <span class="field-label">${label}</span>
      <input type="text" inputmode="decimal" id="${id}" required value="${value.toFixed(2)}" />
    </label>`
  const termField = `
    <label class="field">
      <span class="field-label">期限（年）</span>
      <input type="number" id="loan-term" min="5" max="40" step="1" required value="${loan.term}" />
    </label>`

  if (loan.type === 'combo') {
    wrap.innerHTML = `
      <div class="loan-row">
        ${moneyField('loan-c-amount', '商贷金额（万）', loan.cAmount)}
        ${moneyField('loan-f-amount', '公积金金额（万）', loan.fAmount)}
      </div>
      <div class="loan-row">${termField}</div>
      <div class="loan-row">
        ${rateField('loan-rate-c', '商贷年利率（%）', loan.rateCommercial)}
        ${rateField('loan-rate-f', '公积金年利率（%）', loan.rateFund)}
      </div>`
  } else {
    wrap.innerHTML = `
      <div class="loan-row">${moneyField('loan-amount', '贷款金额（万）', loan.amount)}</div>
      <div class="loan-row">${termField}</div>
      <div class="loan-row">${rateField('loan-rate', '年利率（%）', loan.type === 'fund' ? loan.rateFund : loan.rateCommercial)}</div>`
  }

  // 不同贷款类型的字段不同，绑定前先确认节点存在
  const bindNum = (id: string, apply: (v: number) => void) => {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('change', (e) => {
      const v = Number((e.target as HTMLInputElement).value)
      if (Number.isFinite(v) && v > 0) apply(v)
      renderLoanResults()
    })
  }
  // 利率：0.05 最小单位、固定展示两位小数；非法输入回退为当前值
  const bindRate = (id: string, get: () => number, set: (v: number) => void) => {
    const el = document.getElementById(id) as HTMLInputElement | null
    if (!el) return
    el.addEventListener('change', () => {
      const v = Number(el.value)
      if (Number.isFinite(v) && v >= 0 && v <= 24) {
        const snapped = Number((Math.round(v / 0.05) * 0.05).toFixed(2))
        set(snapped)
        el.value = snapped.toFixed(2)
      } else {
        el.value = get().toFixed(2)
      }
      renderLoanResults()
    })
  }
  bindNum('loan-amount', (v) => (loan.amount = Math.min(v, 100000)))
  bindNum('loan-c-amount', (v) => (loan.cAmount = Math.min(v, 100000)))
  bindNum('loan-f-amount', (v) => (loan.fAmount = Math.min(v, 100000)))
  // 期限范围 5-40 年，越界自动吸附
  const termEl = document.getElementById('loan-term') as HTMLInputElement | null
  if (termEl)
    termEl.addEventListener('change', () => {
      const v = Number(termEl.value)
      loan.term = Math.min(Math.max(Math.round(Number.isFinite(v) ? v : loan.term), 5), 40)
      termEl.value = String(loan.term)
      renderLoanResults()
    })
  bindRate(
    'loan-rate',
    () => (loan.type === 'fund' ? loan.rateFund : loan.rateCommercial),
    (v) => {
      if (loan.type === 'fund') loan.rateFund = v
      else loan.rateCommercial = v
    },
  )
  bindRate(
    'loan-rate-c',
    () => loan.rateCommercial,
    (v) => (loan.rateCommercial = v),
  )
  bindRate(
    'loan-rate-f',
    () => loan.rateFund,
    (v) => (loan.rateFund = v),
  )
}

function renderLoanResults(): void {
  const wrap = document.getElementById('loan-results')
  if (!wrap) return
  const parts: Array<{ P: number; rate: number }> = []
  if (loan.type === 'commercial') parts.push({ P: loan.amount * 10000, rate: loan.rateCommercial })
  else if (loan.type === 'fund') parts.push({ P: loan.amount * 10000, rate: loan.rateFund })
  else {
    parts.push({ P: loan.cAmount * 10000, rate: loan.rateCommercial })
    parts.push({ P: loan.fAmount * 10000, rate: loan.rateFund })
  }
  const months = loan.term * 12
  const sum = parts.reduce(
    (acc, p) => {
      const s = loanSchedule(p.P, p.rate, months, loan.repay)
      return {
        first: acc.first + s.first,
        last: acc.last + s.last,
        decrease: acc.decrease + s.decrease,
        totalInterest: acc.totalInterest + s.totalInterest,
        totalPay: acc.totalPay + s.totalPay,
      }
    },
    { first: 0, last: 0, decrease: 0, totalInterest: 0, totalPay: 0 },
  )

  const isAnnuity = loan.repay === 'annuity'
  const payLabel = isAnnuity ? '每月月供' : '首月月供'
  const payNote = isAnnuity
    ? `每月固定，共 ${fmtInt(months)} 期`
    : `末月 ${fmtMoney(sum.last)} 元 · 每月递减约 ${fmtMoney(sum.decrease)} 元`
  const typeNote =
    loan.type === 'combo'
      ? `组合贷：商业 ${loan.cAmount} 万 + 公积金 ${loan.fAmount} 万`
      : `${loan.type === 'fund' ? '公积金贷' : '商业贷'} · 年利率 ${loan.type === 'fund' ? loan.rateFund : loan.rateCommercial}%`

  wrap.innerHTML = `
    <article class="card feature-card">
      <p class="card-label">${payLabel}</p>
      <p class="stat-num"><span id="loan-payment">${fmtMoney(sum.first)}</span><span class="stat-unit">元</span></p>
      <p class="stat-note">${payNote}</p>
    </article>
    <article class="card feature-card">
      <p class="card-label">利息总额</p>
      <p class="stat-num"><span id="loan-interest">${fmtMoney(sum.totalInterest)}</span><span class="stat-unit">元</span></p>
      <p class="stat-note">${typeNote} · ${loan.term} 年</p>
    </article>
    <article class="card feature-card">
      <p class="card-label">还款总额</p>
      <p class="stat-num"><span id="loan-total">${fmtMoney(sum.totalPay)}</span><span class="stat-unit">元</span></p>
      <p class="stat-note">本金 + 利息 · 本息合计</p>
    </article>`
}

// ---------- 个税计算页 ----------
type Bracket = { limit: number; rate: number; quick: number }

// 综合所得年度税率表（金额单位：元，rate 为 %）
const ANNUAL_BRACKETS: Bracket[] = [
  { limit: 36000, rate: 3, quick: 0 },
  { limit: 144000, rate: 10, quick: 2520 },
  { limit: 300000, rate: 20, quick: 16920 },
  { limit: 420000, rate: 25, quick: 31920 },
  { limit: 660000, rate: 30, quick: 52920 },
  { limit: 960000, rate: 35, quick: 85920 },
  { limit: Number.POSITIVE_INFINITY, rate: 45, quick: 181920 },
]

// 按月换算税率表（年终奖单独计税，按奖金 ÷ 12 定档，速算扣除只减一次）
const MONTHLY_BRACKETS: Bracket[] = [
  { limit: 3000, rate: 3, quick: 0 },
  { limit: 12000, rate: 10, quick: 210 },
  { limit: 25000, rate: 20, quick: 1410 },
  { limit: 35000, rate: 25, quick: 2660 },
  { limit: 55000, rate: 30, quick: 4410 },
  { limit: 80000, rate: 35, quick: 7160 },
  { limit: Number.POSITIVE_INFINITY, rate: 45, quick: 15160 },
]

function bracketFor(amount: number, brackets: Bracket[]): Bracket {
  return brackets.find((b) => amount <= b.limit) ?? brackets[brackets.length - 1]
}

function taxOf(taxable: number, bracket: Bracket): number {
  return Math.max(taxable * (bracket.rate / 100) - bracket.quick, 0)
}

// 综合所得（工资薪金）：年度测算 + 累计预扣法逐月明细
function salaryCalc() {
  const income = tax.salary * 12
  const ins = tax.insurance * 12
  const ded = tax.deduction * 12
  const taxable = Math.max(income - 60000 - ins - ded, 0)
  const bracket = bracketFor(taxable, ANNUAL_BRACKETS)
  const annualTax = taxOf(taxable, bracket)
  const net = income - ins - annualTax

  // 逐月累计预扣：累计应纳税所得额跨档时当月税额抬升
  const monthlyBase = tax.salary - tax.insurance - tax.deduction
  const months: Array<{ month: number; cumTaxable: number; tax: number; takeHome: number }> = []
  let cumTax = 0
  let lastTax = 0
  for (let m = 1; m <= 12; m++) {
    const cumTaxable = Math.max(monthlyBase * m - 5000 * m, 0)
    const cum = taxOf(cumTaxable, bracketFor(cumTaxable, ANNUAL_BRACKETS))
    const monthTax = Math.max(cum - cumTax, 0)
    cumTax = cum
    lastTax = monthTax
    months.push({ month: m, cumTaxable, tax: monthTax, takeHome: monthlyBase - monthTax })
  }
  return { income, ins, ded, taxable, bracket, annualTax, net, months, lastTax }
}

function bonusTaxOf(bonus: number): number {
  return taxOf(bonus, bracketFor(bonus / 12, MONTHLY_BRACKETS))
}

// 年终奖盲区：区间内多发不多得（速算扣除只减一次所致）
function bonusTrapZone(bonus: number): { lower: number; upper: number } | null {
  for (let i = 0; i < MONTHLY_BRACKETS.length - 1; i++) {
    const cur = MONTHLY_BRACKETS[i]
    const next = MONTHLY_BRACKETS[i + 1]
    const lower = cur.limit * 12
    if (bonus <= lower) break
    const upper = Math.round(
      ((lower * (1 - cur.rate / 100) + cur.quick - next.quick) / (1 - next.rate / 100)) * 100,
    ) / 100
    if (bonus <= upper) return { lower, upper }
  }
  return null
}

function renderTaxPage(main: HTMLElement): void {
  main.innerHTML = `
  <section class="hero">
    <p class="caption-uppercase">TAX CALC</p>
    <h1 class="display-lg">税前与到手</h1>
  </section>
  <section class="card settings-card tax-settings">
    <div class="loan-rows">
      <div class="loan-row">
        <div class="field">
          <span class="field-label">所得类型</span>
          <div class="seg-tabs" id="tax-mode-tabs">
            <button class="seg-tab${tax.mode === 'salary' ? ' active' : ''}" data-mode="salary" type="button">综合所得</button>
            <button class="seg-tab${tax.mode === 'bonus' ? ' active' : ''}" data-mode="bonus" type="button">年终奖</button>
          </div>
        </div>
      </div>
      <div id="tax-fields"></div>
    </div>
  </section>
  <section class="stats-grid" id="tax-results"></section>
  <section class="card dark-card" id="tax-detail" hidden></section>`

  const modeTabs = document.getElementById('tax-mode-tabs')!
  modeTabs.querySelectorAll<HTMLButtonElement>('.seg-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      tax.mode = btn.dataset.mode as TaxMode
      modeTabs.querySelectorAll('.seg-tab').forEach((b) => b.classList.toggle('active', b === btn))
      renderTaxFields()
      renderTaxResults()
    })
  })

  renderTaxFields()
  renderTaxResults()
}

function renderTaxFields(): void {
  const wrap = document.getElementById('tax-fields')!
  const numField = (id: string, label: string, value: number, step = 100) => `
    <label class="field">
      <span class="field-label">${label}</span>
      <input type="number" id="${id}" min="0" max="10000000" step="${step}" required value="${value}" />
    </label>`
  const salaryFields = `
      <div class="loan-row cols-3">
        ${numField('tax-salary', '税前月薪', tax.salary)}
        ${numField('tax-insurance', '五险一金', tax.insurance)}
        ${numField('tax-deduction', '专项附加', tax.deduction)}
      </div>`

  // 年终奖与综合所得共用月薪参数，便于对比两种计税方式
  wrap.innerHTML =
    tax.mode === 'salary'
      ? salaryFields
      : `<div class="loan-row cols-4">
          ${numField('tax-bonus', '年终奖', tax.bonus, 1000)}
          ${numField('tax-salary', '税前月薪', tax.salary)}
          ${numField('tax-insurance', '五险一金', tax.insurance)}
          ${numField('tax-deduction', '专项附加', tax.deduction)}
        </div>`

  const bindNum = (id: string, apply: (v: number) => void) => {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('change', () => {
      const v = Number((el as HTMLInputElement).value)
      if (Number.isFinite(v) && v >= 0) apply(Math.min(v, 10000000))
      renderTaxResults()
    })
  }
  bindNum('tax-salary', (v) => (tax.salary = v))
  bindNum('tax-insurance', (v) => (tax.insurance = v))
  bindNum('tax-deduction', (v) => (tax.deduction = v))
  bindNum('tax-bonus', (v) => (tax.bonus = v))
}

function renderTaxResults(): void {
  const wrap = document.getElementById('tax-results')
  const detail = document.getElementById('tax-detail')
  if (!wrap || !detail) return

  if (tax.mode === 'salary') {
    const s = salaryCalc()
    const rateNote =
      s.taxable > 0
        ? `边际税率 ${s.bracket.rate}% · 应纳税所得额 ${fmtMoney(s.taxable)} 元/年`
        : '应纳税所得额为 0，暂无需缴税'
    wrap.innerHTML = `
      <article class="card feature-card">
        <p class="card-label">月均个税</p>
        <p class="stat-num"><span>${fmtMoney(s.annualTax / 12)}</span><span class="stat-unit">元</span></p>
        <p class="stat-note">全年 ${fmtMoney(s.annualTax)} 元 · 累计预扣法</p>
      </article>
      <article class="card feature-card">
        <p class="card-label">月均到手</p>
        <p class="stat-num"><span>${fmtMoney(s.net / 12)}</span><span class="stat-unit">元</span></p>
        <p class="stat-note">全年到手 ${fmtMoney(s.net)} 元</p>
      </article>
      <article class="card feature-card">
        <p class="card-label">有效税率</p>
        <p class="stat-num"><span>${s.income > 0 ? ((s.annualTax / s.income) * 100).toFixed(2) : '0.00'}</span><span class="stat-unit">%</span></p>
        <p class="stat-note">${rateNote}</p>
      </article>`

    detail.hidden = false
    detail.innerHTML = `
      <div class="dark-head">
        <p class="dark-title">全年预扣节奏</p>
        <p class="dark-pct">${fmtMoney(s.lastTax)}<span class="dark-pct-unit"> 12 月税额</span></p>
      </div>
      <table class="tax-table">
        <thead><tr><th>月份</th><th>累计应纳税所得额</th><th>当月个税</th><th>当月到手</th></tr></thead>
        <tbody>
          ${s.months
            .map(
              (m) => `
          <tr>
            <td>${m.month} 月</td>
            <td>${fmtMoney(m.cumTaxable)}</td>
            <td>${fmtMoney(m.tax)}</td>
            <td>${fmtMoney(m.takeHome)}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <p class="dark-note">应纳税所得额 = 全年收入 − 6 万减除费用 − 五险一金 − 专项附加；税率跳档时当月个税抬升，前低后高属正常现象。</p>`
    return
  }

  // 年终奖：单独计税 vs 并入综合所得
  const bonus = tax.bonus
  const sepBracket = bracketFor(bonus / 12, MONTHLY_BRACKETS)
  const sepTax = bonusTaxOf(bonus)
  const sepNet = bonus - sepTax
  const s = salaryCalc()
  const mergedTaxable = s.taxable + bonus
  const incTax = Math.max(taxOf(mergedTaxable, bracketFor(mergedTaxable, ANNUAL_BRACKETS)) - s.annualTax, 0)
  const trap = bonusTrapZone(bonus)
  const saving = Math.abs(sepTax - incTax)
  const sepBetter = sepTax <= incTax

  const netNote = trap
    ? `多发盲区：改发 ${fmtMoney(trap.lower)} 元，到手可多 ${fmtMoney(Math.max(trap.lower - bonusTaxOf(trap.lower) - sepNet, 0))} 元`
    : bonus > 0
      ? `到手占奖金 ${((sepNet / bonus) * 100).toFixed(1)}%`
      : '输入年终奖金额开始计算'
  const mergeNote =
    saving < 0.005
      ? '两种方式个税相同'
      : `${sepBetter ? '单独计税更划算' : '并入综合所得更划算'}，可省 ${fmtMoney(saving)} 元`

  wrap.innerHTML = `
    <article class="card feature-card">
      <p class="card-label">单独计税 · 个税</p>
      <p class="stat-num"><span>${fmtMoney(sepTax)}</span><span class="stat-unit">元</span></p>
      <p class="stat-note">税率 ${sepBracket.rate}% · 速算扣除 ${fmtInt(sepBracket.quick)} 元</p>
    </article>
    <article class="card feature-card">
      <p class="card-label">单独计税 · 到手</p>
      <p class="stat-num"><span>${fmtMoney(sepNet)}</span><span class="stat-unit">元</span></p>
      <p class="stat-note">${netNote}</p>
    </article>
    <article class="card feature-card">
      <p class="card-label">并入综合所得 · 增税</p>
      <p class="stat-num"><span>${fmtMoney(incTax)}</span><span class="stat-unit">元</span></p>
      <p class="stat-note">${mergeNote}</p>
    </article>`
  detail.hidden = true
}

// ---------- 万年历页 ----------
// 公历节日（月-日）
const SOLAR_FEST: Record<string, string> = { '1-1': '元旦', '5-1': '劳动节', '10-1': '国庆节' }
// 农历节日（农历月-农历日，闰月不过）
const LUNAR_FEST: Record<string, string> = { '1-1': '春节', '5-5': '端午', '8-15': '中秋' }

function lunarOf(date: Date): SolarLunarResult | -1 {
  return solarLunar.solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function renderCalendarPage(main: HTMLElement): void {
  main.innerHTML = `
  <section class="hero">
    <p class="caption-uppercase">ALMANAC</p>
    <h1 class="display-lg" id="cal-hero"></h1>
    <p class="hero-sub" id="cal-hero-sub"></p>
  </section>
  <section class="card settings-card cal-toolbar">
    <button id="cal-prev" class="btn btn-secondary" type="button" aria-label="上一月">‹</button>
    <select id="cal-year" aria-label="选择年份"></select>
    <span class="cal-unit">年</span>
    <select id="cal-month" aria-label="选择月份"></select>
    <span class="cal-unit">月</span>
    <button id="cal-next" class="btn btn-secondary" type="button" aria-label="下一月">›</button>
    <button id="cal-today" class="btn btn-secondary" type="button">回到今天</button>
  </section>
  <section class="card dark-card cal-card">
    <div class="cal-week">
      <span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span class="wk-end">六</span><span class="wk-end">日</span>
    </div>
    <div class="cal-grid" id="cal-grid"></div>
  </section>`

  document.getElementById('cal-prev')!.addEventListener('click', () => navMonth(-1))
  document.getElementById('cal-next')!.addEventListener('click', () => navMonth(1))
  document.getElementById('cal-today')!.addEventListener('click', goToday)

  // 年月下拉：1900-2100 任意跳转
  const yearSel = document.getElementById('cal-year') as HTMLSelectElement
  const monthSel = document.getElementById('cal-month') as HTMLSelectElement
  for (let y = 1900; y <= 2100; y++) yearSel.appendChild(new Option(String(y), String(y)))
  for (let m = 1; m <= 12; m++) monthSel.appendChild(new Option(String(m), String(m)))
  yearSel.addEventListener('change', () => {
    cal.y = Number(yearSel.value)
    renderCalGrid()
  })
  monthSel.addEventListener('change', () => {
    cal.m = Number(monthSel.value)
    renderCalGrid()
  })

  syncCalSelects()
  renderCalHero()
  renderCalGrid()
}

// 翻月/跳转后同步年月下拉的显示值
function syncCalSelects(): void {
  const yearSel = document.getElementById('cal-year') as HTMLSelectElement | null
  const monthSel = document.getElementById('cal-month') as HTMLSelectElement | null
  if (yearSel) yearSel.value = String(cal.y)
  if (monthSel) monthSel.value = String(cal.m)
}

// 顶部展示选中日期：阳历大字 + 星期/农历/干支生肖
function renderCalHero(): void {
  const [y, m, d] = cal.sel.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const res = lunarOf(date)
  if (res === -1) {
    setText('cal-hero', `${y} 年 ${m} 月 ${d} 日`)
    setText('cal-hero-sub', '农历换算支持 1900-2100 年')
    return
  }
  setText('cal-hero', `${y} 年 ${m} 月 ${d} 日`)
  setText('cal-hero-sub', `${res.ncWeek} · 农历${res.monthCn}${res.dayCn} · ${res.gzYear}${res.animal}年`)
}

function renderCalGrid(): void {
  const grid = document.getElementById('cal-grid')
  if (!grid) return
  const today = fmtDate(new Date())
  // 周一为第一列，补齐月初前的空位
  const lead = (new Date(cal.y, cal.m - 1, 1).getDay() + 6) % 7
  let html = ''
  for (let i = 0; i < 42; i++) {
    const date = new Date(cal.y, cal.m - 1, 1 - lead + i)
    const inMonth = date.getMonth() === cal.m - 1 && date.getFullYear() === cal.y
    const key = fmtDate(date)
    const jsDay = date.getDay()
    const cls = ['cal-cell']
    if (!inMonth) cls.push('out')
    if (jsDay === 0 || jsDay === 6) cls.push('wk-end')
    if (key === today) cls.push('today')
    if (key === cal.sel) cls.push('selected')
    html += `<button class="${cls.join(' ')}" data-date="${key}" type="button">${calCellInner(date)}</button>`
  }
  grid.innerHTML = html
  grid.querySelectorAll<HTMLButtonElement>('.cal-cell').forEach((btn) => {
    btn.addEventListener('click', () => selectDay(btn.dataset.date!))
  })
}

// 单元格文字优先级：节日 > 节气 > 农历初一显月名 > 农历日
function calCellInner(date: Date): string {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const res = lunarOf(date)
  let label = '–'
  let cls = 'cal-lunar'
  if (res !== -1) {
    const fest = SOLAR_FEST[`${m}-${d}`] || (!res.isLeap && LUNAR_FEST[`${res.lMonth}-${res.lDay}`]) || ''
    if (fest) {
      label = fest
      cls += ' fest'
    } else if (res.term) {
      label = res.term
      cls += ' term'
    } else if (res.lDay === 1) {
      label = res.monthCn
    } else {
      label = res.dayCn
    }
  }
  return `<span class="cal-solar">${d}</span><span class="${cls}">${label}</span>`
}

function navMonth(delta: number): void {
  let m = cal.m + delta
  let y = cal.y
  if (m < 1) {
    m = 12
    y--
  } else if (m > 12) {
    m = 1
    y++
  }
  cal.y = y
  cal.m = m
  syncCalSelects()
  renderCalGrid()
}

function selectDay(key: string): void {
  cal.sel = key
  const [y, m] = key.split('-').map(Number)
  // 点击相邻月的日期时，视图切到对应月份
  if (y !== cal.y || m !== cal.m) {
    cal.y = y
    cal.m = m
    syncCalSelects()
  }
  renderCalHero()
  renderCalGrid()
}

function goToday(): void {
  const now = new Date()
  cal.y = now.getFullYear()
  cal.m = now.getMonth() + 1
  cal.sel = fmtDate(now)
  syncCalSelects()
  renderCalHero()
  renderCalGrid()
}

// ---------- 每秒刷新 ----------
function tick(): void {
  if (currentPage() !== 'life' || !draft.birthday) return
  const birth = parseDate(draft.birthday)
  const now = new Date()

  const { years, days } = ageParts(birth, now)
  const totalDays = Math.max(diffDays(birth, now), 0)
  const retireDate = addYears(birth, draft.retirement_age)
  const deathDate = addYears(birth, draft.life_expectancy)
  const totalLife = Math.max(diffDays(birth, deathDate), 1)
  const pctVal = Math.min(Math.max((totalDays / totalLife) * 100, 0), 100)
  const retirePct = Math.min(Math.max((diffDays(birth, retireDate) / totalLife) * 100, 0), 100)

  // 掩码态：个人数据显示 **/**/** 或 **；进度条与进度百分比不掩
  const maskDate = '**/**/**'
  const M = '**'
  setText('age-years', masked ? M : String(years))
  setText('age-days', masked ? M : String(days))
  setText('ticker-days', masked ? M : fmtInt(totalDays))
  setText('retire-label', masked ? maskDate : fmtDate(retireDate))
  setText('retire-days', masked ? M : fmtInt(Math.max(diffDays(now, retireDate), 0)))
  setText('life-label', masked ? maskDate : fmtDate(deathDate))
  setText('life-days', masked ? M : fmtInt(Math.max(diffDays(now, deathDate), 0)))

  setStyle('bar-fill', 'width', pctVal.toFixed(3) + '%')
  setStyle('bar-marker', 'left', retirePct.toFixed(3) + '%')
  setStyle('marker-label', 'left', Math.min(Math.max(retirePct, 10), 90).toFixed(3) + '%')
  setText('pct', masked ? M : pctVal.toFixed(2))
  setText('pct-detail', masked ? `${M} / ${M} 天` : `${fmtInt(totalDays)} / ${fmtInt(totalLife)} 天`)
  setText('pct-day', masked ? '**%' : `${((100 / totalLife) * 1).toFixed(4)}%`)
  setText('legend-birth', masked ? maskDate : draft.birthday)
  setText('legend-retire', masked ? maskDate : fmtDate(retireDate))
  setText('legend-death', masked ? maskDate : fmtDate(deathDate))
}

async function boot(): Promise<void> {
  applyTheme(currentTheme())
  window.addEventListener('hashchange', renderPage)
  try {
    me = await api<Me>('/api/me')
    draft = draftFromUser(me)
  } catch {
    me = null
    draft = loadDraftLocal() ?? defaultDraft()
  }
  renderApp()
}

void boot()
