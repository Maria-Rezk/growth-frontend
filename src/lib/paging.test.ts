import { afterEach, describe, expect, it, vi } from 'vitest';
import { http } from './http';
import { getAllItems, MAX_ROWS } from './paging';

const rows = (from: number, count: number) => Array.from({ length: count }, (_, index) => ({ id: from + index }));

afterEach(() => vi.restoreAllMocks());

/** A server of `total` rows that honours limit and offset. */
function server(total: number) {
  return vi.spyOn(http, 'get').mockImplementation(async (_url, config) => {
    const { offset, limit } = config?.params as { offset: number; limit: number };
    return { data: { items: rows(offset, Math.max(0, Math.min(limit, total - offset))), total, limit, offset } };
  });
}

describe('getAllItems', () => {
  it('gathers every page, in order', async () => {
    const get = server(230);
    const all = await getAllItems<{ id: number }>('/tasks');
    expect(all).toHaveLength(230);
    expect(all.map((row) => row.id)).toEqual(Array.from({ length: 230 }, (_, index) => index));
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('asks for the remaining pages together once the total is known', async () => {
    let inFlight = 0;
    let peak = 0;
    vi.spyOn(http, 'get').mockImplementation(async (_url, config) => {
      const { offset } = config?.params as { offset: number };
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { data: { items: rows(offset, Math.min(100, 1000 - offset)), total: 1000 } };
    });
    expect(await getAllItems('/tasks')).toHaveLength(1000);
    // The first page is alone; the other nine run side by side, a few at a time.
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it('returns a bare array in one call', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: rows(0, 7) });
    expect(await getAllItems('/posts')).toHaveLength(7);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('needs one call when the first page is everything', async () => {
    const get = server(40);
    expect(await getAllItems('/campaigns')).toHaveLength(40);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('copes with a server that clamps the page below the limit it was asked for', async () => {
    vi.spyOn(http, 'get').mockImplementation(async (_url, config) => {
      const { offset } = config?.params as { offset: number };
      return { data: { items: rows(offset, Math.min(25, 80 - offset)), total: 80 } };
    });
    expect((await getAllItems<{ id: number }>('/x')).map((row) => row.id)).toEqual(Array.from({ length: 80 }, (_, index) => index));
  });

  it('never lists a row twice when the server ignores offset', async () => {
    vi.spyOn(http, 'get').mockResolvedValue({ data: { items: rows(0, 100), total: 300 } });
    expect(await getAllItems('/x')).toHaveLength(100);
  });

  it('stops at the row cap instead of loading without bound', async () => {
    server(MAX_ROWS * 3);
    expect(await getAllItems('/x')).toHaveLength(MAX_ROWS);
  });

  it('keeps the caller filters on every page', async () => {
    const get = server(250);
    await getAllItems('/tasks', { status: 'DONE' });
    get.mock.calls.forEach(([, config]) => expect(config?.params).toMatchObject({ status: 'DONE', limit: 100 }));
  });
});
