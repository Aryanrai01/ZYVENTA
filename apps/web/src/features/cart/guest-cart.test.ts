import { describe, expect, it } from 'vitest';
import { addGuestLine, removeGuestLine, setGuestQuantity } from './guest-cart';

const A = '65f0000000000000000000aa';
const B = '65f0000000000000000000bb';

describe('guest cart lines', () => {
  it('adds new lines and increments existing ones up to the cap', () => {
    let lines = addGuestLine([], A, 2);
    lines = addGuestLine(lines, A, 3);
    expect(lines).toEqual([{ variantId: A, quantity: 5 }]);
    lines = addGuestLine(lines, A, 9);
    expect(lines[0]?.quantity).toBe(10);
  });

  it('respects the known availability', () => {
    expect(addGuestLine([], B, 5, 2)).toEqual([{ variantId: B, quantity: 2 }]);
  });

  it('updates and removes lines', () => {
    const lines = addGuestLine(addGuestLine([], A, 1), B, 1);
    expect(setGuestQuantity(lines, B, 4)[1]?.quantity).toBe(4);
    expect(setGuestQuantity(lines, B, 40)[1]?.quantity).toBe(10);
    expect(removeGuestLine(lines, A)).toEqual([{ variantId: B, quantity: 1 }]);
  });
});
