import { describe, expect, it } from 'vitest';
import { PostStatus } from '@/types/domain';
import { CLIENT_HIDDEN_STATUSES, POST_BOARD, POST_STATUSES_ALL, POST_WORKFLOW, isHiddenFromClient, postActionsFor, postBoardFor, postWorkflowStatus, visibleToViewer } from './workflow';

describe('post workflow', () => {
  it('never offers internal review as a step or a column: nothing writes that status', () => {
    expect(POST_WORKFLOW.map((step) => step.status)).not.toContain(PostStatus.IN_INTERNAL_REVIEW);
    expect(POST_BOARD).not.toContain(PostStatus.IN_INTERNAL_REVIEW);
  });

  it('still reaches a post that is somehow in that status', () => {
    expect(postBoardFor([{ status: PostStatus.DRAFT }])).toEqual(POST_BOARD);
    const withLegacy = postBoardFor([{ status: PostStatus.IN_INTERNAL_REVIEW }]);
    expect(withLegacy).toContain(PostStatus.IN_INTERNAL_REVIEW);
    expect(withLegacy.indexOf(PostStatus.IN_INTERNAL_REVIEW)).toBe(1);
    expect(POST_STATUSES_ALL).toContain(PostStatus.IN_INTERNAL_REVIEW);
  });

  it('every status can be shown somewhere', () => {
    Object.values(PostStatus).forEach((status) => expect(POST_STATUSES_ALL).toContain(status));
  });

  it('shows a scheduled post as approved, not as no step at all', () => {
    const steps = POST_WORKFLOW.map((step) => step.status);
    expect(steps).toContain(postWorkflowStatus(PostStatus.SCHEDULED));
    expect(postWorkflowStatus(PostStatus.READY_FOR_CLIENT)).toBe(PostStatus.READY_FOR_CLIENT);
  });
});

describe('what can be done to a post, by status', () => {
  const allowed = (status: PostStatus) => {
    const a = postActionsFor(status);
    return [a.submit && 'submit', a.review && 'review', a.publish && 'publish'].filter(Boolean);
  };

  it('follows the API state machine', () => {
    expect(allowed(PostStatus.DRAFT)).toEqual(['submit']);
    expect(allowed(PostStatus.CHANGES_REQUESTED)).toEqual(['submit']);
    expect(allowed(PostStatus.READY_FOR_CLIENT)).toEqual(['review']);
    expect(allowed(PostStatus.APPROVED)).toEqual(['publish']);
    expect(allowed(PostStatus.SCHEDULED)).toEqual(['publish']);
  });

  it('closed posts offer nothing, including a planned date', () => {
    [PostStatus.PUBLISHED, PostStatus.CANCELED].forEach((status) => {
      expect(allowed(status)).toEqual([]);
      expect(postActionsFor(status).plan).toBe(false);
    });
  });

  it('never says a post publishes itself', () => {
    Object.values(PostStatus).forEach((status) => {
      expect(postActionsFor(status).agencyNote).not.toMatch(/automatically (post|publish)es? (it|for)/i);
    });
    expect(postActionsFor(PostStatus.SCHEDULED).agencyNote).toMatch(/Nothing posts automatically/);
  });
});

describe('what a client-only person can see of the posts', () => {
  const posts = Object.values(PostStatus).map((status) => ({ id: status, status }));

  it('drops drafts and internal review, and nothing else', () => {
    const shown = visibleToViewer(posts, true).map((post) => post.status);
    CLIENT_HIDDEN_STATUSES.forEach((status) => expect(shown).not.toContain(status));
    expect(shown).toHaveLength(posts.length - CLIENT_HIDDEN_STATUSES.length);
    expect(shown).toContain(PostStatus.READY_FOR_CLIENT);
    expect(shown).toContain(PostStatus.PUBLISHED);
  });

  it('shows the agency everything', () => {
    expect(visibleToViewer(posts, false)).toHaveLength(posts.length);
  });

  it('gives a client a board with no column for what they cannot see', () => {
    const columns = postBoardFor(posts, true);
    CLIENT_HIDDEN_STATUSES.forEach((status) => expect(columns).not.toContain(status));
    expect(columns).toContain(PostStatus.READY_FOR_CLIENT);
    // Even if a response carried an internal-review post, a client board never grows a column for it.
    expect(postBoardFor([{ status: PostStatus.IN_INTERNAL_REVIEW }], true)).not.toContain(PostStatus.IN_INTERNAL_REVIEW);
  });

  it('knows which statuses are hidden', () => {
    expect(isHiddenFromClient(PostStatus.DRAFT)).toBe(true);
    expect(isHiddenFromClient(PostStatus.IN_INTERNAL_REVIEW)).toBe(true);
    expect(isHiddenFromClient(PostStatus.CHANGES_REQUESTED)).toBe(false);
  });
});
