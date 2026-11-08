import {API_URL} from '@/lib/api';

/**
 * `/.well-known/pactora.json`: where an agent that has found this site learns
 * where the API is and how to read the rest.
 *
 * `apiBase` comes from this deployment's own configuration
 * (`NEXT_PUBLIC_API_URL`). The contract and the payment token are NOT written
 * here, on purpose: they belong to the API's `GET /v1/network`, which is what
 * the chain facts are read from everywhere else on this site. A copy in this
 * file would be a second place for them to go stale. `contract` and `token`
 * are therefore `null`, and `discover` says where to read them.
 */
export const dynamic = 'force-static';

export function GET() {
  return Response.json(
    {
      name: 'Pactora',
      network: 'near:testnet',
      contract: null,
      token: null,
      apiBase: API_URL,
      discover: {
        chainFacts: `${API_URL}/v1/network`,
        fields: {contract: 'contracts.Pactora', token: 'paymentToken.accountId'},
      },
      skill: '/SKILL.md',
      note: 'contract and token are read from chainFacts at run time, not copied here. Testnet only.',
    },
    {headers: {'cache-control': 'public, max-age=300'}},
  );
}
