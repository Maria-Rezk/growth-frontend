import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { appRoutes } from '@/config/appRoutes';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Fields';
import { EmptyState, ErrorState } from '@/components/ui/State';
import { Badge } from '@/components/ui/Badge';
import { RoleGate } from '@/components/domain/RoleGate';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { Timeline } from '@/components/domain/Timeline';
import { AttachmentsPanel } from '@/components/domain/AttachmentsPanel';
import { PostWorkPanel } from '@/components/domain/PostWorkPanel';
import { PostContentEditor } from '@/components/domain/PostContentEditor';
import { WorkflowStepper } from '@/components/domain/WorkflowStepper';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { hasFormDraft, scopeDraftKey } from '@/hooks/useFormDraft';
import { useAuth } from '@/context/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { contentService } from '@/services/content';
import { errorCode } from '@/lib/http';
import { queryKeys } from '@/lib/queryClient';
import { formatDateTime, fromInputDateTime, humanize } from '@/utils/format';
import { CompanyMembershipRole, PostReviewErrorCode, PostStatus } from '@/types/domain';
import { DetailSkeleton } from '@/components/ui/Skeleton';

export function PostDetailPage() {
  const { postId = '' } = useParams();
  return <RequireCompany>{(companyId) => <PostDetailInner companyId={companyId} postId={postId} />}</RequireCompany>;
}

function PostDetailInner({ companyId, postId }: { companyId: string; postId: string }) {
  const { user } = useAuth();
  const { hasRole } = useCompany();
  // Client roles must never see internal agency comments.
  const isClient = hasRole(CompanyMembershipRole.CLIENT_OWNER, CompanyMembershipRole.CLIENT_REVIEWER);

  const postsPrefix = [['companies', companyId, 'posts']];
  const post = useAsync(() => contentService.getPost(companyId, postId), [companyId, postId], { queryKey: queryKeys.post(companyId, postId) });
  const comments = useAsync(() => contentService.comments(companyId, postId), [companyId, postId]);
  const logs = useAsync(() => contentService.approvalLogs(companyId, postId), [companyId, postId]);

  // All mutations declared before any early return (rules of hooks).
  // 409 STAGES_OPEN is a gate, not a race: the refetch after the press brings the stages that are in the way.
  const [blockedByStages, setBlockedByStages] = useState(false);
  const submitReview = useMutation(contentService.submitReview, {
    invalidateKeys: postsPrefix,
    onSuccess: () => setBlockedByStages(false),
    onError: (error) => setBlockedByStages(errorCode(error) === PostReviewErrorCode.STAGES_OPEN),
  });
  const approve = useMutation(contentService.approve, { invalidateKeys: postsPrefix });
  const requestChanges = useMutation(contentService.requestChanges, { invalidateKeys: postsPrefix });
  const reject = useMutation(contentService.reject, { invalidateKeys: postsPrefix });
  const publish = useMutation(contentService.publish, { invalidateKeys: postsPrefix });
  const schedule = useMutation(contentService.updatePost, { invalidateKeys: postsPrefix });

  const [comment, setComment] = useState('');
  const [commentIsInternal, setCommentIsInternal] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  // A refresh mid-edit would otherwise strand an unsaved caption behind a
  // button the person has to remember to click again — reopen the editor by
  // itself when there is a draft waiting for this post, for this person.
  const draftKey = scopeDraftKey(user?.id, `post-content:${postId}`);
  const [editing, setEditing] = useState(() => Boolean(draftKey && hasFormDraft(draftKey)));

  if (post.loading) return <DetailSkeleton />;
  // Clients get 404 (never 403) for posts still in preparation.
  if (post.errorStatus === 404 && isClient) {
    return <EmptyState title="This post is not available" description="It may still be in preparation. Your agency will send it when it is ready for you." />;
  }
  if (post.error || !post.data) return <ErrorState message={post.error ?? 'Post not found.'} onRetry={post.refetch} />;

  const stages = post.data.stages ?? null;
  const stagesOpen = (stages?.open.length ?? 0) > 0;

  // Internal comments are filtered out for client roles.
  const visibleComments = (comments.data ?? []).filter((item) => !item.isInternal || !isClient);

  const reloadAll = async () => { await Promise.all([post.refetch(), comments.refetch(), logs.refetch()]); };

  const transition = async (action: 'submit' | 'approve' | 'changes' | 'reject' | 'publish') => {
    if (action === 'submit') await submitReview.mutate(companyId, postId);
    if (action === 'approve') await approve.mutate(companyId, postId);
    if (action === 'changes') await requestChanges.mutate(companyId, postId, changeNote);
    if (action === 'reject') await reject.mutate(companyId, postId, changeNote);
    if (action === 'publish') await publish.mutate(companyId, postId, publishedUrl);
    await reloadAll();
  };

  /*
    Sets the publish date only. It used to also send `status: SCHEDULED`,
    which is a status change dressed up as an edit — the workflow's status is
    owned by the approval operations, not by a PATCH. The date is planning
    metadata; the post moves to Published when someone publishes it.
  */
  const schedulePost = async () => {
    const result = await schedule.mutate(companyId, postId, {
      scheduledAt: fromInputDateTime(scheduleAt),
    });
    if (result) { post.setData(result); await reloadAll(); }
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    // Client roles can only ever post client-visible comments.
    await contentService.addComment(companyId, postId, comment.trim(), isClient ? false : commentIsInternal);
    setComment('');
    setCommentIsInternal(false);
    await comments.refetch();
  };

  return (
    <>
      <PageHeader
        title={post.data.title}
        subtitle="Caption, visual brief, assets, comments and approval decisions."
        action={<ButtonLink to="/posts" variant="secondary" size="sm">Back to posts</ButtonLink>}
      />

      <WorkflowStepper status={post.data.status} />

      <div className="detail-grid">
        <section className="detail-main">
          <Card className="content-card">
            <CardHeader
              title="Content package"
              action={(
                <span className="button-row">
                  {/* Editable until it is live; a published post is a record. */}
                  {!editing && post.data.status !== PostStatus.PUBLISHED && post.data.status !== PostStatus.CANCELED ? (
                    <RoleGate permission="posts:edit">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                    </RoleGate>
                  ) : null}
                  <StatusBadge value={post.data.status} />
                </span>
              )}
            />
            <div className="content-card__body">
              {editing ? (
                <PostContentEditor
                  companyId={companyId}
                  post={post.data}
                  onSaved={(saved) => { post.setData(saved); setEditing(false); }}
                  onCancel={() => setEditing(false)}
                />
              ) : (
              <>
              {post.data.status === PostStatus.CHANGES_REQUESTED ? (
                <p className="review-note review-note--inline">
                  The client asked for changes — see their comment below, edit the content, then submit it again.
                </p>
              ) : null}
              <div className="content-meta-grid">
                <div><span>Platform</span><strong>{post.data.platform ?? '—'}</strong></div>
                <div><span>Format</span><strong>{post.data.contentType ?? '—'}</strong></div>
                <div><span>Scheduled</span><strong>{formatDateTime(post.data.scheduledAt)}</strong></div>
              </div>
              <hr />
              <h3>Caption</h3>
              <p className="pre-wrap">{post.data.caption || 'No caption yet.'}</p>
              <hr />
              <h3>Visual brief</h3>
              <p className="pre-wrap muted">{post.data.visualBrief || 'No visual brief.'}</p>
              </>
              )}
            </div>
          </Card>

          <Card className="content-card">
            <CardHeader title="Comments" subtitle="Keep client feedback attached to the post instead of scattered across chats." />
            <div className="content-card__body stack-list">
              {visibleComments.map((item) => (
                <div className="comment" key={item.id}>
                  <div className="comment__head">
                    <strong>{item.author?.fullName ?? 'Team member'}</strong>
                    {item.isInternal ? <Badge tone="warning">Internal</Badge> : null}
                  </div>
                  <p className="pre-wrap">{item.body}</p>
                  <time>{formatDateTime(item.createdAt)}</time>
                </div>
              ))}
              {visibleComments.length === 0 ? <p className="muted">No comments yet.</p> : null}
              <form className="inline-form" onSubmit={addComment}>
                <Input
                  aria-label="Comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Add comment…"
                />
                <Button type="submit">Send</Button>
              </form>
              {!isClient ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={commentIsInternal}
                    onChange={(event) => setCommentIsInternal(event.target.checked)}
                  />
                  <span>Internal note (hidden from client)</span>
                </label>
              ) : null}
            </div>
          </Card>
        </section>

        <aside className="detail-side">
          <Card className="content-card action-panel">
            <CardHeader title="Approval actions" subtitle="Available actions depend on your role and the current workflow state." />
            <div className="content-card__body form-grid">
              <RoleGate permission="posts:submit" fallback={<p className="muted">You cannot submit posts from this role.</p>}>
                <Button onClick={() => transition('submit')} loading={submitReview.loading} disabled={stagesOpen}>Submit to client</Button>
                {stagesOpen && stages ? (
                  <div className="blocker-note" role="status">
                    <strong>Finish {stages.open.length === 1 ? 'this stage' : `these ${stages.open.length} stages`} first</strong>
                    <ul>
                      {stages.open.map((stage) => (
                        <li key={stage.taskId}>
                          <Link className="table-link" to={appRoutes.task(stage.taskId)}>
                            {stage.sequence}. {stage.title}
                          </Link>{' '}
                          <span className="muted">— {humanize(stage.status).toLowerCase()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </RoleGate>
              <RoleGate permission="posts:approve">
                <Button variant="secondary" onClick={() => transition('approve')} loading={approve.loading}>Approve</Button>
                <Field label="Note" htmlFor="change-note" hint="Used when requesting changes or rejecting.">
                  <Textarea id="change-note" rows={3} value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
                </Field>
                <Button variant="secondary" onClick={() => transition('changes')} loading={requestChanges.loading}>Request changes</Button>
                <Button variant="danger" onClick={() => transition('reject')} loading={reject.loading}>Reject</Button>
              </RoleGate>
              <RoleGate permission="posts:publish">
                <Field label="Published URL" htmlFor="published-url"><Input id="published-url" value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} /></Field>
                <Button onClick={() => transition('publish')} loading={publish.loading}>Mark published</Button>
              </RoleGate>
              <RoleGate permission="posts:publish">
                <Field
                  label="Planned publish date"
                  htmlFor="schedule-at"
                  hint="Planning only — the post still moves to Published through the approval actions above."
                >
                  <Input id="schedule-at" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                </Field>
                <Button variant="secondary" onClick={schedulePost} loading={schedule.loading} disabled={!scheduleAt}>Save publish date</Button>
              </RoleGate>
              {(!blockedByStages && submitReview.error) || approve.error || requestChanges.error || reject.error || publish.error ? (
                <p className="error-box" role="alert">
                  {(!blockedByStages && submitReview.error) || approve.error || requestChanges.error || reject.error || publish.error}
                </p>
              ) : null}
            </div>
          </Card>

          {/* Staff only: the client sees the result, not the production line. */}
          {!isClient ? <PostWorkPanel companyId={companyId} post={post.data} /> : null}

          <AttachmentsPanel
            companyId={companyId}
            parent={{ entityType: 'POST', entityId: postId }}
            title="Assets"
            subtitle={isClient ? 'Creative files for this post.' : 'Creative files for this post. The client can open these.'}
          />

          <Card className="content-card">
            <CardHeader title="Approval log" />
            <div className="content-card__body">
              <Timeline
                items={(logs.data ?? []).map((log) => ({
                  id: log.id,
                  title: log.fromStatus && log.toStatus
                    ? `${humanize(log.action)}: ${humanize(log.fromStatus)} → ${humanize(log.toStatus)}`
                    : humanize(log.action),
                  body: log.note ?? undefined,
                  createdAt: log.createdAt,
                }))}
              />
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}