import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/State';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { queryKeys } from '@/lib/queryClient';
import { reportsService } from '@/services/reports';
import { formatDate, formatDateTime } from '@/utils/format';

/**
 * A login-free link to this report, for a client without an account.
 *
 * The API stores only a hash of the token, so the URL is shown exactly once —
 * on the press that mints it. A repeat press is told a link exists and offered
 * a replacement, which revokes the old one. Account Manager or admin only.
 */
export function ReportShareDialog({
  open,
  onClose,
  companyId,
  reportId,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  reportId: string;
}) {
  const key = queryKeys.reportShare(companyId, reportId);
  const status = useAsync(() => reportsService.getShareLink(companyId, reportId), [companyId, reportId], { queryKey: key, enabled: open });
  const mint = useMutation(reportsService.createShareLink, { invalidateKeys: [key] });
  const revoke = useMutation(reportsService.revokeShareLink, { invalidateKeys: [key] });
  const confirm = useConfirm();
  // Only in memory: once this dialog closes the URL is gone for good, as on the server.
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const close = () => {
    setFreshUrl(null);
    setCopied(false);
    mint.reset();
    revoke.reset();
    onClose();
  };

  const create = async (rotate: boolean) => {
    const result = await mint.mutate(companyId, reportId, rotate);
    if (!result) return;
    if (result.created && result.url) {
      setFreshUrl(result.url);
      setCopied(false);
      status.setData({ active: true, expiresAt: result.expiresAt, createdAt: result.createdAt, viewCount: 0, lastViewedAt: null });
      return;
    }
    // A link was already out there and we did not ask to replace it.
    const replace = await confirm({
      title: 'A public link already exists',
      message: `It expires ${formatDate(result.expiresAt)}. Its address cannot be shown again. Replace it with a new link? The old one stops working immediately.`,
      confirmLabel: 'Replace link',
    });
    if (replace) await create(true);
  };

  const rotate = async () => {
    const ok = await confirm({
      title: 'Replace the public link?',
      message: 'Anyone using the current link loses access immediately. You will get a new link to send.',
      confirmLabel: 'Replace link',
    });
    if (ok) await create(true);
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Turn off the public link?',
      message: 'The link stops working immediately for everyone who has it.',
      confirmLabel: 'Turn off',
      tone: 'danger',
    });
    if (!ok) return;
    const done = await revoke.mutate(companyId, reportId);
    if (done !== null) {
      setFreshUrl(null);
      status.setData({ active: false });
      toast.success('Public link turned off.');
    }
  };

  const copy = async () => {
    if (!freshUrl) return;
    try {
      await navigator.clipboard.writeText(freshUrl);
      setCopied(true);
      toast.success('Public link copied.');
    } catch {
      toast.error('Could not copy — select the link and copy it by hand.');
    }
  };

  const share = status.data;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Share this report publicly"
      footer={<Button variant="secondary" onClick={close}>Done</Button>}
    >
      <div className="stack-list">
        <p className="muted">Anyone with the link can read this report without signing in. Your internal notes are never included.</p>

        {status.loading ? <p className="muted">Checking for a public link…</p> : null}
        {status.error ? <ErrorState message={status.error} onRetry={status.refetch} /> : null}

        {freshUrl ? (
          <div className="staged-file">
            <strong>Your link is ready</strong>
            <div className="inline-form">
              <Input readOnly value={freshUrl} aria-label="Public report link" onFocus={(event) => event.target.select()} />
              <Button size="sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
            </div>
            <p className="muted">Copy it now. For security it cannot be shown again — if you lose it, replace the link.</p>
          </div>
        ) : null}

        {share?.active ? (
          <div className="key-values">
            <div><span>Status</span><strong>Active until {formatDate(share.expiresAt)}</strong></div>
            <div>
              <span>Opened</span>
              <strong>{share.viewCount === 0 ? 'Not yet' : `${share.viewCount} time${share.viewCount === 1 ? '' : 's'}`}</strong>
            </div>
            {share.lastViewedAt ? <div><span>Last opened</span><strong>{formatDateTime(share.lastViewedAt)}</strong></div> : null}
          </div>
        ) : share && !share.active ? (
          <p>No public link yet. Only people with access to this client can open the report.</p>
        ) : null}

        {share ? (
          <div className="button-row">
            {share.active ? (
              <>
                <Button size="sm" variant="secondary" onClick={rotate} loading={mint.loading}>Replace link</Button>
                <Button size="sm" variant="ghost" onClick={remove} loading={revoke.loading}>Turn off link</Button>
              </>
            ) : (
              <Button size="sm" onClick={() => create(false)} loading={mint.loading}>Create public link</Button>
            )}
          </div>
        ) : null}
        {mint.error ? <p className="error-box" role="alert">{mint.error}</p> : null}
        {revoke.error ? <p className="error-box" role="alert">{revoke.error}</p> : null}
      </div>
    </Modal>
  );
}
