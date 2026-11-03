import { describe, expect, it } from 'vitest';
import { fitWindowBounds, type WindowBounds } from '../electron/window-fit';

const screen = { x: 0, y: 25, width: 1440, height: 875 };
const inside = (bounds: WindowBounds, area: WindowBounds) => {
  expect(bounds.x).toBeGreaterThanOrEqual(area.x);
  expect(bounds.y).toBeGreaterThanOrEqual(area.y);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height);
  expect(bounds.width).toBeGreaterThanOrEqual(1);
  expect(bounds.height).toBeGreaterThanOrEqual(1);
};

describe('placement de fenêtres entièrement dans l’écran', () => {
  it('récupère une ancienne fenêtre dont seuls 80 pixels étaient encore visibles', () => {
    const result = fitWindowBounds({ x: 1360, y: 820, width: 980, height: 1000 }, screen);
    inside(result, screen);
    expect(result).toEqual({ x: 448, y: 37, width: 980, height: 851 });
  });

  it('réduit une fenêtre sauvegardée avant un changement de résolution', () => {
    const small = { x: 0, y: 24, width: 800, height: 576 };
    const result = fitWindowBounds({ x: 900, y: 200, width: 1180, height: 1000 }, small);
    inside(result, small);
    expect(result).toEqual({ x: 12, y: 36, width: 776, height: 552 });
  });

  it('conserve une fenêtre déjà bien placée sans la recentrer', () => {
    const previous = { x: 110, y: 90, width: 900, height: 620 };
    expect(fitWindowBounds(previous, screen)).toEqual(previous);
  });

  it('respecte un écran situé à gauche et au-dessus du principal', () => {
    const leftScreen = { x: -1920, y: -1080, width: 1920, height: 1040 };
    const result = fitWindowBounds({ x: 1200, y: 0, width: 420, height: 500 }, leftScreen);
    inside(result, leftScreen);
    expect(result.x).toBe(-432);
    expect(result.y).toBe(-552);
  });

  it('réduit aussi les dimensions sur un écran plus petit que les minimums habituels', () => {
    const tiny = { x: -5, y: 10, width: 5, height: 3 };
    const result = fitWindowBounds({ x: 100, y: 100, width: 420, height: 500 }, tiny);
    inside(result, tiny);
    expect(result).toEqual({ x: -3, y: 11, width: 1, height: 1 });
  });

  it('récupère des dimensions et coordonnées sauvegardées invalides', () => {
    const result = fitWindowBounds({ x: NaN, y: Infinity, width: -1, height: NaN }, screen);
    inside(result, screen);
    expect(result).toEqual({ x: 12, y: 37, width: 1416, height: 851 });
  });

  it('arrondit les zones fractionnaires vers l’intérieur et permet une marge nulle', () => {
    const area = { x: -100.4, y: 4.2, width: 300.8, height: 200.6 };
    const result = fitWindowBounds({ x: -100.4, y: 4.2, width: 500, height: 500 }, area, 0);
    inside(result, area);
    expect(result).toEqual({ x: -100, y: 5, width: 300, height: 199 });
  });

  it('rejette une zone d’écran inexploitable au lieu de produire des coordonnées hors écran', () => {
    for (const area of [
      { ...screen, x: NaN }, { ...screen, height: 0 }, { ...screen, width: -1 },
      { x: 0.5, y: 0.5, width: 1, height: 1 },
    ]) expect(() => fitWindowBounds(screen, area)).toThrow(RangeError);
  });
});
