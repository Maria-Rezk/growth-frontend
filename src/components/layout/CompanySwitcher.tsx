import { useCompany } from '@/context/CompanyContext';
import { Select } from '@/components/ui/Fields';

export function CompanySwitcher() {
  const { companies, activeCompanyId, setActiveCompanyId, loading } = useCompany();
  if (loading) return <span className="muted">Loading companies…</span>;
  if (!companies.length) return <span className="pill">No company</span>;

  return (
    <label className="company-switcher">
      <span>Workspace</span>
      <Select value={activeCompanyId ?? ''} onChange={(event) => setActiveCompanyId(event.target.value)}>
        {companies.map((company) => (
          <option key={company.id} value={company.id}>{company.name}</option>
        ))}
      </Select>
    </label>
  );
}
