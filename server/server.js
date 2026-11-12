#!/usr/bin/env node
/* ============================================================================
   SERVIDOR MULTIJUGADOR DE MINICRAFT 3.0
   ----------------------------------------------------------------------------
   Sin dependencias: solo hace falta Node.js 18 o superior.

       node server.js                     (puerto 8080)
       node server.js --port=9000 --seed=12345 --mode=creative --pvp=off

   Qué hace:
     · Sirve el juego por HTTP (abre http://TU-IP:8080 en el navegador).
     · Acepta conexiones WebSocket en el mismo puerto (ws://TU-IP:8080).
     · Es la autoridad de la semilla, el modo, los bloques modificados, los
       cofres/hornos/carteles, la hora y el clima; reenvía a los demás las
       posiciones de los jugadores, las criaturas, los objetos del suelo, los
       jefes, el chat y los golpes.
     · Guarda el mundo y el inventario de cada jugador en data/world.json.

   Opciones (como --opcion=valor o como variable de entorno en MAYÚSCULAS):
     port      8080             puerto (las plataformas de alojamiento usan PORT)
     seed      (al azar)        semilla del mundo, solo al crearlo
     mode      survival         survival | creative, solo al crear el mundo
     pvp       on               on | off: los jugadores pueden golpearse
     max       12               jugadores a la vez
     password  (ninguna)        contraseña para entrar
     name      Servidor MiniCraft
     data      ./data           carpeta donde se guarda el mundo
     game      (auto)           ruta del index.html del juego

   Comandos en esta consola: help, list, say <texto>, kick <nombre>,
     time <day|night|0..1>, weather <clear|rain|storm|fog>, save, stop
   ============================================================================ */
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');

/* ---------- Configuración ---------- */
const args = {};
for (const a of process.argv.slice(2)) { const m = /^--([a-z]+)(?:=(.*))?$/i.exec(a); if (m) args[m[1].toLowerCase()] = m[2] ?? 'on'; }
const opt = (k, d) => args[k] ?? process.env[k.toUpperCase()] ?? process.env['MC_' + k.toUpperCase()] ?? d;
const cfg = {
  port: parseInt(opt('port', 8080), 10) || 8080,
  seed: opt('seed', null),
  mode: opt('mode', 'survival') === 'creative' ? 'creative' : 'survival',
  pvp: !/^(off|0|false|no)$/i.test(String(opt('pvp', 'on'))),
  max: Math.max(1, parseInt(opt('max', 12), 10) || 12),
  password: String(opt('password', '') || ''),
  name: String(opt('name', 'Servidor MiniCraft')).slice(0, 60),
  data: path.resolve(opt('data', path.join(__dirname, 'data'))),
  game: opt('game', null),
};
const PROTOCOL = 3, WY = 96, DAY_LENGTH = 1200;          // deben coincidir con el juego
const MAX_MSG = 512 * 1024, SAVE_EVERY = 30000;
const WEATHERS = ['clear', 'rain', 'storm', 'fog'];
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

/* ---------- Mundo (persistente) ---------- */
function seedFrom(s) {
  if (s == null || s === '') return crypto.randomInt(1, 2147483647);
  if (/^-?\d+$/.test(String(s))) return Number(s) | 0;
  let h = 0; for (const c of String(s)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h;
}
const worldFile = path.join(cfg.data, 'world.json');
const W = { v: 1, gen: 2, seed: 0, mode: cfg.mode, time: 0.045, days: 0, weather: 'clear', weatherT: 600, tiles: {}, players: {}, bosses: {} };
const drops = new Map();          // objetos en el suelo: id → { s: [id, cantidad, daño, encantamientos], p: [x, y, z], t: creado }
const activeBoss = new Map();     // jefes despiertos: plan → { owner: id del jugador que lo simula, k: tipo }
const DROP_LIFE = 300000, MAX_DROPS = 600;
const edits = new Map();          // "cx,cz" → Map(índice local → id | meta << 8), igual que en el cliente
let dirty = false;

function loadWorld() {
  for (const f of [worldFile, worldFile + '.bak']) {
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!Number.isFinite(d.seed)) throw new Error('sin semilla');
      Object.assign(W, { gen: d.gen === 2 ? 2 : 1, seed: d.seed, mode: d.mode === 'creative' ? 'creative' : 'survival', time: +d.time || 0, days: d.days | 0,
        weather: WEATHERS.includes(d.weather) ? d.weather : 'clear', weatherT: +d.weatherT || 600, tiles: d.tiles || {}, players: d.players || {}, bosses: d.bosses || {} });
      for (const k in d.edits || {}) {
        const m = new Map();
        for (const e of String(d.edits[k]).split(',')) { const [i, v] = e.split(':'); const ii = parseInt(i, 36), vv = parseInt(v, 36); if (Number.isFinite(ii) && Number.isFinite(vv)) m.set(ii, vv); }
        if (m.size) edits.set(k, m);
      }
      log(`Mundo cargado de ${path.basename(f)}: semilla ${W.seed}, modo ${W.mode}, ${countEdits()} bloques modificados, ${Object.keys(W.players).length} jugadores guardados`);
      return;
    } catch (e) { if (e.code !== 'ENOENT') log(`No se pudo leer ${f}: ${e.message}`); }
  }
  W.seed = seedFrom(cfg.seed); W.mode = cfg.mode; W.gen = 2; dirty = true;     // gen 2 = biomas de la 3.1; los mundos ya guardados conservan el suyo
  log(`Mundo nuevo: semilla ${W.seed}, modo ${W.mode}`);
}
const countEdits = () => { let n = 0; for (const m of edits.values()) n += m.size; return n; };
function packEdits() {
  const out = {};
  for (const [k, m] of edits) { if (!m.size) continue; const a = []; for (const [i, v] of m) a.push(i.toString(36) + ':' + v.toString(36)); out[k] = a.join(','); }
  return out;
}
function saveWorld(sync) {
  if (!dirty) return;
  dirty = false;
  const json = JSON.stringify({ v: 1, gen: W.gen, seed: W.seed, mode: W.mode, time: W.time, days: W.days, weather: W.weather, weatherT: W.weatherT, edits: packEdits(), tiles: W.tiles, players: W.players, bosses: W.bosses, saved: Date.now() });
  try {
    fs.mkdirSync(cfg.data, { recursive: true });
    const tmp = worldFile + '.tmp';
    fs.writeFileSync(tmp, json);
    if (fs.existsSync(worldFile)) fs.copyFileSync(worldFile, worldFile + '.bak');
    fs.renameSync(tmp, worldFile);
    if (!sync) log(`Mundo guardado (${(json.length / 1024).toFixed(0)} KB)`);
  } catch (e) { dirty = true; log('⚠ No se pudo guardar el mundo:', e.message); }
}

/* ---------- WebSocket mínimo (RFC 6455, sin extensiones) ---------- */
const clients = new Map();        // id → Client
let nextId = 1;
class Client {
  constructor(socket, ip) {
    this.socket = socket; this.ip = ip; this.id = null; this.name = null; this.key = null;
    this.buf = Buffer.alloc(0); this.frag = null; this.alive = true; this.closed = false;
    this.state = null; this.msgs = 0; this.joined = Date.now();
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => this.onClose());
  }
  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (!this.closed) {
      const b = this.buf; if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80; let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; const hi = b.readUInt32BE(2); len = b.readUInt32BE(6); off = 10; if (hi) return this.close(1009, 'mensaje demasiado grande'); }
      if (!masked) return this.close(1002, 'trama sin máscara');
      if (len > MAX_MSG) return this.close(1009, 'mensaje demasiado grande');
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) return this.close(1000);
      if (op === 9) { this.frame(10, payload); continue; }
      if (op === 10) { this.alive = true; continue; }
      if (op === 2) return this.close(1003, 'solo texto');
      if (op === 1 || op === 0) {
        if (op === 1) this.frag = []; else if (!this.frag) return this.close(1002, 'fragmento inesperado');
        this.frag.push(payload);
        if (this.frag.reduce((n, p) => n + p.length, 0) > MAX_MSG) return this.close(1009, 'mensaje demasiado grande');
        if (fin) { const text = Buffer.concat(this.frag).toString('utf8'); this.frag = null; this.onText(text); }
      }
    }
  }
  frame(op, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(len, 6); }
    this.socket.write(head); this.socket.write(payload);
    if (this.socket.writableLength > 8 * 1024 * 1024) this.close(1008, 'conexión demasiado lenta');
  }
  send(msg) { this.frame(1, Buffer.from(typeof msg === 'string' ? msg : JSON.stringify(msg))); }
  close(code = 1000, reason = '') {
    if (this.closed) return;
    try { const r = Buffer.from(reason); const p = Buffer.alloc(2 + r.length); p.writeUInt16BE(code, 0); r.copy(p, 2); this.frame(8, p); } catch {}
    this.closed = true;
    try { this.socket.end(); } catch {}
    setTimeout(() => { try { this.socket.destroy(); } catch {} }, 1000);
    this.onClose();
  }
  kick(reason) { this.send({ type: 'kicked', reason }); this.close(1008, reason.slice(0, 100)); }
  onClose() {
    if (this.gone) return; this.gone = true; this.closed = true;
    if (this.id != null && clients.get(this.id) === this) {
      clients.delete(this.id);
      for (const [plan, b] of activeBoss) if (b.owner === this.id) { activeBoss.delete(plan); broadcast({ type: 'bleft', plan: b.plan }); }
      broadcast({ type: 'leave', id: this.id });
      sys(`${this.name} salió del servidor`);
      log(`- ${this.name} salió (${clients.size}/${cfg.max})`);
    }
  }
  onText(text) {
    if (++this.msgs > 600) return this.kick('Demasiados mensajes por segundo');
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
    try { handle(this, m); } catch (e) { log('Error al procesar', m.type, 'de', this.name || this.ip, '-', e.message); }
  }
}
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const c of clients.values()) if (c !== except) c.send(s);
}
const sys = (text, except) => broadcast({ type: 'sys', text }, except);

/* ---------- Protocolo del juego ---------- */
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const num = (n, d = 0) => (Number.isFinite(n) ? n : d);
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
const cleanText = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
const playerList = (except) => [...clients.values()].filter((c) => c !== except).map((c) => ({ id: c.id, name: c.name, s: c.state }));

function handle(c, m) {
  if (c.id == null) {                      // lo primero tiene que ser «hello»
    if (m.type !== 'hello') return;
    if (m.v !== PROTOCOL) return c.kick('La versión del juego no coincide con la del servidor. Recarga la página.');
    if (cfg.password && m.pass !== cfg.password) return c.kick(m.pass ? 'Contraseña incorrecta' : 'Este servidor pide contraseña');
    if (clients.size >= cfg.max) return c.kick('El servidor está lleno');
    const token = String(m.token || ''); if (token.length < 8 || token.length > 80) return c.kick('Identificador de jugador no válido');
    c.key = crypto.createHash('sha1').update(token).digest('hex').slice(0, 20);
    for (const o of clients.values()) if (o.key === c.key) o.kick('Has entrado desde otra pestaña o dispositivo');
    let name = cleanName(m.name) || 'Jugador', base = name, n = 2;
    while ([...clients.values()].some((o) => o.name.toLowerCase() === name.toLowerCase())) name = (base.slice(0, 13) + ' ' + n++);
    c.name = name; c.id = nextId++;
    const saved = W.players[c.key];
    c.send({ type: 'welcome', id: c.id, name, server: cfg.name, seed: W.seed, gen: W.gen, mode: W.mode, pvp: cfg.pvp, dayLength: DAY_LENGTH,
      time: W.time, days: W.days, weather: W.weather, edits: packEdits(), tiles: W.tiles, players: playerList(c), you: saved ? saved.d : null,
      drops: [...drops].map(([did, d]) => [did, d.s, d.p, Math.round((Date.now() - d.t) / 1000)]), bosses: Object.keys(W.bosses) });
    clients.set(c.id, c);
    broadcast({ type: 'join', id: c.id, name }, c);
    sys(`${name} entró al servidor`, c);
    log(`+ ${name} entró desde ${c.ip} (${clients.size}/${cfg.max})`);
    return;
  }
  switch (m.type) {
    case 'player': {
      if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
      c.state = { p: m.p.map((v) => Math.round(v * 100) / 100), yaw: num(m.yaw), pitch: num(m.pitch), anim: m.anim === 'walk' ? 'walk' : 'idle',
        held: m.held | 0, hp: Math.max(0, Math.min(40, num(m.hp, 20))), cr: m.cr ? 1 : 0, sw: m.sw ? 1 : 0 };
      broadcast({ type: 'player', id: c.id, ...c.state }, c);
      break;
    }
    case 'block': {
      if (!isInt(m.x, -3e7, 3e7) || !isInt(m.z, -3e7, 3e7) || !isInt(m.y, 0, WY - 1) || !isInt(m.id, 0, 255)) return;
      const meta = isInt(m.meta, 0, 65535) ? m.meta : 0, key = (m.x >> 4) + ',' + (m.z >> 4), i = (m.x & 15) | ((m.z & 15) << 4) | (m.y << 8);
      let ed = edits.get(key); if (!ed) { ed = new Map(); edits.set(key, ed); }
      ed.set(i, m.id | (meta << 8)); dirty = true;
      broadcast({ type: 'block', x: m.x, y: m.y, z: m.z, id: m.id, meta }, c);
      break;
    }
    case 'tile': {
      if (typeof m.key !== 'string' || !/^-?\d{1,9},\d{1,3},-?\d{1,9}$/.test(m.key)) return;
      if (m.d == null) delete W.tiles[m.key];
      else { if (typeof m.d !== 'object' || JSON.stringify(m.d).length > 16384) return; W.tiles[m.key] = m.d; }
      dirty = true;
      broadcast({ type: 'tile', key: m.key, d: m.d ?? null }, c);
      break;
    }
    case 'save': {
      if (!m.d || typeof m.d !== 'object' || JSON.stringify(m.d).length > 200000) return;
      W.players[c.key] = { name: c.name, t: Date.now(), d: m.d }; dirty = true;
      break;
    }
    case 'chat': {
      const text = cleanText(m.text); if (!text) return;
      if (text[0] === '/') return chatCommand(c, text.slice(1));
      log(`<${c.name}> ${text}`);
      broadcast({ type: 'chat', id: c.id, name: c.name, text });
      break;
    }
    case 'sleep': {
      W.time = 0.01; W.days++; W.weather = 'clear'; W.weatherT = 300 + Math.random() * 600; dirty = true;
      broadcast({ type: 'time', t: W.time, d: W.days }); broadcast({ type: 'weather', w: W.weather });
      sys(`${c.name} durmió: ya es de día`);
      break;
    }
    case 'died': sys(`${c.name} murió${m.msg ? ': ' + cleanText(m.msg).slice(0, 80) : ''}`); break;
    case 'ents': {                          // criaturas que simula este jugador → los demás las ven
      if (!Array.isArray(m.l) || m.l.length > 80) return;
      broadcast({ type: 'ents', id: c.id, l: m.l }, c);
      break;
    }
    case 'ehit': case 'kill': case 'hit': { // mensajes dirigidos a un jugador concreto
      const to = clients.get(m.to); if (!to || to === c) return;
      if (m.type === 'hit' && !cfg.pvp) return;
      if (m.type === 'hit') to.send({ type: 'hit', from: c.id, name: c.name, dmg: Math.max(0, Math.min(40, num(m.dmg, 1))), x: num(m.x), z: num(m.z) });
      else if (m.type === 'ehit') to.send({ type: 'ehit', from: c.id, nid: m.nid | 0, dmg: Math.max(0, Math.min(200, num(m.dmg, 1))), x: num(m.x), z: num(m.z) });
      else to.send({ type: 'kill', from: c.id, k: String(m.k).slice(0, 24), p: Array.isArray(m.p) ? m.p.slice(0, 3).map((v) => num(v)) : [0, 0, 0], fire: m.fire ? 1 : 0 });
      break;
    }
    case 'drop': {                          // un objeto cae al suelo: lo ven todos
      const did = String(m.did);
      if (did.length > 24 || !did.startsWith(c.id + ':') || drops.has(did)) return;
      if (!Array.isArray(m.s) || m.s.length < 2 || m.s.length > 4 || !isInt(m.s[0], 1, 65535) || !isInt(m.s[1], 1, 999) || JSON.stringify(m.s).length > 400) return;
      if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
      const v = Array.isArray(m.v) && m.v.length === 3 && m.v.every(Number.isFinite) ? m.v : [0, 0, 0];
      drops.set(did, { s: m.s, p: m.p, t: Date.now() });
      if (drops.size > MAX_DROPS) { const old = drops.keys().next().value; drops.delete(old); broadcast({ type: 'picked', did: old, by: 0 }); }
      broadcast({ type: 'drop', did, s: m.s, p: m.p, v }, c);
      break;
    }
    case 'dmove': {                         // dónde quedó en reposo (para quien llegue después)
      const d = drops.get(String(m.did));
      if (!d || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
      d.p = m.p; broadcast({ type: 'dmove', did: String(m.did), p: m.p }, c);
      break;
    }
    case 'pickup': {                        // el primero que lo pide se lo lleva
      const did = String(m.did);
      if (!drops.delete(did)) return;
      broadcast({ type: 'picked', did, by: c.id });
      break;
    }
    case 'bstart': case 'bstate': case 'bdead': case 'bleft': {   // jefes: uno solo para todos, lo simula quien lo despertó
      if (typeof m.plan !== 'string' && typeof m.plan !== 'number') return;
      const key = String(m.plan).slice(0, 48), cur = activeBoss.get(key);
      if (m.type === 'bstart') {
        if (W.bosses[key]) return c.send({ type: 'bdone', plan: m.plan });
        if (cur && cur.owner !== c.id) return c.send({ type: 'bdeny', plan: m.plan });
        activeBoss.set(key, { owner: c.id, plan: m.plan, k: String(m.k).slice(0, 24) });
        return;
      }
      if (!cur || cur.owner !== c.id) return;
      if (m.type === 'bstate') {
        if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
        broadcast({ type: 'bstate', id: c.id, plan: m.plan, k: cur.k, nid: m.nid | 0, p: m.p, yaw: num(m.yaw), hp: num(m.hp), ph: m.ph | 0, st: String(m.st || '').slice(0, 16) }, c);
      } else if (m.type === 'bdead') {
        activeBoss.delete(key); W.bosses[key] = 'done'; dirty = true;
        broadcast({ type: 'bdead', plan: m.plan, k: cur.k, p: Array.isArray(m.p) ? m.p.slice(0, 3).map((v) => num(v)) : [0, 0, 0], name: c.name }, c);
        log(`${c.name} derrotó al jefe ${cur.k}`);
      } else { activeBoss.delete(key); broadcast({ type: 'bleft', plan: m.plan }, c); }
      break;
    }
    case 'ping': c.send({ type: 'pong', t: m.t }); break;
  }
}
function chatCommand(c, line) {
  const [cmd] = line.split(/\s+/), tell = (text) => c.send({ type: 'sys', text });
  switch (cmd.toLowerCase()) {
    case 'list': case 'jugadores': tell(`Conectados (${clients.size}/${cfg.max}): ${[...clients.values()].map((o) => o.name).join(', ')}`); break;
    case 'seed': case 'semilla': tell(`Semilla del mundo: ${W.seed}`); break;
    case 'help': case 'ayuda': tell('Comandos: /list (jugadores conectados), /seed (semilla del mundo)'); break;
    default: tell(`Comando desconocido: /${cmd}. Escribe /help`);
  }
}

/* ---------- Hora y clima (autoridad del servidor) ---------- */
let lastTick = Date.now(), timeT = 0;
setInterval(() => {
  const now = Date.now(), dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
  for (const c of clients.values()) c.msgs = 0;
  for (const [did, d] of drops) { if (now - d.t < DROP_LIFE) break; drops.delete(did); broadcast({ type: 'picked', did, by: 0 }); }   // los objetos desaparecen a los 5 minutos
  if (!clients.size) return;                                  // el mundo se detiene sin jugadores
  W.time += dt / DAY_LENGTH; if (W.time >= 1) { W.time -= 1; W.days++; }
  W.weatherT -= dt; dirty = true;
  if (W.weatherT <= 0) {
    if (W.weather === 'clear') { const r = Math.random(); W.weather = r < 0.6 ? 'rain' : r < 0.8 ? 'storm' : 'fog'; W.weatherT = 120 + Math.random() * 240; }
    else { W.weather = 'clear'; W.weatherT = 420 + Math.random() * 900; }
    broadcast({ type: 'weather', w: W.weather });
  }
  if ((timeT += dt) >= 4) { timeT = 0; broadcast({ type: 'time', t: W.time, d: W.days }); }
}, 1000);
// Latido: detecta conexiones muertas y mantiene vivos los proxies
setInterval(() => { for (const c of clients.values()) { if (!c.alive) { c.close(1001, 'sin respuesta'); continue; } c.alive = false; c.frame(9, Buffer.alloc(0)); } }, 25000);
setInterval(() => saveWorld(), SAVE_EVERY);

/* ---------- HTTP: sirve el juego y el estado ---------- */
function findGame() {
  const list = [cfg.game, path.join(__dirname, 'index.html'), path.join(__dirname, '..', 'index.html'), path.join(process.cwd(), 'index.html')].filter(Boolean);
  return list.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
}
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/status' || url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ minicraft: PROTOCOL, name: cfg.name, players: clients.size, max: cfg.max, mode: W.mode, pvp: cfg.pvp, password: !!cfg.password }));
  }
  if (url === '/' || url === '/index.html') {
    const f = findGame();
    if (f) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<meta charset="utf-8"><body style="font-family:sans-serif;max-width:560px;margin:40px auto"><h1>Servidor de MiniCraft en marcha</h1><p>No se encontró <code>index.html</code> junto al servidor. Copia el archivo del juego a esta carpeta o usa <code>--game=ruta/index.html</code>. Mientras tanto puedes conectarte desde el juego con la dirección de este servidor.</p>');
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('No encontrado');
});
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true); socket.setKeepAlive(true, 30000);
  const ip = String(req.headers['x-forwarded-for'] || socket.remoteAddress || '?').split(',')[0].trim();
  new Client(socket, ip);
});

/* ---------- Consola del servidor ---------- */
function consoleCommand(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/), arg = rest.join(' ');
  switch ((cmd || '').toLowerCase()) {
    case '': break;
    case 'help': console.log('Comandos: list · say <texto> · kick <nombre> · time <day|night|0..1> · weather <clear|rain|storm|fog> · save · stop'); break;
    case 'list': console.log(clients.size ? [...clients.values()].map((c) => `${c.name} (${c.ip})`).join(', ') : 'No hay jugadores conectados'); break;
    case 'say': if (arg) { sys(`[Servidor] ${cleanText(arg)}`); log(`[Servidor] ${arg}`); } break;
    case 'kick': { const c = [...clients.values()].find((o) => o.name.toLowerCase() === arg.toLowerCase()); if (c) c.kick('Expulsado por el administrador'); else console.log('No hay nadie con ese nombre'); break; }
    case 'time': { const t = arg === 'day' ? 0.1 : arg === 'night' ? 0.62 : parseFloat(arg); if (t >= 0 && t < 1) { W.time = t; dirty = true; broadcast({ type: 'time', t: W.time, d: W.days }); console.log('Hora cambiada'); } else console.log('Uso: time day | night | 0..1'); break; }
    case 'weather': if (WEATHERS.includes(arg)) { W.weather = arg; W.weatherT = 600; dirty = true; broadcast({ type: 'weather', w: arg }); console.log('Clima cambiado'); } else console.log('Uso: weather clear | rain | storm | fog'); break;
    case 'save': dirty = true; saveWorld(); break;
    case 'stop': shutdown(); break;
    default: console.log('Comando desconocido. Escribe help');
  }
}
function shutdown() {
  log('Cerrando el servidor…');
  for (const c of clients.values()) c.kick('El servidor se ha cerrado');
  dirty = true; saveWorld(true);
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
if (process.stdin.isTTY || process.env.MC_CONSOLE) {
  require('readline').createInterface({ input: process.stdin }).on('line', consoleCommand);
}

/* ---------- Arranque ---------- */
loadWorld();
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `El puerto ${cfg.port} ya está en uso. Prueba con --port=OTRO` : e.message); process.exit(1); });
server.listen(cfg.port, () => {
  const ips = Object.values(require('os').networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  log(`${cfg.name} listo en el puerto ${cfg.port} · PvP ${cfg.pvp ? 'activado' : 'desactivado'} · máx. ${cfg.max} jugadores${cfg.password ? ' · con contraseña' : ''}`);
  log(`  En este equipo:   http://localhost:${cfg.port}`);
  for (const ip of ips) log(`  En tu red local:  http://${ip}:${cfg.port}`);
  log(findGame() ? '  Abre esa dirección en el navegador para jugar. Escribe help para ver los comandos.' : '  ⚠ No se encontró index.html: el servidor funciona, pero no sirve el juego.');
});
