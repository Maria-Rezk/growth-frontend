import { FormEvent, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { useCompany } from '@/context/CompanyContext';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select, Textarea } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/State';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { responsibilitiesService } from '@/services/responsibilities';
import { queryKeys } from '@/lib/queryClient';
import {
  AREA_KEYS,
  CompanyMembershipRole,
  RESPONSIBILITY_TYPE_LABELS,
  type AreaKey,
  type ResponsibilityArea,
  type ResponsibilityMatrix,
  type ResponsibilityMatrixCell,
  type ResponsibilityType,
} from '@/types/domain';
import { rolesLabel } from '@/utils/roles';
import { humanize } from '@/utils/format';

/** What each key routes: the task type that lands on this area's approver. */
const AREA_KEY_OPTIONS: Array<{ value: AreaKey; label: string }> = AREA_KEYS.map((key) => ({
  value: key,
  label: `${humanize(key)} — ${humanize(key).toLowerCase()} tasks`,
}));

const TYPE_OPTIONS = Object.entries(RESPONSIBILITY_TYPE_LABELS) as Array<[ResponsibilityType, string]>;

function cellKey(areaId: string, userId: string): string {
  return `${areaId}:${userId}`;
}

function cellLabel(cell: ResponsibilityMatrixCell): string {
  return cell.type === 'OTHER' && cell.customLabel ? cell.customLabel : RESPONSIBILITY_TYPE_LABELS[cell.type];
}

export function ResponsibilitiesPage() {
  return <RequireCompany>{(companyId) => <ResponsibilitiesInner companyId={companyId} />}</RequireCompany>;
}

function ResponsibilitiesInner({ companyId }: { companyId: string }) {
  const { hasRole } = useCompany();
  const canManage = hasRole(CompanyMembershipRole.ACCOUNT_MANAGER);

  const matrix = useAsync(
    () => responsibilitiesService.matrix(companyId),
    [companyId],
    { queryKey: queryKeys.responsibilityMatrix(companyId) },
  );

  const [editorTarget, setEditorTarget] = useState<{ areaId: string; areaName: string; userId: string; userName: string; cell: ResponsibilityMatrixCell | null } | null>(null);
  const [areasOpen, setAreasOpen] = useState(false);

  const cellMap = useMemo(() => {
    const map = new Map<string, ResponsibilityMatrixCell>();
    matrix.data?.cells.forEach((cell) => map.set(cellKey(cell.areaId, cell.memberUserId), cell));
    return map;
  }, [matrix.data]);

  return (
    <>
      <PageHeader
        title="Responsibility matrix"
        subtitle="Who does what per service area. Rows are service areas, columns are team members."
        action={canManage ? <Button variant="secondary" size="sm" onClick={() => setAreasOpen(true)}>Manage areas</Button> : undefined}
      />

      {matrix.loading ? <LoadingState label="Loading matrix…" /> : null}
      {matrix.error ? <ErrorState message={matrix.error} onRetry={matrix.refetch} /> : null}

      {matrix.data && !matrix.loading ? (
        <MatrixGrid
          matrix={matrix.data}
          cellMap={cellMap}
          canManage={canManage}
          onOpenAreas={() => setAreasOpen(true)}
          onEditCell={(areaId, areaName, userId, userName) =>
            setEditorTarget({ areaId, areaName, userId, userName, cell: cellMap.get(cellKey(areaId, userId)) ?? null })}
        />
      ) : null}

      {editorTarget ? (
        <CellEditorModal
          // Keyed remount: form state re-initializes cleanly per cell.
          key={cellKey(editorTarget.areaId, editorTarget.userId)}
          companyId={companyId}
          target={editorTarget}
          onClose={() => setEditorTarget(null)}
        />
      ) : null}
      <ManageAreasModal
        companyId={companyId}
        open={areasOpen}
        onClose={() => setAreasOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Matrix grid
// ---------------------------------------------------------------------------
function MatrixGrid({
  matrix,
  cellMap,
  canManage,
  onOpenAreas,
  onEditCell,
}: {
  matrix: ResponsibilityMatrix;
  cellMap: Map<string, ResponsibilityMatrixCell>;
  canManage: boolean;
  onOpenAreas: () => void;
  onEditCell: (areaId: string, areaName: string, userId: string, userName: string) => void;
}) {
  if (!matrix.areas.length) {
    return (
      <Card>
        <EmptyState
          title="No service areas yet"
          description="Service areas are the rows of the matrix, e.g. Social media, Marketing."
          action={canManage ? <Button size="sm" onClick={onOpenAreas}>Add your first area</Button> : undefined}
        />
      </Card>
    );
  }
  if (!matrix.members.length) {
    return (
      <Card>
        <EmptyState
          title="No assignable team members"
          description="Only active staff members (non-client roles) appear as columns. Add members first."
        />
      </Card>
    );
  }

  return (
    <Card className="table-card">
      <div className="raci-scroll">
        <table className="raci">
          <thead>
            <tr>
              <th scope="col" className="raci__area-col">Service area</th>
              {matrix.members.map((member) => (
                <th scope="col" key={member.userId}>
                  <span className="raci__member">{member.fullName}</span>
                  <span className="raci__role muted">{rolesLabel(member)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.areas.map((area) => (
              <tr key={area.id}>
                <th scope="row" className="raci__area-col">
                  {area.name}
                  {area.areaKey ? <span className="raci__area-key" title={`Routes ${humanize(area.areaKey).toLowerCase()} tasks to this row's approver`}>{humanize(area.areaKey)}</span> : null}
                  {area.areaKey ? <RoutingHint areaKey={area.areaKey} approvers={matrix.cells.filter((cell) => cell.areaId === area.id && cell.type === 'TO_APPROVE').map((cell) => matrix.members.find((member) => member.userId === cell.memberUserId)?.fullName ?? 'someone')} /> : null}
                </th>
                {matrix.members.map((member) => {
                  const cell = cellMap.get(cellKey(area.id, member.userId));
                  return (
                    <td key={member.userId}>
                      {canManage ? (
                        <button
                          type="button"
                          className={cell ? 'raci-chip' : 'raci-chip raci-chip--empty'}
                          title={cell?.note ?? undefined}
                          aria-label={
                            cell
                              ? `${area.name} · ${member.fullName}: ${cellLabel(cell)}. Edit assignment.`
                              : `${area.name} · ${member.fullName}: no assignment. Add assignment.`
                          }
                          onClick={() => onEditCell(area.id, area.name, member.userId, member.fullName)}
                        >
                          {cell ? cellLabel(cell) : '+'}
                          {cell?.note ? <span className="raci-chip__note" aria-hidden="true">•</span> : null}
                        </button>
                      ) : cell ? (
                        <span className="raci-chip raci-chip--static" title={cell.note ?? undefined}>
                          {cellLabel(cell)}
                          {cell.note ? <span className="raci-chip__note" aria-hidden="true">•</span> : null}
                        </span>
                      ) : (
                        <span className="muted" aria-label="No assignment">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cell editor — single-cell upsert (POST /) or clear (DELETE /:id).
// ---------------------------------------------------------------------------
function CellEditorModal({
  companyId,
  target,
  onClose,
}: {
  companyId: string;
  target: { areaId: string; areaName: string; userId: string; userName: string; cell: ResponsibilityMatrixCell | null };
  onClose: () => void;
}) {
  const invalidate = [queryKeys.responsibilityMatrix(companyId)];
  const save = useMutation(responsibilitiesService.assign, { invalidateKeys: invalidate });
  const clear = useMutation(responsibilitiesService.clearAssignment, { invalidateKeys: invalidate });

  // Component is remounted per cell via key, so initializers seed the form.
  const [type, setType] = useState<ResponsibilityType>(target.cell?.type ?? 'TO_MANAGE');
  const [customLabel, setCustomLabel] = useState(target.cell?.customLabel ?? '');
  const [note, setNote] = useState(target.cell?.note ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const close = onClose;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    const trimmedLabel = customLabel.trim();
    // Mirror backend rules: customLabel required (2–120) only when OTHER; note ≤1000.
    if (type === 'OTHER' && (trimmedLabel.length < 2 || trimmedLabel.length > 120)) {
      setValidationError('Custom label is required for "Other" (2–120 characters).');
      return;
    }
    if (note.length > 1000) {
      setValidationError('Note must be 1000 characters or fewer.');
      return;
    }
    const result = await save.mutate(companyId, {
      areaId: target.areaId,
      memberUserId: target.userId,
      type,
      customLabel: type === 'OTHER' ? trimmedLabel : undefined,
      note: note.trim() || undefined,
    });
    if (result) {
      close();
    }
  };

  const clearCell = async () => {
    if (!target.cell) return;
    const ok = await clear.mutate(companyId, target.cell.assignmentId);
    if (ok !== null) {
      close();
    }
  };

  const busy = save.loading || clear.loading;
  const errorText = validationError ?? save.error ?? clear.error;

  return (
    <Modal
      open
      onClose={busy ? () => undefined : close}
      title={target.cell ? 'Edit responsibility' : 'Assign responsibility'}
      footer={
        <>
          {target.cell ? (
            <Button variant="danger" type="button" onClick={clearCell} loading={clear.loading} disabled={save.loading}>
              Clear cell
            </Button>
          ) : null}
          <Button variant="secondary" type="button" onClick={close} disabled={busy}>Cancel</Button>
          <Button form="raci-cell-form" type="submit" loading={save.loading} disabled={clear.loading}>Save</Button>
        </>
      }
    >
      <p className="muted">
        <strong>{target.areaName}</strong> · {target.userName}
      </p>
      <form id="raci-cell-form" className="form-grid" onSubmit={submit}>
        <Field label="Responsibility" htmlFor="raci-type">
          <Select id="raci-type" value={type} onChange={(event) => setType(event.target.value as ResponsibilityType)}>
            {TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        {type === 'OTHER' ? (
          <Field label="Custom label" htmlFor="raci-custom-label" hint="Shown on the matrix chip instead of a standard verb.">
            <Input
              id="raci-custom-label"
              value={customLabel}
              onChange={(event) => setCustomLabel(event.target.value)}
              minLength={2}
              maxLength={120}
              placeholder="e.g. To Archive"
              required
            />
          </Field>
        ) : null}
        <Field label="Note (optional)" htmlFor="raci-note">
          <Textarea
            id="raci-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            rows={3}
          />
        </Field>
        {errorText ? <p className="error-box" role="alert">{errorText}</p> : null}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Manage areas — list + create/edit form + delete (cascades to assignments).
// ---------------------------------------------------------------------------
function ManageAreasModal({ companyId, open, onClose }: { companyId: string; open: boolean; onClose: () => void }) {
  const invalidate = [queryKeys.responsibilityAreas(companyId), queryKeys.responsibilityMatrix(companyId)];
  const areas = useAsync(
    () => responsibilitiesService.listAreas(companyId, { limit: 100 }),
    [companyId],
    { queryKey: queryKeys.responsibilityAreas(companyId), enabled: open },
  );
  const create = useMutation(responsibilitiesService.createArea, { invalidateKeys: invalidate });
  const update = useMutation(responsibilitiesService.updateArea, { invalidateKeys: invalidate });
  const remove = useMutation(responsibilitiesService.deleteArea, { invalidateKeys: invalidate });

  const [editing, setEditing] = useState<ResponsibilityArea | null>(null);
  const [name, setName] = useState('');
  const [areaKey, setAreaKey] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const confirm = useConfirm();

  const resetForm = () => {
    setEditing(null);
    setName('');
    setAreaKey('');
    setDescription('');
    setSortOrder('0');
    setIsActive(true);
    setValidationError(null);
    create.reset();
    update.reset();
  };

  const startEdit = (area: ResponsibilityArea) => {
    setEditing(area);
    setName(area.name);
    setAreaKey(area.areaKey ?? '');
    setDescription(area.description ?? '');
    setSortOrder(String(area.sortOrder));
    setIsActive(area.isActive);
    setValidationError(null);
  };

  const close = () => { resetForm(); onClose(); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 120) {
      setValidationError('Name must be between 2 and 120 characters.');
      return;
    }
    const order = Number(sortOrder);
    if (!Number.isInteger(order) || order < 0) {
      setValidationError('Sort order must be a whole number of 0 or more.');
      return;
    }
    const payload = {
      name: trimmedName,
      /*
        The key is what task routing matches on — names are free text and
        differ per client. Send `null` on edit to clear a key; omit it on
        create when none was picked so the backend's name fallback applies.
      */
      ...(areaKey ? { areaKey: areaKey as AreaKey } : editing?.areaKey ? { areaKey: null } : {}),
      description: description.trim() || undefined,
      sortOrder: order,
      isActive,
    };
    const result = editing
      ? await update.mutate(companyId, editing.id, payload)
      : await create.mutate(companyId, payload);
    if (result) {
      toast.success(editing ? 'Area updated.' : 'Area created.');
      resetForm();
    }
  };

  const deleteArea = async (area: ResponsibilityArea) => {
    const confirmed = await confirm({
      title: `Delete "${area.name}"?`,
      message: 'Every responsibility assignment in this row is removed with it. This cannot be undone.',
      confirmLabel: 'Delete area',
      tone: 'danger',
    });
    if (!confirmed) return;
    setDeletingId(area.id);
    try {
      const result = await remove.mutate(companyId, area.id);
      if (result !== null) {
        toast.success('Area deleted.');
        if (editing?.id === area.id) resetForm();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const saving = create.loading || update.loading;
  const errorText = validationError ?? create.error ?? update.error ?? remove.error;

  return (
    <Modal open={open} onClose={close} title="Manage service areas" wide footer={<Button variant="secondary" onClick={close}>Done</Button>}>
      <div className="raci-areas">
        <div className="raci-areas__list">
          {areas.loading ? <p className="muted">Loading areas…</p> : null}
          {areas.error ? <ErrorState message={areas.error} onRetry={areas.refetch} /> : null}
          {areas.data && !areas.data.items.length && !areas.loading ? <p className="muted">No areas yet — create the first one.</p> : null}
          {areas.data?.items.map((area) => (
            <div key={area.id} className="list-row raci-areas__row">
              <div>
                <strong>{area.name}</strong>
                <p className="muted">
                  Order {area.sortOrder}
                  {area.areaKey ? ` · routes ${humanize(area.areaKey).toLowerCase()} tasks` : ''}
                  {area.description ? ` · ${area.description}` : ''}
                </p>
              </div>
              <div className="raci-areas__actions">
                <Badge tone={area.isActive ? 'success' : 'neutral'}>{area.isActive ? 'Active' : 'Inactive'}</Badge>
                <Button variant="secondary" size="sm" onClick={() => startEdit(area)}>Edit</Button>
                {/* Per-row: `remove.loading` spun every Delete button at once,
                    on an action that cascades to assignments. */}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deleteArea(area)}
                  loading={deletingId === area.id}
                  disabled={deletingId !== null}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>

        <form className="form-grid" onSubmit={submit}>
          <h3>{editing ? `Edit "${editing.name}"` : 'New area'}</h3>
          <Field label="Name" htmlFor="area-name" hint="Unique per company, 2–120 characters.">
            <Input id="area-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required />
          </Field>
          <Field
            label="Task routing key"
            htmlFor="area-key"
            hint="Which kind of task this area approves. Without a key the backend matches on common names only; set it and “change one cell instead of forty tasks” actually works."
          >
            <Select id="area-key" value={areaKey} onChange={(event) => setAreaKey(event.target.value)}>
              <option value="">No key — match by name</option>
              {AREA_KEY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </Field>
          <Field label="Description (optional)" htmlFor="area-description">
            <Textarea id="area-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={2} />
          </Field>
          <Field label="Sort order" htmlFor="area-sort" hint="Lower numbers appear first as matrix rows.">
            <Input id="area-sort" type="number" min={0} step={1} value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
          </Field>
          <label className="checkbox-row" htmlFor="area-active">
            <input id="area-active" type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            <span>Active (inactive areas are hidden from the matrix)</span>
          </label>
          {errorText ? <p className="error-box" role="alert">{errorText}</p> : null}
          <div className="raci-areas__form-actions">
            {editing ? <Button variant="secondary" type="button" onClick={resetForm} disabled={saving}>Cancel edit</Button> : null}
            <Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Create area'}</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

/**
 * What the key actually does, in words: which tasks this row routes and to
 * whom. One approver is the happy path; none or several means the task
 * form will ask — say so here, where the fix is one cell away.
 */
function RoutingHint({ areaKey, approvers }: { areaKey: string; approvers: string[] }) {
  const kind = humanize(areaKey).toLowerCase();
  if (approvers.length === 1) return <span className="raci__routing">{kind} tasks → {approvers[0]}</span>;
  if (approvers.length === 0) return <span className="raci__routing raci__routing--warn">{kind} tasks have no approver — set a “To Approve” cell</span>;
  return <span className="raci__routing raci__routing--warn">{approvers.length} approve {kind} — each task will ask which</span>;
}
