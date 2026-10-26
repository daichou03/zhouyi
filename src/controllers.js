export function isHumanVsAi(controllers) {
  const values = Object.values(controllers);
  return values.filter(value => value === 'human').length === 1
    && values.filter(value => value === 'ai').length === 1;
}

export function shouldAiOfferSwap(controllers, whiteBonus) {
  return !isHumanVsAi(controllers) && whiteBonus < 0.5;
}
