import { useCompany } from '@/context/CompanyContext';
import { Select } from '@/components/ui/Fields';

// Solutions is the product; the client is the workspace you're currently in.
// Renders "Solutions (Curby)" — a static client name when there's only one to
// switch to, otherwise a dropdown of every client the signed-in employee works on.
export function CompanySwitcher() {
  const { companies, activeCompany, activeCompanyId, setActiveCompanyId, loading } = useCompany();
  if (loading) return <span className="muted">Loading clients…</span>;
  if (!companies.length) return <span className="pill">No client</span>;

  if (companies.length === 1) {
    return <span className="company-switcher">Solutions ({activeCompany?.name ?? companies[0].name})</span>;
  }

  return (
    <label className="company-switcher">
      <span>Solutions</span>
      <Select
        aria-label="Client"
        value={activeCompanyId ?? ''}
        onChange={(event) => setActiveCompanyId(event.target.value)}
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>{company.name}</option>
        ))}
      </Select>
    </label>
  );
}
