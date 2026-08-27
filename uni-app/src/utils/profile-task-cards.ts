export interface ProfileQuickTaskCard {
  id: string;
  title: string;
  sub: string;
  action: string;
  image: string;
  className: string;
  visible?: boolean;
}

export function selectProfileQuickTaskCards(cards: ProfileQuickTaskCard[], limit = 4): ProfileQuickTaskCard[] {
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (max <= 0) return [];
  return cards.filter((item) => item.visible !== false).slice(0, max);
}
