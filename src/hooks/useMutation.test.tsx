// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMutation } from './useAsync';

function setup<Args extends unknown[]>(fn: (...args: Args) => Promise<string>) {
  const client = new QueryClient();
  return renderHook(() => useMutation(fn), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe('useMutation — double submit', () => {
  it('drops an exact repeat while the first call is in flight (a double-click)', async () => {
    let finish: (() => void) | undefined;
    const send = vi.fn((..._args: [string, string, { internal: boolean }]) => new Promise<string>((resolve) => { finish = () => resolve('ok'); }));
    const { result } = setup(send);

    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    act(() => {
      first = result.current.mutate('post-1', 'Looks good', { internal: false });
      second = result.current.mutate('post-1', 'Looks good', { internal: false });
    });
    await vi.waitFor(() => expect(finish).toBeDefined());
    await act(async () => { finish?.(); await first; });

    expect(send).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBeNull();
  });

  it('lets different calls through at the same time', async () => {
    const send = vi.fn(async (id: string) => id);
    const { result } = setup(send);

    await act(async () => {
      await Promise.all([result.current.mutate('task-1'), result.current.mutate('task-2')]);
    });

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('treats two different files as different, even with the same name', async () => {
    const send = vi.fn(async (_file: File) => 'ok');
    const { result } = setup(send);

    await act(async () => {
      await Promise.all([
        result.current.mutate(new File(['a'], 'brief.pdf')),
        result.current.mutate(new File(['b'], 'brief.pdf')),
      ]);
    });

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('allows the same call again once the first has finished', async () => {
    const send = vi.fn(async () => 'ok');
    const { result } = setup(send);

    await act(async () => { await result.current.mutate(); });
    await act(async () => { await result.current.mutate(); });

    expect(send).toHaveBeenCalledTimes(2);
  });
});
