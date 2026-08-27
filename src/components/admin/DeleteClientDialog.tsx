import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { adminDashboardService } from '@/services/adminDashboard';
import { companiesService } from '@/services/companies';
import type { Company } from '@/types/domain';

/**
 * Permanent deletion of a client. Super Admin only.
 *
 * Built as a deliberate, slow path — it is the most dangerous control in the
 * product:
 *
 *  - the confirm button stays disabled until the exact client name is typed,
 *    and that same string is what goes to the API as `?confirm=` (a mismatch
 *    is a 409 and deletes nothing);
 *  - the consequence is stated with real numbers pulled from the client-health
 *    endpoint, not a vague "this cannot be undone";
 *  - afterwards the client is cleared from every cache and the switcher, and
 *    the removed counts are reported back.
 *
 * Archiving is a different action entirely: `PATCH { status: 'ARCHIVED' }`,
 * available to both admin roles, and reversible.
 */
export function DeleteClientDialog({
  client,
  onClose,
  onDeleted,
}: {
  client: Company | null;
  onClose: () => void;
  onDeleted: (clientId: string) => void;
}) {
  const [typedName, setTypedName] = useState('');

  useEffect(() => { setTypedName(''); }, [client]);

  /*
    Real numbers for the dialog. This is a SPEC endpoint, so `null` (404) is
    expected for now — the dialog then states the consequence without counts
    rather than blocking the action or showing zeros, which would read as
    "nothing will be lost".
  */
  const health = useAsync(
    () => adminDashboardService.clients({ clientId: client?.id, limit: 1 }),
    [client?.id],
    { queryKey: queryKeys.adminWidget('clients', { clientId: client?.id, limit: 1 }), enabled: Boolean(client) },
  );

  const row = health.data?.items.find((item) => item.clientId === client?.id) ?? null;

  /*
    Success is handled in `onSuccess`, not after `await mutate(...)`: `mutate`
    resolves to null on failure too, and `remove.error` is still the previous
    render's value at that point. Reacting there would report a failed delete
    as "already deleted".
  */
  const remove = useMutation(companiesService.remove, {
    invalidateKeys: [queryKeys.companies, queryKeys.employees, ADMIN_DASHBOARD_KEY],
    onSuccess: (result, [clientId, clientName]) => {
      if (result === null) {
        // 404 — someone else already deleted it. That is the desired end state.
        toast.success(`${clientName} was already deleted.`);
      } else {
        const { removed } = result;
        toast.success(
          `${result.clientName} deleted — ${removed.tasks} tasks, ${removed.posts} posts, ${removed.leads} leads, ${removed.campaigns} campaigns, ${removed.memberships} memberships and ${removed.files} files removed.`,
          { duration: 8000 },
        );
      }
      onDeleted(clientId);
      onClose();
    },
  });

  const confirmed = Boolean(client) && typedName.trim() === client?.name;

  const submit = () => {
    if (!client || !confirmed) return;
    void remove.mutate(client.id, client.name);
  };

  return (
    <Modal
      open={Boolean(client)}
      onClose={onClose}
      title={`Delete ${client?.name ?? 'client'} permanently`}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="danger" type="button" disabled={!confirmed} loading={remove.loading} onClick={submit}>
            Delete permanently
          </Button>
        </>
      )}
    >
      <div className="form-grid">
        <p className="danger-text">
          This deletes the client from the database. It is not archiving, and it cannot be undone.
        </p>

        {row ? (
          <ul className="delete-consequences">
            <li><strong>{row.tasks.open}</strong> open tasks</li>
            <li><strong>{row.content.scheduled + row.content.waitingApproval}</strong> posts in flight, {row.content.published} published</li>
            <li><strong>{row.leads.open}</strong> open leads</li>
            <li><strong>{row.campaigns.active}</strong> active campaigns</li>
          </ul>
        ) : (
          <p className="muted">
            Every task, post, lead, campaign, membership and file belonging to this client will be destroyed.
          </p>
        )}

        <Field
          label={`Type "${client?.name ?? ''}" to confirm`}
          htmlFor="delete-client-confirm"
          hint="Must match the client name exactly. The server checks it too and refuses a mismatch."
        >
          <Input
            id="delete-client-confirm"
            autoComplete="off"
            value={typedName}
            aria-invalid={typedName.length > 0 && !confirmed}
            onChange={(event) => setTypedName(event.target.value)}
          />
        </Field>

        {remove.error ? <p className="error-box" role="alert">{remove.error}</p> : null}
      </div>
    </Modal>
  );
}
