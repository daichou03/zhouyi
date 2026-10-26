import { GoGame, GridTopology, BLACK, WHITE } from './engine.js?v=8b7457d1d7688be4';
import { MatchState, PHASES } from './match.js?v=8b7457d1d7688be4';
import { applyMatchEvent } from './record.js?v=8b7457d1d7688be4';

// Versioned, lossless positions. Region IDs are labels, not ordinal features.
export function extractTrainingSamples(result, { split, gameId }) {
  const { record } = result;
  const { width, height, safeEnabled, safeCount } = record.config;
  const game = new GoGame(new GridTopology(width, height));
  const match = new MatchState({ game, regions: record.regions, safeEnabled, safeCount });
  match.start();
  const forcedEnd = result.termination !== 'natural-passes';
  const forcedPassStart = forcedEnd ? record.events.findLastIndex(event => event.type === 'confirm') - 2 : -1;
  const samples = [];
  for (const [eventIndex, event] of record.events.entries()) {
    if (event.type === 'play' || event.type === 'pass') {
      // Synthetic passes used by the simulator are never policy targets.
      if (!forcedEnd || eventIndex < forcedPassStart) {
        const allowed = match.allowedNodes();
        const legalActions = [];
        for (let node = 0; node < width * height; node++) {
          if ((!allowed || allowed.includes(node)) && game.analyzeMove(node).legal) legalActions.push(node);
        }
        if (match.phase === PHASES.PLAY) legalActions.push(width * height);
        const action = event.type === 'pass' ? width * height : event.node;
        if (!legalActions.includes(action)) throw new Error(`Illegal training action: ${gameId}/${eventIndex}`);
        const sign = game.turn === BLACK ? 1 : -1;
        samples.push({
          format: 'electoral-go-position', version: 1, split, gameId, eventIndex,
          mapSeed: result.mapSeed, width, height,
          regions: record.regions.map(({ points, nodes }) => ({ points, nodes })),
          board: [...game.board], toPlay: game.turn, previousPosition: game.previousPosition,
          consecutivePasses: game.consecutivePasses, phase: match.phase,
          safePicks: { black: [...match.picks[BLACK]], white: [...match.picks[WHITE]] },
          safeUsed: { black: [...match.used[BLACK]], white: [...match.used[WHITE]] },
          whiteBonus: match.whiteBonus, legalActions, action,
          policyTargetKind: 'teacher-action-not-search-distribution',
          // A move-cap score is not a completed-game training label.
          outcomeTarget: forcedEnd ? null : sign * Math.sign(result.blackTotal - result.whiteTotal),
          scoreTarget: forcedEnd ? null : sign * (result.blackTotal - result.whiteTotal),
          termination: result.termination,
          adjudication: 'automatic-area-no-dead-stone-review'
        });
      }
    }
    const applied = applyMatchEvent(match, event);
    if (!applied.ok) throw new Error(`Replay failed: ${gameId}/${eventIndex}: ${applied.reason}`);
  }
  return samples;
}

export function trainingCell(index) {
  const cells = [];
  for (const safeEnabled of [false, true]) {
    for (const style of ['natural', 'regular', 'complex']) {
      for (const regionCount of [4, 5, 7]) cells.push({ regionCount, style, safeEnabled, safeCount: safeEnabled ? 1 : 0 });
    }
  }
  return cells[index % cells.length];
}
