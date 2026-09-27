import { BLACK, WHITE, EMPTY, scoreRegions } from './engine.js';

export const PHASES = Object.freeze({
  PREVIEW: 'preview',
  DRAFT: 'draft',
  SAFE_OPENING: 'opening',
  PLAY: 'play',
  REVIEW: 'review',
  FINISHED: 'finished'
});

export class MatchState {
  constructor({ game, regions, safeEnabled = false, safeCount = 0, onEvent = null }) {
    this.game = game;
    this.regions = regions;
    this.safeEnabled = safeEnabled;
    const selectableCount=regions.filter(region=>region.safeSelectable!==false).length;
    this.safeCount = safeEnabled ? Math.min(safeCount, Math.floor(selectableCount / 2)) : 0;
    this.onEvent = onEvent;
    this.phase = PHASES.PREVIEW;
    this.picks = { [BLACK]: [], [WHITE]: [] };
    this.used = { [BLACK]: [], [WHITE]: [] };
    this.draftTurn = WHITE;
    this.whiteBonus = 0;
    this.swapCount = 0;
    this.openingRound = 0;
    this.freePlayHistoryStart = 0;
    this.deadStones = new Set();
    this.finalScore = null;
    this.regionByNode = new Int16Array(game.topology.nodeCount).fill(-1);
    regions.forEach((region, index) => region.nodes.forEach(node => { this.regionByNode[node] = index; }));
  }

  emit(type, data = {}, enabled = true) { if (enabled && this.onEvent) this.onEvent({ type, ...data }); }
  start() { if (this.phase !== PHASES.PREVIEW) return false; this.phase = this.safeEnabled ? PHASES.DRAFT : PHASES.PLAY; return true; }
  get started() { return this.phase !== PHASES.PREVIEW; }
  get enabled() { return this.safeEnabled; }
  get count() { return this.safeCount; }
  get activeColor() { return this.phase === PHASES.DRAFT ? this.draftTurn : this.game.turn; }
  get canSwapSides() { return this.phase === PHASES.DRAFT && this.picks[BLACK].length === 0 && this.picks[WHITE].length === 0; }
  regionAt(node) { return this.regionByNode[node]; }
  safeOwner(regionIndex) {
    if (this.picks[BLACK].includes(regionIndex)) return BLACK;
    if (this.picks[WHITE].includes(regionIndex)) return WHITE;
    return EMPTY;
  }

  requestSideSwap(emit = true) {
    if (!this.canSwapSides) return { ok: false, reason: '只能在首次选择安全州前要求换边' };
    this.whiteBonus += 0.5;
    this.swapCount++;
    this.emit('swap-sides', { whiteBonus: this.whiteBonus }, emit);
    return { ok: true, whiteBonus: this.whiteBonus };
  }

  withWhiteBonus(score) {
    return { ...score, whiteTotal: score.whiteTotal + this.whiteBonus, whiteBonus: this.whiteBonus };
  }

  selectSafeRegion(regionIndex, emit = true) {
    if (this.phase !== PHASES.DRAFT) return { ok: false, reason: '当前不是选州阶段' };
    if (regionIndex < 0 || regionIndex >= this.regions.length) return { ok: false, reason: '无效区域' };
    if (this.regions[regionIndex].safeSelectable === false) return { ok: false, reason: '首都领地不能作为安全州' };
    if (this.safeOwner(regionIndex) !== EMPTY) return { ok: false, reason: '该州已被选择' };
    const color = this.draftTurn;
    this.picks[color].push(regionIndex);
    this.emit('select-safe', { color, regionIndex }, emit);
    if (color === BLACK && this.picks[BLACK].length === this.safeCount && this.picks[WHITE].length === this.safeCount) {
      this.phase = PHASES.SAFE_OPENING;
      this.openingRound = 0;
    } else this.draftTurn = color === WHITE ? BLACK : WHITE;
    return { ok: true };
  }

  availableSafeRegions(color = this.game.turn) {
    if (this.phase !== PHASES.SAFE_OPENING) return [];
    return this.picks[color].filter(regionIndex => !this.used[color].includes(regionIndex));
  }

  allowedNodes(color = this.game.turn) {
    if (this.phase !== PHASES.SAFE_OPENING) return null;
    return this.availableSafeRegions(color).flatMap(regionIndex => this.regions[regionIndex].nodes);
  }

  canPlay(node) {
    if (this.phase === PHASES.PREVIEW) return { ok: false, reason: '请先开始对局' };
    if (this.phase === PHASES.DRAFT) return { ok: false, reason: '请先完成安全州选择' };
    if (this.phase === PHASES.REVIEW || this.phase === PHASES.FINISHED) return { ok: false, reason: '对局已经停止落子' };
    const allowed = this.allowedNodes();
    if (allowed && !allowed.includes(node)) return { ok: false, reason: '请选择尚未布子的己方安全州' };
    if (!this.game.analyzeMove(node).legal) return { ok: false, reason: '该处不是合法着点' };
    return { ok: true };
  }

  play(node, emit = true) {
    const legality = this.canPlay(node);
    if (!legality.ok) return legality;
    const color = this.game.turn, phase = this.phase;
    if (!this.game.play(node)) return { ok: false, reason: '落子失败' };
    if (phase === PHASES.SAFE_OPENING) {
      const regionIndex = this.regionAt(node);
      if (!this.used[color].includes(regionIndex)) this.used[color].push(regionIndex);
      if (color === WHITE) this.openingRound++;
      if (this.used[BLACK].length >= this.safeCount && this.used[WHITE].length >= this.safeCount) {
        this.phase = PHASES.PLAY;
        this.freePlayHistoryStart = this.game.history.length;
      }
    }
    this.emit('play', { color, node, phase }, emit);
    return { ok: true };
  }

  pass(emit = true) {
    if (this.phase !== PHASES.PLAY) return { ok: false, reason: '当前阶段不能停一手' };
    const color = this.game.turn;
    this.game.pass();
    this.emit('pass', { color }, emit);
    if (this.game.finished) this.phase = PHASES.REVIEW;
    return { ok: true };
  }

  reviewGame() {
    if (!this.deadStones.size) return this.game;
    const review = this.game.clone();
    for (const node of this.deadStones) review.board[node] = EMPTY;
    return review;
  }

  reviewScore() { return this.withWhiteBonus(scoreRegions(this.reviewGame(), this.regions)); }

  toggleDeadGroup(node, emit = true) {
    if (this.phase !== PHASES.REVIEW || this.game.board[node] === EMPTY) return { ok: false, reason: '只能在终局确认时标记棋块' };
    const stones = [...this.game.groupAt(node).stones];
    const dead = !stones.every(stone => this.deadStones.has(stone));
    for (const stone of stones) dead ? this.deadStones.add(stone) : this.deadStones.delete(stone);
    this.emit('mark-dead', { nodes: stones, dead }, emit);
    return { ok: true };
  }

  setDeadNodes(nodes, dead) { for (const node of nodes) dead ? this.deadStones.add(node) : this.deadStones.delete(node); }

  confirm(score = this.reviewScore(), emit = true) {
    if (this.phase !== PHASES.REVIEW) return { ok: false, reason: '当前不能确认终局' };
    this.finalScore = score;
    this.phase = PHASES.FINISHED;
    this.emit('confirm', { blackTotal: score.blackTotal, whiteTotal: score.whiteTotal }, emit);
    return { ok: true };
  }

  resume(emit = true) {
    if (this.phase !== PHASES.REVIEW) return { ok: false, reason: '当前不能恢复对局' };
    this.game.finished = false;
    this.game.consecutivePasses = 0;
    this.deadStones.clear();
    this.phase = PHASES.PLAY;
    this.emit('resume', {}, emit);
    return { ok: true };
  }

  undo(plies = 1, emit = true) {
    if (![PHASES.PLAY, PHASES.REVIEW].includes(this.phase)) return { ok: false, reason: '当前阶段不能悔棋' };
    const available = this.game.history.length - this.freePlayHistoryStart;
    const actual = Math.min(plies, available);
    if (actual <= 0 || !this.game.undo(actual)) return { ok: false, reason: '没有可以撤销的自由对弈着法' };
    this.deadStones.clear(); this.finalScore = null; this.phase = PHASES.PLAY;
    this.emit('undo', { plies: actual }, emit);
    return { ok: true, plies: actual };
  }
}
