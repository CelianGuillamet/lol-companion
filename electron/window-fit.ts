export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Garde toute la fenêtre dans la zone utilisable de l'écran, y compris après un
 * changement de résolution. Les coordonnées négatives des autres écrans sont valides.
 * Les valeurs de fenêtre illisibles retombent sur l'espace disponible. Une zone
 * d'écran invalide ou sans pixel entier utilisable provoque une RangeError.
 */
export function fitWindowBounds(bounds: WindowBounds, workArea: WindowBounds, padding = 12): WindowBounds {
  const rightEdge = workArea.x + workArea.width;
  const bottomEdge = workArea.y + workArea.height;
  if (![workArea.x, workArea.y, workArea.width, workArea.height, rightEdge, bottomEdge].every(Number.isFinite) ||
    workArea.width < 1 || workArea.height < 1) {
    throw new RangeError('Zone d’écran invalide');
  }
  // Arrondir vers l'intérieur : le rectangle final ne dépasse jamais la zone donnée.
  const areaX = Math.ceil(workArea.x);
  const areaY = Math.ceil(workArea.y);
  const areaWidth = Math.floor(rightEdge) - areaX;
  const areaHeight = Math.floor(bottomEdge) - areaY;
  if (areaWidth < 1 || areaHeight < 1) throw new RangeError('Zone d’écran sans pixel utilisable');

  const inset = Number.isFinite(padding) ? Math.max(0, Math.round(padding)) : 12;
  const padX = Math.min(inset, Math.floor((areaWidth - 1) / 2));
  const padY = Math.min(inset, Math.floor((areaHeight - 1) / 2));
  const left = areaX + padX;
  const top = areaY + padY;
  const availableWidth = areaWidth - 2 * padX;
  const availableHeight = areaHeight - 2 * padY;
  const dimension = (value: number, available: number) =>
    Number.isFinite(value) && value > 0 ? Math.min(available, Math.max(1, Math.round(value))) : available;
  const width = dimension(bounds.width, availableWidth);
  const height = dimension(bounds.height, availableHeight);
  const coordinate = (value: number, start: number, end: number) =>
    Number.isFinite(value) ? Math.min(end, Math.max(start, Math.round(value))) : start;
  return {
    x: coordinate(bounds.x, left, left + availableWidth - width),
    y: coordinate(bounds.y, top, top + availableHeight - height),
    width,
    height,
  };
}
