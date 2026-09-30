import { describe, expect, it } from 'vitest';
import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('shows all pages when few', () => {
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });
  it('inserts gaps around the current page', () => {
    expect(pageWindow(6, 20)).toEqual([1, 'gap', 5, 6, 7, 'gap', 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 'gap', 20]);
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 19, 20]);
  });
});
