// Calib 1.1.0 - калибровка экрана Amazfit Bip Max (Zepp OS)
//
// Система кладёт начало страницы (0,0) не в левый верхний угол стекла, а со сдвигом, поэтому
// у экрана есть и отрицательные координаты (в приложении таймера это DOWN = 33 и y < 0).
// Здесь сетка идёт от -100 до +100 за пределами 432x514, а видимую часть и рабочую область
// подбираешь кнопками. Все числа - в обычных пикселях страницы (designWidth = 432, px() не нужен).
// Правый и нижний края - координата ПЕРВОГО пикселя за областью (ширина = п - л, высота = н - в).

import { createWidget, widget, prop, align, setStatusBarVisible } from '@zos/ui'
import { setScrollLock } from '@zos/page'
import { getDeviceInfo } from '@zos/device'
import { setPageBrightTime, pauseDropWristScreenOff } from '@zos/display'
import { LocalStorage } from '@zos/storage'

const W = 432
const H = 514
// размеры поля, на котором нарисована сетка (с запасом во все стороны)
const GX0 = -100
const GX1 = W + 100
const GY0 = -100
const GY1 = H + 100
const OFFX = GX1 + 60 // куда прячем лишнее
const OFFY = GY1 + 60

// Где сидят кнопки (центр блока управления). Это предположение по сдвигам из приложения таймера
// (видимое окно примерно x -18..414, y -31..483); если окно другое, блок просто чуть сместится.
const UCX = 198
const UCY = 226

// Стартовые значения: видимая область - догадка по приложению таймера, рабочая - она же с отступом 20.
const DEF_S = { l: -18, t: -31, r: 414, b: 483 }
const INSET = 20
const MIN = 40

const C = {
  GREEN: 0x2ecc71,
  GRID: 0x1e9e50,
  GRID50: 0x0b6b30,
  LABEL: 0x00300f,
  S_EDGE: 0xff1744,
  S_CENTER: 0xffffff,
  A_CENTER: 0xffd600,
  TICK: 0xff00ff,
  HL: 0xff9100,
  BLACK: 0x000000,
  WHITE: 0xffffff,
  YELLOW: 0xffd600,
  CYAN: 0x4dd0e1,
  BTN: 0x333333,
  BTN_P: 0x666666,
  BTN5: 0x1f4fa3,
  BTN5_P: 0x3d73d6,
  ON: 0xe67e00,
  ON_P: 0xff9d2e,
  OFF: 0x2b2b2b,
  OFF_P: 0x555555
}

let store = null
try {
  store = new LocalStorage()
} catch (e) {}

let INFO = {}
try {
  INFO = getDeviceInfo() || {}
} catch (e) {}

function defA() {
  return { l: DEF_S.l + INSET, t: DEF_S.t + INSET, r: DEF_S.r - INSET, b: DEF_S.b - INSET }
}
const S = { l: DEF_S.l, t: DEF_S.t, r: DEF_S.r, b: DEF_S.b } // видимая область
const A = defA() // рабочая область (чёрная)
let mode = 0 // 0 - правим экран, 1 - правим рабочую область
let target = 4 // 0 лев, 1 верх, 2 прав, 3 низ, 4 вся рамка

const w = {} // ссылки на виджеты

// ---------- помощники ----------
function R(color, x, y, ww, hh) {
  return createWidget(widget.FILL_RECT, { x: x, y: y, w: ww, h: hh, color: color })
}
function dyn(color) {
  return R(color, OFFX, OFFY, 1, 1)
}
function RR(color, x, y, ww, hh, radius) {
  return createWidget(widget.FILL_RECT, { x: x, y: y, w: ww, h: hh, color: color, radius: radius })
}
function T(text, x, y, ww, hh, size, color, ah) {
  return createWidget(widget.TEXT, {
    x: x, y: y, w: ww, h: hh,
    text: text, text_size: size, color: color,
    align_h: ah === undefined ? align.CENTER_H : ah,
    align_v: align.CENTER_V
  })
}
function B(text, x, y, ww, hh, size, nc, pc, fn) {
  return createWidget(widget.BUTTON, {
    x: x, y: y, w: ww, h: hh,
    text: text, text_size: size, color: C.WHITE,
    normal_color: nc, press_color: pc, radius: 10,
    click_func: fn
  })
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}
function setBox(wd, x, y, ww, hh, show) {
  if (show === false || ww < 1 || hh < 1) {
    x = OFFX
    y = OFFY
    ww = ww < 1 ? 1 : ww
    hh = hh < 1 ? 1 : hh
  }
  try {
    wd.setProperty(prop.MORE, { x: x, y: y, w: ww, h: hh })
  } catch (e) {}
}
function setTxt(wd, s) {
  try {
    wd.setProperty(prop.TEXT, s)
  } catch (e) {}
}
function setBtn(wd, on) {
  try {
    wd.setProperty(prop.MORE, {
      normal_color: on ? C.ON : C.OFF,
      press_color: on ? C.ON_P : C.OFF_P
    })
  } catch (e) {}
}
// центральная линия: чётная ширина -> толщина te, нечётная -> to (всегда симметрично)
function centerLine(l, r, te, to) {
  if ((r - l) % 2 === 0) {
    return [(l + r) / 2 - te / 2, te]
  }
  return [(l + r - 1) / 2 - (to - 1) / 2, to]
}
function edgeRect(Q, i, th) {
  if (i === 0) return [Q.l, Q.t, th, Q.b - Q.t]
  if (i === 1) return [Q.l, Q.t, Q.r - Q.l, th]
  if (i === 2) return [Q.r - th, Q.t, th, Q.b - Q.t]
  return [Q.l, Q.b - th, Q.r - Q.l, th]
}

// ---------- сохранение (чтобы цифры не пропадали при выходе и при гаснущем экране) ----------
function save() {
  try {
    store.setItem('cal', JSON.stringify({ S: S, A: A, mode: mode, target: target }))
  } catch (e) {}
}
function okRect(Q, lim) {
  return Q && isFinite(Q.l) && isFinite(Q.t) && isFinite(Q.r) && isFinite(Q.b) &&
    Q.l >= lim.l && Q.t >= lim.t && Q.r <= lim.r && Q.b <= lim.b &&
    Q.r - Q.l >= MIN && Q.b - Q.t >= MIN
}
function load() {
  try {
    const raw = store.getItem('cal', '')
    if (!raw) return
    const o = JSON.parse(raw)
    const lim = { l: GX0, t: GY0, r: GX1, b: GY1 }
    if (okRect(o.S, lim) && okRect(o.A, o.S)) {
      S.l = o.S.l; S.t = o.S.t; S.r = o.S.r; S.b = o.S.b
      A.l = o.A.l; A.t = o.A.t; A.r = o.A.r; A.b = o.A.b
      mode = o.mode === 1 ? 1 : 0
      target = o.target >= 0 && o.target <= 4 ? o.target : 4
    }
  } catch (e) {}
}

// ---------- логика ----------
function fitA() {
  A.l = Math.max(A.l, S.l)
  A.t = Math.max(A.t, S.t)
  A.r = Math.min(A.r, S.r)
  A.b = Math.min(A.b, S.b)
  if (A.r - A.l < MIN) A.r = Math.min(S.r, A.l + MIN)
  if (A.b - A.t < MIN) A.b = Math.min(S.b, A.t + MIN)
}

function move(dx, dy, step) {
  const Q = mode === 0 ? S : A
  const lim = mode === 0 ? { l: GX0, t: GY0, r: GX1, b: GY1 } : S
  const ddx = dx * step
  const ddy = dy * step
  if (target === 4) {
    const ww = Q.r - Q.l
    const hh = Q.b - Q.t
    const nl = clamp(Q.l + ddx, lim.l, lim.r - ww)
    const nt = clamp(Q.t + ddy, lim.t, lim.b - hh)
    Q.l = nl
    Q.r = nl + ww
    Q.t = nt
    Q.b = nt + hh
  } else if (target === 0 && ddx) {
    Q.l = clamp(Q.l + ddx, lim.l, Q.r - MIN)
  } else if (target === 2 && ddx) {
    Q.r = clamp(Q.r + ddx, Q.l + MIN, lim.r)
  } else if (target === 1 && ddy) {
    Q.t = clamp(Q.t + ddy, lim.t, Q.b - MIN)
  } else if (target === 3 && ddy) {
    Q.b = clamp(Q.b + ddy, Q.t + MIN, lim.b)
  }
  if (mode === 0) fitA()
  refresh()
}

function centerA() {
  let ww = A.r - A.l
  let hh = A.b - A.t
  if ((S.r - S.l - ww) % 2 !== 0) ww -= 1
  if ((S.b - S.t - hh) % 2 !== 0) hh -= 1
  A.l = S.l + (S.r - S.l - ww) / 2
  A.t = S.t + (S.b - S.t - hh) / 2
  A.r = A.l + ww
  A.b = A.t + hh
  refresh()
}

function resetAll() {
  S.l = DEF_S.l; S.t = DEF_S.t; S.r = DEF_S.r; S.b = DEF_S.b
  const a = defA()
  A.l = a.l; A.t = a.t; A.r = a.r; A.b = a.b
  refresh()
}

function fmt(Q) {
  return 'л' + Q.l + ' в' + Q.t + ' п' + Q.r + ' н' + Q.b + ' ' + (Q.r - Q.l) + 'x' + (Q.b - Q.t)
}
const EDGE_NAMES = ['левый край', 'верхний край', 'правый край', 'нижний край', 'вся рамка']

// ---------- отрисовка ----------
const XS = []
for (let v = -100; v <= 500; v += 50) XS.push(v)
const YS = []
for (let v = -100; v <= 600; v += 50) YS.push(v)
let lastLabelKey = ''

// подписи координат бегут за краями видимой области, чтобы всегда были на виду
function updateLabels() {
  const key = S.l + ',' + S.t + ',' + S.r + ',' + S.b
  if (key === lastLabelKey) return
  lastLabelKey = key
  for (let i = 0; i < XS.length; i++) {
    const v = XS[i]
    const show = v + 2 >= S.l + 46 && v + 38 <= S.r - 46
    setBox(w.lxT[i], v + 2, S.t + 3, 36, 16, show)
    setBox(w.lxB[i], v + 2, S.b - 19, 36, 16, show)
  }
  for (let i = 0; i < YS.length; i++) {
    const v = YS[i]
    const show = v + 2 >= S.t + 22 && v + 18 <= S.b - 22
    setBox(w.lyL[i], S.l + 3, v + 2, 40, 16, show)
    setBox(w.lyR[i], S.r - 43, v + 2, 40, 16, show)
  }
}

function refresh() {
  setBox(w.aRect, A.l, A.t, A.r - A.l, A.b - A.t)

  // всё, что вне видимой области, закрашиваем чёрным
  setBox(w.mask[0], GX0, GY0, GX1 - GX0, S.t - GY0)
  setBox(w.mask[1], GX0, S.b, GX1 - GX0, GY1 - S.b)
  setBox(w.mask[2], GX0, S.t, S.l - GX0, S.b - S.t)
  setBox(w.mask[3], S.r, S.t, GX1 - S.r, S.b - S.t)

  updateLabels()

  // центральные линии
  const sx = centerLine(S.l, S.r, 4, 3)
  const sy = centerLine(S.t, S.b, 4, 3)
  setBox(w.sV, sx[0], S.t, sx[1], S.b - S.t)
  setBox(w.sH, S.l, sy[0], S.r - S.l, sy[1])
  const ax = centerLine(A.l, A.r, 2, 1)
  const ay = centerLine(A.t, A.b, 2, 1)
  setBox(w.aV, ax[0], A.t, ax[1], A.b - A.t)
  setBox(w.aH, A.l, ay[0], A.r - A.l, ay[1])

  // красные линии по краям видимой области
  for (let i = 0; i < 4; i++) {
    const e = edgeRect(S, i, 2)
    setBox(w.sE[i], e[0], e[1], e[2], e[3])
  }

  // подсветка редактируемого края
  const Q = mode === 0 ? S : A
  for (let i = 0; i < 4; i++) {
    if (target === 4 || target === i) {
      const e = edgeRect(Q, i, target === 4 ? 2 : 5)
      setBox(w.hl[i], e[0], e[1], e[2], e[3])
    } else {
      setBox(w.hl[i], 0, 0, 0, 0)
    }
  }

  // уголки рабочей области
  const L = 16
  const th = 3
  setBox(w.tk[0], A.l, A.t, L, th)
  setBox(w.tk[1], A.l, A.t, th, L)
  setBox(w.tk[2], A.r - L, A.t, L, th)
  setBox(w.tk[3], A.r - th, A.t, th, L)
  setBox(w.tk[4], A.l, A.b - th, L, th)
  setBox(w.tk[5], A.l, A.b - L, th, L)
  setBox(w.tk[6], A.r - L, A.b - th, L, th)
  setBox(w.tk[7], A.r - th, A.b - L, th, L)

  // числа
  setTxt(w.t0, 'Правим: ' + (mode === 0 ? 'ЭКРАН' : 'РАБОЧУЮ') + ' - ' + EDGE_NAMES[target])
  setTxt(w.t1, 'Эк  ' + fmt(S))
  setTxt(w.t2, 'Раб ' + fmt(A))
  setTxt(w.t3, 'Поля л' + (A.l - S.l) + ' в' + (A.t - S.t) + ' п' + (S.r - A.r) + ' н' + (S.b - A.b))

  // кнопки
  setBtn(w.m0, mode === 0)
  setBtn(w.m1, mode === 1)
  for (let i = 0; i < 5; i++) setBtn(w.tg[i], target === i)

  save()
}

function draw() {
  lastLabelKey = ''
  const cx = UCX
  const cy = UCY

  // 1. фон и рабочая область
  R(C.GREEN, GX0, GY0, GX1 - GX0, GY1 - GY0)
  w.aRect = R(C.BLACK, A.l, A.t, A.r - A.l, A.b - A.t)

  // 2. сетка 10 px (каждая пятая линия толще и темнее); линия на x = 0 - это первый пиксель страницы
  for (let x = GX0; x < GX1; x += 10) {
    const major = x % 50 === 0
    R(major ? C.GRID50 : C.GRID, x, GY0, major ? 2 : 1, GY1 - GY0)
  }
  for (let y = GY0; y < GY1; y += 10) {
    const major = y % 50 === 0
    R(major ? C.GRID50 : C.GRID, GX0, y, GX1 - GX0, major ? 2 : 1)
  }

  // 3. подписи координат каждые 50 px (по краям видимой области, двигаются вместе с ней)
  w.lxT = []
  w.lxB = []
  w.lyL = []
  w.lyR = []
  for (let i = 0; i < XS.length; i++) {
    w.lxT.push(T(String(XS[i]), OFFX, OFFY, 36, 16, 14, C.LABEL, align.LEFT))
    w.lxB.push(T(String(XS[i]), OFFX, OFFY, 36, 16, 14, C.LABEL, align.LEFT))
  }
  for (let i = 0; i < YS.length; i++) {
    w.lyL.push(T(String(YS[i]), OFFX, OFFY, 40, 16, 14, C.LABEL, align.LEFT))
    w.lyR.push(T(String(YS[i]), OFFX, OFFY, 40, 16, 14, C.LABEL, align.RIGHT))
  }

  // 4. чёрные маски вне видимой области
  w.mask = [dyn(C.BLACK), dyn(C.BLACK), dyn(C.BLACK), dyn(C.BLACK)]

  // 5. центральные линии, края, уголки
  w.sV = dyn(C.S_CENTER)
  w.sH = dyn(C.S_CENTER)
  w.aV = dyn(C.A_CENTER)
  w.aH = dyn(C.A_CENTER)
  w.sE = [dyn(C.S_EDGE), dyn(C.S_EDGE), dyn(C.S_EDGE), dyn(C.S_EDGE)]
  w.hl = [dyn(C.HL), dyn(C.HL), dyn(C.HL), dyn(C.HL)]
  w.tk = []
  for (let i = 0; i < 8; i++) w.tk.push(dyn(C.TICK))

  // 6. панель с числами
  RR(C.BLACK, cx - 160, cy - 213, 320, 92, 12)
  w.t0 = T('', cx - 156, cy - 211, 312, 22, 17, C.WHITE)
  w.t1 = T('', cx - 156, cy - 189, 312, 22, 17, C.WHITE)
  w.t2 = T('', cx - 156, cy - 167, 312, 22, 17, C.YELLOW)
  w.t3 = T('', cx - 156, cy - 145, 312, 22, 17, C.CYAN)

  // 7. режимы
  w.m0 = B('ЭКРАН', cx - 154, cy - 107, 126, 56, 20, C.ON, C.ON_P, function () {
    mode = 0
    refresh()
  })
  w.m1 = B('РАБОЧАЯ', cx + 28, cy - 107, 126, 56, 20, C.OFF, C.OFF_P, function () {
    mode = 1
    refresh()
  })

  // 8. крестовина: внешняя стрелка = 1 px, внутренняя (к центру) = 5 px
  const g = 28 // зазор от центра (там видно пересечение центральных линий)
  const s = 44
  const hw = s / 2
  B('<', cx - g - 2 * s - 2, cy - hw, s, s, 26, C.BTN, C.BTN_P, function () { move(-1, 0, 1) })
  B('<<', cx - g - s, cy - hw, s, s, 24, C.BTN5, C.BTN5_P, function () { move(-1, 0, 5) })
  B('>>', cx + g, cy - hw, s, s, 24, C.BTN5, C.BTN5_P, function () { move(1, 0, 5) })
  B('>', cx + g + s + 2, cy - hw, s, s, 26, C.BTN, C.BTN_P, function () { move(1, 0, 1) })
  B('^', cx - hw, cy - g - 2 * s - 2, s, s, 26, C.BTN, C.BTN_P, function () { move(0, -1, 1) })
  B('^^', cx - hw, cy - g - s, s, s, 24, C.BTN5, C.BTN5_P, function () { move(0, -1, 5) })
  B('vv', cx - hw, cy + g, s, s, 24, C.BTN5, C.BTN5_P, function () { move(0, 1, 5) })
  B('v', cx - hw, cy + g + s + 2, s, s, 26, C.BTN, C.BTN_P, function () { move(0, 1, 1) })

  // 9. сервисные кнопки
  B('Сброс', cx - 154, cy + 43, 126, 56, 20, C.BTN, C.BTN_P, resetAll)
  B('Центр', cx + 28, cy + 43, 126, 56, 20, C.BTN, C.BTN_P, centerA)

  // 10. выбор края
  const names = ['Лев', 'Верх', 'Прав', 'Низ', 'Все']
  w.tg = []
  for (let i = 0; i < 5; i++) {
    ;(function (k) {
      w.tg.push(B(names[k], cx - 147 + k * 60, cy + 131, 54, 40, 17, C.OFF, C.OFF_P, function () {
        target = k
        refresh()
      }))
    })(i)
  }

  // 11. диагностика: что система сообщает об экране
  RR(C.BLACK, cx - 160, cy + 178, 320, 22, 8)
  T('система: ' + (INFO.width || '?') + 'x' + (INFO.height || '?') + ' ' + (INFO.deviceName || ''),
    cx - 156, cy + 178, 312, 22, 14, C.WHITE)
}

Page({
  build() {
    try { setStatusBarVisible(false) } catch (e) {}
    try { setScrollLock({ lock: true }) } catch (e) {}
    try { setPageBrightTime({ brightTime: 600000 }) } catch (e) {}
    try { pauseDropWristScreenOff({ duration: 600000 }) } catch (e) {}
    load()
    draw()
    refresh()
  }
})
