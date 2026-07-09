import clsx from 'clsx';

export interface SegmentOption<T extends string> {
  label: string;
  value: T;
  count?: number;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={clsx('segmented__button', option.value === value && 'segmented__button--active')}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {typeof option.count === 'number' ? <em>{option.count}</em> : null}
        </button>
      ))}
    </div>
  );
}
