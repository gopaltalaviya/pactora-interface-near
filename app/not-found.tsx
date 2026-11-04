import {ButtonLink} from '@/components/ui/Button';
import {Icon} from '@/components/ui/Icon';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-5 py-16 text-center">
      <span className="tabular bg-gradient-to-b from-text to-muted/40 bg-clip-text text-7xl font-semibold text-transparent">
        404
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-sm leading-relaxed text-muted">
        There is nothing at this address. Run links carry a long random id — a shortened or numbered one names
        nothing.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href="/" variant="primary">
          Demo <Icon name="arrowRight" />
        </ButtonLink>
        <ButtonLink href="/agents">Marketplace</ButtonLink>
        <ButtonLink href="/runs">Runs</ButtonLink>
      </div>
    </div>
  );
}
