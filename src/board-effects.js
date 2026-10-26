export function lastMoveHighlightFrame(progress,step){
  const clamped=Math.max(0,Math.min(1,progress));
  const eased=1-(1-clamped)**3;
  return {
    radius:step*(1.6-1.08*eased),
    alpha:clamped<.82?1:Math.max(0,(1-clamped)/.18),
  };
}

export function regionOverlayTitle(regionIndex,name){
  return `${String(regionIndex+1).padStart(2,'0')} · ${name}`;
}
