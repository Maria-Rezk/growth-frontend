import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Fields';
import { useMutation } from '@/hooks/useAsync';
import { companiesService } from '@/services/companies';
import { useCompany } from '@/context/CompanyContext';

export function CreateCompanyPage() {
  const navigate = useNavigate();
  const { refreshCompanies } = useCompany();
  const create = useMutation(companiesService.create);
  const [name, setName] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    const company = await create.mutate({ name: name.trim() });
    if (company) {
      toast.success('Workspace created.');
      await refreshCompanies();
      navigate('/dashboard', { replace: true });
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <PageHeader title="Create your workspace" subtitle="You need a company workspace before you can manage content, leads and tasks." />
        <Card className="form-card">
          <form className="form-grid" onSubmit={submit} noValidate>
            <Field label="Company name" htmlFor="company-name">
              <Input id="company-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </Field>
            {create.error ? <p className="error-box" role="alert">{create.error}</p> : null}
            <Button type="submit" loading={create.loading}>Create workspace</Button>
          </form>
        </Card>
      </section>
    </main>
  );
}