import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { scopeDraftKey, useFormDraft } from '@/hooks/useFormDraft';
import { useMutation } from '@/hooks/useAsync';
import { useAuth } from '@/context/AuthContext';
import { applyServerFieldErrors } from '@/lib/forms';
import { contentService } from '@/services/content';
import type { ContentPost } from '@/types/domain';
import { humanize } from '@/utils/format';

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'WHATSAPP', 'WEBSITE'];
const CONTENT_TYPES = ['POST', 'REEL', 'STORY', 'CAROUSEL', 'VIDEO'];

const schema = z.object({
  title: z.string().trim().min(3, 'Give the post a title.'),
  platform: z.string().optional(),
  contentType: z.string().optional(),
  caption: z.string().optional(),
  visualBrief: z.string().optional(),
});
type Form = z.infer<typeof schema>;

/**
 * Edit the content package in place.
 *
 * Until now a post's caption and brief were write-once: the client asked for
 * changes and the copywriter had nowhere to make them. This is the other
 * half of the review loop. Status is deliberately not here — it moves only
 * through the review actions.
 */
export function PostContentEditor({
  companyId,
  post,
  onSaved,
  onCancel,
}: {
  companyId: string;
  post: ContentPost;
  onSaved: (post: ContentPost) => void;
  onCancel: () => void;
}) {
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: post.title,
      platform: post.platform ?? '',
      contentType: post.contentType ?? '',
      caption: post.caption ?? '',
      visualBrief: post.visualBrief ?? '',
    },
    mode: 'onBlur',
  });
  const { user } = useAuth();
  const discard = useDiscardGuard(form);
  const cancel = discard(onCancel);

  // Keyed on the post and the signed-in user: switching which post is open,
  // or which person is signed in on this browser, must never surface someone
  // else's half-written caption.
  const draft = useFormDraft(scopeDraftKey(user?.id, `post-content:${post.id}`), form, { serverUpdatedAt: post.updatedAt });

  const save = useMutation(contentService.updatePost, {
    invalidateKeys: [['companies', companyId, 'posts']],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    const result = await save.mutate(companyId, post.id, {
      title: values.title.trim(),
      platform: values.platform || undefined,
      contentType: values.contentType || undefined,
      caption: values.caption,
      visualBrief: values.visualBrief,
    });
    if (result) {
      toast.success('Content saved.');
      form.reset(values);
      draft.discard();
      onSaved(result);
    }
  });

  const { errors } = form.formState;
  // The option lists are upper-case codes; a value from the API that is not
  // in the list (older data, other spelling) is kept as its own option so
  // the select never silently snaps to something else.
  const platformOptions = withCurrent(PLATFORMS, post.platform);
  const typeOptions = withCurrent(CONTENT_TYPES, post.contentType);

  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <Field label="Title" htmlFor="edit-title" error={errors.title?.message}>
        <Input id="edit-title" {...form.register('title')} />
      </Field>
      <div className="grid-2">
        <Field label="Platform" htmlFor="edit-platform">
          <Select id="edit-platform" {...form.register('platform')}>
            <option value="">—</option>
            {platformOptions.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </Field>
        <Field label="Format" htmlFor="edit-type">
          <Select id="edit-type" {...form.register('contentType')}>
            <option value="">—</option>
            {typeOptions.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Caption" htmlFor="edit-caption" hint="What the audience reads. Emoji and line breaks are kept.">
        <Textarea id="edit-caption" rows={6} {...form.register('caption')} />
      </Field>
      <Field label="Visual brief" htmlFor="edit-brief" hint="What the designer needs to make.">
        <Textarea id="edit-brief" rows={4} {...form.register('visualBrief')} />
      </Field>
      {draft.restored ? <p className="muted">Restored your unsaved edits from before.</p> : null}
      {save.error ? <p className="error-box" role="alert">{save.error}</p> : null}
      <div className="form-actions">
        <Button variant="secondary" type="button" onClick={cancel} disabled={save.loading}>Cancel</Button>
        <Button type="submit" loading={save.loading} disabled={!form.formState.isDirty}>Save changes</Button>
      </div>
    </form>
  );
}

function withCurrent(options: string[], current?: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}
