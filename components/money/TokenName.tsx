import type {NetworkInfo} from '@/lib/api';

/**
 * The payment token's symbol, explained on hover and to assistive technology
 * that reads abbreviations (UX audit 2026-11-13: "mUSDC" was never
 * explained). On a test network it says the token has no value.
 */
export function tokenMeaning(network: Pick<NetworkInfo, 'name' | 'testnet' | 'paymentToken'>): string {
  const symbol = network.paymentToken.symbol;
  return network.testnet === false
    ? `${symbol}: the stablecoin jobs are paid in on ${network.name}`
    : `${symbol}: a test stablecoin on ${network.name}; it has no monetary value`;
}

export function TokenName({network}: {network: Pick<NetworkInfo, 'name' | 'testnet' | 'paymentToken'>}) {
  return (
    <abbr
      title={tokenMeaning(network)}
      className="cursor-help underline decoration-dotted underline-offset-2"
    >
      {network.paymentToken.symbol}
    </abbr>
  );
}
