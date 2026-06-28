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
  effects: [],
  texts: [],
  targetHint: null,
  shake: 0,
  nextId: 1,
};

const items = [
  { id: "sword", icon: "劍", color: "#f6e49e", name: "短劍", cost: 100, text: "ATK（攻擊力）+10", apply: p => (p.atk += 10) },
  { id: "armor", icon: "甲", color: "#9ccdff", name: "護甲", cost: 120, text: "DEF（防禦）+5", apply: p => (p.def += 5) },
  { id: "boots", icon: "靴", color: "#bdf2a0", name: "靴子", cost: 95, text: "Move Speed（移動速度）+15%", apply: p => (p.speed *= 1.15) },
  { id: "stone", icon: "心", color: "#ff9aa2", name: "生命石", cost: 145, text: "HP（生命值）上限 +80", apply: p => { p.maxHp += 80; p.hp += 80; } },
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
  state.effects = [];
  state.texts = [];
  state.targetHint = null;
  state.shake = 0;
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
      radius: 22, hp: 560, maxHp: 560, atk: 30, range: 92, attackRate: 1.25, speed: 0,
    }));
    state.entities.push(makeEntity("tower", "blue", i, lane.x, 556, {
      radius: 22, hp: 560, maxHp: 560, atk: 30, range: 92, attackRate: 1.25, speed: 0,
    }));
  });

  state.player = makeEntity("player", "blue", 1, W / 2, 636, {
    radius: 15, hp: 320, maxHp: 320, atk: 27, def: 3, range: 52, attackRate: 0.62, speed: 186,
    gold: 180,
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
    radius: 14, hp: 250, maxHp: 250, atk: 18, def: 2, range: 46, attackRate: 0.88,
    speed: 98, rewardGold: 120, rewardExp: 90,
  });
}

function spawnMinion(team, laneIndex, offset) {
  const lane = LANES[laneIndex];
  const y = team === "blue" ? 686 + offset : 66 - offset;
  state.entities.push(makeEntity("minion", team, laneIndex, lane.x + offset * 0.9, y, {
    radius: 9, hp: 76, maxHp: 76, atk: 7, def: 0, range: 24, attackRate: 1,
    speed: 62, rewardGold: 14, rewardExp: 18,
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
  state.shake = Math.max(0, state.shake - dt * 22);

  updatePlayerTargetHint();

  if (state.waveTimer >= 8) {
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
  state.effects = state.effects.filter(effect => {
    effect.life -= dt;
    return effect.life > 0;
  });
  state.texts = state.texts.filter(t => {
    t.life -= dt;
    t.y -= t.speed * dt;
    return t.life > 0;
  });

  state.entities = state.entities.filter(e => !(e.dead && e.kind === "minion"));
  if (state.redBase.hp <= 0) endGame("blue");
  if (state.blueBase.hp <= 0) endGame("red");
}

function updatePlayer(player, dt) {
  player.x = clamp(player.x + state.input.x * player.speed * dt, 24, W - 24);
  player.y = clamp(player.y + state.input.y * player.speed * dt, FIELD_TOP, FIELD_BOTTOM);
  const autoTarget = getPlayerTarget(72);
  if (autoTarget) attack(player, autoTarget);
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
  addAttackEffect(attacker, target);
  addHit(target.x, target.y, attacker.team);
  addFloatingText(target.x, target.y - target.radius - 12, `-${damage}`, attacker.team === "blue" ? "#b9d8ff" : "#ffd0d0");
  state.shake = Math.max(state.shake, attacker.kind === "tower" ? 3.8 : attacker.kind === "player" ? 2.4 : 1.4);
  if (target.hp <= 0) kill(target, attacker);
  return true;
}

function playerAttack() {
  if (state.gameOver) return;
  const target = getPlayerTarget(128);
  if (!target) {
    showMessage("附近沒有可攻擊目標");
    return;
  }
  if (attack(state.player, target)) showMessage(`攻擊 ${target.kind === "tower" ? "劍塔" : target.kind === "base" ? "主堡" : "敵人"}`);
}

function getPlayerTarget(range) {
  return nearestEnemy(state.player, range, e => e.kind !== "base" || noEnemyTowerAhead(state.player));
}

function updatePlayerTargetHint() {
  const target = getPlayerTarget(128);
  state.targetHint = target ? target.id : null;
}

function kill(target, killer) {
  target.dead = true;
  target.hp = 0;
  addBurst(target.x, target.y, target.team === "blue" ? BLUE : RED);
  const player = state.player;
  if (target.team === "red" && (killer.id === player.id || dist(player, target) < 172)) {
    const scale = killer.id === player.id ? 1 : 0.55;
    const gold = Math.round(target.rewardGold * scale);
    const exp = Math.round(target.rewardExp * scale);
    gainReward(gold, exp);
    addFloatingText(player.x, player.y - 34, `+${gold}G +${exp}EXP`, GOLD);
  }
  if (target.kind === "tower") {
    showMessage(`${target.team === "red" ? "紅方" : "藍方"}${LANES[target.laneIndex].name}路劍塔被摧毀`);
    if (target.team === "red") {
      gainReward(120, 70);
      addFloatingText(player.x, player.y - 42, "+120G +70EXP", GOLD);
    }
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
  p.expNeed = Math.round(58 + p.level * 30);
  p.maxHp += 26;
  p.hp = p.maxHp;
  p.atk += 4;
  p.def += 1;
  showMessage(`升級到 Lv.${p.level}：HP、ATK、DEF 提升`);
  addFloatingText(p.x, p.y - 50, `LEVEL ${p.level}`, "#f6e49e", 1.2);
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
  const color = team === "blue" ? "#b9d8ff" : "#ffd0d0";
  state.particles.push({ x, y, vx: 0, vy: -18, life: 0.25, color, r: 9, type: "ring" });
  for (let i = 0; i < 5; i += 1) {
    const a = Math.PI * 2 * (i / 5) + state.time;
    state.particles.push({ x, y, vx: Math.cos(a) * 34, vy: Math.sin(a) * 34, life: 0.28, color, r: 2.6, type: "spark" });
  }
}

function addAttackEffect(attacker, target) {
  const color = attacker.team === "blue" ? "#8fc7ff" : "#ff858a";
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const angle = Math.atan2(dy, dx);
  const kind = attacker.kind === "tower" ? "beam" : attacker.kind === "minion" ? "stab" : "slash";
  state.effects.push({
    type: kind,
    team: attacker.team,
    x1: attacker.x,
    y1: attacker.y,
    x2: target.x,
    y2: target.y,
    angle,
    color,
    life: kind === "beam" ? 0.22 : 0.18,
    duration: kind === "beam" ? 0.22 : 0.18,
    width: attacker.kind === "tower" ? 7 : attacker.kind === "player" ? 6 : 4,
  });
}

function addFloatingText(x, y, text, color, scale = 1) {
  state.texts.push({ x, y, text, color, scale, life: 1, speed: 30 });
}

function addBurst(x, y, color) {
  for (let i = 0; i < 14; i += 1) {
    const a = (Math.PI * 2 * i) / 14;
    const speed = i % 2 === 0 ? 58 : 34;
    state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.52, color, r: i % 2 === 0 ? 4 : 2.5, type: "spark" });
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (state.shake > 0) {
    const sx = Math.sin(state.time * 91) * state.shake;
    const sy = Math.cos(state.time * 73) * state.shake;
    ctx.translate(sx, sy);
  }
  drawMap();
  const sorted = [...state.entities].sort((a, b) => a.y - b.y);
  drawTargetHint();
  for (const entity of sorted) {
    if (!entity.dead) drawEntity(entity);
  }
  drawAttackEffects();
  drawParticles();
  drawFloatingTexts();
  ctx.restore();
  drawHud();
  if (state.gameOver) drawGameOver();
}

function drawTargetHint() {
  const target = findById(state.targetHint);
  if (!target) return;
  ctx.strokeStyle = "#f6e49e";
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius + 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(246,228,158,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(state.player.x, state.player.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
}

function drawAttackEffects() {
  for (const effect of state.effects) {
    const t = 1 - effect.life / effect.duration;
    const alpha = clamp(effect.life / effect.duration, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (effect.type === "beam") {
      const grad = ctx.createLinearGradient(effect.x1, effect.y1, effect.x2, effect.y2);
      grad.addColorStop(0, effect.color);
      grad.addColorStop(0.5, "#ffffff");
      grad.addColorStop(1, effect.color);
      ctx.strokeStyle = grad;
      ctx.lineWidth = effect.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(effect.x1, effect.y1 - 8);
      ctx.lineTo(effect.x2, effect.y2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(effect.x1, effect.y1 - 8);
      ctx.lineTo(effect.x2, effect.y2);
      ctx.stroke();
    } else if (effect.type === "slash") {
      ctx.translate(effect.x2, effect.y2);
      ctx.rotate(effect.angle + Math.PI / 2);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = effect.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, 0, 24 + t * 10, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 17 + t * 7, -0.8, 0.8);
      ctx.stroke();
    } else {
      const mx = effect.x1 + (effect.x2 - effect.x1) * t;
      const my = effect.y1 + (effect.y2 - effect.y1) * t;
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = effect.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(effect.x1, effect.y1);
      ctx.lineTo(mx, my);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawMap() {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, FIELD_TOP, 0, FIELD_BOTTOM);
  grad.addColorStop(0, "#1e3329");
  grad.addColorStop(0.5, "#2a4230");
  grad.addColorStop(1, "#20382d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, FIELD_TOP, W, FIELD_BOTTOM - FIELD_TOP);

  drawGrassTexture();

  ctx.strokeStyle = "rgba(15,22,18,0.42)";
  ctx.lineWidth = 26;
  ctx.lineCap = "round";
  LANES.forEach(lane => {
    ctx.beginPath();
    ctx.moveTo(lane.x, FIELD_TOP + 10);
    ctx.lineTo(lane.x, FIELD_BOTTOM - 10);
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(215,225,198,0.18)";
  ctx.lineWidth = 18;
  LANES.forEach(lane => {
    ctx.beginPath();
    ctx.moveTo(lane.x, FIELD_TOP + 10);
    ctx.lineTo(lane.x, FIELD_BOTTOM - 10);
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  LANES.forEach(lane => {
    ctx.beginPath();
    ctx.moveTo(lane.x - 13, FIELD_TOP + 22);
    ctx.lineTo(lane.x - 13, FIELD_BOTTOM - 22);
    ctx.moveTo(lane.x + 13, FIELD_TOP + 22);
    ctx.lineTo(lane.x + 13, FIELD_BOTTOM - 22);
    ctx.stroke();
  });

  ctx.strokeStyle = "rgba(246,228,158,0.2)";
  ctx.lineWidth = 2;
  for (let y = 180; y <= 520; y += 88) {
    ctx.beginPath();
    ctx.moveTo(34, y);
    ctx.lineTo(W - 34, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(32, 356);
  ctx.lineTo(W - 32, 356);
  ctx.stroke();
  ctx.setLineDash([]);

  drawBasePad(W / 2, 44, RED, "紅方主堡");
  drawBasePad(W / 2, 704, BLUE, "藍方主堡");
}

function drawGrassTexture() {
  for (let i = 0; i < 85; i += 1) {
    const x = (i * 47) % W;
    const y = FIELD_TOP + ((i * 83) % (FIELD_BOTTOM - FIELD_TOP));
    const alpha = 0.05 + ((i % 5) * 0.014);
    ctx.strokeStyle = `rgba(180,220,170,${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5 + (i % 3), y - 5);
    ctx.stroke();
  }
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
    drawTower(e, color);
  } else if (e.kind === "base") {
    drawCastle(e, color);
  } else if (e.kind === "player") {
    drawPlayer(e, color);
  } else if (e.kind === "hero") {
    drawHero(e, color);
  } else {
    drawMinion(e, color);
  }
  drawHealthBar(e);
}

function drawTower(e, color) {
  const pulse = 0.5 + Math.sin(state.time * 3 + e.id) * 0.5;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 24, 23, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = e.team === "blue" ? `rgba(80,160,255,${0.1 + pulse * 0.08})` : `rgba(255,90,100,${0.1 + pulse * 0.08})`;
  ctx.beginPath();
  ctx.arc(e.x, e.y + 4, 36 + pulse * 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(e.x - 18, e.y - 12, 36, 38, 5);
  ctx.fill();
  ctx.fillStyle = "#eaf4ff";
  ctx.fillRect(e.x - 12, e.y - 20, 24, 10);
  ctx.fillRect(e.x - 4, e.y - 30, 8, 12);
  ctx.strokeStyle = "#18212b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - 8);
  ctx.lineTo(e.x, e.y + 18);
  ctx.stroke();
  ctx.strokeStyle = e.team === "blue" ? "#9ccdff" : "#ffb6bb";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(e.x, e.y - 3, 10, Math.PI * 0.15, Math.PI * 0.85, true);
  ctx.stroke();
}

function drawCastle(e, color) {
  const pulse = 0.5 + Math.sin(state.time * 2 + e.id) * 0.5;
  ctx.fillStyle = e.team === "blue" ? `rgba(80,160,255,${0.12 + pulse * 0.08})` : `rgba(255,90,100,${0.12 + pulse * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + 10, 70 + pulse * 8, 38 + pulse * 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(e.x - 30, e.y - 20, 60, 46, 6);
  ctx.fill();
  ctx.fillRect(e.x - 36, e.y - 8, 14, 34);
  ctx.fillRect(e.x + 22, e.y - 8, 14, 34);

  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(e.x - 30, e.y - 30, 10, 10);
  ctx.fillRect(e.x - 5, e.y - 32, 10, 12);
  ctx.fillRect(e.x + 20, e.y - 30, 10, 10);
  ctx.fillStyle = "#17202a";
  ctx.beginPath();
  ctx.roundRect(e.x - 8, e.y + 3, 16, 23, 8);
  ctx.fill();
  ctx.fillStyle = e.team === "blue" ? "#9ccdff" : "#ffb6bb";
  ctx.fillRect(e.x - 22, e.y - 4, 10, 10);
  ctx.fillRect(e.x + 12, e.y - 4, 10, 10);
}

function drawMinion(e, color) {
  const dir = e.team === "blue" ? -1 : 1;
  const bob = Math.sin(state.time * 8 + e.id) * 1.6;
  const x = e.x;
  const y = e.y + bob;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, e.y + 11, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f1f6ff";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x, y + 8);
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x - 8, y + 7);
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x - 5, y + 15);
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x + 5, y + 15);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(x - 5, y - 2, 10, 8);
  ctx.strokeStyle = "#f6e49e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 7, y + 3);
  ctx.lineTo(x + 15, y + 3 + dir * 5);
  ctx.stroke();
}

function drawHero(e, color) {
  drawFighter(e, color, 1, "#f6e49e");
}

function drawPlayer(e, color) {
  drawFighter(e, color, 1.16, "#ffffff");
  const bob = Math.sin(state.time * 6 + e.id) * 1.2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(e.x - 8, e.y + bob - 23);
  ctx.lineTo(e.x, e.y + bob - 31);
  ctx.lineTo(e.x + 8, e.y + bob - 23);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#b9d8ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius + 7, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFighter(e, color, scale, accent) {
  const dir = e.team === "blue" ? -1 : 1;
  const bob = Math.sin(state.time * 6 + e.id) * 1.2;
  const x = e.x;
  const y = e.y + bob;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, e.y + 17 * scale, 16 * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f1f6ff";
  ctx.lineWidth = 3.2 * scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 4 * scale);
  ctx.lineTo(x, y + 12 * scale);
  ctx.moveTo(x, y + 1 * scale);
  ctx.lineTo(x - 14 * scale, y + 8 * scale);
  ctx.moveTo(x, y + 12 * scale);
  ctx.lineTo(x - 8 * scale, y + 25 * scale);
  ctx.moveTo(x, y + 12 * scale);
  ctx.lineTo(x + 8 * scale, y + 25 * scale);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 16 * scale, 8 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - 9 * scale, y - 2 * scale, 18 * scale, 18 * scale, 4 * scale);
  ctx.fill();

  ctx.shadowColor = accent;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(x + 10 * scale, y + 1 * scale);
  ctx.lineTo(x + 23 * scale, y - 10 * dir * scale);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(x - 24 * scale, y + 2 * scale, 10 * scale, 16 * scale, 4 * scale);
  ctx.fill();
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
    if (p.type === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + (0.28 - p.life) * 34, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  ctx.textAlign = "center";
  ctx.font = "800 13px system-ui";
  for (const t of state.texts) {
    ctx.globalAlpha = clamp(t.life, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color;
    ctx.font = `800 ${Math.round(13 * t.scale)}px system-ui`;
    ctx.fillText(t.text, t.x, t.y);
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

  drawInventory(p);

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

function drawInventory(player) {
  const slots = 4;
  const size = 34;
  const gap = 8;
  const startX = W / 2 - ((slots * size + (slots - 1) * gap) / 2);
  const y = FIELD_BOTTOM + 16;

  ctx.textAlign = "center";
  ctx.font = "800 11px system-ui";
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.fillText("裝備", W / 2, y - 5);

  for (let i = 0; i < slots; i += 1) {
    const x = startX + i * (size + gap);
    const item = items.find(entry => entry.id === player.items[i]);
    ctx.fillStyle = item ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)";
    ctx.strokeStyle = item ? item.color : "rgba(255,255,255,0.2)";
    ctx.lineWidth = item ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 7);
    ctx.fill();
    ctx.stroke();

    if (item) {
      ctx.fillStyle = item.color;
      ctx.font = "900 15px system-ui";
      ctx.fillText(item.icon, x + size / 2, y + 22);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "700 9px system-ui";
      ctx.fillText(item.name.slice(0, 2), x + size / 2, y + 43);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "800 15px system-ui";
      ctx.fillText("+", x + size / 2, y + 22);
    }
  }
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
  if (p.items.length >= 4) {
    showMessage("裝備欄已滿");
    return;
  }
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
