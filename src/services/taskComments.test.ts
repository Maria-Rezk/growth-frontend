import { describe, expect, it } from 'vitest';
import { normalizeTaskComment } from './tasks';

describe('normalizeTaskComment', () => {
  it('reads the live API spelling: `comment` for the text, `userId` for the author', () => {
    const result = normalizeTaskComment(
      { id: 'c1', comment: 'Looks good', userId: 'u1', createdAt: '2026-09-20T12:26:00Z' },
      'task-1',
    );
    expect(result).toEqual({
      id: 'c1',
      taskId: 'task-1',
      body: 'Looks good',
      authorId: 'u1',
      author: undefined,
      createdAt: '2026-09-20T12:26:00Z',
    });
  });

  it('keeps the frontend spelling when that is what arrives', () => {
    const author = { id: 'u2', email: 'omar@agency.com', fullName: 'Omar' };
    const result = normalizeTaskComment({ id: 'c2', taskId: 't', body: 'Hi', authorId: 'u2', author }, 'task-1');
    expect(result.body).toBe('Hi');
    expect(result.authorId).toBe('u2');
    expect(result.author).toBe(author);
  });

  it('takes an embedded `user` as the author and derives the id from it', () => {
    const user = { id: 'u3', email: 'j@agency.com', fullName: 'Jessika' };
    const result = normalizeTaskComment({ id: 'c3', comment: 'Done', user }, 'task-1');
    expect(result.author).toBe(user);
    expect(result.authorId).toBe('u3');
  });
});
