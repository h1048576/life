import './style.css'

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

function currentPage(): 'life' | 'loan' {
  return location.hash === '#loan' ? 'loan' : 'life'
}

function defaultDraft(): Draft {
  return { birthday: '2001-01-01', retirement_age: 60, life_expectancy: 100 }
}

const mark = `<svg class="mark" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`

const mark15 = mark.replace('width="18" height="18"', 'width="15" height="15"')

const calcIcon15 = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>`

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
      <a class="nav-link${currentPage() === 'life' ? ' active' : ''}" href="#life">${mark15}生命刻度</a>
      <nav class="nav-menu">
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
  return currentPage() === 'loan'
    ? 'Loan Calc — 月供与总利息实时计算，贷前心里有数。'
    : 'Life in Days — 记录已走过的时间，珍惜剩下的每一天。'
}

function footerBrandHtml(): string {
  return currentPage() === 'loan'
    ? `${calcIcon15}<span>贷款计算</span>`
    : `${mark15}<span>生命刻度</span>`
}

function renderPage(): void {
  const main = document.getElementById('main')!
  if (currentPage() === 'loan') renderLoanPage(main)
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
      <p class="dark-title">生命进度</p>
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
    tick()
  })
  retireInput.addEventListener('change', () => {
    const v = Number(retireInput.value)
    if (Number.isFinite(v) && v >= 1) draft.retirement_age = Math.min(Math.round(v), 120)
    tick()
  })
  lifeInput.addEventListener('change', () => {
    const v = Number(lifeInput.value)
    if (Number.isFinite(v) && v >= 1) draft.life_expectancy = Math.min(Math.round(v), 150)
    tick()
  })

  document.getElementById('settings-form')!.addEventListener('submit', onSubmitSettings)
}

async function onSubmitSettings(e: Event): Promise<void> {
  e.preventDefault()
  const payload: Draft = {
    birthday: (document.getElementById('s-birthday') as HTMLInputElement).value,
    retirement_age: Number((document.getElementById('s-retire') as HTMLInputElement).value),
    life_expectancy: Number((document.getElementById('s-life') as HTMLInputElement).value),
  }
  draft = payload
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

// ---------- 每秒刷新 ----------
function tick(): void {
  if (currentPage() !== 'life' || !draft.birthday) return
  const birth = parseDate(draft.birthday)
  const now = new Date()

  const { years, days } = ageParts(birth, now)
  const totalDays = Math.max(diffDays(birth, now), 0)
  setText('age-years', String(years))
  setText('age-days', String(days))
  setText('ticker-days', fmtInt(totalDays))

  const retireDate = addYears(birth, draft.retirement_age)
  const deathDate = addYears(birth, draft.life_expectancy)
  setText('retire-label', fmtDate(retireDate))
  setText('life-label', fmtDate(deathDate))
  setText('retire-days', fmtInt(Math.max(diffDays(now, retireDate), 0)))
  setText('life-days', fmtInt(Math.max(diffDays(now, deathDate), 0)))

  const totalLife = Math.max(diffDays(birth, deathDate), 1)
  const pctVal = Math.min(Math.max((totalDays / totalLife) * 100, 0), 100)
  const retirePct = Math.min(Math.max((diffDays(birth, retireDate) / totalLife) * 100, 0), 100)
  setStyle('bar-fill', 'width', pctVal.toFixed(3) + '%')
  setStyle('bar-marker', 'left', retirePct.toFixed(3) + '%')
  setStyle('marker-label', 'left', Math.min(Math.max(retirePct, 10), 90).toFixed(3) + '%')
  setText('pct', pctVal.toFixed(2))
  setText('pct-detail', `${fmtInt(totalDays)} / ${fmtInt(totalLife)} 天`)
  setText('pct-day', `${((100 / totalLife) * 1).toFixed(4)}%`)
  setText('legend-birth', draft.birthday)
  setText('legend-retire', fmtDate(retireDate))
  setText('legend-death', fmtDate(deathDate))
}

async function boot(): Promise<void> {
  applyTheme(currentTheme())
  window.addEventListener('hashchange', renderPage)
  try {
    me = await api<Me>('/api/me')
    draft = draftFromUser(me)
  } catch {
    me = null
    draft = defaultDraft()
  }
  renderApp()
}

void boot()
