#!/usr/bin/env node
/* ============================================================================
   SERVIDOR MULTIJUGADOR DE LINKCRAFT 5.2 (ANTES MINICRAFT) — SALAS
   ----------------------------------------------------------------------------
   Sin dependencias: solo hace falta Node.js 18 o superior.

       node server.js                     (puerto 8080)
       node server.js --port=9000 --max=16 --rooms=40

   Qué hace:
     · Sirve el juego por HTTP (abre http://TU-IP:8080 en el navegador).
     · Acepta conexiones WebSocket en el mismo puerto (ws://TU-IP:8080).
     · Aloja SALAS: cada sala es un mundo independiente con su propio código de
       invitación (6 letras), su anfitrión, su límite de jugadores y sus permisos.
       Hay una sala pública fija («INICIO») con el mundo de siempre
       (data/world.json), y cualquier jugador puede crear salas nuevas.
     · Es la autoridad de cada sala: semilla, modo, bloques modificados,
       cofres/hornos/carteles, hora, clima, permisos de construcción y quién
       es el anfitrión. Reenvía a los demás de la sala las posiciones, las
       criaturas, los objetos del suelo, los jefes, el chat y los golpes.
     · Guarda cada sala en data/rooms/CÓDIGO.json (la sala INICIO en
       data/world.json) con el inventario de cada jugador.
     · 4.9: equipos (con chat y cofre de equipo compartido, sin fuego amigo),
       comercio entre jugadores, terrenos protegidos y cofres con candado,
       permisos de construcción por jugador, misiones cooperativas y eventos
       de grupo, invitaciones entre salas, latencia de cada jugador y un margen
       de 20 s para reconectarse sin que la sala lo dé por ido.

   Opciones (como --opcion=valor o como variable de entorno en MAYÚSCULAS):
     port      8080             puerto (las plataformas de alojamiento usan PORT)
     max       16               tope de jugadores por sala (el anfitrión elige hasta este número)
     rooms     40               salas guardadas como máximo en el servidor
     password  (ninguna)        contraseña para entrar al servidor
     name      Servidor LinkCraft
     data      ./data           carpeta donde se guardan las salas
     game      (auto)           ruta del index.html del juego
     De la sala INICIO (solo al crearla, salvo pvp/cheats):
     seed      (al azar) · mode survival|creative · pvp on|off · cheats on|off
     lobby     on               off = sin sala INICIO (solo salas con código)

   Comandos en esta consola: help, rooms, list, say <texto>, kick <nombre>,
     time [CÓDIGO] <day|night|0..1>, weather [CÓDIGO] <clear|rain|storm|fog>,
     close <CÓDIGO>, save, stop
   ============================================================================ */
'use strict';
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path');

/* ---------- Configuración ---------- */
const args = {};
for (const a of process.argv.slice(2)) { const m = /^--([a-z]+)(?:=(.*))?$/i.exec(a); if (m) args[m[1].toLowerCase()] = m[2] ?? 'on'; }
const opt = (k, d) => args[k] ?? process.env[k.toUpperCase()] ?? process.env['MC_' + k.toUpperCase()] ?? d;
const yes = (v) => !/^(off|0|false|no)$/i.test(String(v));
const cfg = {
  port: parseInt(opt('port', 8080), 10) || 8080,
  seed: opt('seed', null),
  mode: opt('mode', 'survival') === 'creative' ? 'creative' : 'survival',
  pvp: yes(opt('pvp', 'on')),
  cheats: yes(opt('cheats', 'on')),
  max: Math.max(1, Math.min(64, parseInt(opt('max', 16), 10) || 16)),
  rooms: Math.max(1, parseInt(opt('rooms', 40), 10) || 40),
  lobby: yes(opt('lobby', 'on')),
  password: String(opt('password', '') || ''),
  name: String(opt('name', 'Servidor LinkCraft')).slice(0, 60),
  data: path.resolve(opt('data', path.join(__dirname, 'data'))),
  game: opt('game', null),
};
const PROTOCOL = 4, WY = 96, DAY_LENGTH = 1200;          // deben coincidir con el juego
const MAX_MSG = 512 * 1024, SAVE_EVERY = 30000, UNLOAD_AFTER = 5 * 60000, OWNER_LIMIT = 3;
const WEATHERS = ['clear', 'rain', 'storm', 'fog'], BUILD = ['all', 'trusted', 'host'];
const DEFAULT_CODE = 'INICIO', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DROP_LIFE = 300000, MAX_DROPS = 600;
// 4.9
const FEATURES = ['teams', 'tchest', 'trade', 'claims', 'locks', 'perm', 'coop', 'gev', 'invite', 'pings'];
const TEAM_COLORS = ['#e05050', '#4a8ef0', '#4cc35a', '#e8b83a', '#a463e0', '#f08a3a', '#3ac3c8', '#e070b8'];
const CLAIM_SIZES = [8, 16, 24], CLAIMS_PER_PLAYER = 3, TEAM_SLOTS = 27, GRACE = 20000;
// Misiones cooperativas y eventos de grupo: [tipo, título, objetivo, cantidad base, segundos (eventos)]
const COOP = [['mine', 'Minería en grupo', 'Piquen {n} minerales entre todos', 40], ['kill', 'Limpieza de monstruos', 'Derroten {n} monstruos entre todos', 25],
  ['fish', 'Gran pesca', 'Pesquen {n} peces entre todos', 10], ['cook', 'Banquete', 'Cocinen {n} platos entre todos', 6], ['harvest', 'Cosecha comunal', 'Cosechen {n} cultivos entre todos', 40],
  ['place', 'Obra conjunta', 'Coloquen {n} bloques entre todos', 250], ['explore', 'Exploradores', 'Descubran {n} lugares nuevos entre todos', 3], ['boss', 'Cazadores de jefes', 'Derroten {n} jefe entre todos', 1]];
const GEV = [['kill', 'Cacería grupal', 'Derroten {n} monstruos antes de que acabe el tiempo', 12, 240], ['mine', 'Fiebre minera', 'Piquen {n} minerales antes de que acabe el tiempo', 25, 240],
  ['fish', 'Pesca colectiva', 'Pesquen {n} peces antes de que acabe el tiempo', 6, 300], ['harvest', 'Cosecha relámpago', 'Cosechen {n} cultivos antes de que acabe el tiempo', 25, 240],
  ['place', 'Construcción exprés', 'Coloquen {n} bloques antes de que acabe el tiempo', 150, 240]];
const KINDS = new Set(COOP.map((c) => c[0]));
const validStack = (s) => s == null || (Array.isArray(s) && s.length >= 2 && s.length <= 4 && isInt(s[0], 1, 65535) && isInt(s[1], 1, 999) && JSON.stringify(s).length <= 400);
const sameStack = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const roomsDir = path.join(cfg.data, 'rooms');

function seedFrom(s) {
  if (s == null || s === '') return crypto.randomInt(1, 2147483647);
  if (/^-?\d+$/.test(String(s))) return Number(s) | 0;
  let h = 0; for (const c of String(s)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h;
}
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const num = (n, d = 0) => (Number.isFinite(n) ? n : d);
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
const cleanText = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
const cleanCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/* ---------- Salas ---------- */
// Cada sala es un mundo completo. Solo están en memoria las que tienen jugadores
// (o los tuvieron hace poco); las demás quedan en disco y se cargan al entrar.
const rooms = new Map();          // código → Room cargada
const index = new Map();          // código → resumen de todas las salas guardadas (para la lista y los límites)
class Room {
  constructor(code, file) {
    this.code = code; this.file = file;
    this.W = { v: 2, gen: 5, seed: 0, mode: 'survival', time: 0.045, days: 0, weather: 'clear', weatherT: 600, tiles: {}, players: {}, bosses: {},
      name: 'Sala', owner: null, trusted: [], banned: [], max: Math.min(8, cfg.max), pvp: true, cheats: true, build: 'all', priv: false, pass: '', created: Date.now(),
      teams: {}, claims: [], locks: {}, perm: {}, coop: null, names: {} };
    this.trades = new Map();        // comercios abiertos: id → { a, b, offer: {a, b}, ready: {a, b} }
    this.teamInv = new Map();
    this.tchestHold = new Map();    // equipo → jugador que tiene abierto el cofre de equipo       // invitaciones a equipos pendientes: clave del invitado → id del equipo
    this.pendingLeave = new Map();  // jugadores que se desconectaron hace poco: clave → { t: temporizador, name }
    this.gev = null; this.gevNext = Date.now() + (15 + Math.random() * 10) * 60000; this.coopT = 0; this.pingT = 0; this.coopDirty = false; this.coopNext = 0;
    this.edits = new Map();         // "cx,cz" → Map(índice local → id | meta << 8), igual que en el cliente
    this.drops = new Map();         // objetos en el suelo: id → { s: [id, cantidad, daño, encantamientos], p: [x, y, z], t: creado }
    this.activeBoss = new Map();    // jefes despiertos: plan → { owner: id del jugador que lo simula, k: tipo }
    this.clients = new Map();       // id → Client, en orden de llegada
    this.dirty = false; this.emptySince = Date.now(); this.timeT = 0; this.hostId = null;
  }
  get isDefault() { return this.code === DEFAULT_CODE; }
  load() {
    for (const f of [this.file, this.file + '.bak']) {
      try {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (!Number.isFinite(d.seed)) throw new Error('sin semilla');
        const W = this.W;
        Object.assign(W, { gen: [2, 3, 4, 5].includes(d.gen) ? d.gen : 1, seed: d.seed, mode: d.mode === 'creative' ? 'creative' : 'survival', time: +d.time || 0, days: d.days | 0,
          weather: WEATHERS.includes(d.weather) ? d.weather : 'clear', weatherT: +d.weatherT || 600, tiles: d.tiles || {}, players: d.players || {}, bosses: d.bosses || {} });
        if (d.v >= 2) Object.assign(W, { name: String(d.name || W.name).slice(0, 32), owner: d.owner || null, trusted: Array.isArray(d.trusted) ? d.trusted : [],
          banned: Array.isArray(d.banned) ? d.banned : [], max: isInt(d.max, 1, 64) ? d.max : W.max, pvp: d.pvp !== false, cheats: d.cheats !== false,
          build: BUILD.includes(d.build) ? d.build : 'all', priv: !!d.priv, pass: String(d.pass || ''), created: d.created || Date.now() });
        // 4.9
        W.teams = d.teams && typeof d.teams === 'object' ? d.teams : {};
        for (const t of Object.values(W.teams)) { t.members = Array.isArray(t.members) ? t.members : []; t.inv = Array.isArray(t.inv) ? t.inv.slice(0, TEAM_SLOTS) : []; }
        W.claims = Array.isArray(d.claims) ? d.claims.filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.z) && CLAIM_SIZES.includes(c.r)).map((c) => ({ ...c, friends: Array.isArray(c.friends) ? c.friends : [] })) : [];
        W.locks = d.locks && typeof d.locks === 'object' ? d.locks : {}; W.perm = d.perm && typeof d.perm === 'object' ? d.perm : {};
        W.coop = d.coop && KINDS.has(d.coop.k) ? d.coop : null; W.names = d.names && typeof d.names === 'object' ? d.names : {};
        for (const k in d.edits || {}) {
          const m = new Map();
          for (const e of String(d.edits[k]).split(',')) { const [i, v] = e.split(':'); const ii = parseInt(i, 36), vv = parseInt(v, 36); if (Number.isFinite(ii) && Number.isFinite(vv)) m.set(ii, vv); }
          if (m.size) this.edits.set(k, m);
        }
        return true;
      } catch (e) { if (e.code !== 'ENOENT') log(`No se pudo leer ${f}: ${e.message}`); }
    }
    return false;
  }
  packEdits() {
    const out = {};
    for (const [k, m] of this.edits) { if (!m.size) continue; const a = []; for (const [i, v] of m) a.push(i.toString(36) + ':' + v.toString(36)); out[k] = a.join(','); }
    return out;
  }
  countEdits() { let n = 0; for (const m of this.edits.values()) n += m.size; return n; }
  save(quiet) {
    if (!this.dirty) return;
    this.dirty = false;
    const W = this.W;
    const json = JSON.stringify({ ...W, v: 2, edits: this.packEdits(), saved: Date.now() });
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, json);
      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.bak');
      fs.renameSync(tmp, this.file);
      if (!quiet) log(`Sala ${this.code} guardada (${(json.length / 1024).toFixed(0)} KB)`);
    } catch (e) { this.dirty = true; log(`⚠ No se pudo guardar la sala ${this.code}:`, e.message); }
    this.updateIndex();
  }
  updateIndex() { const W = this.W; index.set(this.code, { name: W.name, owner: W.owner, priv: W.priv, locked: !!W.pass, max: W.max, mode: W.mode, pvp: W.pvp, build: W.build }); }
  /* --- Mensajes --- */
  broadcast(msg, except) { const s = JSON.stringify(msg); for (const c of this.clients.values()) if (c !== except) c.send(s); }
  sys(text, except) { this.broadcast({ type: 'sys', text }, except); }
  /* --- Anfitrión y permisos --- */
  // El dueño de la sala es su anfitrión cuando está conectado. Si no, lo es el
  // jugador de confianza que lleva más tiempo dentro, o si no el más antiguo.
  pickHost() {
    const list = [...this.clients.values()];
    const h = list.find((c) => c.key === this.W.owner) || list.find((c) => this.W.trusted.includes(c.key)) || list[0] || null;
    const id = h ? h.id : null;
    if (id !== this.hostId) { this.hostId = id; if (h) this.sys(`${h.name} es ahora ${h.key === this.W.owner ? 'el anfitrión' : 'el anfitrión temporal'} de la sala`); return true; }
    return false;
  }
  isHost(c) { return c.id === this.hostId; }
  role(c) { return this.isHost(c) ? 'host' : this.W.trusted.includes(c.key) ? 'trusted' : this.W.build === 'all' ? 'member' : 'visitor'; }
  canBuild(c) {
    const b = this.W.build; if (this.isHost(c)) return true;
    const p = this.W.perm[c.key]; if (p === true || p === false) return p;           // permiso propio del jugador (4.9)
    return b === 'all' || (b === 'trusted' && this.W.trusted.includes(c.key));
  }
  /* --- 4.9: equipos, terrenos y cofres con candado --- */
  teamOf(key) { for (const [id, t] of Object.entries(this.W.teams)) if (t.members.includes(key)) return id; return null; }
  sameTeam(a, b) { const t = this.teamOf(a.key); return !!t && t === this.teamOf(b.key); }
  claimAt(x, z) { return this.W.claims.find((cl) => Math.abs(x - cl.x) <= cl.r && Math.abs(z - cl.z) <= cl.r) || null; }
  claimAllows(c, cl) { if (!cl || this.isHost(c) || cl.owner === c.key || cl.friends.includes(c.key)) return true; const t = this.teamOf(cl.owner); return !!t && t === this.teamOf(c.key); }
  // ¿Puede este jugador cambiar ese bloque? (terrenos protegidos y cofres con candado)
  allowedAt(c, x, y, z) {
    const lock = this.W.locks[`${x},${y},${z}`]; if (lock && lock !== c.key && !this.isHost(c)) return false;
    return this.claimAllows(c, this.claimAt(x, z));
  }
  teamsMsg() {
    const online = new Map([...this.clients.values()].map((c) => [c.key, c]));
    return { type: 'teams', l: Object.entries(this.W.teams).map(([id, t]) => ({ id, name: t.name, color: t.color, owner: online.get(t.owner)?.id ?? null, ownerName: this.W.names[t.owner] || '?',
      members: t.members.map((k) => ({ name: this.W.names[k] || '?', id: online.get(k)?.id ?? null })) })) };
  }
  sendClaims() {
    const online = new Map([...this.clients.values()].map((c) => [c.key, c.id]));
    for (const c of this.clients.values()) c.send({ type: 'claims', l: this.W.claims.map((cl) => ({ id: cl.id, name: cl.name, x: cl.x, z: cl.z, r: cl.r, owner: online.get(cl.owner) ?? null,
      ownerName: this.W.names[cl.owner] || '?', friends: cl.friends.map((k) => this.W.names[k] || '?'), mine: cl.owner === c.key, can: this.claimAllows(c, cl) })) });
  }
  sendLocks() { const l = Object.entries(this.W.locks); for (const c of this.clients.values()) c.send({ type: 'locks', l: l.map(([k, o]) => [k, this.W.names[o] || '?', o === c.key ? 1 : 0]) }); }
  coopMsg() { const q = this.W.coop; return { type: 'coop', q: q ? { id: q.id, k: q.k, title: q.title, goal: q.goal, n: q.n, prog: q.prog, em: q.em, xp: q.xp } : null }; }
  gevMsg() { const g = this.gev; return { type: 'gev', g: g ? { id: g.id, k: g.k, title: g.title, goal: g.goal, n: g.n, prog: g.prog, left: Math.max(0, Math.round((g.end - Date.now()) / 1000)), em: g.em } : null }; }
  newCoop() {
    const [k, title, goal, base] = COOP[Math.floor(Math.random() * COOP.length)], n = Math.max(1, Math.round(base * (1 + 0.5 * Math.max(0, this.clients.size - 1))));
    this.W.coop = { id: Date.now().toString(36), k, title, goal: goal.replace('{n}', n), n, prog: 0, contrib: {}, em: 5 + Math.round(n / base * 4), xp: 40 };
    this.dirty = true; this.broadcast(this.coopMsg()); this.sys(`Nueva misión cooperativa: ${title} — ${this.W.coop.goal}`);
  }
  startGev() {
    if (this.gev) return false;
    const [k, title, goal, base, secs] = GEV[Math.floor(Math.random() * GEV.length)], n = Math.max(1, Math.round(base * (1 + 0.6 * Math.max(0, this.clients.size - 1))));
    this.gev = { id: Date.now().toString(36), k, title, goal: goal.replace('{n}', n), n, prog: 0, contrib: {}, end: Date.now() + secs * 1000, em: 4 + Math.round(this.clients.size * 1.5), xp: 25 };
    this.broadcast(this.gevMsg()); this.sys(`¡Evento de grupo! ${title}: ${this.gev.goal}`);
    return true;
  }
  // Progreso de misiones y eventos que informan los jugadores
  progress(c, k, n) {
    for (const which of ['coop', 'gev']) {
      const q = which === 'coop' ? this.W.coop : this.gev; if (!q || q.k !== k || q.prog >= q.n || n <= 0) continue;
      q.prog = Math.min(q.n, q.prog + n); q.contrib[c.key] = (q.contrib[c.key] || 0) + n; this.coopDirty = true; if (which === 'coop') this.dirty = true;
      if (q.prog >= q.n) this.finish(which, true);
    }
  }
  finish(which, ok) {
    const q = which === 'coop' ? this.W.coop : this.gev; if (!q) return;
    const names = Object.keys(q.contrib).map((k) => this.W.names[k] || '?');
    // la recompensa es para quien ayudó (aunque se haya ido, la cobra al volver: queda pendiente en su ficha)
    for (const key of Object.keys(q.contrib)) { if (!ok) break; const pl = this.W.players[key] || (this.W.players[key] = {}); pl.rewards = [...(pl.rewards || []), { em: q.em, xp: q.xp || 30, title: q.title }].slice(-10); }
    for (const c of this.clients.values()) c.send({ type: 'coopDone', which, ok, title: q.title, names, helped: !!q.contrib[c.key], prog: q.prog, n: q.n });
    if (ok) this.sys(`${which === 'coop' ? 'Misión cooperativa' : 'Evento de grupo'} completado: ${q.title}. ¡Bien hecho, ${names.join(', ') || 'equipo'}!`);
    else this.sys(`Se acabó el tiempo del evento «${q.title}» (${q.prog}/${q.n})`);
    if (which === 'coop') { this.W.coop = null; this.dirty = true; this.coopNext = Date.now() + 60000; this.broadcast(this.coopMsg()); }
    else { this.gev = null; this.gevNext = Date.now() + (15 + Math.random() * 10) * 60000; this.broadcast(this.gevMsg()); }
    if (ok) for (const c of this.clients.values()) this.giveRewards(c);
  }
  giveRewards(c) {
    const pl = this.W.players[c.key]; if (!pl || !pl.rewards || !pl.rewards.length) return;
    c.send({ type: 'reward', l: pl.rewards }); pl.rewards = []; this.dirty = true;
  }
  cancelTrades(c, why) {
    for (const [id, t] of this.trades) if (t.a === c.id || t.b === c.id) {
      this.trades.delete(id);
      for (const pid of [t.a, t.b]) { const o = this.clients.get(pid); if (o && o !== c) o.send({ type: 'trade', act: 'cancel', id, why }); }
    }
  }
  canCheat(c) { return this.W.cheats && (this.isHost(c) || this.W.trusted.includes(c.key)); }
  info() {
    const W = this.W;
    return { code: this.code, name: W.name, players: this.clients.size, max: W.max, mode: W.mode, pvp: W.pvp, cheats: W.cheats, build: W.build, priv: W.priv, locked: !!W.pass, def: this.isDefault };
  }
  roster() { return { type: 'roster', host: this.hostId, owner: !!this.W.owner, list: [...this.clients.values()].map((c) => ({ id: c.id, name: c.name, role: this.role(c), own: c.key === this.W.owner,
    team: this.teamOf(c.key), build: this.canBuild(c), perm: this.W.perm[c.key] ?? null, lat: c.lat | 0 })) }; }
  sendRoom() {
    this.broadcast({ type: 'room', room: this.info() });
    for (const c of this.clients.values()) c.send({ ...this.roster(), you: { host: this.isHost(c), build: this.canBuild(c), cheat: this.canCheat(c), team: this.teamOf(c.key) } });
    this.broadcast(this.teamsMsg());
  }
  /* --- Entrar y salir --- */
  add(c, resume) {
    let name = c.baseName, base = name, n = 2;
    while ([...this.clients.values()].some((o) => o.name.toLowerCase() === name.toLowerCase())) name = (base.slice(0, 13) + ' ' + n++);
    c.name = name; c.room = this;
    const W = this.W, saved = W.players[c.key];
    W.names[c.key] = name;
    const back = this.pendingLeave.get(c.key); if (back) { clearTimeout(back.t); this.pendingLeave.delete(c.key); resume = true; this.broadcast({ type: 'leave', id: back.id }); }
    c.send({ type: 'welcome', id: c.id, name, server: cfg.name, room: this.info(), resume: !!resume, seed: W.seed, gen: W.gen, mode: W.mode, pvp: W.pvp, dayLength: DAY_LENGTH,
      time: W.time, days: W.days, weather: W.weather, edits: this.packEdits(), tiles: W.tiles, players: this.playerList(c), you: saved ? saved.d : null,
      drops: [...this.drops].map(([did, d]) => [did, d.s, d.p, Math.round((Date.now() - d.t) / 1000)]), bosses: Object.keys(W.bosses), feat: FEATURES });
    this.clients.set(c.id, c); this.emptySince = 0;
    this.broadcast({ type: 'join', id: c.id, name }, c);
    this.sys(resume ? `${name} se reconectó` : `${name} entró a la sala`, c);
    this.pickHost(); this.sendRoom();
    this.sendClaims(); this.sendLocks(); c.send(this.coopMsg()); c.send(this.gevMsg()); this.giveRewards(c);
    if (!W.coop && !this.coopNext) this.newCoop();
    log(`+ ${name} ${resume ? 'volvió a' : 'entró a'} ${this.code} desde ${c.ip} (${this.clients.size}/${W.max})`);
  }
  remove(c) {
    if (this.clients.get(c.id) !== c) return;
    this.clients.delete(c.id);
    for (const [plan, b] of this.activeBoss) if (b.owner === c.id) { this.activeBoss.delete(plan); this.broadcast({ type: 'bleft', plan: b.plan }); }
    this.cancelTrades(c, `${c.name} salió de la sala`); this.teamInv.delete(c.key);
    for (const [tid, id] of this.tchestHold) if (id === c.id) this.tchestHold.delete(tid);
    // si se cortó la conexión (no se fue a propósito), se espera un poco antes de darlo por ido
    // (los demás siguen viendo su personaje, marcado «sin conexión», hasta que vuelva o pase el margen)
    if (c.kicked || c.byeSent || !this.clients.size) { this.broadcast({ type: 'leave', id: c.id }); this.sys(`${c.name} salió de la sala`); }
    else {
      const name = c.name, id = c.id, t = setTimeout(() => { this.pendingLeave.delete(c.key); this.broadcast({ type: 'leave', id }); this.sys(`${name} salió de la sala`); }, GRACE);
      this.pendingLeave.set(c.key, { t, name, id }); this.broadcast({ type: 'lost', id, name, secs: GRACE / 1000 });
      this.sys(`${c.name} perdió la conexión (tiene ${GRACE / 1000} s para volver)`);
    }
    log(`- ${c.name} salió de ${this.code} (${this.clients.size}/${this.W.max})`);
    if (!this.clients.size) { this.emptySince = Date.now(); this.dirty = true; this.save(true); }
    this.pickHost(); this.sendRoom();
  }
  playerList(except) { return [...this.clients.values()].filter((c) => c !== except).map((c) => ({ id: c.id, name: c.name, s: c.state })); }
  /* --- Hora y clima --- */
  tick(dt) {
    const W = this.W, now = Date.now();
    for (const [did, d] of this.drops) { if (now - d.t < DROP_LIFE) break; this.drops.delete(did); this.broadcast({ type: 'picked', did, by: 0 }); }
    if (!this.clients.size) return;                    // el mundo se detiene sin jugadores
    W.time += dt / DAY_LENGTH; if (W.time >= 1) { W.time -= 1; W.days++; }
    W.weatherT -= dt; this.dirty = true;
    if (W.weatherT <= 0) {
      if (W.weather === 'clear') { const r = Math.random(); W.weather = r < 0.6 ? 'rain' : r < 0.8 ? 'storm' : 'fog'; W.weatherT = 120 + Math.random() * 240; }
      else { W.weather = 'clear'; W.weatherT = 420 + Math.random() * 900; }
      this.broadcast({ type: 'weather', w: W.weather });
    }
    if ((this.timeT += dt) >= 4) { this.timeT = 0; this.broadcast({ type: 'time', t: W.time, d: W.days }); }
    // 4.9: latencias, misiones y eventos de grupo
    if ((this.pingT += dt) >= 3) { this.pingT = 0; this.broadcast({ type: 'pings', l: [...this.clients.values()].map((c) => [c.id, c.lat | 0, c.state ? c.state.hp : 20]) }); }
    if (this.coopDirty && (this.coopT += dt) >= 0.5) { this.coopT = 0; this.coopDirty = false; this.broadcast(this.coopMsg()); if (this.gev) this.broadcast(this.gevMsg()); }
    if (!W.coop && this.coopNext && Date.now() > this.coopNext) { this.coopNext = 0; this.newCoop(); }
    if (this.gev && Date.now() > this.gev.end) this.finish('gev', false);
    if (!this.gev && this.clients.size >= 2 && Date.now() > this.gevNext) this.startGev();
  }
}
const roomFile = (code) => (code === DEFAULT_CODE ? path.join(cfg.data, 'world.json') : path.join(roomsDir, code + '.json'));
function newCode() {
  for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!index.has(c) && c !== DEFAULT_CODE) return c; }
}
// Devuelve la sala cargada (o la carga del disco); null si no existe
function getRoom(code) {
  code = cleanCode(code); if (!code) return null;
  let r = rooms.get(code); if (r) return r;
  if (!index.has(code)) return null;
  r = new Room(code, roomFile(code));
  if (!r.load()) return null;
  rooms.set(code, r); r.updateIndex();
  return r;
}
function scanRooms() {
  try {
    for (const f of fs.readdirSync(roomsDir)) {
      const m = /^([A-Z0-9]{4,8})\.json$/.exec(f); if (!m) continue;
      try { const d = JSON.parse(fs.readFileSync(path.join(roomsDir, f), 'utf8')); index.set(m[1], { name: String(d.name || 'Sala').slice(0, 32), owner: d.owner || null, priv: !!d.priv, locked: !!d.pass, max: d.max | 0 || 8, mode: d.mode, pvp: d.pvp !== false, build: d.build || 'all' }); }
      catch (e) { log(`Sala ${m[1]} ilegible: ${e.message}`); }
    }
  } catch (e) { if (e.code !== 'ENOENT') log('No se pudo leer la carpeta de salas:', e.message); }
}
function setupDefaultRoom() {
  if (!cfg.lobby) return;
  const r = new Room(DEFAULT_CODE, roomFile(DEFAULT_CODE));
  if (r.load()) log(`Sala ${DEFAULT_CODE} cargada: semilla ${r.W.seed}, modo ${r.W.mode}, ${r.countEdits()} bloques modificados, ${Object.keys(r.W.players).length} jugadores guardados`);
  else { r.W.seed = seedFrom(cfg.seed); r.W.mode = cfg.mode; r.dirty = true; log(`Sala ${DEFAULT_CODE} nueva: semilla ${r.W.seed}, modo ${r.W.mode}`); }
  // la sala pública no tiene dueño: la configura el servidor
  Object.assign(r.W, { name: 'Mundo principal', owner: null, max: cfg.max, pvp: cfg.pvp, cheats: cfg.cheats, priv: false, pass: '' });
  rooms.set(DEFAULT_CODE, r); r.updateIndex();
}
function publicRooms() {
  const out = [];
  for (const [code, x] of index) {
    if (x.priv) continue;
    const r = rooms.get(code);
    out.push({ code, name: x.name, players: r ? r.clients.size : 0, max: x.max, mode: x.mode, pvp: x.pvp, build: x.build, locked: x.locked, def: code === DEFAULT_CODE });
  }
  return out.sort((a, b) => (b.def - a.def) || (b.players - a.players) || a.name.localeCompare(b.name)).slice(0, 50);
}

/* ---------- WebSocket mínimo (RFC 6455, sin extensiones) ---------- */
const clients = new Map();        // id → Client (todos los conectados, estén o no en una sala)
let nextId = 1;
class Client {
  constructor(socket, ip) {
    this.socket = socket; this.ip = ip; this.id = null; this.name = null; this.key = null; this.room = null;
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
  kick(reason) { this.kicked = true; this.send({ type: 'kicked', reason }); this.close(1008, reason.slice(0, 100)); }
  onClose() {
    if (this.gone) return; this.gone = true; this.closed = true;
    if (this.id != null && clients.get(this.id) === this) clients.delete(this.id);
    if (this.room) this.room.remove(this);
  }
  onText(text) {
    if (++this.msgs > 600) return this.kick('Demasiados mensajes por segundo');
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
    try { handle(this, m); } catch (e) { log('Error al procesar', m.type, 'de', this.name || this.ip, '-', e.message); }
  }
}

/* ---------- Protocolo ---------- */
const allPlayers = () => [...rooms.values()].reduce((n, r) => n + r.clients.size, 0);
function sendLobby(c, error) { c.send({ type: 'lobby', server: cfg.name, cap: cfg.max, rooms: publicRooms(), canCreate: index.size < cfg.rooms, error: error || undefined }); }

function handle(c, m) {
  if (c.id == null) {                      // lo primero tiene que ser «hello»
    if (m.type !== 'hello') return;
    if (m.v !== PROTOCOL) return c.kick('La versión del juego no coincide con la del servidor. Recarga la página (y actualiza el servidor si es tuyo).');
    if (cfg.password && m.pass !== cfg.password) return c.kick(m.pass ? 'Contraseña del servidor incorrecta' : 'Este servidor pide contraseña');
    const token = String(m.token || ''); if (token.length < 8 || token.length > 80) return c.kick('Identificador de jugador no válido');
    c.key = crypto.createHash('sha1').update(token).digest('hex').slice(0, 20);
    for (const o of clients.values()) if (o.key === c.key) o.kick('Has entrado desde otra pestaña o dispositivo');
    c.baseName = cleanName(m.name) || 'Jugador'; c.name = c.baseName; c.id = nextId++;
    clients.set(c.id, c);
    sendLobby(c);
    return;
  }
  if (!c.room) {                           // en la recepción: elegir o crear sala
    switch (m.type) {
      case 'rooms': return sendLobby(c);
      case 'join': {
        const r = getRoom(m.code);
        if (!r) return sendLobby(c, 'No existe ninguna sala con ese código');
        if (r.W.banned.includes(c.key)) return sendLobby(c, 'El anfitrión te vetó en esa sala');
        if (r.W.pass && m.pass !== r.W.pass && c.key !== r.W.owner) return sendLobby(c, m.pass ? 'Contraseña de la sala incorrecta' : 'Esa sala pide contraseña');
        if (r.clients.size >= r.W.max && c.key !== r.W.owner) return sendLobby(c, `La sala está llena (${r.clients.size}/${r.W.max})`);
        return r.add(c, !!m.resume);
      }
      case 'create': {
        if (index.size >= cfg.rooms) return sendLobby(c, 'El servidor ya tiene el máximo de salas guardadas');
        if ([...index.values()].filter((x) => x.owner === c.key).length >= OWNER_LIMIT) return sendLobby(c, `Ya eres anfitrión de ${OWNER_LIMIT} salas. Borra una para crear otra.`);
        const code = newCode(), r = new Room(code, roomFile(code)), W = r.W;
        Object.assign(W, { name: cleanText(m.name).slice(0, 32) || `Sala de ${c.baseName}`, owner: c.key, seed: seedFrom(m.seed), mode: m.mode === 'creative' ? 'creative' : 'survival',
          max: isInt(m.max, 1, cfg.max) ? m.max : Math.min(8, cfg.max), pvp: m.pvp !== false, cheats: m.cheats !== false, build: BUILD.includes(m.build) ? m.build : 'all',
          priv: !!m.priv, pass: String(m.pass || '').slice(0, 40) });
        r.dirty = true; rooms.set(code, r); r.save(true);
        log(`Sala ${code} creada por ${c.baseName}: «${W.name}», semilla ${W.seed}, ${W.mode}, máx. ${W.max}`);
        return r.add(c, false);
      }
    }
    return;
  }
  const R = c.room, W = R.W;
  switch (m.type) {
    case 'player': {
      if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
      c.state = { p: m.p.map((v) => Math.round(v * 100) / 100), yaw: num(m.yaw), pitch: num(m.pitch), anim: m.anim === 'walk' ? 'walk' : 'idle',
        held: m.held | 0, hp: Math.max(0, Math.min(40, num(m.hp, 20))), cr: m.cr ? 1 : 0, sw: Math.max(0, Math.min(6, m.sw | 0)), lt: Math.max(0, Math.min(15, m.lt | 0)),
        ...(typeof m.sk === 'string' && /^[\d.]{1,40}$/.test(m.sk) ? { sk: m.sk } : {}) };      // 5.2: aspecto del personaje
      R.broadcast({ type: 'player', id: c.id, ...c.state }, c);
      break;
    }
    case 'block': {
      if (!isInt(m.x, -3e7, 3e7) || !isInt(m.z, -3e7, 3e7) || !isInt(m.y, 0, WY - 1) || !isInt(m.id, 0, 2047)) return;
      if (!R.canBuild(c)) return c.send({ type: 'deny', x: m.x, y: m.y, z: m.z });     // el cliente deshace el cambio
      if (!R.allowedAt(c, m.x, m.y, m.z)) return c.send({ type: 'deny', x: m.x, y: m.y, z: m.z, why: 'claim' });
      { const lk = `${m.x},${m.y},${m.z}`; if (W.locks[lk] && m.id === 0) { delete W.locks[lk]; R.dirty = true; R.sendLocks(); } }       // al romper el cofre, el candado se va con él
      const meta = isInt(m.meta, 0, 255) ? m.meta : 0, key = (m.x >> 4) + ',' + (m.z >> 4), i = (m.x & 15) | ((m.z & 15) << 4) | (m.y << 8);
      let ed = R.edits.get(key); if (!ed) { ed = new Map(); R.edits.set(key, ed); }
      ed.set(i, m.id < 256 ? m.id | (meta << 8) : 65536 + m.id + (meta << 12)); R.dirty = true;      // igual que packBlock() del cliente
      R.broadcast({ type: 'block', x: m.x, y: m.y, z: m.z, id: m.id, meta }, c);
      break;
    }
    case 'tile': {
      if (typeof m.key !== 'string' || !/^-?\d{1,9},\d{1,3},-?\d{1,9}$/.test(m.key)) return;
      if (!R.canBuild(c)) return c.send({ type: 'tile', key: m.key, d: W.tiles[m.key] ?? null });
      { const [tx, ty, tz] = m.key.split(',').map(Number); if (!R.allowedAt(c, tx, ty, tz)) return c.send({ type: 'tile', key: m.key, d: W.tiles[m.key] ?? null, why: 'claim' }); }
      if (m.d == null) delete W.tiles[m.key];
      else { if (typeof m.d !== 'object' || JSON.stringify(m.d).length > 16384) return; W.tiles[m.key] = m.d; }
      R.dirty = true;
      R.broadcast({ type: 'tile', key: m.key, d: m.d ?? null }, c);
      break;
    }
    case 'save': {
      if (!m.d || typeof m.d !== 'object' || JSON.stringify(m.d).length > 200000) return;
      W.players[c.key] = { ...(W.players[c.key] || {}), name: c.name, t: Date.now(), d: m.d }; R.dirty = true;
      break;
    }
    case 'chat': {
      const text = cleanText(m.text); if (!text) return;
      if (text[0] === '/') return chatCommand(c, text.slice(1));
      if (m.team) {                                      // chat de equipo
        const tid = R.teamOf(c.key); if (!tid) return c.send({ type: 'sys', text: 'No estás en ningún equipo' });
        for (const o of R.clients.values()) if (R.teamOf(o.key) === tid) o.send({ type: 'chat', id: c.id, name: c.name, text, team: 1 });
        return;
      }
      log(`[${R.code}] <${c.name}> ${text}`);
      R.broadcast({ type: 'chat', id: c.id, name: c.name, text });
      break;
    }
    case 'sleep': {
      W.time = 0.01; W.days++; W.weather = 'clear'; W.weatherT = 300 + Math.random() * 600; R.dirty = true;
      R.broadcast({ type: 'time', t: W.time, d: W.days }); R.broadcast({ type: 'weather', w: W.weather });
      R.sys(`${c.name} durmió: ya es de día`);
      break;
    }
    case 'died': R.sys(`${c.name} murió${m.msg ? ': ' + cleanText(m.msg).slice(0, 80) : ''}`); break;
    case 'ents': {                          // criaturas que simula este jugador → los demás las ven
      if (!Array.isArray(m.l) || m.l.length > 80) return;
      R.broadcast({ type: 'ents', id: c.id, l: m.l }, c);
      break;
    }
    case 'ehit': case 'kill': case 'hit': { // mensajes dirigidos a un jugador concreto
      const to = R.clients.get(m.to); if (!to || to === c) return;
      if (m.type === 'hit' && (!W.pvp || R.sameTeam(c, to))) return;      // sin fuego amigo entre compañeros de equipo
      if (m.type === 'hit') to.send({ type: 'hit', from: c.id, name: c.name, dmg: Math.max(0, Math.min(40, num(m.dmg, 1))), x: num(m.x), z: num(m.z) });
      else if (m.type === 'ehit') to.send({ type: 'ehit', from: c.id, nid: m.nid | 0, dmg: Math.max(0, Math.min(200, num(m.dmg, 1))), x: num(m.x), z: num(m.z) });
      else to.send({ type: 'kill', from: c.id, k: String(m.k).slice(0, 24), p: Array.isArray(m.p) ? m.p.slice(0, 3).map((v) => num(v)) : [0, 0, 0], fire: m.fire ? 1 : 0 });
      break;
    }
    case 'drop': {                          // un objeto cae al suelo: lo ven todos
      const did = String(m.did);
      if (did.length > 24 || !did.startsWith(c.id + ':') || R.drops.has(did)) return;
      if (!Array.isArray(m.s) || m.s.length < 2 || m.s.length > 4 || !isInt(m.s[0], 1, 65535) || !isInt(m.s[1], 1, 999) || JSON.stringify(m.s).length > 400) return;
      if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
      const v = Array.isArray(m.v) && m.v.length === 3 && m.v.every(Number.isFinite) ? m.v : [0, 0, 0];
      R.drops.set(did, { s: m.s, p: m.p, t: Date.now() });
      if (R.drops.size > MAX_DROPS) { const old = R.drops.keys().next().value; R.drops.delete(old); R.broadcast({ type: 'picked', did: old, by: 0 }); }
      R.broadcast({ type: 'drop', did, s: m.s, p: m.p, v }, c);
      break;
    }
    case 'dmove': {                         // dónde quedó en reposo (para quien llegue después)
      const d = R.drops.get(String(m.did));
      if (!d || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
      d.p = m.p; R.broadcast({ type: 'dmove', did: String(m.did), p: m.p }, c);
      break;
    }
    case 'pickup': {                        // el primero que lo pide se lo lleva
      const did = String(m.did);
      if (!R.drops.delete(did)) return;
      R.broadcast({ type: 'picked', did, by: c.id });
      break;
    }
    case 'bstart': case 'bstate': case 'bdead': case 'bleft': {   // jefes: uno solo para todos, lo simula quien lo despertó
      if (typeof m.plan !== 'string' && typeof m.plan !== 'number') return;
      const key = String(m.plan).slice(0, 48), cur = R.activeBoss.get(key);
      if (m.type === 'bstart') {
        if (W.bosses[key]) return c.send({ type: 'bdone', plan: m.plan });
        if (cur && cur.owner !== c.id) return c.send({ type: 'bdeny', plan: m.plan });
        R.activeBoss.set(key, { owner: c.id, plan: m.plan, k: String(m.k).slice(0, 24) });
        return;
      }
      if (!cur || cur.owner !== c.id) return;
      if (m.type === 'bstate') {
        if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
        R.broadcast({ type: 'bstate', id: c.id, plan: m.plan, k: cur.k, nid: m.nid | 0, p: m.p, yaw: num(m.yaw), hp: num(m.hp), ph: m.ph | 0, st: String(m.st || '').slice(0, 16) }, c);
      } else if (m.type === 'bdead') {
        R.activeBoss.delete(key); W.bosses[key] = 'done'; R.dirty = true;
        R.broadcast({ type: 'bdead', plan: m.plan, k: cur.k, p: Array.isArray(m.p) ? m.p.slice(0, 3).map((v) => num(v)) : [0, 0, 0], name: c.name }, c);
        log(`[${R.code}] ${c.name} derrotó al jefe ${cur.k}`);
      } else { R.activeBoss.delete(key); R.broadcast({ type: 'bleft', plan: m.plan }, c); }
      break;
    }
    case 'admin': return admin(c, m);
    case 'lat': c.lat = Math.max(0, Math.min(9999, m.ms | 0)); break;
    case 'bye': c.byeSent = true; break;
    case 'prog': {                                       // misiones cooperativas y eventos (como mucho un aviso por tipo cada 0,8 s)
      if (!KINDS.has(m.k)) return;
      const now = Date.now(); c.progT = c.progT || {}; if (now - (c.progT[m.k] || 0) < 800) return; c.progT[m.k] = now;
      R.progress(c, m.k, Math.max(0, Math.min(50, m.n | 0))); break;
    }
    case 'team': return teamMsg(c, m);
    case 'tchest': return teamChest(c, m);
    case 'trade': return tradeMsg(c, m);
    case 'claim': return claimMsg(c, m);
    case 'lock': {
      if (!isInt(m.x, -3e7, 3e7) || !isInt(m.z, -3e7, 3e7) || !isInt(m.y, 0, WY - 1)) return;
      const k = `${m.x},${m.y},${m.z}`;
      if (m.act === 'set') { if (W.locks[k] || !R.canBuild(c) || !R.allowedAt(c, m.x, m.y, m.z)) return c.send({ type: 'sys', text: 'No puedes ponerle candado a ese cofre' }); W.locks[k] = c.key; }
      else if (m.act === 'del') { if (W.locks[k] !== c.key && !R.isHost(c)) return; delete W.locks[k]; }
      else return;
      R.dirty = true; R.sendLocks(); break;
    }
    case 'online': {                                     // jugadores del servidor que no están en esta sala (para invitar)
      const l = [...clients.values()].filter((o) => o.room !== R && o.baseName).slice(0, 40).map((o) => ({ id: o.id, name: o.name || o.baseName, where: o.room ? (o.room.W.priv ? 'en otra sala' : `en «${o.room.W.name}»`) : 'en la recepción' }));
      c.send({ type: 'online', l }); break;
    }
    case 'invite': {
      const to = clients.get(m.to); if (!to || to === c || to.room === R) return;
      const now = Date.now(); c.invT = c.invT || {}; if (now - (c.invT[to.id] || 0) < 15000) return c.send({ type: 'sys', text: 'Ya le enviaste una invitación hace poco' });
      c.invT[to.id] = now;
      to.send({ type: 'invite', from: c.name || c.baseName, code: R.code, room: W.name, locked: !!W.pass, pass: W.pass && R.isHost(c) ? W.pass : '' });
      c.send({ type: 'sys', text: `Invitación enviada a ${to.name || to.baseName}` });
      break;
    }
    case 'ping': c.send({ type: 'pong', t: m.t }); break;
  }
}
// Acciones del anfitrión (o del dueño de la sala)
function admin(c, m) {
  const R = c.room, W = R.W, tell = (text) => c.send({ type: 'sys', text });
  const isOwner = W.owner && c.key === W.owner;
  if (!R.isHost(c)) return tell('Solo el anfitrión puede hacer eso');
  const t = m.id != null ? R.clients.get(m.id) : null;
  switch (m.act) {
    case 'set': {
      const before = JSON.stringify(R.info());
      if (isInt(m.max, 1, cfg.max)) W.max = m.max;
      if (typeof m.pvp === 'boolean') W.pvp = m.pvp;
      if (typeof m.cheats === 'boolean') W.cheats = m.cheats;
      if (BUILD.includes(m.build)) W.build = m.build;
      if (!R.isDefault) {                // la sala pública la configura el servidor
        if (typeof m.priv === 'boolean') W.priv = m.priv;
        if (typeof m.name === 'string' && cleanText(m.name)) W.name = cleanText(m.name).slice(0, 32);
        if (typeof m.pass === 'string') W.pass = m.pass.slice(0, 40);
      }
      R.dirty = true; R.updateIndex();
      if (JSON.stringify(R.info()) !== before) { R.sys(`${c.name} cambió la configuración de la sala`); R.sendRoom(); }
      return;
    }
    case 'trust': case 'untrust': {
      if (!t || t === c) return;
      W.trusted = W.trusted.filter((k) => k !== t.key); if (m.act === 'trust') W.trusted.push(t.key);
      R.dirty = true; R.sys(m.act === 'trust' ? `${t.name} ahora es de confianza` : `${t.name} ya no es de confianza`); R.sendRoom();
      return;
    }
    case 'kick': case 'ban': {
      if (!t || t === c) return;
      if (t.key === W.owner) return tell('No puedes expulsar al dueño de la sala');
      if (m.act === 'ban') { W.banned.push(t.key); W.trusted = W.trusted.filter((k) => k !== t.key); R.dirty = true; }
      R.sys(`${c.name} ${m.act === 'ban' ? 'vetó' : 'expulsó'} a ${t.name}`, t);
      t.kick(m.act === 'ban' ? 'El anfitrión te vetó en esta sala' : 'El anfitrión te expulsó de la sala');
      return;
    }
    case 'host': {                       // pasar la sala a otro jugador
      if (!t || t === c) return;
      if (R.isDefault) return tell('La sala pública no tiene dueño: el anfitrión es quien lleva más tiempo dentro');
      if (W.owner && !isOwner) return tell('Solo el dueño de la sala puede cederla');
      W.owner = t.key; W.trusted = W.trusted.filter((k) => k !== t.key); if (isOwner) W.trusted.push(c.key);
      R.dirty = true; R.updateIndex(); R.pickHost(); R.sendRoom();
      return;
    }
    case 'unban': W.banned = []; R.dirty = true; tell('Se levantaron todos los vetos de la sala'); return;
    case 'allow': case 'deny': case 'resetperm': {       // permiso para construir de un jugador concreto (4.9)
      if (!t || t === c) return;
      if (m.act === 'resetperm') delete W.perm[t.key]; else W.perm[t.key] = m.act === 'allow';
      R.dirty = true; R.sys(m.act === 'allow' ? `${t.name} puede construir` : m.act === 'deny' ? `${t.name} ya no puede construir` : `${t.name} vuelve al permiso general de la sala`); R.sendRoom();
      return;
    }
    case 'event': if (!R.startGev()) tell('Ya hay un evento de grupo en marcha'); return;
    case 'delete': {
      if (R.isDefault || !isOwner) return tell('Solo el dueño puede borrar la sala');
      for (const o of [...R.clients.values()]) if (o !== c) o.kick('El anfitrión cerró la sala');
      deleteRoom(R); c.kick('Borraste la sala');
      return;
    }
  }
}
/* ---------- 4.9: equipos ---------- */
function teamMsg(c, m) {
  const R = c.room, W = R.W, tell = (text) => c.send({ type: 'sys', text }), mine = R.teamOf(c.key), T = mine && W.teams[mine];
  switch (m.act) {
    case 'create': {
      if (mine) return tell('Ya estás en un equipo: sal de él para crear otro');
      const name = cleanText(m.name).slice(0, 20); if (!name) return tell('Ponle un nombre al equipo');
      if (Object.values(W.teams).some((t) => t.name.toLowerCase() === name.toLowerCase())) return tell('Ya hay un equipo con ese nombre');
      if (Object.keys(W.teams).length >= 16) return tell('La sala ya tiene demasiados equipos');
      const id = 't' + Date.now().toString(36), color = TEAM_COLORS.includes(m.color) ? m.color : TEAM_COLORS[Object.keys(W.teams).length % TEAM_COLORS.length];
      W.teams[id] = { name, color, owner: c.key, members: [c.key], inv: [] }; R.dirty = true;
      R.sys(`${c.name} fundó el equipo «${name}»`); break;
    }
    case 'invite': {
      if (!T) return tell('No estás en ningún equipo');
      const to = R.clients.get(m.id); if (!to || to === c) return;
      if (R.teamOf(to.key)) return tell(`${to.name} ya está en un equipo`);
      R.teamInv.set(to.key, mine); to.send({ type: 'teamInvite', team: mine, name: T.name, color: T.color, from: c.name }); tell(`Invitaste a ${to.name} al equipo «${T.name}»`);
      return;
    }
    case 'accept': {
      const tid = R.teamInv.get(c.key); if (!tid || tid !== m.team || !W.teams[tid]) return;
      if (mine) return tell('Ya estás en un equipo');
      R.teamInv.delete(c.key); W.teams[tid].members.push(c.key); R.dirty = true; R.sys(`${c.name} se unió al equipo «${W.teams[tid].name}»`); break;
    }
    case 'decline': {
      const tid = R.teamInv.get(c.key); R.teamInv.delete(c.key);
      const T2 = tid && W.teams[tid]; if (T2) for (const o of R.clients.values()) if (o.key === T2.owner) o.send({ type: 'sys', text: `${c.name} rechazó unirse a «${T2.name}»` });
      return;
    }
    case 'leave': {
      if (!T) return;
      T.members = T.members.filter((k) => k !== c.key); if (R.tchestHold.get(mine) === c.id) R.tchestHold.delete(mine);
      if (!T.members.length) {
        // lo que quedaba en el cofre del equipo no se pierde: vuelve a quien lo deja último
        const left = T.inv.filter(Boolean); if (left.length) c.send({ type: 'tchest', act: 'refund', inv: left });
        delete W.teams[mine]; R.sys(`El equipo «${T.name}» se disolvió`);
      }
      else { if (T.owner === c.key) T.owner = T.members[0]; R.sys(`${c.name} dejó el equipo «${T.name}»`); }
      R.dirty = true; break;
    }
    case 'kick': {
      if (!T || T.owner !== c.key) return tell('Solo el líder del equipo puede expulsar');
      const to = R.clients.get(m.id), key = to ? to.key : null; if (!key || key === c.key || !T.members.includes(key)) return;
      T.members = T.members.filter((k) => k !== key); R.dirty = true; R.sys(`${to.name} ya no está en el equipo «${T.name}»`); break;
    }
    default: return;
  }
  R.sendRoom(); R.sendClaims();
}
// Cofre de equipo: lo comparten todos los miembros. Solo un jugador a la vez puede tenerlo
// abierto (los demás ven quién lo está usando): así nadie duplica ni pierde objetos.
function teamChest(c, m) {
  const R = c.room, W = R.W, tid = R.teamOf(c.key);
  if (!tid) return c.send({ type: 'tchest', act: 'none' });
  const T = W.teams[tid], hold = R.tchestHold.get(tid), holder = hold != null ? R.clients.get(hold) : null;
  if (m.act === 'open') {
    if (holder && holder !== c) return c.send({ type: 'tchest', act: 'busy', name: holder.name });
    R.tchestHold.set(tid, c.id);
    return c.send({ type: 'tchest', act: 'all', inv: Array.from({ length: TEAM_SLOTS }, (_, i) => T.inv[i] ?? null), name: T.name });
  }
  if (holder !== c) return;
  if (m.act === 'save' || m.act === 'close') {
    if (Array.isArray(m.inv) && m.inv.length <= TEAM_SLOTS && m.inv.every(validStack)) { T.inv = m.inv.map((x) => x ?? null); R.dirty = true; }
    if (m.act === 'close') R.tchestHold.delete(tid);
  }
}
/* ---------- 4.9: comercio entre jugadores ----------
   Cada jugador pone en la mesa hasta 9 pilas (salen de su inventario mientras dura el trato).
   Cualquier cambio quita las dos confirmaciones; cuando los dos confirman, el servidor cierra
   el trato y le dice a cada uno qué recibe. */
function tradeMsg(c, m) {
  const R = c.room, tell = (text) => c.send({ type: 'sys', text });
  const near = (a, b) => a.state && b.state && Math.hypot(a.state.p[0] - b.state.p[0], a.state.p[2] - b.state.p[2]) <= 16;
  const busy = (o) => [...R.trades.values()].some((t) => t.a === o.id || t.b === o.id);
  switch (m.act) {
    case 'req': {
      const to = R.clients.get(m.to); if (!to || to === c) return;
      if (!near(c, to)) return tell(`${to.name} está demasiado lejos para comerciar (acércate a menos de 16 bloques)`);
      if (busy(c) || busy(to)) return tell('Uno de los dos ya está comerciando');
      c.tradeReq = to.id; to.send({ type: 'trade', act: 'req', from: c.id, name: c.name }); tell(`Le propusiste un trato a ${to.name}`);
      return;
    }
    case 'accept': {
      const from = R.clients.get(m.from); if (!from || from.tradeReq !== c.id) return;
      from.tradeReq = null;
      if (!near(c, from)) return tell('Ya está demasiado lejos para comerciar');
      if (busy(c) || busy(from)) return tell('Uno de los dos ya está comerciando');
      const id = 'x' + Date.now().toString(36) + c.id;
      R.trades.set(id, { a: from.id, b: c.id, offer: { a: [], b: [] }, ready: { a: false, b: false } });
      from.send({ type: 'trade', act: 'open', id, with: c.id, name: c.name }); c.send({ type: 'trade', act: 'open', id, with: from.id, name: from.name });
      return;
    }
    case 'decline': { const from = R.clients.get(m.from); if (from && from.tradeReq === c.id) { from.tradeReq = null; from.send({ type: 'trade', act: 'declined', name: c.name }); } return; }
  }
  const T = R.trades.get(m.id); if (!T || (T.a !== c.id && T.b !== c.id)) return;
  const side = T.a === c.id ? 'a' : 'b', other = side === 'a' ? 'b' : 'a', partner = R.clients.get(T[other]);
  const sendReady = () => { for (const o of [c, partner]) o?.send({ type: 'trade', act: 'ready', id: m.id, me: T.ready[o === c ? side : other], them: T.ready[o === c ? other : side] }); };
  if (m.act === 'offer') {
    if (!Array.isArray(m.items) || m.items.length > 9 || !m.items.every(validStack)) return;
    T.offer[side] = m.items.map((s) => s ?? null); T.ready.a = T.ready.b = false;          // cualquier cambio obliga a confirmar de nuevo
    partner?.send({ type: 'trade', act: 'offer', id: m.id, items: T.offer[side] });
    sendReady();
  } else if (m.act === 'ready') {
    T.ready[side] = !!m.v; sendReady();
    if (T.ready.a && T.ready.b) {
      R.trades.delete(m.id);
      const A = R.clients.get(T.a), B = R.clients.get(T.b);
      A?.send({ type: 'trade', act: 'done', id: m.id, give: T.offer.b, gave: T.offer.a }); B?.send({ type: 'trade', act: 'done', id: m.id, give: T.offer.a, gave: T.offer.b });
      log(`[${R.code}] Comercio entre ${A?.name} y ${B?.name}`);
    }
  } else if (m.act === 'cancel') {
    R.trades.delete(m.id); partner?.send({ type: 'trade', act: 'cancel', id: m.id, why: `${c.name} canceló el trato` });
  }
}
/* ---------- 4.9: terrenos protegidos ---------- */
function claimMsg(c, m) {
  const R = c.room, W = R.W, tell = (text) => c.send({ type: 'sys', text });
  if (m.act === 'add') {
    if (!isInt(m.x, -3e7, 3e7) || !isInt(m.z, -3e7, 3e7) || !CLAIM_SIZES.includes(m.r)) return;
    if (!R.canBuild(c)) return tell('No tienes permiso para construir en esta sala');
    if (W.claims.filter((cl) => cl.owner === c.key).length >= CLAIMS_PER_PLAYER) return tell(`Ya tienes ${CLAIMS_PER_PLAYER} terrenos. Quita uno para proteger otro.`);
    const clash = W.claims.find((cl) => cl.owner !== c.key && Math.abs(cl.x - m.x) <= cl.r + m.r && Math.abs(cl.z - m.z) <= cl.r + m.r);
    if (clash) return tell(`Se superpone con el terreno «${clash.name}» de ${W.names[clash.owner] || 'otro jugador'}`);
    const cl = { id: 'c' + Date.now().toString(36), owner: c.key, name: cleanText(m.name).slice(0, 24) || `Terreno de ${c.name}`, x: m.x, z: m.z, r: m.r, friends: [] };
    W.claims.push(cl); R.dirty = true; R.sys(`${c.name} protegió el terreno «${cl.name}» (${cl.r * 2 + 1}×${cl.r * 2 + 1})`);
  } else if (m.act === 'del') {
    const i = W.claims.findIndex((cl) => cl.id === m.id && (cl.owner === c.key || R.isHost(c))); if (i < 0) return;
    const cl = W.claims.splice(i, 1)[0]; R.dirty = true; R.sys(`Se quitó la protección del terreno «${cl.name}»`);
  } else if (m.act === 'friend') {
    const cl = W.claims.find((x) => x.id === m.id && x.owner === c.key), to = R.clients.get(m.who); if (!cl || !to || to === c) return;
    cl.friends = cl.friends.filter((k) => k !== to.key); if (m.on) cl.friends.push(to.key);
    R.dirty = true; tell(m.on ? `${to.name} puede construir en «${cl.name}»` : `${to.name} ya no puede construir en «${cl.name}»`);
    to.send({ type: 'sys', text: m.on ? `${c.name} te dio permiso para construir en su terreno «${cl.name}»` : `${c.name} te quitó el permiso de su terreno «${cl.name}»` });
  } else return;
  R.sendClaims();
}
function deleteRoom(R) {
  rooms.delete(R.code); index.delete(R.code);
  for (const f of [R.file, R.file + '.bak']) try { fs.unlinkSync(f); } catch {}
  log(`Sala ${R.code} borrada`);
}
function chatCommand(c, line) {
  const R = c.room, W = R.W, [cmd, ...args] = line.split(/\s+/), tell = (text) => c.send({ type: 'sys', text }), arg = (args[0] || '').toLowerCase();
  const needCheat = () => { if (R.canCheat(c)) return false; tell(W.cheats ? 'Solo el anfitrión y los jugadores de confianza pueden usar ese comando' : 'Los trucos están desactivados en esta sala'); return true; };
  switch (cmd.toLowerCase()) {
    case 'list': case 'jugadores': tell(`En la sala (${R.clients.size}/${W.max}): ${[...R.clients.values()].map((o) => o.name + (R.isHost(o) ? ' ★' : '')).join(', ')}`); break;
    case 'seed': case 'semilla': tell(`Semilla del mundo: ${W.seed}`); break;
    case 'code': case 'codigo': case 'código': case 'sala': tell(`Sala «${W.name}» · código de invitación: ${R.code}`); break;
    case 'time': case 'tiempo': {
      if (needCheat()) return;
      const t = arg === 'day' || arg === 'dia' || arg === 'día' ? 0.1 : arg === 'night' || arg === 'noche' ? 0.6 : parseFloat(arg);
      if (!(t >= 0 && t < 1)) return tell('Uso: /tiempo dia | noche | 0..1');
      W.time = t; R.dirty = true; R.broadcast({ type: 'time', t: W.time, d: W.days }); R.sys(`${c.name} cambió la hora`); break;
    }
    case 'weather': case 'clima': {
      if (needCheat()) return;
      const map = { despejado: 'clear', lluvia: 'rain', tormenta: 'storm', niebla: 'fog' }, w = map[arg] || arg;
      if (!WEATHERS.includes(w)) return tell('Uso: /clima despejado | lluvia | tormenta | niebla');
      W.weather = w; W.weatherT = 600; R.dirty = true; R.broadcast({ type: 'weather', w }); R.sys(`${c.name} cambió el clima`); break;
    }
    case 'kick': case 'expulsar': {
      const t = [...R.clients.values()].find((o) => o.name.toLowerCase() === args.join(' ').toLowerCase());
      if (!t) return tell('No hay nadie con ese nombre en la sala');
      return admin(c, { act: 'kick', id: t.id });
    }
    case 'e': case 'equipo': { const text = cleanText(args.join(' ')); if (text) handle(c, { type: 'chat', text, team: true }); break; }
    case 'evento': if (!R.isHost(c)) return tell('Solo el anfitrión puede empezar un evento de grupo'); if (!R.startGev()) tell('Ya hay un evento de grupo en marcha'); break;
    case 'help': case 'ayuda': tell('Comandos de la sala: /list, /codigo, /semilla, /e <mensaje> (chat de equipo)' + (W.cheats ? ', /tiempo, /clima (anfitrión y confianza)' : '') + ', /expulsar <nombre>, /evento (anfitrión)'); break;
    default: tell(`Comando desconocido: /${cmd}. Escribe /help`);
  }
}

/* ---------- Tareas periódicas ---------- */
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
  for (const c of clients.values()) c.msgs = 0;
  for (const r of rooms.values()) {
    r.tick(dt);
    if (!r.clients.size && !r.isDefault && r.emptySince && now - r.emptySince > UNLOAD_AFTER) { r.save(true); rooms.delete(r.code); }   // libera memoria
  }
}, 1000);
// Latido: detecta conexiones muertas y mantiene vivos los proxies
setInterval(() => { for (const c of clients.values()) { if (!c.alive) { c.close(1001, 'sin respuesta'); continue; } c.alive = false; c.frame(9, Buffer.alloc(0)); } }, 25000);
setInterval(() => { for (const r of rooms.values()) r.save(true); }, SAVE_EVERY);

/* ---------- HTTP: sirve el juego y el estado ---------- */
function findGame() {
  const list = [cfg.game, path.join(__dirname, 'index.html'), path.join(__dirname, '..', 'index.html'), path.join(process.cwd(), 'index.html')].filter(Boolean);
  return list.find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } });
}
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/status' || url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ linkcraft: PROTOCOL, minicraft: PROTOCOL, name: cfg.name, players: allPlayers(), max: cfg.max, rooms: index.size, password: !!cfg.password, public: publicRooms() }));
  }
  if (url === '/' || url === '/index.html') {
    const f = findGame();
    if (f) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<meta charset="utf-8"><body style="font-family:sans-serif;max-width:560px;margin:40px auto"><h1>Servidor de LinkCraft en marcha</h1><p>No se encontró <code>index.html</code> junto al servidor. Copia el archivo del juego a esta carpeta o usa <code>--game=ruta/index.html</code>. Mientras tanto puedes conectarte desde el juego con la dirección de este servidor.</p>');
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
  const [cmd, ...rest] = line.trim().split(/\s+/);
  // time/weather aceptan un código de sala opcional delante
  const pick = () => { const r = rest.length > 1 ? getRoom(rest[0]) : rooms.get(DEFAULT_CODE) || [...rooms.values()][0]; return [r, rest.length > 1 ? rest.slice(1).join(' ') : rest.join(' ')]; };
  switch ((cmd || '').toLowerCase()) {
    case '': break;
    case 'help': console.log('Comandos: rooms · list · say <texto> · kick <nombre> · time [CÓDIGO] <day|night|0..1> · weather [CÓDIGO] <clear|rain|storm|fog> · close <CÓDIGO> · save · stop'); break;
    case 'rooms': for (const [code, x] of index) { const r = rooms.get(code); console.log(`${code}  «${x.name}»  ${r ? r.clients.size : 0}/${x.max}  ${x.mode}${x.priv ? '  privada' : ''}${x.locked ? '  con contraseña' : ''}${r ? '' : '  (en disco)'}`); } break;
    case 'list': for (const r of rooms.values()) if (r.clients.size) console.log(`${r.code}: ${[...r.clients.values()].map((c) => `${c.name}${r.isHost(c) ? '★' : ''} (${c.ip})`).join(', ')}`); if (!allPlayers()) console.log('No hay jugadores conectados'); break;
    case 'say': if (rest.length) { const t = cleanText(rest.join(' ')); for (const r of rooms.values()) r.sys(`[Servidor] ${t}`); log(`[Servidor] ${t}`); } break;
    case 'kick': { const n = rest.join(' ').toLowerCase(), c = [...clients.values()].find((o) => o.name && o.name.toLowerCase() === n); if (c) c.kick('Expulsado por el administrador'); else console.log('No hay nadie con ese nombre'); break; }
    case 'time': { const [r, a] = pick(); const t = a === 'day' ? 0.1 : a === 'night' ? 0.62 : parseFloat(a); if (r && t >= 0 && t < 1) { r.W.time = t; r.dirty = true; r.broadcast({ type: 'time', t, d: r.W.days }); console.log(`Hora cambiada en ${r.code}`); } else console.log('Uso: time [CÓDIGO] day | night | 0..1'); break; }
    case 'weather': { const [r, a] = pick(); if (r && WEATHERS.includes(a)) { r.W.weather = a; r.W.weatherT = 600; r.dirty = true; r.broadcast({ type: 'weather', w: a }); console.log(`Clima cambiado en ${r.code}`); } else console.log('Uso: weather [CÓDIGO] clear | rain | storm | fog'); break; }
    case 'close': { const r = getRoom(rest[0]); if (!r || r.isDefault) { console.log('Uso: close CÓDIGO (no se puede borrar la sala INICIO)'); break; } for (const c of [...r.clients.values()]) c.kick('El administrador cerró la sala'); deleteRoom(r); break; }
    case 'save': for (const r of rooms.values()) { r.dirty = true; r.save(); } break;
    case 'stop': shutdown(); break;
    default: console.log('Comando desconocido. Escribe help');
  }
}
function shutdown() {
  log('Cerrando el servidor…');
  for (const c of clients.values()) c.kick('El servidor se ha cerrado');
  for (const r of rooms.values()) { r.dirty = true; r.save(true); }
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
if (process.stdin.isTTY || process.env.MC_CONSOLE) {
  require('readline').createInterface({ input: process.stdin }).on('line', consoleCommand);
}

/* ---------- Arranque ---------- */
scanRooms(); setupDefaultRoom();
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `El puerto ${cfg.port} ya está en uso. Prueba con --port=OTRO` : e.message); process.exit(1); });
server.listen(cfg.port, () => {
  const ips = Object.values(require('os').networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  log(`${cfg.name} listo en el puerto ${cfg.port} · ${index.size} sala(s) · hasta ${cfg.max} jugadores por sala${cfg.password ? ' · con contraseña' : ''}`);
  log(`  En este equipo:   http://localhost:${cfg.port}`);
  for (const ip of ips) log(`  En tu red local:  http://${ip}:${cfg.port}`);
  log(findGame() ? '  Abre esa dirección en el navegador para jugar. Escribe help para ver los comandos.' : '  ⚠ No se encontró index.html: el servidor funciona, pero no sirve el juego.');
});
