export const RECORD_VERSION = 1;
export const RECORD_ERRORS = Object.freeze({ INVALID_JSON:'record.invalidJson', UNSUPPORTED_FORMAT:'record.unsupportedFormat', INCOMPLETE:'record.incomplete', INVALID_BOARD_SIZE:'record.invalidBoardSize', INVALID_REGIONS:'record.invalidRegions', UNKNOWN_OPERATION:'record.unknownOperation', UNKNOWN_EVENT:'record.unknownEvent' });

export class MatchRecordError extends Error {
  constructor(code, params={}) { super(code); this.name='MatchRecordError'; this.code=code; this.params=params; }
}

export function createMatchRecord(config, regions) {
  return {
    format: 'zhouyi-match',
    version: RECORD_VERSION,
    createdAt: new Date().toISOString(),
    config: structuredClone(config),
    regions: regions.map(region => ({ name: region.name, ...(region.nameKey?{nameKey:region.nameKey}:{}), ...(region.nameParams?{nameParams:structuredClone(region.nameParams)}:{}), points: region.points, nodes: [...region.nodes], ...(region.safeSelectable===false?{safeSelectable:false}:{}) })),
    events: []
  };
}

export function appendMatchEvent(record, event) { record.events.push(structuredClone(event)); }
export function serializeMatchRecord(record) { return JSON.stringify(record, null, 2); }

export function parseMatchRecord(text) {
  let record;
  try { record=JSON.parse(text); } catch { throw new MatchRecordError(RECORD_ERRORS.INVALID_JSON); }
  if (record?.format !== 'zhouyi-match' || record.version !== RECORD_VERSION) throw new MatchRecordError(RECORD_ERRORS.UNSUPPORTED_FORMAT);
  if (!record.config || !Array.isArray(record.regions) || !Array.isArray(record.events)) throw new MatchRecordError(RECORD_ERRORS.INCOMPLETE);
  const width=Number(record.config.width||record.config.size),height=Number(record.config.height||record.config.size),nodeCount=width*height;
  const validSquare=width===height&&[9,13,19].includes(width),validRectangle=(width===15&&height===11)||(width===19&&height===13);
  if (!validSquare&&!validRectangle) throw new MatchRecordError(RECORD_ERRORS.INVALID_BOARD_SIZE);
  const nodes = record.regions.flatMap(region => Array.isArray(region.nodes) ? region.nodes : []);
  if (!record.regions.length || nodes.length !== nodeCount || new Set(nodes).size !== nodeCount || nodes.some(node => !Number.isInteger(node) || node < 0 || node >= nodeCount)) throw new MatchRecordError(RECORD_ERRORS.INVALID_REGIONS);
  const supported = new Set(['swap-sides','select-safe','play','pass','mark-dead','resume','confirm','undo']);
  if (record.events.some(event => !event || !supported.has(event.type))) throw new MatchRecordError(RECORD_ERRORS.UNKNOWN_OPERATION);
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
    default: return { ok: false, reason: RECORD_ERRORS.UNKNOWN_EVENT, params:{type:event.type} };
  }
}
