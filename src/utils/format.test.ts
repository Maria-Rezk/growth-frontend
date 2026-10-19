import { describe, expect, it } from 'vitest';
import { humanize } from './format';

describe('humanize', () => {
  it('turns constants into words', () => {
    expect(humanize('IN_PROGRESS')).toBe('In Progress');
    expect(humanize('instagram')).toBe('Instagram');
  });

  it('leaves text somebody typed exactly as written', () => {
    expect(humanize('Instagram DM')).toBe('Instagram DM');
    expect(humanize('LinkedIn')).toBe('LinkedIn');
  });

  it('shows a dash for nothing', () => {
    expect(humanize(null)).toBe('—');
    expect(humanize('')).toBe('—');
  });
});
