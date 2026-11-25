// Mediciones, capturas y recorridos del panel en Chrome (DevTools Protocol, sin dependencias nuevas).
//
//   node scripts/panel-check.mjs --base <url> --owner <token> --barber <token> --out <dir> [--only <sección>]
//
// - Corre contra `pnpm build && pnpm start`, con la base descartable del worktree: lee `DATABASE_URL` de `.env` y se
//   niega a correr si el nombre de la base no empieza con `barber_job_`.
// - `--owner` y `--barber` son cookies de sesión (`signSession`) del dueño y de un barbero de la MISMA barbería del
//   seed. El script borra y recrea los turnos y cortes de HOY de esa barbería: no depende de la hora ni del día.
// - Chrome por `CHROME_PATH`. El tamaño se fija con `Emulation.setDeviceMetricsOverride` (en Windows `--window-size`
//   no baja de unos 500 px). Perfil y puerto propios; todo termina con un timeout, también si falla.
// - Sale con 1 si algo falla.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import pg from "pg";

const GLOBAL_TIMEOUT_MS = 12 * 60_000;
const COMMAND_TIMEOUT_MS = 30_000;
const TZ = "America/Argentina/Buenos_Aires";
const GREEN = { primary: "#1b5e20", secondary: "#9a6700" };
const SLOW_MS = 2000;

const { values: args } = parseArgs({
  options: {
    base: { type: "string" },
    owner: { type: "string" },
    barber: { type: "string" },
    out: { type: "string" },
    only: { type: "string" },
  },
});
for (const name of ["base", "owner", "barber", "out"]) {
  if (!args[name]) fail(`Falta --${name}.`);
}
const base = args.base.replace(/\/$/, "");
mkdirSync(args.out, { recursive: true });

function fail(message) {
  console.error(message);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------------

config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), quiet: true });
const databaseUrl = process.env.DATABASE_URL ?? "";
let databaseName = "";
try {
  databaseName = new URL(databaseUrl).pathname.slice(1);
} catch {
  fail("DATABASE_URL inválida.");
}
if (!databaseName.startsWith("barber_job_")) {
  fail(`Me niego a correr: la base "${databaseName}" no empieza con "barber_job_".`);
}

const client = new pg.Client({ connectionString: databaseUrl });
const q = async (text, params = []) => (await client.query(text, params)).rows;

const claims = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
const owner = claims(args.owner);
const barber = claims(args.barber);
if (owner.role !== "OWNER" || barber.role !== "BARBER" || owner.barbershopId !== barber.barbershopId) {
  fail("Los tokens tienen que ser del dueño y de un barbero de la misma barbería.");
}
const shop = owner.barbershopId;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const LONG_NAME = "Maximiliano Bartolomé Fernández de la Vega y Etcheverry Soto";
const NOTES = "Dos al costado, tijera arriba.";

const fx = { customers: [], services: [], inactive: "chk-svc-inactive", other: null, appointments: [] };

/** Deja la barbería como la necesitan los recorridos: turnos de hoy conocidos, sin cortes y con la caja abierta. */
async function resetFixture({ appointments = true, services = true } = {}) {
  await q(`update "Barbershop" set "brandPrimary"=null, "brandSecondary"=null, "billingEnabled"=false,
           "planExpiresAt"=null, "mpStatus"=null, "payerEmail"=null where id=$1`, [shop]);
  await q(`delete from "ServiceRecord" where "barbershopId"=$1 and "businessDate"=$2::date`, [shop, today]);
  await q(`delete from "CashRegisterClose" where "barbershopId"=$1 and "businessDate"=$2::date`, [shop, today]);
  // `startsAt` se guarda en UTC sin zona; el día es el de la barbería.
  await q(
    `delete from "Appointment" where "barbershopId"=$1
     and ("startsAt" at time zone 'UTC' at time zone $2)::date = $3::date`,
    [shop, TZ, today],
  );
  await q(`delete from "Appointment" where id like 'chk-%'`);
  await q(`delete from "ServiceRecord" where "customerId" like 'chk-%'`);
  await q(`delete from "Customer" where id like 'chk-%' or ("barbershopId"=$1 and phone like '549110000%')`, [shop]);
  await q(`update "Service" set active=false where "barbershopId"=$1`, [shop]);
  if (services) await q(`update "Service" set active=true where "barbershopId"=$1 and id not like 'chk-%'`, [shop]);
  await q(
    `insert into "Service"(id,"barbershopId",name,price,"durationMinutes",active,"updatedAt")
     values($1,$2,'Servicio retirado',8000,30,false,now()) on conflict (id) do update set active=false`,
    [fx.inactive, shop],
  );
  await q(
    `insert into "Service"(id,"barbershopId",name,price,"durationMinutes",active,"sortOrder","updatedAt")
     values('chk-svc-cents',$1,'Corte, barba y perfilado premium',15000.50,30,$2,90,now())
     on conflict (id) do update set active=excluded.active`,
    [shop, services],
  );
  fx.services = await q(
    `select id, name, price::text from "Service" where "barbershopId"=$1 and id not like 'chk-%' order by "sortOrder", name`,
    [shop],
  );
  fx.other = (
    await q(`select id from "User" where "barbershopId"=$1 and role='BARBER' and active and id<>$2 limit 1`, [
      shop,
      barber.userId,
    ])
  )[0].id;
  const names = ["Diego Paz", "Juan Acosta", "Tomás Vera", "Leo Sosa", LONG_NAME, "Nicolás Rey", "Bruno Díaz", "Pablo Luna", "Iván Gil"];
  fx.customers = names.map((name, i) => ({ id: `chk-cus-${i}`, name, phone: `5491100000${100 + i}` }));
  for (const c of fx.customers) {
    await q(
      `insert into "Customer"(id,"barbershopId",name,phone,notes,"updatedAt") values($1,$2,$3,$4,$5,now())`,
      [c.id, shop, c.name, c.phone, NOTES],
    );
  }
  fx.appointments = [];
  if (!appointments) return;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  const at = (h) => Math.min(23, Math.max(0, h));
  const svc = fx.services.map((s) => s.id);
  // hora, estado, barbero, servicio, cliente. Las relativas a ahora dejan turnos antes y después de la línea.
  const rows = [
    [at(hour - 3), "COMPLETED", barber.userId, svc[0], 0],
    [at(hour - 2), "NO_SHOW", null, svc[1], 1],
    [at(hour), "CONFIRMED", null, svc[0], 2],
    [at(hour), "PENDING", barber.userId, svc[3], 3],
    [at(hour), "CONFIRMED", null, "chk-svc-cents", 4],
    [at(hour + 1), "PENDING", null, fx.inactive, 5],
    [at(hour + 1), "CONFIRMED", null, svc[1], 6],
    [at(hour + 2), "CONFIRMED", null, svc[2], 7],
    [at(hour + 3), "CANCELLED", null, svc[2], 8],
  ];
  for (const [i, [h, status, barberId, serviceId, customer]] of rows.entries()) {
    const id = `chk-apt-${i}`;
    const startsAt = `${today}T${String(h).padStart(2, "0")}:00:00-03:00`;
    await q(
      `insert into "Appointment"(id,"barbershopId","customerId","barberId","serviceId","startsAt","endsAt",status,"createdAt","updatedAt")
       values($1,$2,$3,$4,$5,$6::timestamptz at time zone 'UTC',($6::timestamptz + interval '1 hour') at time zone 'UTC',
              $7::"AppointmentStatus", now() at time zone 'UTC' + ($8 || ' seconds')::interval, now())`,
      [id, shop, `chk-cus-${customer}`, barberId, serviceId, startsAt, status, String(i)],
    );
    fx.appointments.push({ id, status, name: fx.customers[customer].name });
  }
}

const setBrand = (brand) =>
  q(`update "Barbershop" set "brandPrimary"=$2, "brandSecondary"=$3 where id=$1`, [
    shop,
    brand?.primary ?? null,
    brand?.secondary ?? null,
  ]);
const setBilling = (enabled, daysFromNow, extra = {}) =>
  q(
    `update "Barbershop" set "billingEnabled"=$2,
     "planExpiresAt"= case when $3::int is null then null else (now() at time zone 'UTC') + ($3::int * interval '1 day') end,
     "payerEmail"=$4 where id=$1`,
    [shop, enabled, daysFromNow, extra.payerEmail ?? null],
  );
const countRecords = async () =>
  (await q(`select count(*)::int n from "ServiceRecord" where "barbershopId"=$1 and "businessDate"=$2::date`, [shop, today]))[0].n;
const statusOf = async (id) => (await q(`select status from "Appointment" where id=$1`, [id]))[0]?.status;

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

const CHROME =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find(existsSync);
if (!CHROME) fail("No encontré Chrome: definí CHROME_PATH.");

const profile = mkdtempSync(join(tmpdir(), "panel-check-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);
function killChrome() {
  try {
    chrome.kill();
  } catch {
    // Ya terminó.
  }
}
process.on("exit", killChrome);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(1));
const globalTimer = setTimeout(() => {
  console.error(`Timeout global (${GLOBAL_TIMEOUT_MS / 1000} s).`);
  process.exit(1);
}, GLOBAL_TIMEOUT_MS);

let socket;
let lastId = 0;
const pendingCommands = new Map();
const listeners = new Set();

async function connect() {
  const file = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 150 && !existsSync(file); i++) await sleep(100);
  await sleep(200);
  const [port, path] = readFileSync(file, "utf8").trim().split("\n");
  socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("No pude conectar con Chrome."));
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) {
      for (const listener of listeners) listener(message);
      return;
    }
    const command = pendingCommands.get(message.id);
    pendingCommands.delete(message.id);
    if (!command) return;
    clearTimeout(command.timer);
    if (message.error) command.reject(new Error(`${command.method}: ${message.error.message}`));
    else command.resolve(message.result);
  };
}

function send(method, params = {}, sessionId = undefined) {
  return new Promise((resolve, reject) => {
    const id = ++lastId;
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`${method}: sin respuesta`));
    }, COMMAND_TIMEOUT_MS);
    pendingCommands.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

/** Se inyecta en cada documento. Todo filtra por visible: las rutas ocultas por `<Activity>` siguen en el DOM. */
const INJECTED = `(() => {
  window.__skew = 0;
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + window.__skew;
  const visible = (e) => e.checkVisibility({ visibilityProperty: true, opacityProperty: false });
  window.__all = (sel, root = document) => [...root.querySelectorAll(sel)].filter(visible);
  window.__one = (sel) => window.__all(sel)[0] ?? null;
  window.__text = (text, sel = "button, a") =>
    window.__all(sel).find((e) => e.textContent.trim() === text || (text.endsWith("*") && e.textContent.trim().startsWith(text.slice(0, -1)))) ?? null;
  window.__dialog = () => window.__all('[role="dialog"]').at(-1) ?? null;
  window.__toast = () => document.querySelector("[data-panel-toast]")?.textContent.trim() ?? "";
  window.__overflow = () => {
    const out = [];
    const root = document.scrollingElement;
    if (root.scrollWidth > window.innerWidth + 0.5) out.push("página " + root.scrollWidth);
    for (const e of window.__all('[role="dialog"], [role="dialog"] *')) {
      const r = e.getBoundingClientRect();
      if (getComputedStyle(e).position !== "absolute" && r.width > 1 && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) out.push("hoja: " + e.tagName + " " + e.className.toString().slice(0, 60));
      if (["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.scrollWidth > e.clientWidth + 0.5) out.push("scroll lateral en la hoja " + e.scrollWidth + ">" + e.clientWidth);
    }
    return out;
  };
  // Controles menores a 44x44 (de los sr-only se mide su label) y campos con texto menor a 16 px.
  window.__small = (root = document) => {
    const out = [];
    for (const e of window.__all('a, button, input:not([type="hidden"]), select, textarea, summary, [role="button"]', root)) {
      let box = e;
      if (e.closest("[inert], [aria-hidden='true'], [data-base-ui-focus-guard]")) continue;
      if (e.classList.contains("sr-only")) box = e.closest("label") ?? e;
      const r = box.getBoundingClientRect();
      if (r.width < 43.9 || r.height < 43.9) out.push((e.getAttribute("aria-label") ?? e.textContent.trim().slice(0, 30)) + " " + e.tagName + " " + r.width.toFixed(1) + "x" + r.height.toFixed(1));
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !e.classList.contains("sr-only") && parseFloat(getComputedStyle(e).fontSize) < 16) out.push("texto chico en " + (e.name || e.id));
    }
    return out;
  };
  // Contraste AA de todo el texto visible contra su fondo (los deshabilitados no cuentan).
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (color) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
  const channel = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  window.__ratio = (e) => {
    const layers = [];
    let opacity = 1;
    for (let n = e; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      opacity *= parseFloat(s.opacity);
      const bg = rgba(s.backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] >= 0.999) break;
    }
    let bg = [255, 255, 255];
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const fg = rgba(getComputedStyle(e).color);
    const color = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    const a = lum(color), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  window.__contrast = (root = document) => {
    const out = new Set();
    const walker = document.createTreeWalker(root === document ? document.body : root, NodeFilter.SHOW_TEXT);
    const dialog = window.__dialog();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const e = n.parentElement;
      if (!n.textContent.trim() || !e || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(e.tagName) || !visible(e)) continue;
      if (e.closest(":disabled, [aria-disabled='true'], [aria-hidden='true'], .sr-only, [data-skeleton]")) continue;
      if (dialog && !dialog.contains(e)) continue;
      const ratio = window.__ratio(e);
      if (ratio < 4.5) out.add(ratio.toFixed(2) + " " + JSON.stringify(n.textContent.trim().slice(0, 30)) + " en " + e.className.toString().slice(0, 60));
    }
    return [...out];
  };
})()`;

const LOADED = `document.readyState === "complete" && __all("h1").length > 0 && __all("[data-skeleton]").length === 0`;

async function openPage({ token, width, height, mobile = width < 640, reducedMotion = false, timezone }) {
  const { browserContextId } = await send("Target.createBrowserContext");
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  const page = { s, errors: [], dialogs: 0, actions: 0, ignoreErrors: false };

  const listener = (message) => {
    if (message.sessionId !== sessionId) return;
    const { method, params } = message;
    const report = (text) => {
      if (!page.ignoreErrors) page.errors.push(text.slice(0, 400));
    };
    if (method === "Runtime.exceptionThrown") {
      report(`excepción: ${params.exceptionDetails.exception?.description ?? params.exceptionDetails.text}`);
    } else if (method === "Runtime.consoleAPICalled" && params.type === "error") {
      report(`console.error: ${params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    } else if (method === "Log.entryAdded" && params.entry.level === "error") {
      report(`log: ${params.entry.text} ${params.entry.url ?? ""}`);
    } else if (method === "Page.javascriptDialogOpening") {
      page.dialogs++;
      s("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
    } else if (method === "Network.requestWillBeSent") {
      const headers = Object.keys(params.request.headers).map((h) => h.toLowerCase());
      if (params.request.method === "POST" && headers.includes("next-action")) page.actions++;
    }
  };
  listeners.add(listener);

  for (const domain of ["Page", "Runtime", "Log", "Network"]) await s(`${domain}.enable`);
  await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await s("Emulation.setTouchEmulationEnabled", { enabled: true });
  if (timezone) await s("Emulation.setTimezoneOverride", { timezoneId: timezone });
  await s("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }],
  });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: INJECTED });
  if (token) await s("Network.setCookie", { name: "session", value: token, url: base, httpOnly: true });

  page.ev = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`${expression.slice(0, 120)} → ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    }
    return r.result.value;
  };
  page.wait = async (expression, ms = 8000) => {
    const start = Date.now();
    for (;;) {
      const value = await page.ev(expression).catch(() => null);
      if (value) return value;
      if (Date.now() - start > ms) throw new Error(`No pasó: ${expression.slice(0, 160)}`);
      await sleep(40);
    }
  };
  page.go = async (path) => {
    await s("Page.navigate", { url: base + path });
    await page.wait(LOADED, 15_000);
    await sleep(250);
  };
  page.shot = async (name) => {
    const { data } = await s("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(args.out, `${name}.png`), Buffer.from(data, "base64"));
  };
  page.point = async (target) => {
    const p = await page.ev(`(() => {
      const e = ${target};
      if (!e) return null;
      e.scrollIntoView({ block: "nearest", behavior: "instant" });
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!p) throw new Error(`No encontré ${target}`);
    return p;
  };
  page.tapAt = async (p) => {
    if (mobile) {
      await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
      await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await s("Input.dispatchMouseEvent", { type: "mouseMoved", ...p });
      for (const type of ["mousePressed", "mouseReleased"]) {
        await s("Input.dispatchMouseEvent", { type, ...p, button: "left", clickCount: 1 });
      }
    }
  };
  page.tap = async (target) => page.tapAt(await page.point(target));
  page.tapText = (text, sel) => page.tap(`__text(${JSON.stringify(text)}${sel ? `, ${JSON.stringify(sel)}` : ""})`);
  page.swipe = async (from, dy) => {
    await s("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
    for (let i = 1; i <= 10; i++) {
      await s("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x, y: from.y + (dy * i) / 10 }] });
      await sleep(16);
    }
    await s("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  page.key = async (key, { code = key, vk = 0, text } = {}) => {
    await s("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, text });
    await s("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
  };
  page.escape = () => page.key("Escape", { vk: 27 });
  page.tab = () => page.key("Tab", { vk: 9 });
  page.enter = () => page.key("Enter", { vk: 13, text: "\r" });
  page.space = () => page.key(" ", { code: "Space", vk: 32, text: " " });
  page.type = async (target, text) => {
    await page.ev(`(() => { const e = ${target}; e.focus(); e.select?.(); })()`);
    await s("Input.insertText", { text });
  };
  page.net = (options = {}) =>
    s("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      ...options,
    });
  /** Hoja abierta y quieta: la misma posición y opacidad durante 120 ms. */
  page.opened = () =>
    page.wait(`(async () => {
      const at = () => { const d = __dialog(); return d && !d.hasAttribute("data-starting-style") ? JSON.stringify(d.getBoundingClientRect()) + getComputedStyle(d).opacity : null; };
      const first = at();
      await new Promise((resolve) => setTimeout(resolve, 120));
      return first !== null && first === at();
    })()`);
  page.closed = () => page.wait(`!__dialog()`);
  /** Vuelve a la app después de 31 segundos. */
  page.comeBack = async () => {
    await page.ev(`window.__skew += 31000; document.dispatchEvent(new Event("visibilitychange"))`);
  };
  page.close = async () => {
    listeners.delete(listener);
    await send("Target.closeTarget", { targetId }).catch(() => {});
    await send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
  };
  return page;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

const failures = [];
let passed = 0;
function check(condition, label, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    const text = detail === undefined ? "" : typeof detail === "string" ? detail : JSON.stringify(detail);
    console.log(`  ✗ ${label}${text ? ` → ${text.slice(0, 900)}` : ""}`);
  }
}
const none = (list, label) => check(list.length === 0, label, list);

/** Cada sección abre sus páginas, parte de una base conocida y no corta a las demás si falla. */
async function section(name, run) {
  if (args.only && !name.toLowerCase().includes(args.only.toLowerCase())) return;
  console.log(`\n${name}`);
  const pages = [];
  const open = async (options) => {
    const page = await openPage(options);
    pages.push(page);
    return page;
  };
  try {
    await resetFixture();
    await run(open);
  } catch (error) {
    check(false, `${name}: se cortó`, String(error?.message ?? error));
    for (const [i, page] of pages.entries()) await page.shot(`error-${name.replace(/\W+/g, "-")}-${i}`).catch(() => {});
  }
  for (const page of pages) {
    none(page.errors, `${name}: sin errores en consola`);
    check(page.dialogs === 0, `${name}: sin window.confirm`);
    await page.close();
  }
}

const OWNER = args.owner;
const BARBER = args.barber;
const PHONE = { width: 402, height: 874 };
const SMALL = { width: 360, height: 640 };
const DESKTOP = { width: 1366, height: 900 };
const row = (id) => `__one('[data-appointment="${id}"]')`;
const CTA = `__text("Registrar corte", "button")`;
const submitButton = `__all('[role="dialog"] button[type="submit"]')[0]`;
const tile = (name) =>
  `__all('[role="dialog"] label').find((l) => l.querySelector('[name="serviceIds"]') && l.textContent.includes(${JSON.stringify(name)}))`;
const checkedServices = `__all('[role="dialog"] [name="serviceIds"]').filter((i) => i.checked).map((i) => i.value)`;
const hasAction = (text) => `!!__text(${JSON.stringify(text)}, '[role="dialog"] button')`;

async function openWalkIn(page) {
  await page.tap(CTA);
  await page.opened();
}
async function openRow(page, id) {
  await page.tap(row(id));
  await page.opened();
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

async function capturas() {
  const sizes = [
    ["360", SMALL],
    ["402", PHONE],
    ["1366", DESKTOP],
  ];
  for (const [brandName, brand] of [
    ["azul", null],
    ["verde", GREEN],
  ]) {
    for (const [role, token] of [
      ["dueno", OWNER],
      ["barbero", BARBER],
    ]) {
      await section(`Capturas ${brandName} ${role}`, async (open) => {
        await setBrand(brand);
        for (const [sizeName, size] of sizes) {
          const page = await open({ token, ...size });
          const name = (screen) => `${brandName}-${role}-${sizeName}-${screen}`;
          const label = (text) => `${brandName} ${role} ${sizeName}: ${text}`;
          const screens = role === "dueno" ? ["today", "cash", "services", "barbers", "settings", "account"] : ["today", "services", "account"];
          for (const screen of screens) {
            await page.go(`/dashboard/${screen}`);
            await page.shot(name(screen));
            none(await page.ev("__overflow()"), label(`${screen} sin desborde`));
            none(await page.ev("__contrast()"), label(`${screen} con contraste AA`));
            check(
              await page.ev(`(() => { const h = __all("h1"); return h.length === 1 && getComputedStyle(h[0]).fontFamily.includes("Anton"); })()`),
              label(`${screen} con un solo h1 en Anton`),
            );
            none(
              await page.ev(`[...__small(__one("header.panel-header")), ...__small(__one("nav.panel-nav"))]`),
              label(`${screen}: encabezado y barra de 44 px`),
            );
            check(
              await page.ev(`__all('nav.panel-nav [aria-current="page"]').length`) === (role === "dueno" ? (screen === "account" ? 0 : 1) : screen === "services" ? 0 : 1),
              label(`${screen}: un solo ítem activo`),
            );
          }
          await page.go("/dashboard/today");
          if (sizeName !== "1366") none(await page.ev("__small()"), label("Hoy sin controles menores a 44 px"));
          for (const [sheet, openSheet] of [
            ["hoja-corte", () => openWalkIn(page)],
            ["hoja-turno", () => openRow(page, "chk-apt-2")],
            ["hoja-turno-listo", () => openRow(page, "chk-apt-0")],
            ["hoja-cortes", async () => { await page.tap(`__one("[data-summary]")`); await page.opened(); }],
          ]) {
            await openSheet();
            await page.shot(name(sheet));
            none(await page.ev("__overflow()"), label(`${sheet} sin desborde`));
            if (sizeName !== "1366") none(await page.ev("__small(__dialog())"), label(`${sheet} sin controles menores a 44 px`));
            none(await page.ev("__contrast(__dialog())"), label(`${sheet} con contraste AA`));
            check(
              await page.ev(`getComputedStyle(__dialog()).getPropertyValue("--primary").trim()`) === (brand ? brand.secondary : "#d7191f"),
              label(`${sheet} con los colores de la barbería`),
            );
            check(
              await page.ev(`(() => { const r = __dialog().getBoundingClientRect(); return r.height <= innerHeight * 0.92 + 1 && r.bottom <= innerHeight + 1; })()`),
              label(`${sheet} hasta 92% del alto`),
            );
            if (sizeName === "1366") {
              check(
                await page.ev(`(() => { const r = __dialog().getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 2 && Math.abs((r.top + r.bottom) / 2 - innerHeight / 2) < 2; })()`),
                label(`${sheet} centrada`),
              );
            }
            await page.escape();
            await page.closed();
          }
          if (sizeName === "1366") {
            const p = await page.point(CTA);
            await page.s("Input.dispatchMouseEvent", { type: "mouseMoved", ...p });
            await sleep(400);
            check((await page.ev(`__ratio(${CTA})`)) >= 4.5, label("la acción se lee al pasar el mouse"));
            check(
              await page.ev(`getComputedStyle(${CTA}).backgroundColor !== getComputedStyle(__one(".panel-theme")).getPropertyValue("--primary")`),
              label("la acción cambia al pasar el mouse"),
            );
          }
        }
      });
    }
  }

  await section("Capturas fichas", async (open) => {
    const [user] = await q(`select id from "User" where id=$1`, [barber.userId]);
    for (const [sizeName, size] of sizes) {
      const page = await open({ token: OWNER, ...size });
      for (const [screen, path, back] of [
        ["cliente", "/dashboard/today/customers/chk-cus-4", "/dashboard/today"],
        ["servicio", `/dashboard/services/${fx.services[0].id}`, "/dashboard/services"],
        ["barbero", `/dashboard/barbers/${user.id}`, "/dashboard/barbers"],
      ]) {
        await page.go(path);
        await page.shot(`ficha-${sizeName}-${screen}`);
        none(await page.ev("__overflow()"), `ficha ${screen} ${sizeName} sin desborde`);
        none(await page.ev("__contrast()"), `ficha ${screen} ${sizeName} con contraste AA`);
        none(await page.ev(`__small(__one("header.panel-header"))`), `ficha ${screen} ${sizeName}: Volver de 44 px`);
        check(await page.ev(`__text("Volver", "header a")?.getAttribute("href")`) === back, `ficha ${screen} ${sizeName}: Volver a su lista`);
        check(await page.ev(`__all("h1").length`) === 1, `ficha ${screen} ${sizeName} con un solo h1`);
      }
    }
  });
}

async function medidas() {
  await section("Medidas de Hoy", async (open) => {
    const small = await open({ token: OWNER, ...SMALL });
    await small.go("/dashboard/today");
    check(
      await small.ev(`(() => { const r = ${CTA}.getBoundingClientRect(); const nav = __one("nav.panel-nav").getBoundingClientRect(); return scrollY === 0 && r.top >= 0 && r.bottom <= nav.top && r.left >= 0 && r.right <= innerWidth; })()`),
      "360×640: Registrar corte entero, sin scroll y arriba de la barra",
    );
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    const visible = await page.ev(`(() => { const dock = __one("[data-dock]").getBoundingClientRect(); return __all("[data-appointment]").filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= dock.top + 0.5; }).length; })()`);
    check(visible >= 4, `402×874: se ven ${visible} turnos enteros`);

    const order = (
      await q(
        `select id from "Appointment" where "barbershopId"=$1 and id like 'chk-apt-%' order by "startsAt", "createdAt", id`,
        [shop],
      )
    ).map((r) => r.id);
    check(
      JSON.stringify(await page.ev(`__all("[data-appointment]").map((e) => e.dataset.appointment)`)) === JSON.stringify(order),
      "los turnos salen en el orden del servidor",
    );
    const tags = await page.ev(`Object.fromEntries(__all("[data-appointment]").map((e) => [e.dataset.appointment, e.lastElementChild.textContent.trim()]))`);
    const barberName = (await q(`select name from "User" where id=$1`, [barber.userId]))[0].name;
    check(
      tags["chk-apt-0"] === "Listo" && tags["chk-apt-1"] === "No vino" && tags["chk-apt-2"] === "Sin asignar" && tags["chk-apt-3"] === barberName && tags["chk-apt-8"] === "Cancelado",
      "etiquetas de cada fila",
      tags,
    );

    // Línea de ahora: antes del primer turno cuya hora no terminó, con la hora de la barbería aunque el celular
    // esté en otra zona.
    const tokyo = await open({ token: OWNER, ...PHONE, timezone: "Asia/Tokyo" });
    await tokyo.go("/dashboard/today");
    const now = new Date();
    const expected = (
      await q(
        `select count(*)::int n from "Appointment" where id like 'chk-apt-%' and "startsAt" + interval '1 hour' <= $1::timestamptz at time zone 'UTC'`,
        [now.toISOString()],
      )
    )[0].n;
    check(
      await tokyo.ev(`(() => { const items = [...__one("[data-now-line]").parentElement.children]; return items.indexOf(__one("[data-now-line]")); })()`) === expected,
      `línea de ahora en la posición ${expected}`,
    );
    const hhmm = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
    const lineTime = `__one("[data-now-line] .tabular-nums").textContent`;
    const first = await tokyo.ev(lineTime);
    check([hhmm(now), hhmm(new Date(now.getTime() - 60_000)), hhmm(new Date(now.getTime() + 60_000))].includes(first), `hora de la barbería en la línea (${first})`);
    check(await page.ev(`__all(".pole").length`) === 1, "la franja del poste aparece una sola vez");
    await page.go("/dashboard/cash");
    check(await page.ev(`__all(".pole").length`) === 0, "la franja del poste no aparece en otra sección");
    await tokyo.wait(`${lineTime} !== ${JSON.stringify(first)}`, 65_000);
    check(true, "la línea avanza cada minuto");
  });

  await section("Textos largos a 360", async (open) => {
    const page = await open({ token: OWNER, ...SMALL });
    await page.go("/dashboard/today");
    none(await page.ev("__overflow()"), "agenda con cliente de 60 caracteres sin desborde");
    check(LONG_NAME.length === 60, "el nombre de prueba tiene 60 caracteres", String(LONG_NAME.length));
    await openRow(page, "chk-apt-4");
    none(await page.ev("__overflow()"), "hoja del turno sin desborde");
    check(await page.ev(`${submitButton}.textContent.trim()`) === "Completar $15.000,50", "precio con centavos en la acción");
    await page.shot("largo-360-turno");
    await page.tapText("No vino", '[role="dialog"] button');
    await page.wait(`__dialog().textContent.includes("¿Marcar que")`);
    none(await page.ev("__overflow()"), "confirmación sin desborde");
    none(await page.ev("__small(__dialog())"), "confirmación con controles de 44 px");
    none(await page.ev("__contrast(__dialog())"), "confirmación con contraste AA");
    await page.shot("largo-360-confirmar");
    await page.tapText("Volver", '[role="dialog"] button');
    await page.wait(hasAction("No vino"));
    await page.tap(submitButton);
    await page.closed();
    await openWalkIn(page);
    await page.tap(tile("perfilado premium"));
    await page.tapText("Cliente*", '[role="dialog"] button');
    await page.type(`__one('[role="dialog"] [name="phone"]')`, fx.customers[4].phone);
    await page.wait(`__dialog().textContent.includes("Ver ficha")`);
    none(await page.ev("__overflow()"), "hoja del corte sin desborde");
    none(await page.ev("__small(__dialog())"), "hoja del corte con cliente: controles de 44 px");
    await page.shot("largo-360-corte");
    await page.escape();
    await page.closed();
    await page.tap(`__one("[data-summary]")`);
    await page.opened();
    check(await page.ev(`__dialog().textContent.includes(${JSON.stringify(LONG_NAME)})`), "la lista de cortes muestra el cliente");
    none(await page.ev("__overflow()"), "lista de cortes sin desborde");
    none(await page.ev("__small(__dialog())"), "lista de cortes con controles de 44 px");
    await page.shot("largo-360-cortes");
    await page.go("/dashboard/today/customers/chk-cus-4");
    none(await page.ev("__overflow()"), "ficha sin desborde");
    await page.shot("largo-360-ficha");
  });
}

async function navegacion() {
  const probe = `({
    path: location.pathname,
    h1: __all("h1").map((e) => e.textContent.trim()),
    skeleton: __all("[data-skeleton]").map((e) => e.getAttribute("aria-label")),
    marked: __all(".panel-tab").filter((e) => getComputedStyle(e.querySelector(".panel-tab-line")).opacity === "1").map((e) => e.textContent.trim()),
  })`;
  const expectations = {
    today: ["Hoy", "Cargando la agenda"],
    cash: ["Caja", "Cargando la caja"],
    services: ["Servicios", "Cargando servicios"],
    barbers: ["Barberos", "Cargando barberos"],
    settings: ["Ajustes", "Cargando ajustes"],
    account: ["Mi cuenta", "Cargando tu cuenta"],
  };
  async function slowTap(page, target, [title, skeleton], label, marked = title) {
    await sleep(1200); // Prefetch de los enlaces visibles.
    const before = await page.ev(`JSON.stringify(__all("nav.panel-nav a").map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.width, r.height]; }))`);
    await page.net({ latency: SLOW_MS });
    await page.tap(target);
    await sleep(160);
    const at = await page.ev(probe);
    const after = await page.ev(`JSON.stringify(__all("nav.panel-nav a").map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.width, r.height]; }))`);
    check(at.h1.join() === title && at.skeleton.join() === skeleton, `${label}: título y esqueleto al instante`, at);
    if (marked !== null) check(at.marked.join() === marked, `${label}: destino marcado al instante`, at.marked);
    check(before === after, `${label}: la barra no se mueve`);
    await page.shot(`esqueleto-${label.replace(/\W+/g, "-")}`);
    await page.net();
    await page.wait(LOADED, 15_000);
  }
  const tab = (s) => `__one('nav.panel-nav a[href="/dashboard/${s}"]')`;

  await section("Navegación con red lenta", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    for (const s of ["cash", "services", "barbers", "settings", "today"]) await slowTap(page, tab(s), expectations[s], `dueño a ${s}`);
    await slowTap(page, `__one('header.panel-header a[aria-label="Mi cuenta"]')`, expectations.account, "dueño a account", "");
    for (const s of ["cash", "settings"]) {
      const fresh = await open({ token: OWNER, ...PHONE });
      await fresh.go("/dashboard/account");
      await slowTap(fresh, tab(s), expectations[s], `dueño de account a ${s}`);
    }
    const b = await open({ token: BARBER, ...PHONE });
    await b.go("/dashboard/today");
    await slowTap(b, tab("account"), expectations.account, "barbero a account");
    const b2 = await open({ token: BARBER, ...PHONE });
    await b2.go("/dashboard/account");
    await slowTap(b2, tab("today"), expectations.today, "barbero de account a today");

    const f = await open({ token: OWNER, ...PHONE });
    await f.go("/dashboard/services");
    await slowTap(f, `__one('main a[href^="/dashboard/services/"]')`, ["Editar servicio", "Cargando el servicio"], "ficha de servicio", "Servicios");
    await f.go("/dashboard/barbers");
    await slowTap(f, `__one('main a[href^="/dashboard/barbers/"]')`, ["Barbero", "Cargando el barbero"], "ficha de barbero", "Barberos");
    await f.go("/dashboard/today");
    await openRow(f, "chk-apt-2");
    await slowTap(f, `__text("Ver ficha", '[role="dialog"] a')`, ["Cliente", "Cargando la ficha"], "ficha de cliente", null);
  });

  await section("Primera carga", async () => {
    for (const [path, title, label] of [
      ["/dashboard/today", "Hoy", "Cargando la agenda"],
      ["/dashboard/cash", "Caja", "Cargando la caja"],
      ["/dashboard/account", "Mi cuenta", "Cargando tu cuenta"],
      ["/dashboard/today/customers/chk-cus-4", null, "Cargando"],
    ]) {
      const response = await fetch(base + path, { headers: { cookie: `session=${OWNER}` } });
      const reader = response.body.getReader();
      // El esqueleto viene en el HTML estático, antes que nada de la sesión.
      let html = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        html += Buffer.from(value).toString();
      }
      const at = html.indexOf(`aria-label="${label}`);
      const body = html.indexOf('<nav aria-label="Secciones');
      check(at > 0 && (body === -1 || at < body), `${path}: esqueleto en el HTML inicial`);
      if (title) check(html.slice(0, at).includes(`>${title}</h1>`), `${path}: título en el HTML inicial`);
      check(html.slice(0, at).includes("h-(--panel-bar)"), `${path}: reserva el alto de la barra`);
    }
  });

  await section("Mi cuenta y sesión", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    check(await page.ev(`__one('header.panel-header a[href="/dashboard/account"]')?.textContent.trim().length > 0`), "avatar con iniciales en Hoy");
    check(await page.ev(`!__text("Cerrar sesión")`), "Cerrar sesión ya no está en el encabezado");
    await page.go("/dashboard/settings");
    check(await page.ev(`__text("Mi cuenta", "header.panel-header a")?.getAttribute("href")`) === "/dashboard/account", "Ajustes enlaza a Mi cuenta");
    await page.go("/dashboard/account");
    check(await page.ev(`!!__text("Cerrar sesión", "form button")`), "Cerrar sesión en Mi cuenta");
    // Foco visible sobre la franja negra.
    await page.go("/dashboard/today");
    await page.ev(`__one('header.panel-header a').focus({ focusVisible: true })`);
    check(
      await page.ev(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineColor === "rgb(255, 255, 255)" && s.outlineStyle === "solid"; })()`),
      "foco blanco sobre la franja negra",
    );
    await page.go("/dashboard/account");
    await page.tapText("Cerrar sesión");
    await page.wait(`location.pathname === "/login"`);
    check(true, "Cerrar sesión lleva a /login");
    check(await page.ev(`!__one(".panel-theme")`), "/login sin el tema del panel");
  });

  await section("Cobro y avisos", async (open) => {
    await setBilling(true, -40, { payerEmail: "pagador@secreto.test" });
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    check(await page.ev(`__one("h1").textContent`) === "Tu suscripción tiene un pago pendiente", "dueño bloqueado ve la pantalla de pago");
    check(await page.ev(`__text("Registrar corte") === null`), "dueño bloqueado no ve Hoy");
    none(await page.ev("__overflow()"), "pantalla de pago sin desborde");
    none(await page.ev("__contrast()"), "pantalla de pago con contraste AA");
    await page.shot("bloqueado-dueno");
    await page.tapText("Mi cuenta", "header.panel-header a");
    await page.wait(`location.pathname === "/dashboard/account" && !!__text("Cerrar sesión")`);
    check(true, "dueño bloqueado llega a Mi cuenta y a Cerrar sesión");
    const b = await open({ token: BARBER, ...PHONE });
    await b.go("/dashboard/today");
    check(await b.ev(`__one("h1").textContent`) === "Panel no disponible", "barbero bloqueado ve el aviso");
    check(await b.ev(`document.querySelector('[role="alert"]').textContent.includes("Hablá con el dueño")`), "barbero: texto del aviso");
    const html = await (await fetch(`${base}/dashboard/today`, { headers: { cookie: `session=${BARBER}` } })).text();
    check(!html.includes("secreto.test") && !html.includes("Mercado Pago"), "el barbero no recibe datos de pago");
    await b.shot("bloqueado-barbero");
    await b.tap(tab("account"));
    await b.wait(`location.pathname === "/dashboard/account" && !!__text("Cerrar sesión")`);
    check(true, "barbero bloqueado llega a Mi cuenta");

    await setBilling(true, null);
    await page.go("/dashboard/today");
    check(await page.ev(`__one("h1").textContent`) === "Esperando tu primer pago", "dueño sin primer pago");

    await setBilling(true, -2);
    const inset = { insets: { top: 47, topMax: 47, bottom: 34, bottomMax: 34 } };
    await page.s("Emulation.setSafeAreaInsetsOverride", inset);
    await page.go("/dashboard/today");
    const notice = `__all('.panel-theme p[role="status"]').find((e) => e.textContent.includes("No pudimos cobrar"))`;
    check(
      await page.ev(`(() => { const e = ${notice}; const r = e.getBoundingClientRect(); const h = __one("header.panel-header"); return r.top === 0 && parseFloat(getComputedStyle(e).paddingTop) >= 47 && parseFloat(getComputedStyle(h).paddingTop) === 0 && Math.abs(h.getBoundingClientRect().top - r.bottom) < 1; })()`),
      "aviso de cobro arriba de todo, con el área segura una sola vez",
    );
    check(
      await page.ev(`(() => { const nav = __one("nav.panel-nav"); const dock = __one("[data-dock]").getBoundingClientRect(); return parseFloat(getComputedStyle(nav).paddingBottom) === 34 && dock.bottom <= nav.getBoundingClientRect().top + 1; })()`),
      "barra con área segura y el botón arriba de ella",
    );
    none(await page.ev("__contrast()"), "aviso con contraste AA");
    await page.shot("aviso-cobro");
    await setBilling(false, null);
    await page.go("/dashboard/today");
    check(await page.ev(`parseFloat(getComputedStyle(__one("header.panel-header")).paddingTop)`) === 47, "sin aviso, el encabezado respeta el área segura");
    await page.shot("area-segura");
  });
}

async function hojas() {
  await section("Hoja", async (open) => {
    const page = await open({ token: OWNER, ...SMALL });
    await page.go("/dashboard/today");
    const scrolled = await page.ev(`(() => { scrollTo(0, 120); return scrollY; })()`);
    check(scrolled > 60, "la agenda tiene scroll a 360×640");
    const ID = "chk-apt-6";
    const before = await page.ev(`(() => { ${row(ID)}.scrollIntoView({ block: "center" }); return scrollY; })()`);
    const back = (label) =>
      page
        .wait(`document.activeElement?.dataset?.appointment === ${JSON.stringify(ID)}`, 2000)
        .then(() => check(true, `${label}: el foco vuelve a quien la abrió`))
        .catch(() => check(false, `${label}: el foco vuelve a quien la abrió`));
    const same = async (label) => check((await page.ev("scrollY")) === before, `${label}: mismo scroll`);

    const openIt = async () => {
      await page.tap(row(ID));
      await page.opened();
    };
    await openIt();
    check(await page.ev(`document.activeElement === __dialog() || __dialog().contains(document.activeElement)`), "el foco entra a la hoja");
    check(await page.ev(`!!__dialog().getAttribute("aria-labelledby") && document.getElementById(__dialog().getAttribute("aria-labelledby")).textContent.length > 0`), "la hoja tiene título accesible");
    check(await page.ev(`!!__dialog().closest(".panel-theme")`), "la hoja se monta dentro de .panel-theme");
    const durations = await page.ev(`(() => { const ms = (v) => v.split(",").map((x) => parseFloat(x) * (x.includes("ms") ? 1 : 1000)); return [...document.querySelectorAll("[data-panel-portal] *")].flatMap((e) => ms(getComputedStyle(e).transitionDuration)); })()`);
    check(Math.max(...durations) <= 300, "movimiento de 300 ms o menos", String(Math.max(...durations)));
    await page.escape();
    await page.closed();
    await back("Escape");
    await same("Escape");

    await openIt();
    await page.tap(`__all('[role="dialog"] [aria-label="Cerrar"]')[0]`);
    await page.closed();
    await back("✕");
    await same("✕");

    await openIt();
    await page.tapAt({ x: 180, y: 12 });
    await page.closed();
    await back("toque afuera");
    await same("toque afuera");

    await openIt();
    await page.swipe(await page.point(`__all('[role="dialog"] h2')[0]`), 320);
    await page.closed();
    await back("deslizar");
    await same("deslizar");

    // Teclado en pantalla: el visor visual se achica 300 px y la acción queda arriba.
    await openWalkIn(page);
    await page.tapText("Cliente*", '[role="dialog"] button');
    await page.ev(`__one('[role="dialog"] [name="phone"]').focus()`);
    await page.ev(`Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => innerHeight - 300 }); window.visualViewport.dispatchEvent(new Event("resize"))`);
    await page
      .wait(`${submitButton}.getBoundingClientRect().bottom <= innerHeight - 300 && __dialog().getBoundingClientRect().top >= 0`, 3000)
      .then(() => check(true, "la acción queda por encima del teclado"))
      .catch(async () => check(false, "la acción queda por encima del teclado", await page.ev(`JSON.stringify([${submitButton}.getBoundingClientRect(), __dialog().getBoundingClientRect()])`)));
    await page.ev(`delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event("resize"))`);
    await page.escape();
    await page.closed();

    const reduced = await open({ token: OWNER, ...PHONE, reducedMotion: true });
    await reduced.go("/dashboard/today");
    await reduced.tap(CTA);
    await reduced.wait(`!!__dialog()`);
    check(
      await reduced.ev(`document.getAnimations().length === 0 && [...document.querySelectorAll("[data-panel-portal] *")].every((e) => /^0s(, 0s)*$/.test(getComputedStyle(e).transitionDuration))`),
      "con movimiento reducido no hay animaciones",
    );
    await reduced.escape();
    await reduced.closed();
    check(true, "con movimiento reducido la hoja también se cierra");

    const desktop = await open({ token: OWNER, ...DESKTOP });
    await desktop.go("/dashboard/today");
    await openWalkIn(desktop);
    const h2 = await desktop.point(`__all('[role="dialog"] h2')[0]`);
    await desktop.s("Input.dispatchMouseEvent", { type: "mousePressed", ...h2, button: "left", clickCount: 1 });
    for (let i = 1; i <= 10; i++) await desktop.s("Input.dispatchMouseEvent", { type: "mouseMoved", x: h2.x, y: h2.y + i * 40, button: "left", buttons: 1 });
    await desktop.s("Input.dispatchMouseEvent", { type: "mouseReleased", x: h2.x, y: h2.y + 400, button: "left", clickCount: 1 });
    await sleep(500);
    check(await desktop.ev(`!!__dialog() && Math.abs((__dialog().getBoundingClientRect().top + __dialog().getBoundingClientRect().bottom) / 2 - innerHeight / 2) < 2`), "en computadora no hay gesto");
    await desktop.escape();
    await desktop.closed();
  });

  await section("Solo teclado", async (open) => {
    const page = await open({ token: OWNER, ...DESKTOP });
    await page.go("/dashboard/today");
    const tabTo = async (condition, label) => {
      for (let i = 0; i < 40; i++) {
        await page.tab();
        if (await page.ev(condition)) return;
      }
      throw new Error(`no llegué con Tab a ${label}`);
    };
    await tabTo(`document.activeElement?.textContent.trim() === "Registrar corte"`, "Registrar corte");
    check(await page.ev(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" || s.boxShadow !== "none"; })()`), "foco visible en Registrar corte");
    await page.enter();
    await page.opened();
    await tabTo(`document.activeElement?.name === "serviceIds"`, "los servicios");
    check(await page.ev(`getComputedStyle(document.activeElement.closest("label")).outlineStyle === "solid"`), "foco visible en los servicios");
    await page.space();
    check((await page.ev(checkedServices)).length === 1, "Espacio marca el servicio");
    await tabTo(`document.activeElement?.name === "paymentMethod"`, "el medio de pago");
    await page.key("ArrowRight", { vk: 39 });
    check(await page.ev(`__all('[role="dialog"] [name="paymentMethod"]').find((i) => i.checked).value`) === "TRANSFER", "flecha cambia el medio de pago");
    for (let i = 0; i < 25; i++) {
      await page.tab();
      if (!(await page.ev(`__dialog().contains(document.activeElement) || document.activeElement.hasAttribute("data-base-ui-focus-guard")`))) {
        check(false, "el foco queda atrapado en la hoja");
        break;
      }
      if (i === 24) check(true, "el foco queda atrapado en la hoja");
    }
    await tabTo(`document.activeElement === ${submitButton}`, "Registrar");
    const before = await countRecords();
    await page.enter();
    await page.closed();
    check((await countRecords()) === before + 1, "Enter registra");
    await page.wait(`document.activeElement?.textContent.trim() === "Registrar corte"`, 2000);
    check(true, "el foco vuelve a Registrar corte");
  });

  await section("Salir de Hoy con la hoja abierta", async (open) => {
    const page = await open({ token: OWNER, ...SMALL });
    await page.go("/dashboard/today");
    await openRow(page, "chk-apt-2");
    await page.tapText("Ver ficha", '[role="dialog"] a');
    await page.wait(`location.pathname.startsWith("/dashboard/today/customers/") && ${LOADED}`);
    await sleep(500);
    check(await page.ev(`!__dialog() && __all("[data-panel-portal] *").length === 0`), "la hoja no queda visible sobre la ficha");
    check(await page.ev(`getComputedStyle(document.documentElement).overflow !== "hidden" && getComputedStyle(document.body).overflow !== "hidden"`), "la ficha se puede scrollear");
    check(await page.ev(`!__one("main").closest("[aria-hidden='true'], [inert]")`), "la ficha no queda oculta a lectores de pantalla");
    await page.shot("salir-ficha");
    await page.ev("history.back()");
    await page.wait(`location.pathname === "/dashboard/today" && ${LOADED}`);
    await sleep(500);
    check(await page.ev(`!__dialog() && __all("[data-panel-portal] *").length === 0`), "Atrás: Hoy sin hoja abierta");
    await openRow(page, "chk-apt-2");
    check(await page.ev(hasAction("No vino")), "y la hoja se puede volver a abrir");
    await page.ev("history.forward()");
    await page.wait(`location.pathname.startsWith("/dashboard/today/customers/") && ${LOADED}`);
    await page.tap(`__one('nav.panel-nav a[href="/dashboard/today"]')`);
    await page.wait(`location.pathname === "/dashboard/today" && ${LOADED}`);
    await sleep(400);
    check(await page.ev(`!__dialog()`), "con la pestaña: Hoy sin hoja abierta");
  });
}

async function recorridos() {
  await section("Corte en 3 toques", async (open) => {
    const page = await open({ token: BARBER, ...PHONE });
    await page.go("/dashboard/today");
    const before = await countRecords();
    await page.tap(CTA); // 1
    await page.opened();
    check(await page.ev(`${submitButton}.textContent.trim() === "Elegí un servicio" && ${submitButton}.disabled`), "sin servicio: Elegí un servicio");
    check(await page.ev(`!__one('[role="dialog"] [name="barberId"]')`), "el barbero no elige quién atendió");
    await page.tap(tile("Corte de pelo")); // 2
    check(await page.ev(`${submitButton}.textContent.trim()`) === "Registrar $15.000", "Registrar $15.000");
    check(
      await page.ev(`getComputedStyle(${tile("Corte de pelo")}).backgroundColor === "rgb(31, 46, 154)"`),
      "lo seleccionado usa el color principal",
    );
    await page.tap(submitButton); // 3
    await page.wait(`__toast().startsWith("Corte registrado: #")`);
    check(await page.ev(`!__dialog()`), "el aviso sale con la hoja ya cerrada");
    check(
      await page.ev(`(() => { const t = document.querySelector("[data-panel-toast]"); const r = t.firstElementChild.getBoundingClientRect(); return t.getAttribute("role") === "status" && !t.closest("[inert], [aria-hidden='true']") && !!t.closest(".panel-theme") && r.bottom <= __one("nav.panel-nav").getBoundingClientRect().top; })()`),
      "aviso en role=status, visible para lectores de pantalla y encima de la barra",
    );
    await sleep(300); // El aviso entra con un fundido.
    none(await page.ev(`[document.querySelector("[data-panel-toast] p")].filter((e) => __ratio(e) < 4.5).map(String)`), "aviso con contraste AA");
    await page.shot("aviso");
    check((await countRecords()) === before + 1, "un corte más en la base");
    await page.wait(`__one("[data-summary]").textContent.trim() === "Hiciste 1 corte por $15.000"`);
    check(true, "el resumen se actualiza");
    await page.wait(`__toast() === ""`, 3800);
    check(true, "el aviso dura 3 segundos");
    await openWalkIn(page);
    check((await page.ev(checkedServices)).length === 0, "registrar limpia el borrador");
  });

  await section("Doble toque y hoja bloqueada", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    await openWalkIn(page);
    await page.tap(tile("Corte de pelo"));
    await page.net({ latency: SLOW_MS });
    const before = await countRecords();
    page.actions = 0;
    await page.ev(`(() => { const b = ${submitButton}; b.click(); b.click(); })()`);
    const p = await page.point(submitButton);
    await page.tapAt(p);
    await page.tapAt(p);
    check(await page.ev(`${submitButton}.textContent.trim()`) === "Registrando…", "el botón dice Registrando…");
    check(await page.ev(`__toast() === ""`), "sin aviso antes de la respuesta");
    await page.escape();
    await page.tapAt({ x: 200, y: 20 });
    await page.swipe(await page.point(`__all('[role="dialog"] h2')[0]`), 320);
    await page.tap(`__all('[role="dialog"] [aria-label="Cerrar"]')[0]`);
    await page.comeBack();
    await sleep(350);
    check(await page.ev(`!!__dialog() && ${submitButton}.textContent.trim() === "Registrando…"`), "guardando no se cierra por ningún camino");
    check(await page.ev(`Math.abs(__dialog().getBoundingClientRect().bottom - innerHeight) < 2`), "guardando no se desliza");
    await page.closed();
    await page.net();
    await sleep(500);
    check((await countRecords()) === before + 1, "doble toque: un solo corte", String(await countRecords()));
    check(page.actions === 1, "doble toque: un solo envío", String(page.actions));

    // Completar.
    await openRow(page, "chk-apt-2");
    await page.net({ latency: 800 });
    page.actions = 0;
    const beforeComplete = await countRecords();
    await page.ev(`(() => { const b = ${submitButton}; b.click(); b.click(); })()`);
    check(await page.ev(`${submitButton}.textContent.trim()`) === "Completando…", "el botón dice Completando…");
    await page.closed();
    check((await countRecords()) === beforeComplete + 1 && page.actions === 1, "doble toque en Completar: un solo corte");
    // No vino.
    await page.net();
    await openRow(page, "chk-apt-6");
    await page.tapText("No vino", '[role="dialog"] button');
    await page.wait(hasAction("Sí, no vino"));
    await page.net({ latency: 800 });
    page.actions = 0;
    await page.ev(`(() => { const b = __text("Sí, no vino"); b.click(); b.click(); })()`);
    await page.escape();
    await sleep(200);
    check(await page.ev(`!!__dialog()`), "confirmando no se cierra");
    await page.closed();
    check(page.actions === 1 && (await statusOf("chk-apt-6")) === "NO_SHOW", "doble toque en No vino: un solo envío");
    await page.net();
  });

  await section("Sin conexión", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    await openWalkIn(page);
    await page.tap(tile("Corte de pelo"));
    await page.tap(tile("Arreglo de barba"));
    await page.tap(`__all('[role="dialog"] label').find((l) => l.textContent.trim() === "Tarjeta")`);
    await page.ev(`(() => { const s = __one('[role="dialog"] [name="barberId"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, ${JSON.stringify(barber.userId)}); s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    const before = await countRecords();
    page.ignoreErrors = true; // El navegador informa el corte de red: es lo que se prueba.
    await page.net({ offline: true });
    await page.tap(submitButton);
    const message = "No se pudo confirmar. Revisá la conexión y fijate si quedó registrado antes de repetir.";
    await page.wait(`__all('[role="dialog"] [role="alert"]').some((e) => e.textContent.trim() === ${JSON.stringify(message)})`);
    check(true, "la hoja sigue abierta con el mensaje");
    await page.shot("sin-conexion");
    const kept = async () =>
      (await page.ev(checkedServices)).length === 2 &&
      (await page.ev(`__all('[role="dialog"] [name="paymentMethod"]').find((i) => i.checked).value`)) === "CARD" &&
      (await page.ev(`__one('[role="dialog"] [name="barberId"]').value`)) === barber.userId;
    check(await kept(), "lo cargado queda intacto");
    check(await page.ev(`${submitButton}.textContent.trim() === "Registrar $24.000" && !${submitButton}.disabled`), "se puede repetir");
    none(await page.ev("__contrast(__dialog())"), "error con contraste AA");
    check(await page.ev(`getComputedStyle(__one('[role="dialog"] [role="alert"]')).color === "rgb(180, 35, 24)"`), "error en rojo fijo");
    check((await countRecords()) === before && (await page.ev(`__toast() === ""`)), "nada se muestra como guardado");
    await page.net();
    await sleep(300);
    await page.tap(submitButton);
    await page.closed();
    page.ignoreErrors = false;
    const [saved] = await q(`select "paymentMethod", total::text, "barberId" from "ServiceRecord" where "barbershopId"=$1 and "businessDate"=$2::date`, [shop, today]);
    check((await countRecords()) === before + 1 && saved.paymentMethod === "CARD" && saved.total === "24000.00" && saved.barberId === barber.userId, "al volver la conexión registra lo elegido", saved);
  });

  await section("Error del servidor", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    await openRow(page, "chk-apt-2");
    await page.tap(`__all('[role="dialog"] label').find((l) => l.textContent.trim() === "Otro")`);
    await q(`update "Appointment" set status='COMPLETED', "barberId"=$2 where id=$1`, ["chk-apt-2", fx.other]);
    await page.tap(submitButton);
    await page.wait(`!!__one('[role="dialog"] [role="alert"]')`);
    check(await page.ev(`__one('[role="dialog"] [role="alert"]').textContent.trim().length > 5 && __toast() === ""`), "error del servidor en la hoja, sin aviso");
    check((await page.ev(`__all('[role="dialog"] [name="paymentMethod"]').find((i) => i.checked).value`)) === "OTHER" && (await page.ev(checkedServices)).length === 1, "con los datos intactos");
    await page.shot("error-servidor");
    await page.escape();
    await page.closed();
    await openRow(page, "chk-apt-3");
    check(await page.ev(`!__one('[role="dialog"] [role="alert"]')`), "otra hoja no hereda el error");
  });

  await section("Otro cambia mi turno", async (open) => {
    const page = await open({ token: BARBER, ...SMALL });
    await page.go("/dashboard/today");
    await openRow(page, "chk-apt-2");
    check(await page.ev(hasAction("No vino")), "turno abierto con acciones");
    const scroll = await page.ev("scrollY");
    // Antes de 30 segundos no refresca.
    await q(`update "Appointment" set status='COMPLETED', "barberId"=$2 where id=$1`, ["chk-apt-2", barber.userId]);
    await page.ev(`document.dispatchEvent(new Event("visibilitychange"))`);
    await sleep(700);
    check(await page.ev(hasAction("No vino")), "antes de 30 segundos no refresca");
    await page.comeBack();
    await page.wait(`!${hasAction("No vino")}`);
    check(await page.ev(`!!__dialog() && !${submitButton} && !${hasAction("Cancelar turno")} && __dialog().textContent.includes("Completado")`), "pasó a terminado: detalle sin acciones");
    check(await page.ev(`!!__text("Llamar", '[role="dialog"] a') && !!__text("Ver ficha", '[role="dialog"] a')`), "quedan Llamar y Ver ficha");
    check((await page.ev("scrollY")) === scroll, "el refresco no mueve el scroll");
    await page.shot("turno-terminado-abierto");
    await page.escape();
    await page.closed();

    await openRow(page, "chk-apt-6");
    await q(`update "Appointment" set "barberId"=$2 where id=$1`, ["chk-apt-6", fx.other]);
    await page.comeBack();
    await page.closed();
    await page.wait(`__toast() === "Ese turno ya no está en tu lista"`);
    check(await page.ev(`!${row("chk-apt-6")}`), "ya no está: la hoja se cierra con el aviso");
    await page.shot("turno-ya-no-esta");

    // Con un envío en curso, un refresco no cierra la hoja.
    await openRow(page, "chk-apt-7");
    await page.net({ latency: 1500 });
    await page.tap(submitButton);
    await page.comeBack();
    await sleep(400);
    check(await page.ev(`!!__dialog() && ${submitButton}.textContent.trim() === "Completando…"`), "un refresco con envío en curso no cierra la hoja");
    await page.closed();
    await page.net();
  });

  await section("Borrador", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    const fill = async () => {
      await openWalkIn(page);
      await page.tap(tile("Corte de pelo"));
      await page.tap(tile("Arreglo de barba"));
      await page.tap(`__all('[role="dialog"] label').find((l) => l.textContent.trim() === "Transf.")`);
      await page.ev(`(() => { const s = __one('[role="dialog"] [name="barberId"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, ${JSON.stringify(barber.userId)}); s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      await page.tapText("Cliente*", '[role="dialog"] button');
      await page.type(`__one('[role="dialog"] [name="name"]')`, "Nombre a mano");
      await page.type(`__one('[role="dialog"] [name="phone"]')`, fx.customers[1].phone);
      await page.wait(`__dialog().textContent.includes("Juan Acosta") && __dialog().textContent.includes(${JSON.stringify(NOTES)})`);
    };
    const state = async () => ({
      services: (await page.ev(checkedServices)).length,
      payment: await page.ev(`__all('[role="dialog"] [name="paymentMethod"]').find((i) => i.checked).value`),
      barber: await page.ev(`__one('[role="dialog"] [name="barberId"]').value`),
      phone: await page.ev(`__dialog().querySelector('[name="phone"]').value`),
      customer: await page.ev(`__dialog().textContent.includes("Juan Acosta")`),
    });
    const full = JSON.stringify({ services: 2, payment: "TRANSFER", barber: barber.userId, phone: fx.customers[1].phone, customer: true });
    await fill();
    await page.shot("borrador");
    await page.escape();
    await page.closed();
    await openWalkIn(page);
    check(JSON.stringify(await state()) === full, "cerrar y reabrir conserva todo", await state());
    await page.comeBack();
    await sleep(900);
    check(JSON.stringify(await state()) === full && (await page.ev(`!!__dialog()`)), "sobrevive a un refresco", await state());
    // Vuelve a escribir el teléfono: el nombre a mano también se conserva.
    await page.type(`__one('[role="dialog"] [name="phone"]')`, "5491199998888");
    await page.wait(`__dialog().textContent.includes("(cliente nuevo)")`);
    check(await page.ev(`__one('[role="dialog"] [name="name"]').value`) === "Nombre a mano", "conserva el nombre");

    await q(`update "Service" set active=false where id=$1`, [fx.services.find((s) => s.name === "Arreglo de barba").id]);
    await page.comeBack();
    await page.wait(`${submitButton}.textContent.trim() === "Registrar $15.000"`);
    check((await page.ev(checkedServices)).length === 1, "un servicio desactivado no se cuenta ni se envía");
    await q(`update "Service" set active=true where id=$1`, [fx.services.find((s) => s.name === "Arreglo de barba").id]);
    await page.escape();
    await page.closed();

    const empty = async (label) => {
      await page.wait(`location.pathname === "/dashboard/today" && ${LOADED}`);
      await sleep(300);
      await openWalkIn(page);
      const now = await state().catch((e) => String(e));
      check(now.services === 0 && now.payment === "CASH" && now.barber === owner.userId && now.phone === "" && !now.customer && (await page.ev(`__dialog().querySelector('[name="name"]').value`)) === "", label, now);
      await page.escape();
      await page.closed();
    };
    await page.tap(`__one('nav.panel-nav a[href="/dashboard/cash"]')`);
    await page.wait(`location.pathname === "/dashboard/cash" && ${LOADED}`);
    await page.tap(`__one('nav.panel-nav a[href="/dashboard/today"]')`);
    await empty("salir y volver con la pestaña: borrador vacío");

    await fill();
    await page.escape();
    await page.closed();
    await page.tap(`__one('nav.panel-nav a[href="/dashboard/cash"]')`);
    await page.wait(`location.pathname === "/dashboard/cash" && ${LOADED}`);
    await page.ev("history.back()");
    await empty("salir y volver con Atrás: borrador vacío");
  });

  await section("Corte con cliente", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    await openWalkIn(page);
    await page.tap(tile("Corte de pelo"));
    await page.tapText("Cliente*", '[role="dialog"] button');
    await page.type(`__one('[role="dialog"] [name="phone"]')`, "549110000999");
    await page.wait(`__dialog().textContent.includes("(cliente nuevo)")`);
    await page.type(`__one('[role="dialog"] [name="name"]')`, "Cliente Nuevo");
    const before = await countRecords();
    await page.enter();
    await sleep(500);
    check((await countRecords()) === before && (await page.ev(`!!__dialog()`)), "Enter en un campo no registra");
    await page.tap(submitButton);
    await page.closed();
    const [saved] = await q(`select c.name from "ServiceRecord" r join "Customer" c on c.id=r."customerId" where r."barbershopId"=$1 and r."businessDate"=$2::date`, [shop, today]);
    check(saved?.name === "Cliente Nuevo", "registra con el cliente nuevo", saved);
  });

  await section("Completar, no vino y cancelar", async (open) => {
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    await openRow(page, "chk-apt-3");
    check(await page.ev(`__one('[role="dialog"] [name="barberId"]').value`) === barber.userId, "¿Quién atendió? arranca en el barbero asignado");
    check(await page.ev(`__dialog().textContent.includes(${JSON.stringify(`Nota: ${NOTES}`)})`), "notas del cliente");
    check(await page.ev(`__text("Llamar", '[role="dialog"] a').getAttribute("href")`) === `tel:+${fx.customers[3].phone}`, "Llamar con tel:+");
    await page.escape();
    await page.closed();

    await openRow(page, "chk-apt-5");
    check(JSON.stringify(await page.ev(checkedServices)) === JSON.stringify([fx.inactive]), "el servicio reservado viene marcado aunque esté inactivo");
    check(await page.ev(`__one('[role="dialog"] [name="barberId"]').value`) === owner.userId, "sin asignar: arranca en quien usa el panel");
    await page.tap(submitButton);
    await page.wait(`__toast().startsWith("Turno completado: registro #")`);
    check((await statusOf("chk-apt-5")) === "COMPLETED", "completa el turno");
    await page.wait(`${row("chk-apt-5")}.lastElementChild.textContent.trim() === "Listo" && ${row("chk-apt-5")}.hasAttribute("data-done")`);
    check(true, "queda atenuado en su lugar");

    await openRow(page, "chk-apt-6");
    await page.tapText("No vino", '[role="dialog"] button');
    await page.wait(`__dialog().textContent.includes("¿Marcar que Bruno Díaz no vino?")`);
    check(await page.ev(`getComputedStyle(__text("Sí, no vino")).backgroundColor === "rgba(0, 0, 0, 0)" && getComputedStyle(__text("Sí, no vino")).color === "rgb(180, 35, 24)"`), "la acción peligrosa es texto rojo fijo sin fondo");
    await page.shot("confirmar-no-vino");
    await page.tapText("Volver", '[role="dialog"] button');
    await page.wait(hasAction("No vino"));
    check((await statusOf("chk-apt-6")) === "CONFIRMED", "Volver no cambia nada");
    await page.tapText("No vino", '[role="dialog"] button');
    await page.wait(hasAction("Sí, no vino"));
    await page.tapText("Sí, no vino", '[role="dialog"] button');
    await page.wait(`__toast().startsWith("Marcado como")`);
    check((await statusOf("chk-apt-6")) === "NO_SHOW", "marca que no vino");

    await openRow(page, "chk-apt-7");
    await page.tapText("Cancelar turno", '[role="dialog"] button');
    await page.wait(`__dialog().textContent.includes("¿Cancelar el turno de Pablo Luna?")`);
    await page.tapText("Sí, cancelar", '[role="dialog"] button');
    await page.wait(`__toast() === "Turno cancelado."`);
    check((await statusOf("chk-apt-7")) === "CANCELLED", "cancela el turno");

    await openRow(page, "chk-apt-0");
    check(await page.ev(`!${submitButton} && !${hasAction("No vino")} && !${hasAction("Cancelar turno")}`), "un turno terminado abre el detalle sin acciones");
    await page.escape();
    await page.closed();

    await page.tap(`__one("[data-summary]")`);
    await page.opened();
    const text = await page.ev(`__dialog().textContent`);
    check(["#1", "con turno", "Nicolás Rey", "Servicio retirado", "Efectivo", "$8.000"].every((t) => text.includes(t)), "la lista muestra número, turno, cliente, servicio, medio y total", text);
    check(await page.ev(`__one('[role="dialog"] a[href="/dashboard/today/customers/chk-cus-5"]') !== null`), "con enlace a la ficha del cliente");
    await page.shot("lista-de-cortes");
  });

  await section("Caja cerrada y vacíos", async (open) => {
    await q(
      `insert into "CashRegisterClose"(id,"barbershopId","businessDate","totalCash","totalTransfer","totalCard","totalOther",total,"closedById")
       values('chk-close',$1,$2::date,0,0,0,0,0,$3)`,
      [shop, today, owner.userId],
    );
    const page = await open({ token: OWNER, ...PHONE });
    await page.go("/dashboard/today");
    check(await page.ev(`__one("[data-dock]").textContent.trim() === "La caja de hoy ya está cerrada" && !__text("Registrar corte")`), "caja cerrada: mensaje en lugar del botón");
    await openRow(page, "chk-apt-2");
    check(await page.ev(`!${submitButton} && !${hasAction("No vino")} && !${hasAction("Cancelar turno")} && !!__text("Llamar", '[role="dialog"] a')`), "caja cerrada: el turno abierto muestra el detalle sin acciones");
    await page.shot("caja-cerrada-turno");
    await page.escape();
    await page.closed();
    await page.shot("caja-cerrada");
    none(await page.ev("__contrast()"), "caja cerrada con contraste AA");

    await resetFixture({ appointments: false });
    await page.go("/dashboard/today");
    check(await page.ev(`__one("main").textContent.includes("No hay turnos para hoy.") && !!${CTA}`), "sin turnos: lo dice y se puede registrar");
    check(await page.ev(`__one("[data-summary]").textContent.trim()`) === "La barbería todavía no tiene cortes hoy", "resumen vacío del dueño");
    await page.shot("sin-turnos");
    await page.tap(`__one("[data-summary]")`);
    await page.opened();
    check(await page.ev(`__dialog().textContent.includes("Todavía no se registró ningún corte hoy.")`), "lista de cortes vacía");
    await page.escape();
    await page.closed();

    await resetFixture({ services: false });
    await page.go("/dashboard/today");
    check(await page.ev(`__text("Cargá tus servicios", "a")?.getAttribute("href")`) === "/dashboard/services", "sin servicios, el dueño ve el enlace");
    await page.shot("sin-servicios-dueno");
    await openRow(page, "chk-apt-2");
    check(await page.ev(`${submitButton}.textContent.trim()`) === "Completar $15.000", "sin servicios activos, el reservado se puede completar");
    const b = await open({ token: BARBER, ...PHONE });
    await b.go("/dashboard/today");
    check(await b.ev(`__one("[data-dock]").textContent.trim()`) === "Pedile al dueño que cargue los servicios", "sin servicios, el barbero sabe qué hacer");
    check(await b.ev(`__one("[data-summary]").textContent.trim()`) === "Todavía no hiciste cortes hoy", "resumen vacío del barbero");
    await b.shot("sin-servicios-barbero");
  });

  await section("Fuera del panel", async (open) => {
    const [{ slug }] = await q(`select slug from "Barbershop" where id=$1`, [shop]);
    const page = await open({ ...PHONE });
    for (const path of [`/${slug}`, "/login", "/admin/login"]) {
      await page.s("Page.navigate", { url: base + path });
      await page.wait(`location.pathname === ${JSON.stringify(path)} && document.readyState === "complete" && !!document.querySelector("h1, form")`);
      check(await page.ev(`!document.querySelector(".panel-theme") && !getComputedStyle(document.body).getPropertyValue("--brand")`), `${path} sin el tema del panel`);
      await page.shot(`fuera-${path.replace(/\W+/g, "-")}`);
    }
  });
}

// ---------------------------------------------------------------------------

let exitCode = 1;
try {
  await client.connect();
  await connect();
  await recorridos();
  await hojas();
  await navegacion();
  await medidas();
  await capturas();
  await resetFixture();
  console.log(`\n${passed} verificaciones pasaron, ${failures.length} fallaron.`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error);
} finally {
  clearTimeout(globalTimer);
  await Promise.race([send("Browser.close").catch(() => {}), sleep(3000)]).catch(() => {});
  await sleep(500);
  killChrome();
  await client.end().catch(() => {});
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // El perfil es temporal: si Chrome todavía lo tiene tomado, lo limpia el sistema.
  }
  process.exit(exitCode);
}
