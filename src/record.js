export const RECORD_VERSION = 1;

export function createMatchRecord(config, regions) {
  return {
    format: 'zhouyi-match',
    version: RECORD_VERSION,
    createdAt: new Date().toISOString(),
    config: structuredClone(config),
    regions: regions.map(region => ({ name: region.name, points: region.points, nodes: [...region.nodes], ...(region.safeSelectable===false?{safeSelectable:false}:{}) })),
    events: []
  };
}

export function appendMatchEvent(record, event) { record.events.push(structuredClone(event)); }
export function serializeMatchRecord(record) { return JSON.stringify(record, null, 2); }

export function parseMatchRecord(text) {
  const record = JSON.parse(text);
  if (record?.format !== 'zhouyi-match' || record.version !== RECORD_VERSION) throw new Error('不支持的棋谱格式');
  if (!record.config || !Array.isArray(record.regions) || !Array.isArray(record.events)) throw new Error('棋谱内容不完整');
  const width=Number(record.config.width||record.config.size),height=Number(record.config.height||record.config.size),nodeCount=width*height;
  const validSquare=width===height&&[9,13,19].includes(width),validRectangle=width===15&&height===11;
  if (!validSquare&&!validRectangle) throw new Error('棋盘尺寸无效');
  const nodes = record.regions.flatMap(region => Array.isArray(region.nodes) ? region.nodes : []);
  if (!record.regions.length || nodes.length !== nodeCount || new Set(nodes).size !== nodeCount || nodes.some(node => !Number.isInteger(node) || node < 0 || node >= nodeCount)) throw new Error('棋谱中的区域地图无效');
  const supported = new Set(['swap-sides','select-safe','play','pass','mark-dead','resume','confirm','undo']);
  if (record.events.some(event => !event || !supported.has(event.type))) throw new Error('棋谱中包含未知操作');
  return record;
}

export function applyMatchEvent(match, event) {
  switch (event.type) {
    case 'swap-sides': return match.requestSideSwap(false);
    case 'select-safe': return match.selectSafeRegion(event.regionIndex, false);
    case 'play': return match.play(event.node, false);
    case 'pass': return match.pass(false);
    case 'mark-dead': match.setDeadNodes(event.nodes, event.dead); return { ok: true };
    case 'resume': return match.resume(false);
    case 'confirm': {
      const score = match.reviewScore();
      score.blackTotal = event.blackTotal;
      score.whiteTotal = event.whiteTotal;
      return match.confirm(score, false);
    }
    case 'undo': return match.undo(event.plies, false);
    default: return { ok: false, reason: `未知棋谱事件：${event.type}` };
  }
}
