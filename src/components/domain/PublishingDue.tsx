import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { RoleGate } from '@/components/domain/RoleGate';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { GlobeIcon } from '@/components/ui/icons';
import { appRoutes } from '@/config/appRoutes';
import { useMutation } from '@/hooks/useAsync';
import { contentService } from '@/services/content';
import { PostStatus, type ContentPost } from '@/types/domain';
import { formatDateTime, humanize } from '@/utils/format';
import { formatWaiting } from '@/utils/taskReview';

/**
 * Scheduled posts whose time has come — and gone.
 *
 * Publishing is a human step here (the platforms are not connected), so a
 * post whose `scheduledAt` is in the past sits in SCHEDULED until somebody
 * notices. The admin dashboard counts these as `publishingDue`; this strip
 * puts them in front of the person who can clear them, with the one action
 * that does: mark it published, with the live URL if there is one.
 */
export function PublishingDue({ companyId, posts, onPublished }: { companyId: string; posts: ContentPost[]; onPublished: () => void }) {
  // Not memoised on purpose: it is a filter over a few dozen rows, and a
  // memo keyed on the array would miss a status that changed in place.
  const now = Date.now();
  const due = posts
    .filter((post) => post.status === PostStatus.SCHEDULED && post.scheduledAt && new Date(post.scheduledAt).getTime() <= now)
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  const [target, setTarget] = useState<ContentPost | null>(null);

  if (due.length === 0) return null;

  return (
    <Card className="publishing-due">
      <CardHeader
        title={`Due to publish (${due.length})`}
        subtitle="Scheduled for a time that has passed. Publish on the platform, then mark it here so the client sees it as live."
      />
      <div className="content-card__body">
        <ul className="queue-list queue-list--flush">
          {due.map((post) => (
            <li key={post.id} className="queue-row queue-row--stale">
              <div className="queue-row__wait" aria-label={`Overdue by ${formatWaiting(post.scheduledAt, now)}`}>
                <strong>{formatWaiting(post.scheduledAt, now)}</strong>
                <span>overdue</span>
              </div>
              <div className="queue-row__main">
                <Link className="queue-row__title" to={appRoutes.post(post.id)}>{post.title}</Link>
                <p className="queue-row__meta">
                  {post.platform ? <span>{humanize(post.platform)}</span> : null}
                  {post.contentType ? <><span aria-hidden="true">·</span><span>{humanize(post.contentType)}</span></> : null}
                  <span aria-hidden="true">·</span>
                  <span>was scheduled for {formatDateTime(post.scheduledAt)}</span>
                </p>
              </div>
              <div className="queue-row__tags"><Badge tone="warning">Scheduled</Badge></div>
              <div className="queue-row__actions">
                <RoleGate permission="posts:publish">
                  <Button size="sm" onClick={() => setTarget(post)}><GlobeIcon size={14} /> Mark published</Button>
                </RoleGate>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <MarkPublishedModal companyId={companyId} post={target} onClose={() => setTarget(null)} onPublished={() => { setTarget(null); onPublished(); }} />
    </Card>
  );
}

function MarkPublishedModal({ companyId, post, onClose, onPublished }: { companyId: string; post: ContentPost | null; onClose: () => void; onPublished: () => void }) {
  const [url, setUrl] = useState('');
  const publish = useMutation(contentService.publish, { invalidateKeys: [['companies', companyId, 'posts']] });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!post) return;
    const result = await publish.mutate(companyId, post.id, url.trim() || undefined);
    if (result) {
      toast.success(`"${post.title}" marked as published.`);
      setUrl('');
      onPublished();
    }
  };

  return (
    <Modal
      open={post !== null}
      title="Mark as published"
      onClose={publish.loading ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={publish.loading}>Cancel</Button>
          <Button type="submit" form="mark-published-form" loading={publish.loading}>Mark published</Button>
        </>
      }
    >
      {post ? <p className="muted"><strong>{post.title}</strong> moves to Published. The client sees it as live on their Home.</p> : null}
      <form id="mark-published-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Live URL" htmlFor="mark-published-url" hint="Optional. Paste the post's link so the report can point at it.">
          <Input id="mark-published-url" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.instagram.com/p/…" />
        </Field>
        {publish.error ? <p className="error-box" role="alert">{publish.error}</p> : null}
      </form>
    </Modal>
  );
}
