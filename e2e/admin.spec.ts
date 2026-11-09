import {expect, test, type TestInfo} from '@playwright/test';
import {expectNoBlockingViolations, signInAs, txs} from './helpers';

/**
 * The admin console (docs/26 F15) against the mock: `cara-…` accounts sit
 * on the arbiter DAO's council, `rhea-…` are compliance reviewers, JOB(50)
 * is disputed. Each test uses an account named after its browser.
 */

const who = (prefix: 'cara' | 'rhea', info: TestInfo) =>
  `${prefix}-${info.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${info.workerIndex}-${info.title.length}.testnet`;

test('a council member proposes a ruling bound to the evidence, and votes, with their own wallet', async ({
  page,
}, info) => {
  await signInAs(page, who('cara', info));
  await page.goto('/admin');
  await expect(page.getByTestId('admin-roles')).toContainText('Arbiter council');
  await page.getByRole('list', {name: 'Disputes'}).getByRole('button', {name: 'Job 7050'}).click();
  // The client's words are shown as text.
  await expect(page.getByTestId('dispute-reason')).toContainText('<b>not bold</b>');
  await expect(page.getByTestId('evidence-hash')).toHaveText('ab'.repeat(32));

  await page.getByRole('button', {name: 'Propose: refund the client'}).click();
  await expect(page.getByTestId('desk-notice')).toContainText('Refund the client');
  const [proposalTx] = await txs(page);
  expect(proposalTx!.receiverId).toBe('pactora-arbiter.sputnikv2.testnet');
  const p = proposalTx!.actions[0]!.params;
  expect(p.methodName).toBe('add_proposal');
  expect(p.deposit).toBe('100000000000000000000000'); // the DAO's 0.1 NEAR bond
  const kind = (
    p.args['proposal'] as {kind: {FunctionCall: {actions: {method_name: string; args: string}[]}}}
  ).kind;
  const ruling = JSON.parse(Buffer.from(kind.FunctionCall.actions[0]!.args, 'base64').toString('utf8'));
  expect(kind.FunctionCall.actions[0]!.method_name).toBe('resolve_dispute');
  expect(ruling).toEqual({job_id: 7050, for_worker: false});

  const proposal = page.getByRole('list', {name: 'Proposals'}).getByRole('listitem').last();
  await expect(proposal).toContainText('Refund the client — open for votes');
  await proposal.getByRole('button', {name: 'Approve'}).click();
  await expect(page.getByTestId('desk-notice')).toContainText('Vote sent');
  const voteTx = (await txs(page)).at(-1)!;
  expect(voteTx.actions[0]!.params.methodName).toBe('act_proposal');
  expect(voteTx.actions[0]!.params.args).toMatchObject({action: 'VoteApprove'});
  await expect(page.getByRole('list', {name: 'Proposals'}).getByRole('listitem').last()).toContainText(
    'You voted Approve',
  );
});

test('someone who is neither council nor reviewer is told so', async ({page}) => {
  await signInAs(page, 'nora.testnet');
  await page.goto('/admin');
  await expect(page.getByText('No admin access')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('a reviewer sees the compliance queue and moderation, not the dispute desk', async ({page}, info) => {
  await signInAs(page, who('rhea', info));
  await page.goto('/admin');
  await expect(page.getByTestId('admin-roles')).toContainText('Compliance reviewer');
  await expect(page.getByRole('tab', {name: 'Dispute desk'})).toHaveCount(0);
  const kase = page.getByRole('list', {name: 'Compliance cases'}).getByRole('listitem').first();
  await expect(kase).toContainText('strong');
  await expect(kase).toContainText('clearing needs two reviewers');
  await kase.getByRole('button', {name: 'Clear'}).click();
  await expect(page.getByRole('list', {name: 'Compliance cases'}).getByRole('alert')).toContainText(
    '10-2000',
  );
  await kase.getByLabel('Reason (10-2000 characters)').fill('Different date of birth and nationality.');
  await kase.getByRole('button', {name: 'Clear'}).click();
  await expect(
    page.getByRole('list', {name: 'Compliance cases'}).getByRole('listitem').first(),
  ).toContainText('1 decision(s)');

  await page.getByRole('tab', {name: 'Moderation'}).click();
  const review = page.getByRole('list', {name: 'Reviews to moderate'}).getByRole('listitem').first();
  await review.getByLabel('Why hide it').fill('abusive language');
  await review.getByRole('button', {name: 'Hide'}).click();
  await expect(
    page.getByRole('list', {name: 'Reviews to moderate'}).getByRole('listitem').first(),
  ).toContainText('Hidden: abusive language');
});

test('the admin console passes an accessibility scan', async ({page}, info) => {
  // Reduced motion BEFORE any click: the scan helper turns it on at scan time,
  // too late for a transition a click already started (axe then samples a
  // colour halfway through it).
  await page.emulateMedia({reducedMotion: 'reduce'});
  await signInAs(page, who('cara', info));
  await page.goto('/admin');
  await page.getByRole('list', {name: 'Disputes'}).getByRole('button', {name: 'Job 7050'}).click();
  await expect(page.getByTestId('evidence-hash')).toBeVisible();
  await expectNoBlockingViolations(page, 'admin console');
});
