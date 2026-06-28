const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const joystick = document.getElementById("joystick");
const stickThumb = document.getElementById("stick-thumb");
const attackButton = document.getElementById("attack-button");
const shopButton = document.getElementById("shop-button");
const shopPanel = document.getElementById("shop-panel");
const closeShop = document.getElementById("close-shop");
const shopItemsEl = document.getElementById("shop-items");

const W = 390;
const H = 844;
const FIELD_TOP = 78;
const FIELD_BOTTOM = 676;
const LANES = [
  { name: "左", x: 78 },
  { name: "中", x: 195 },
  { name: "右", x: 312 },
];

const BLUE = "#2f80ed";
const RED = "#e5484d";
const GOLD = "#f3b63a";
const BG = "#243529";

const state = {
  time: 0,
  last: performance.now(),
  waveTimer: 0,
  message: "摧毀紅方主堡獲勝",
  messageTimer: 2.5,
  gameOver: false,
  winner: null,
  input: { x: 0, y: 0 },
  entities: [],
  particles: [],
  nextId: 1,
};

const items = [
  { id: "sword", name: "短劍", cost: 120, text: "ATK（攻擊力）+10", apply: p => (p.atk += 10) },
  { id: "armor", name: "護甲", cost: 140, text: "DEF（防禦）+5", apply: p => (p.def += 5) },
  { id: "boots", name: "靴子", cost: 110, text: "Move Speed（移動速度）+15%", apply: p => (p.speed *= 1.15) },
  { id: "stone", name: "生命石", cost: 160, text: "HP（生命值）上限 +80", apply: p => { p.maxHp += 80; p.hp += 80; } },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeEntity(kind, team, laneIndex, x, y, stats = {}) {
  const base = {
    id: state.nextId++,
    kind,
    team,
    laneIndex,
    x,
    y,
    radius: 12,
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 0,
    range: 36,
    speed: 40,
    attackCd: 0,
    attackRate: 1,
    dead: false,
    respawn: 0,
    targetId: null,
    rewardGold: 0,
    rewardExp: 0,
    level: 1,
    exp: 0,
    expNeed: 60,
    gold: 0,
    items: [],
  };
  return Object.assign(base, stats);
}

function init() {
  state.entities = [];
  state.particles = [];
  state.nextId = 1;
  state.gameOver = false;
  state.winner = null;
  state.waveTimer = 0;
  state.time = 0;

  state.redBase = makeEntity("base", "red", 1, W / 2, 44, {
    radius: 30, hp: 1200, maxHp: 1200, atk: 0, range: 0, speed: 0,
  });
  state.blueBase = makeEntity("base", "blue", 1, W / 2, 704, {
    radius: 30, hp: 1200, maxHp: 1200, atk: 0, range: 0, speed: 0,
  });
  state.entities.push(state.redBase, state.blueBase);

  LANES.forEach((lane, i) => {
    state.entities.push(makeEntity("tower", "red", i, lane.x, 136, {
      radius: 22, hp: 600, maxHp: 600, atk: 35, range: 96, attackRate: 1.15, speed: 0,
    }));
    state.entities.push(makeEntity("tower", "blue", i, lane.x, 556, {
      radius: 22, hp: 600, maxHp: 600, atk: 35, range: 96, attackRate: 1.15, speed: 0,
    }));
  });

  state.player = makeEntity("player", "blue", 1, W / 2, 636, {
    radius: 15, hp: 300, maxHp: 300, atk: 25, def: 2, range: 44, attackRate: 0.72, speed: 168,
    gold: 150,
  });
  state.entities.push(state.player);

  state.entities.push(makeHero("blue", 0), makeHero("blue", 2));
  state.entities.push(makeHero("red", 0), makeHero("red", 1), makeHero("red", 2));
  spawnWave();
  renderShop();
  showMessage("藍方出擊：用搖桿移動，攻擊鍵打最近敵人");
}

function makeHero(team, laneIndex) {
  const lane = LANES[laneIndex];
  return makeEntity("hero", team, laneIndex, lane.x, team === "blue" ? 628 : 92, {
    radius: 14, hp: 240, maxHp: 240, atk: 18, def: 2, range: 42, attackRate: 0.85,
    speed: 94, rewardGold: 100, rewardExp: 80,
  });
}

function spawnMinion(team, laneIndex, offset) {
  const lane = LANES[laneIndex];
  const y = team === "blue" ? 686 + offset : 66 - offset;
  state.entities.push(makeEntity("minion", team, laneIndex, lane.x + offset * 0.9, y, {
    radius: 9, hp: 80, maxHp: 80, atk: 8, def: 0, range: 24, attackRate: 0.95,
    speed: 58, rewardGold: 10, rewardExp: 15,
  }));
}

function spawnWave() {
  LANES.forEach((_, laneIndex) => {
    [-12, 0, 12].forEach(offset => {
      spawnMinion("blue", laneIndex, offset);
      spawnMinion("red", laneIndex, offset);
    });
  });
  showMessage("三路小兵出發");
}

function showMessage(text) {
  state.message = text;
  state.messageTimer = 2.4;
}

function enemiesOf(entity) {
  return state.entities.filter(e => !e.dead && e.team !== entity.team && e.hp > 0);
}

function findById(id) {
  return state.entities.find(e => e.id === id && !e.dead && e.hp > 0);
}

function nearestEnemy(entity, range = Infinity, filter = null) {
  let best = null;
  let bestD = range;
  for (const enemy of enemiesOf(entity)) {
    if (filter && !filter(enemy)) continue;
    const d = dist(entity, enemy);
    if (d < bestD) {
      bestD = d;
      best = enemy;
    }
  }
  return best;
}

function nearestTowerOrBase(team, laneIndex) {
  const enemyTeam = team === "blue" ? "red" : "blue";
  const laneTargets = state.entities
    .filter(e => !e.dead && e.team === enemyTeam && e.hp > 0 && (e.kind === "tower" || e.kind === "base"))
    .filter(e => e.kind === "base" || e.laneIndex === laneIndex);
  laneTargets.sort((a, b) => team === "blue" ? a.y - b.y : b.y - a.y);
  return laneTargets[0] || null;
}

function update(dt) {
  if (state.gameOver) {
    state.messageTimer = Math.max(1, state.messageTimer);
    return;
  }

  state.time += dt;
  state.waveTimer += dt;
  state.messageTimer = Math.max(0, state.messageTimer - dt);

  if (state.waveTimer >= 10) {
    state.waveTimer = 0;
    spawnWave();
  }

  for (const entity of state.entities) {
    if (entity.dead) {
      entity.respawn -= dt;
      if (entity.respawn <= 0 && entity.kind === "hero") respawnHero(entity);
      continue;
    }
    entity.attackCd = Math.max(0, entity.attackCd - dt);
    if (entity.kind === "player") updatePlayer(entity, dt);
    if (entity.kind === "minion") updateMinion(entity, dt);
    if (entity.kind === "hero") updateHero(entity, dt);
    if (entity.kind === "tower") updateTower(entity, dt);
  }

  state.particles = state.particles.filter(p => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    return p.life > 0;
  });

  state.entities = state.entities.filter(e => !(e.dead && e.kind === "minion"));
  if (state.redBase.hp <= 0) endGame("blue");
  if (state.blueBase.hp <= 0) endGame("red");
}

function updatePlayer(player, dt) {
  player.x = clamp(player.x + state.input.x * player.speed * dt, 24, W - 24);
  player.y = clamp(player.y + state.input.y * player.speed * dt, FIELD_TOP, FIELD_BOTTOM);
}

function updateMinion(entity, dt) {
  const target = nearestEnemy(entity, entity.range + 5, e => e.kind !== "base" || noEnemyTowerAhead(entity));
  if (target) {
    attack(entity, target);
    return;
  }

  const objective = nearestTowerOrBase(entity.team, entity.laneIndex);
  if (objective && dist(entity, objective) <= entity.range + objective.radius + 2) {
    attack(entity, objective);
    return;
  }

  const dir = entity.team === "blue" ? -1 : 1;
  entity.x += (LANES[entity.laneIndex].x - entity.x) * 2.4 * dt;
  entity.y += dir * entity.speed * dt;
}

function noEnemyTowerAhead(entity) {
  const enemyTeam = entity.team === "blue" ? "red" : "blue";
  return !state.entities.some(e => {
    if (e.dead || e.team !== enemyTeam || e.kind !== "tower" || e.laneIndex !== entity.laneIndex) return false;
    return entity.team === "blue" ? e.y < entity.y : e.y > entity.y;
  });
}

function updateHero(entity, dt) {
  const lowHp = entity.hp / entity.maxHp < 0.26;
  const homeY = entity.team === "blue" ? 636 : 92;
  if (lowHp) {
    moveToward(entity, LANES[entity.laneIndex].x, homeY, dt, entity.speed * 1.15);
    return;
  }

  const target = nearestEnemy(entity, entity.range + 12, e => e.kind !== "base" || noEnemyTowerAhead(entity));
  if (target) {
    attack(entity, target);
    return;
  }

  const objective = nearestTowerOrBase(entity.team, entity.laneIndex);
  if (objective) {
    if (dist(entity, objective) <= entity.range + objective.radius) attack(entity, objective);
    else moveToward(entity, objective.x, objective.y, dt, entity.speed);
  }
}

function updateTower(entity) {
  let target = nearestEnemy(entity, entity.range, e => e.kind === "minion");
  if (!target) target = nearestEnemy(entity, entity.range, e => e.kind === "hero" || e.kind === "player");
  if (target) attack(entity, target);
}

function moveToward(entity, x, y, dt, speed) {
  const dx = x - entity.x;
  const dy = y - entity.y;
  const len = Math.hypot(dx, dy) || 1;
  entity.x += (dx / len) * speed * dt;
  entity.y += (dy / len) * speed * dt;
}

function attack(attacker, target) {
  if (attacker.attackCd > 0 || target.dead || target.hp <= 0) return false;
  const damage = Math.max(1, Math.round(attacker.atk - target.def));
  target.hp -= damage;
  attacker.attackCd = attacker.attackRate;
  addHit(target.x, target.y, attacker.team);
  if (target.hp <= 0) kill(target, attacker);
  return true;
}

function playerAttack() {
  if (state.gameOver) return;
  const target = nearestEnemy(state.player, 82, e => e.kind !== "base" || noEnemyTowerAhead(state.player));
  if (!target) {
    showMessage("附近沒有可攻擊目標");
    return;
  }
  if (attack(state.player, target)) showMessage(`攻擊 ${target.kind === "tower" ? "劍塔" : target.kind === "base" ? "主堡" : "敵人"}`);
}

function kill(target, killer) {
  target.dead = true;
  target.hp = 0;
  addBurst(target.x, target.y, target.team === "blue" ? BLUE : RED);
  const player = state.player;
  if (target.team === "red" && (killer.id === player.id || dist(player, target) < 172)) {
    const scale = killer.id === player.id ? 1 : 0.55;
    gainReward(Math.round(target.rewardGold * scale), Math.round(target.rewardExp * scale));
  }
  if (target.kind === "tower") {
    showMessage(`${target.team === "red" ? "紅方" : "藍方"}${LANES[target.laneIndex].name}路劍塔被摧毀`);
    if (target.team === "red") gainReward(80, 40);
  }
  if (target.kind === "hero") {
    target.respawn = 8;
    showMessage(`${target.team === "red" ? "紅方" : "藍方"}英雄倒下`);
  }
}

function gainReward(gold, exp) {
  if (gold > 0) state.player.gold += gold;
  if (exp > 0) {
    state.player.exp += exp;
    while (state.player.exp >= state.player.expNeed) levelUp();
  }
}

function levelUp() {
  const p = state.player;
  p.exp -= p.expNeed;
  p.level += 1;
  p.expNeed = Math.round(60 + p.level * 34);
  p.maxHp += 20;
  p.hp = p.maxHp;
  p.atk += 3;
  p.def += 1;
  showMessage(`升級到 Lv.${p.level}：HP、ATK、DEF 提升`);
}

function respawnHero(hero) {
  hero.dead = false;
  hero.hp = hero.maxHp;
  hero.x = LANES[hero.laneIndex].x;
  hero.y = hero.team === "blue" ? 628 : 92;
}

function endGame(winner) {
  state.gameOver = true;
  state.winner = winner;
  showMessage(winner === "blue" ? "勝利：紅方主堡已摧毀" : "失敗：藍方主堡被摧毀");
}

function addHit(x, y, team) {
  state.particles.push({ x, y, vx: 0, vy: -18, life: 0.22, color: team === "blue" ? "#b9d8ff" : "#ffd0d0", r: 8 });
}

function addBurst(x, y, color) {
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI * 2 * i) / 8;
    state.particles.push({ x, y, vx: Math.cos(a) * 42, vy: Math.sin(a) * 42, life: 0.45, color, r: 4 });
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawMap();
  const sorted = [...state.entities].sort((a, b) => a.y - b.y);
  for (const entity of sorted) {
    if (!entity.dead) drawEntity(entity);
  }
  drawParticles();
  drawHud();
  if (state.gameOver) drawGameOver();
}

function drawMap() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_BOTTOM);
  grad.addColorStop(0, "#20382b");
  grad.addColorStop(1, "#2d412e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, FIELD_TOP, W, FIELD_BOTTOM - FIELD_TOP);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  LANES.forEach(lane => {
    ctx.beginPath();
    ctx.moveTo(lane.x, FIELD_TOP + 10);
    ctx.lineTo(lane.x, FIELD_BOTTOM - 10);
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(235,220,170,0.18)";
  ctx.lineWidth = 2;
  for (let y = 180; y <= 520; y += 88) {
    ctx.beginPath();
    ctx.moveTo(34, y);
    ctx.lineTo(W - 34, y);
    ctx.stroke();
  }

  drawBasePad(W / 2, 44, RED, "紅方主堡");
  drawBasePad(W / 2, 704, BLUE, "藍方主堡");
}

function drawBasePad(x, y, color, label) {
  ctx.fillStyle = color + "24";
  ctx.beginPath();
  ctx.roundRect(x - 78, y - 34, 156, 68, 8);
  ctx.fill();
  ctx.fillStyle = "#f7f7f7";
  ctx.font = "700 13px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 4);
}

function drawEntity(e) {
  const color = e.team === "blue" ? BLUE : RED;
  if (e.kind === "tower") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(e.x - 16, e.y - 22, 32, 44, 5);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(e.x - 5, e.y - 30, 10, 12);
  } else if (e.kind === "base") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(e.x - 28, e.y - 26, 56, 52, 8);
    ctx.fill();
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(e.x - 12, e.y - 34, 24, 10);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    if (e.kind === "player") {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (e.kind === "hero") {
      ctx.strokeStyle = "#f6e49e";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  drawHealthBar(e);
}

function drawHealthBar(e) {
  if (e.maxHp <= 0) return;
  const width = e.kind === "base" ? 72 : e.kind === "tower" ? 42 : 30;
  const y = e.y - e.radius - 14;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(e.x - width / 2, y, width, 5);
  ctx.fillStyle = e.team === "blue" ? "#74b5ff" : "#ff8085";
  ctx.fillRect(e.x - width / 2, y, width * clamp(e.hp / e.maxHp, 0, 1), 5);
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = clamp(p.life * 2.4, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  const p = state.player;
  ctx.fillStyle = "rgba(12,18,24,0.82)";
  ctx.fillRect(0, 0, W, 78);
  ctx.fillRect(0, FIELD_BOTTOM, W, H - FIELD_BOTTOM);

  ctx.fillStyle = "#fff";
  ctx.font = "800 15px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`Lv.${p.level}  HP ${Math.ceil(p.hp)}/${p.maxHp}`, 14, 24);
  ctx.fillText(`Gold ${p.gold}  ATK ${p.atk}  DEF ${p.def}`, 14, 50);

  drawBar(190, 16, 84, 9, p.hp / p.maxHp, "#65aefb");
  drawBar(190, 38, 84, 9, p.exp / p.expNeed, GOLD);

  ctx.textAlign = "right";
  ctx.fillStyle = "#ffb6bb";
  ctx.fillText(`紅堡 ${Math.max(0, Math.ceil(state.redBase.hp))}`, W - 14, 24);
  ctx.fillStyle = "#9ccdff";
  ctx.fillText(`藍堡 ${Math.max(0, Math.ceil(state.blueBase.hp))}`, W - 14, 50);

  if (state.messageTimer > 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(32, 86, W - 64, 34, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 14px system-ui";
    ctx.fillText(state.message, W / 2, 108);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "700 12px system-ui";
  LANES.forEach(lane => ctx.fillText(`${lane.name}路`, lane.x, FIELD_TOP + 26));
}

function drawBar(x, y, w, h, ratio, color) {
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "900 34px system-ui";
  ctx.fillText(state.winner === "blue" ? "勝利" : "失敗", W / 2, H / 2 - 16);
  ctx.font = "700 15px system-ui";
  ctx.fillText("重新整理頁面可再玩一次", W / 2, H / 2 + 20);
}

function renderShop() {
  shopItemsEl.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "shop-item";
    const info = document.createElement("div");
    info.innerHTML = `<strong>${item.name}</strong><br><small>${item.text} / ${item.cost} Gold（金錢）</small>`;
    const button = document.createElement("button");
    button.className = "buy-button";
    button.type = "button";
    button.textContent = "購買";
    button.addEventListener("click", () => buyItem(item));
    row.append(info, button);
    shopItemsEl.append(row);
  }
}

function buyItem(item) {
  const p = state.player;
  if (p.gold < item.cost) {
    showMessage("Gold（金錢）不足");
    return;
  }
  p.gold -= item.cost;
  p.items.push(item.id);
  item.apply(p);
  showMessage(`已購買 ${item.name}`);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

function setStick(clientX, clientY) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const len = Math.hypot(dx, dy);
  const max = 42;
  const nx = len > max ? (dx / len) * max : dx;
  const ny = len > max ? (dy / len) * max : dy;
  state.input.x = nx / max;
  state.input.y = ny / max;
  stickThumb.style.transform = `translate(${nx}px, ${ny}px)`;
}

function resetStick() {
  state.input.x = 0;
  state.input.y = 0;
  stickThumb.style.transform = "translate(0, 0)";
}

joystick.addEventListener("pointerdown", e => {
  joystick.setPointerCapture(e.pointerId);
  setStick(e.clientX, e.clientY);
});
joystick.addEventListener("pointermove", e => {
  if (joystick.hasPointerCapture(e.pointerId)) setStick(e.clientX, e.clientY);
});
joystick.addEventListener("pointerup", e => {
  joystick.releasePointerCapture(e.pointerId);
  resetStick();
});
joystick.addEventListener("pointercancel", resetStick);
attackButton.addEventListener("pointerdown", playerAttack);
shopButton.addEventListener("click", () => shopPanel.classList.toggle("open"));
closeShop.addEventListener("click", () => shopPanel.classList.remove("open"));
window.addEventListener("resize", resizeCanvas);

function frame(now) {
  const dt = Math.min(0.05, (now - state.last) / 1000);
  state.last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

resizeCanvas();
init();
window.__mobaState = state;
requestAnimationFrame(frame);
