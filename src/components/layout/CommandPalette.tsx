import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { StatusBadge } from '@/components/domain/StatusBadges';
import { CampaignIcon, GlobeIcon, LeadIcon, PlanIcon, PostIcon, SearchIcon, TaskIcon } from '@/components/ui/icons';
import { appRoutes } from '@/config/appRoutes';
import { useCompany } from '@/context/CompanyContext';
import { useAsync } from '@/hooks/useAsync';
import { useClientView } from '@/hooks/useClientView';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { contentService } from '@/services/content';
import { leadsService } from '@/services/leads';
import { campaignsService } from '@/services/campaigns';
import { tasksService } from '@/services/tasks';
import { humanize } from '@/utils/format';

type Kind = 'client' | 'post' | 'task' | 'lead' | 'plan' | 'campaign';

interface Result {
  kind: Kind;
  id: string;
  title: string;
  meta?: string;
  status?: string;
  /** Where Enter goes. Clients switch the workspace instead. */
  to?: string;
  companyId?: string;
}

const KIND_LABEL: Record<Kind, string> = { client: 'Clients', post: 'Content', task: 'Tasks', lead: 'Leads', plan: 'Content plans', campaign: 'Campaigns' };
const KIND_ICON: Record<Kind, typeof TaskIcon> = { client: GlobeIcon, post: PostIcon, task: TaskIcon, lead: LeadIcon, plan: PlanIcon, campaign: CampaignIcon };
const MAX_PER_KIND = 5;

/**
 * ⌘K / Ctrl+K: find a task, post, lead or client by name from anywhere.
 *
 * Searches the active client through the list endpoints' `search` param
 * (three requests, debounced, only while open) and matches client names
 * locally. Picking a client switches the workspace; anything else opens
 * the record. A client-side user searches content only — their portal has
 * nothing else in it.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button type="button" className="search-trigger" onClick={() => setOpen(true)} aria-label="Search (Ctrl+K)" title="Search · Ctrl+K">
        <SearchIcon size={16} />
        <span className="search-trigger__label">Search</span>
        <kbd className="search-trigger__kbd" aria-hidden="true">⌘K</kbd>
      </button>
      {open ? <Palette onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { companies, activeCompanyId, setActiveCompanyId } = useCompany();
  const { isClient } = useClientView();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim());
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, inputRef);

  const companyId = activeCompanyId ?? '';
  const enabled = debounced.length >= 2 && Boolean(companyId);

  const posts = useAsync(() => contentService.listPosts(companyId, { search: debounced }), [companyId, debounced], { queryKey: ['search', companyId, 'posts', debounced], enabled });
  const tasks = useAsync(() => tasksService.list(companyId, { search: debounced }), [companyId, debounced], { queryKey: ['search', companyId, 'tasks', debounced], enabled: enabled && !isClient });
  const leads = useAsync(() => leadsService.list(companyId, { search: debounced }), [companyId, debounced], { queryKey: ['search', companyId, 'leads', debounced], enabled: enabled && !isClient });
  // Plans and campaigns are short lists with no search param: fetched once, matched locally.
  const plans = useAsync(() => contentService.listPlans(companyId), [companyId], { queryKey: ['companies', companyId, 'content-plans'], enabled });
  const campaigns = useAsync(() => campaignsService.list(companyId), [companyId], { queryKey: ['companies', companyId, 'campaigns', {}], enabled: enabled && !isClient });

  const results = useMemo<Result[]>(() => {
    if (!enabled) return [];
    const needle = debounced.toLowerCase();
    const list: Result[] = [];
    if (!isClient) {
      companies
        .filter((company) => company.name.toLowerCase().includes(needle))
        .slice(0, MAX_PER_KIND)
        .forEach((company) => list.push({ kind: 'client', id: company.id, title: company.name, meta: company.id === activeCompanyId ? 'Current client' : 'Switch to this client', companyId: company.id }));
    }
    (posts.data ?? []).slice(0, MAX_PER_KIND).forEach((post) => list.push({ kind: 'post', id: post.id, title: post.title, meta: [post.platform, post.contentType].filter(Boolean).map((v) => humanize(v)).join(' · '), status: post.status, to: appRoutes.post(post.id) }));
    (tasks.data ?? []).slice(0, MAX_PER_KIND).forEach((task) => list.push({ kind: 'task', id: task.id, title: task.title, meta: humanize(task.type), status: task.status, to: appRoutes.task(task.id) }));
    (leads.data ?? []).slice(0, MAX_PER_KIND).forEach((lead) => list.push({ kind: 'lead', id: lead.id, title: lead.name, meta: [lead.source, lead.email].filter(Boolean).join(' · '), status: lead.status, to: `/leads/${lead.id}` }));
    (plans.data ?? []).filter((plan) => plan.title.toLowerCase().includes(needle)).slice(0, MAX_PER_KIND).forEach((plan) => list.push({ kind: 'plan', id: plan.id, title: plan.title, meta: plan.month && plan.year ? `${plan.month}/${plan.year}` : undefined, to: `/content-plans/${plan.id}` }));
    (campaigns.data ?? []).filter((campaign) => campaign.name.toLowerCase().includes(needle)).slice(0, MAX_PER_KIND).forEach((campaign) => list.push({ kind: 'campaign', id: campaign.id, title: campaign.name, meta: humanize(campaign.objective), status: campaign.status, to: `/campaigns/${campaign.id}` }));
    return list;
  }, [activeCompanyId, campaigns.data, companies, debounced, enabled, isClient, leads.data, plans.data, posts.data, tasks.data]);

  useEffect(() => setActive(0), [results]);

  const choose = useCallback(
    (result: Result) => {
      if (result.kind === 'client' && result.companyId) {
        setActiveCompanyId(result.companyId);
        navigate(isClient ? appRoutes.clientHome : appRoutes.dashboard);
      } else if (result.to) {
        navigate(result.to);
      }
      onClose();
    },
    [isClient, navigate, onClose, setActiveCompanyId],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (event.key === 'Enter' && results[active]) { event.preventDefault(); choose(results[active]); }
  };

  const loading = enabled && (posts.loading || tasks.loading || leads.loading);
  const grouped = useMemo(() => {
    const map = new Map<Kind, Result[]>();
    results.forEach((result) => map.set(result.kind, [...(map.get(result.kind) ?? []), result]));
    return [...map.entries()];
  }, [results]);

  let index = -1;
  return createPortal(
    <div className="modal-backdrop palette-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="palette" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <div className="palette__input">
          <SearchIcon size={18} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isClient ? 'Search your content…' : 'Search tasks, content, leads, clients…'}
            aria-label="Search"
            aria-activedescendant={results[active] ? `palette-${results[active].kind}-${results[active].id}` : undefined}
            autoComplete="off"
          />
          <kbd aria-hidden="true">esc</kbd>
        </div>

        <div className="palette__results" role="listbox">
          {!enabled ? <p className="palette__hint">Type at least two characters. ↑↓ to move, Enter to open.</p> : null}
          {enabled && loading && results.length === 0 ? <p className="palette__hint">Searching…</p> : null}
          {enabled && !loading && results.length === 0 ? <p className="palette__hint">Nothing matches “{debounced}” on this client.</p> : null}
          {grouped.map(([kind, items]) => {
            const Icon = KIND_ICON[kind];
            return (
              <div key={kind} className="palette__group">
                <p className="palette__group-label">{KIND_LABEL[kind]}</p>
                {items.map((result) => {
                  index += 1;
                  const current = index === active;
                  return (
                    <button
                      key={`${result.kind}-${result.id}`}
                      id={`palette-${result.kind}-${result.id}`}
                      type="button"
                      role="option"
                      aria-selected={current}
                      className={clsx('palette__item', current && 'palette__item--active')}
                      onMouseEnter={() => setActive(indexOf(results, result))}
                      onClick={() => choose(result)}
                    >
                      <Icon size={16} />
                      <span className="palette__item-main">
                        <strong>{result.title}</strong>
                        {result.meta ? <span className="muted">{result.meta}</span> : null}
                      </span>
                      {result.status ? <StatusBadge value={result.status} /> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function indexOf(results: Result[], result: Result): number {
  return results.findIndex((item) => item.kind === result.kind && item.id === result.id);
}
