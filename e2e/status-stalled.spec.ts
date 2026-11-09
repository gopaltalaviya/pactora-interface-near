import {expect, test} from '@playwright/test';

/** /status when the indexer has stalled on a pruned start block (Round 3, 2026-11-09). */

test('the status page says plainly when the indexer has stalled on a pruned start block', async ({page}) => {
  await page.route('**/v1/status', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.components.indexer = 'stalled';
    body.chains[0].indexer = {
      ...body.chains[0].indexer,
      status: 'stalled',
      state: 'stalled: start block pruned',
      fix: 'set INDEXER_START_AT_HEAD=1 or use an archival RPC',
    };
    await route.fulfill({response: res, json: body});
  });
  await page.goto('/status');
  const alert = page.getByRole('alert').filter({hasText: 'indexer has stopped'});
  await expect(alert).toContainText('NEAR Testnet');
  await expect(alert).toContainText('pruned');
  await expect(alert).toContainText('set INDEXER_START_AT_HEAD=1 or use an archival RPC');
  const card = page
    .getByRole('region', {name: 'Components'})
    .getByRole('listitem')
    .filter({hasText: 'Indexer'});
  await expect(card).toContainText('Stalled');
});
