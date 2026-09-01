import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { ChevronDownIcon, SearchIcon } from '@/components/ui/icons';
import { compareNames } from '@/utils/sort';

export interface ClientFilterOption {
  id: string;
  name: string;
  count: number;
}

/** `'all'` is a filter value, not a client id — it means "do not narrow". */
export type ClientFilterValue = 'all' | string;

/**
 * Client filter for the cross-client screens.
 *
 * Sized by the work in front of the reader rather than by how many clients the
 * agency has. An agency with thirty clients otherwise gets thirty buttons in
 * three rows, nearly all of them reading `0` — a filter whose options are
 * mostly dead ends, pushing the actual work below the fold.
 *
 * So: chips for the clients that have something open, busiest first and capped;
 * everything else stays a click away in a searchable picker at the end of the
 * row. Whatever is selected always keeps its chip, so the filter in force is
 * visible and reversible even when it is a client with nothing open.
 */
export function ClientFilter({
  options,
  value,
  total,
  onChange,
  maxChips = 6,
  label = 'Filter by client',
  allLabel = 'All clients',
}: {
  /** Every client the user can filter by, already ordered A→Z. */
  options: ClientFilterOption[];
  value: ClientFilterValue;
  /** Count for the "all" chip — the unfiltered total, not the sum of `options`. */
  total: number;
  onChange: (value: ClientFilterValue) => void;
  maxChips?: number;
  label?: string;
  allLabel?: string;
}) {
  const chips = useMemo(() => {
    const ranked = options
      .filter((option) => option.count > 0)
      .sort((left, right) => right.count - left.count || compareNames(left.name, right.name))
      .slice(0, maxChips);

    // The selected client keeps its chip past the cap and at zero: a filter you
    // cannot see is a filter you cannot undo.
    const selected = value !== 'all' && !ranked.some((option) => option.id === value)
      ? options.filter((option) => option.id === value)
      : [];

    return [...ranked, ...selected];
  }, [maxChips, options, value]);

  const overflow = useMemo(() => {
    const shown = new Set(chips.map((option) => option.id));
    return options.filter((option) => !shown.has(option.id));
  }, [chips, options]);

  return (
    <div className="client-filter" role="group" aria-label={label}>
      <FilterChip
        label={allLabel}
        count={total}
        active={value === 'all'}
        onClick={() => onChange('all')}
      />

      {chips.length ? <span className="client-filter__divider" aria-hidden="true" /> : null}

      {chips.map((option) => (
        <FilterChip
          key={option.id}
          label={option.name}
          count={option.count}
          active={value === option.id}
          /*
            Clicking the chip that is already on clears it. The gesture that
            applied the filter takes it off again, so nobody has to work out
            that "All clients" is the way back.
          */
          onClick={() => onChange(value === option.id ? 'all' : option.id)}
        />
      ))}

      {overflow.length ? <ClientPicker options={overflow} onSelect={onChange} /> : null}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={clsx('client-chip', active && 'client-chip--active')}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="client-chip__label">{label}</span>
      {/* Labelled, or the badge reads as part of the client's name: "Vendi 4". */}
      <span className="count-pill" aria-label={`${count} open`}>{count}</span>
    </button>
  );
}

/**
 * The rest of the client list, behind one control: a combobox over a listbox,
 * driven from the search field so the whole list is reachable by keyboard
 * without tabbing through every client in it.
 */
function ClientPicker({
  options,
  onSelect,
}: {
  options: ClientFilterOption[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const panelId = `${baseId}-panel`;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.name.toLowerCase().includes(needle));
  }, [options, query]);

  /*
    Clamped rather than stored blindly: typing shortens the list under the
    highlight, and an index left pointing past the end would send Enter to
    nothing.
  */
  const activeOption = matches.length ? matches[Math.min(activeIndex, matches.length - 1)] : undefined;

  const dismiss = (restoreFocus: boolean) => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    /*
      pointerdown, not click: closing on the press means the click that follows
      lands on whatever the user was reaching for, instead of being spent
      dismissing the panel.
    */
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery('');
      setActiveIndex(0);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keeps the keyboard highlight inside the scroll area on long client lists.
  useEffect(() => {
    if (!open) return;
    const highlighted = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    // Optional call: this is a nicety, and not every environment implements
    // scrollIntoView (jsdom does not). Losing the scroll must not take the
    // whole picker down with it.
    highlighted?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOption?.id, open]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        dismiss(true);
        return;
      case 'Enter':
        event.preventDefault();
        if (activeOption) {
          onSelect(activeOption.id);
          dismiss(true);
        }
        return;
      case 'Tab':
        // Let focus leave naturally; keeping the panel open behind it would
        // strand a listbox nobody is driving.
        dismiss(false);
        return;
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!matches.length) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((current) => {
          // Wraps — a list this short is quicker to cycle than to back out of.
          const next = Math.min(current, matches.length - 1) + step;
          if (next < 0) return matches.length - 1;
          if (next >= matches.length) return 0;
          return next;
        });
        return;
      }
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        return;
      case 'End':
        event.preventDefault();
        setActiveIndex(Math.max(0, matches.length - 1));
        return;
      default:
    }
  };

  return (
    <div className="client-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="client-chip client-chip--ghost"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? dismiss(false) : setOpen(true))}
      >
        <span className="client-chip__label">{options.length} more</span>
        <ChevronDownIcon
          size={14}
          className={clsx('client-picker__chevron', open && 'client-picker__chevron--open')}
        />
      </button>

      {open ? (
        <div className="client-picker__panel" id={panelId}>
          <div className="client-picker__search">
            <SearchIcon size={14} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              placeholder="Search clients…"
              aria-label="Search clients"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeOption ? `${baseId}-${activeOption.id}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>

          <ul className="client-picker__list" id={listId} role="listbox" aria-label="Clients" ref={listRef}>
            {matches.map((option, index) => {
              const active = option.id === activeOption?.id;
              return (
                /*
                  role="option" rather than a button: the search field owns the
                  focus and drives the list through aria-activedescendant, which
                  is what lets one Tab stop cover a list of any length.
                */
                <li
                  key={option.id}
                  id={`${baseId}-${option.id}`}
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  className={clsx('client-picker__option', active && 'client-picker__option--active')}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onSelect(option.id);
                    dismiss(true);
                  }}
                >
                  <span className="client-picker__name">{option.name}</span>
                  <span className="count-pill" aria-label={`${option.count} open`}>{option.count}</span>
                </li>
              );
            })}
          </ul>

          {matches.length === 0 ? (
            <p className="client-picker__empty" role="status">No client matches “{query.trim()}”.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
