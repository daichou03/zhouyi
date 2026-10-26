// Deliberately small 9x9 imitation baseline, not the final search/value network.
export const POLICY_INPUT_SIZE = 81 * 15 + 4;

export function encodePolicyInput(position) {
  if (position.width !== 9 || position.height !== 9) throw new Error('Tiny policy only supports 9x9');
  const own = position.toPlay, enemy = 3 - own, out = new Float32Array(POLICY_INPUT_SIZE);
  const byNode = new Int16Array(81).fill(-1);
  position.regions.forEach((region, index) => region.nodes.forEach(node => { byNode[node] = index; }));
  const total = position.regions.reduce((sum, region) => sum + region.points, 0);
  const legal = new Set(position.legalActions);
  const ownKey = own === 1 ? 'black' : 'white', enemyKey = own === 1 ? 'white' : 'black';
  for (let node = 0; node < 81; node++) {
    const regionIndex = byNode[node], region = position.regions[regionIndex];
    const ownSafe = position.safePicks[ownKey].includes(regionIndex), enemySafe = position.safePicks[enemyKey].includes(regionIndex);
    const x = node % 9, y = Math.floor(node / 9), offset = node * 15;
    const previous = Number(position.previousPosition?.[node] ?? 0);
    out.set([
      Number(position.board[node] === own), Number(position.board[node] === enemy),
      Number(previous === own), Number(previous === enemy), Number(legal.has(node)),
      region.points / total, region.nodes.length / 81,
      Number(y > 0 && byNode[node - 9] === regionIndex), Number(x < 8 && byNode[node + 1] === regionIndex),
      Number(y < 8 && byNode[node + 9] === regionIndex), Number(x > 0 && byNode[node - 1] === regionIndex),
      Number(ownSafe), Number(enemySafe),
      Number(ownSafe && !position.safeUsed[ownKey].includes(regionIndex)),
      Number(enemySafe && !position.safeUsed[enemyKey].includes(regionIndex))
    ], offset);
  }
  out.set([Number(own === 1), position.consecutivePasses / 2, Number(position.phase === 'opening'),
    (own === 2 ? 1 : -1) * position.whiteBonus / total], 81 * 15);
  return out;
}

export function predictTinyPolicy(model, position) {
  if (model.format !== 'electoral-go-tiny-policy' || model.version !== 1 || model.inputSize !== POLICY_INPUT_SIZE || model.actions !== 82) throw new Error('Unsupported tiny policy');
  const input = encodePolicyInput(position), hidden = new Float32Array(model.hiddenSize);
  for (let h = 0; h < hidden.length; h++) {
    let value = model.b1[h];
    for (let i = 0; i < input.length; i++) value += input[i] * model.w1[i * hidden.length + h];
    hidden[h] = Math.max(0, value);
  }
  const logits = new Float64Array(82).fill(-Infinity);
  for (const action of position.legalActions) {
    let value = model.b2[action];
    for (let h = 0; h < hidden.length; h++) value += hidden[h] * model.w2[h * 82 + action];
    logits[action] = value;
  }
  const peak = Math.max(...logits), probabilities = Array.from(logits, value => Math.exp(value - peak));
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  return probabilities.map(value => value / total);
}
