// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readMuted, writeMuted } from './NotificationsContext';
import type { NotificationType } from '@/types/domain';

beforeEach(() => {
  window.localStorage.clear();
});

describe('notification mute preferences — per-user isolation', () => {
  it('keeps two accounts on the same browser from seeing each other\'s mutes', () => {
    writeMuted('user-1', new Set<NotificationType>(['TASK_STATUS_CHANGED']));
    writeMuted('user-2', new Set<NotificationType>(['POST_COMMENTED']));

    expect(readMuted('user-1')).toEqual(new Set(['TASK_STATUS_CHANGED']));
    expect(readMuted('user-2')).toEqual(new Set(['POST_COMMENTED']));
  });

  it('a signed-out reader (no user id) sees nothing muted', () => {
    writeMuted('user-1', new Set<NotificationType>(['TASK_STATUS_CHANGED']));
    expect(readMuted(null)).toEqual(new Set());
  });

  it('writing with no user id is a no-op', () => {
    writeMuted(null, new Set<NotificationType>(['TASK_STATUS_CHANGED']));
    expect(window.localStorage.length).toBe(0);
  });
});
