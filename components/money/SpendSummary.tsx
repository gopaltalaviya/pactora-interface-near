import type {SummaryRow} from '@/lib/fees';

/**
 * What a signature commits, before the wallet opens: the money locked, the
 * fee and who pays it, the bonds, the time limits (lib/fees.ts spendSummary
 * and workSummary). A definition list, so each figure is read with its name.
 */
export function SpendSummary({
  rows,
  title = 'Before you sign',
  testId = 'spend-summary',
}: {
  rows: SummaryRow[];
  title?: string;
  testId?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-edge bg-ink/40 p-3 text-xs" data-testid={testId}>
      <p className="mb-2 font-medium uppercase tracking-[0.08em] text-muted">{title}</p>
      <dl className="grid gap-1.5">
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3"
            data-testid={`${testId}-${r.id}`}
          >
            <dt className="text-muted">{r.label}</dt>
            <dd className={r.id === 'windows' ? 'col-span-2' : 'tabular text-right'}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
