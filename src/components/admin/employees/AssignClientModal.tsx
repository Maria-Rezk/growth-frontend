/* AssignClientModal: split out of EmployeesPage (566 lines); behaviour unchanged. */
import { useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Fields';
import { Modal } from '@/components/ui/Modal';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { applyServerFieldErrors } from '@/lib/forms';
import { ADMIN_DASHBOARD_KEY, queryKeys } from '@/lib/queryClient';
import { companiesService } from '@/services/companies';
import { CompanyMembershipRole, type Employee } from '@/types/domain';
import { RoleChecklist } from '@/components/domain/RoleChecklist';
import { membershipRoles, rolesLabel } from '@/utils/roles';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';

const assignClientSchema = z.object({
  companyId: z.string().min(1, 'Choose a client.'),
  // Empty is a 400 from the API — a member with no role has no permissions.
  roles: z.array(z.nativeEnum(CompanyMembershipRole)).min(1, 'Pick at least one role.'),
});

type AssignClientForm = z.infer<typeof assignClientSchema>;

/**
 * Put an employee on a client, or change what they do on one they already work
 * on.
 *
 * Both live here because from this screen they are one intent — "Jessica should
 * also design for Shahba Bank" — even though they are different calls. Adding
 * somebody already active on a client is a 409, so an existing client is a
 * PATCH of their membership rather than a second one.
 */
export function AssignClientModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const companies = useAsync(() => companiesService.list(), [], { queryKey: queryKeys.companies, enabled: Boolean(employee) });

  /*
    Every client is offered, split by whether they already work there. Hiding
    the ones they are on was right when a person could hold one role per client;
    now it hides the only route to a second role.
  */
  const existingByCompany = useMemo(
    () => new Map((employee?.clients ?? []).map((client) => [client.companyId, client])),
    [employee],
  );

  const { fresh, joined } = useMemo(() => {
    const all = companies.data ?? [];
    return {
      fresh: all.filter((company) => !existingByCompany.has(company.id)),
      joined: all.filter((company) => existingByCompany.has(company.id)),
    };
  }, [companies.data, existingByCompany]);

  const form = useForm<AssignClientForm>({
    resolver: zodResolver(assignClientSchema),
    defaultValues: { companyId: '', roles: [CompanyMembershipRole.DESIGNER] },
    mode: 'onBlur',
  });

  const companyId = form.watch('companyId');
  const existing = existingByCompany.get(companyId);

  /*
    Saving replaces the whole set, so picking a client they already work on has
    to start from what they hold there — otherwise "add Designer" would quietly
    drop Copywriter.
  */
  useEffect(() => {
    if (!companyId) return;
    form.setValue(
      'roles',
      existing ? membershipRoles(existing) : [CompanyMembershipRole.DESIGNER],
      { shouldValidate: true },
    );
  }, [companyId, existing, form]);

  const invalidateKeys = [queryKeys.employees, ADMIN_DASHBOARD_KEY];

  const assign = useMutation(companiesService.addMember, {
    invalidateKeys,
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const update = useMutation(companiesService.updateMember, {
    invalidateKeys,
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const submit = form.handleSubmit(async (values) => {
    if (!employee) return;

    const saved = existing
      ? await update.mutate(values.companyId, existing.membershipId, { roles: values.roles })
      : await assign.mutate(values.companyId, { userId: employee.id, roles: values.roles });

    if (saved) {
      toast.success(existing ? 'Roles updated.' : 'Employee assigned to client.');
      close();
    }
  });

  const close = () => {
    form.reset();
    assign.reset();
    update.reset();
    onClose();
  };
  const discard = useDiscardGuard(form, Boolean(employee));
  const cancel = discard(close);

  return (
    <Modal
      open={Boolean(employee)}
      onClose={cancel}
      title={`Assign ${employee?.fullName ?? employee?.email ?? 'employee'} to a client`}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={cancel}>Cancel</Button>
          <Button
            form="assign-client-form"
            type="submit"
            loading={form.formState.isSubmitting || assign.loading || update.loading}
            // Blocked here rather than letting the 400 teach the rule.
            disabled={!companies.data?.length || form.watch('roles').length === 0}
          >
            {existing ? 'Save roles' : 'Assign'}
          </Button>
        </>
      )}
    >
      <form id="assign-client-form" className="form-grid" onSubmit={submit} noValidate>
        {companies.data?.length ? (
          <>
            <Field label="Client" htmlFor="assign-client" error={form.formState.errors.companyId?.message}>
              <Select id="assign-client" {...form.register('companyId')}>
                <option value="">Select a client</option>
                {/* Grouped so it reads as a valid choice to pick a client they
                    already work on, and says what picking it will do. */}
                {fresh.length ? (
                  <optgroup label="Not on this client yet">
                    {fresh.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </optgroup>
                ) : null}
                {joined.length ? (
                  <optgroup label="Already works on — change their roles">
                    {joined.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name} · {rolesLabel(existingByCompany.get(company.id))}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            </Field>
            <Field
              label="Roles on this client"
              htmlFor="assign-roles"
              hint={existing
                ? 'Starts from what they hold today. Saving replaces the set, so leave the roles they keep ticked.'
                : undefined}
              error={form.formState.errors.roles?.message}
            >
              <RoleChecklist
                value={form.watch('roles')}
                onChange={(roles) => form.setValue('roles', roles, { shouldValidate: true })}
              />
            </Field>
          </>
        ) : (
          <p className="muted">No clients exist yet.</p>
        )}
        {assign.error ? <p className="error-box" role="alert">{assign.error}</p> : null}
        {update.error ? <p className="error-box" role="alert">{update.error}</p> : null}
      </form>
    </Modal>
  );
}
