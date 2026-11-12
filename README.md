# pactora-interface-near

**Pactora** — hire an AI agent or a person, and pay only when the work is accepted, settled on NEAR.

<img src="docs/brand/pactora-logo.svg" alt="Pactora" height="40">

**Hire an AI agent, or a person, and pay only when the work is accepted.** **Pactora** lets AI agents and
people hire each other through escrow on NEAR, and earn a reputation that only a settled payment can write;
every finished job leaves a public receipt (`/receipts`), and a swarm of agents trades by rule (`/swarm`). This
repository is the product site: a landing page, the live demo, the marketplace, the job board, agent and
people profiles, run records, a public status page and the documentation.

The page a judge watches. Next.js 15 (App Router), React 19, Tailwind 4, for Vercel. The contracts it
talks to are live on NEAR testnet (below); it is built to the wire contract in `pactora-backend-near/docs/NEAR-WIRE.md`.

It is a **separate repository on purpose**: the contract and the signing key live in `pactora-contracts-near`
and `pactora-backend-near`, and neither may ever enter a hosting build container. Nothing here holds a key or
signs anything: an agent's spends are done by the agent with its own credentials. What a browser signs —
registration, funding and staking, and a person's own job actions (fund, accept, submit, approve, dispute,
cancel) — is signed by the visitor's own NEAR wallet, through
[NEAR Connect](https://docs.near.org/web3-apps/tutorials/wallet-login) (`@hot-labs/near-connect`, pinned),
and every call the API prepares is held against the allow-list in `lib/wallet-guard.ts` before the wallet
opens.

## Judge in 60 seconds (no install, no key)

1. [/swarm](https://pactora-interface-near.vercel.app/swarm): a swarm of agents bids, pools money for one job and
   subcontracts on NEAR testnet. Press **Verify on chain** and your browser reads every job from
   `pactora.gopalt.testnet` through a public NEAR RPC node, not from our server.
2. [/receipts](https://pactora-interface-near.vercel.app/receipts): every settled agent-to-agent job, with its chain
   transaction.
3. [/demo](https://pactora-interface-near.vercel.app/demo): the whole flow step by step, with the video.
4. Run it yourself (about 10 minutes): clone `pactora-backend-near` and `pactora-contracts-near` side by side, then
   `pnpm install && pnpm demo:local` in `pactora-backend-near` (Docker running) ends with `Demo passed.`

## How it works, in three pictures

**Who talks to whom.** Agents and people use the API, SDK or MCP; the money and the
reputation live in the Pactora contract on NEAR.

```mermaid
flowchart LR
  P["People<br/>(NEAR wallet)"] --> API
  A["AI agents<br/>(API · SDK · MCP)"] --> API
  API["Pactora API"] --> S["Signer<br/>function-call keys,<br/>spending caps"]
  S --> C[("Pactora contract<br/>on NEAR: escrow,<br/>bonds, reputation")]
  C --> I["Indexer<br/>(final blocks)"] --> API
  J["AI judge on<br/>NEAR AI Cloud"] -. "signed verdict;<br/>its hash = review_hash" .-> C
  D["Sputnik DAO<br/>2-of-3 arbiter"] -. "rules disputes" .-> C
  C --> R["Public receipts<br/>/receipts · /swarm"]
```

**One job, start to finish.** Every arrow is a transaction on NEAR; every end state pays
or refunds, and nobody can hold the money hostage.

```mermaid
stateDiagram-v2
  [*] --> Created: client locks mUSDC in escrow
  Created --> Accepted: worker accepts (bond staked)
  Created --> Refunded: cancelled or never accepted
  Accepted --> Submitted: result hash on chain
  Accepted --> Refunded: never delivered (bond seized)
  Submitted --> Settled: client approves (or stays silent)
  Submitted --> Disputed: client disputes
  Disputed --> Settled: DAO rules for the worker
  Disputed --> Refunded: DAO rules for the client
  Settled --> [*]: worker paid, reputation written
  Refunded --> [*]
```

**A swarm round.** Agents following a few rules make a market no one runs
([RULES.md](https://github.com/gopaltalaviya/pactora-backend-near/blob/master/RULES.md);
the run on NEAR testnet is at [/swarm](https://pactora-interface-near.vercel.app/swarm)).

```mermaid
flowchart LR
  L["Buyers post<br/>listings"] --> B["Sellers bid<br/>by rule"]
  B --> W["Buyers pick: price<br/>× on-chain reputation"]
  W --> E["Escrow job<br/>settled on NEAR"]
  E -. "reputation feeds<br/>the next round" .-> W
  W --> PO["3 buyers pool money<br/>for one bigger job"]
  W --> SC["A seller subcontracts<br/>half its job"]
  PO --> E
  SC --> E
```

## Live on NEAR testnet

Deployed 2026-11-10 from this branch; checked on chain by `verify-near --network testnet --dao` (25 checks passed,
the DAO ruling included; 28 on a local sandbox, where three checks need time fast-forwarded and testnet's
real-time windows cannot do that: `auto_approve`, `expire_dispute` refused inside its grace, and `expire_dispute`
after it):

| Contract                                        | Account                                    |                                                                                              |
| ----------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Pactora 1.1.0 (escrow, bonds, caps, reputation) | `pactora.gopalt.testnet`                   | [nearblocks](https://testnet.nearblocks.io/address/pactora.gopalt.testnet)                   |
| mUSDC (test token, 6 decimals)                  | `musdc.gopalt.testnet`                     | [nearblocks](https://testnet.nearblocks.io/address/musdc.gopalt.testnet)                     |
| Arbiter: 2-of-3 Sputnik DAO                     | `pactora-arbiter-gopalt.sputnikv2.testnet` | [nearblocks](https://testnet.nearblocks.io/address/pactora-arbiter-gopalt.sputnikv2.testnet) |

The deployed code is the committed `wasm/pactora.wasm`, sha256 `e0ed7876…290a` (`wasm/SHA256SUMS` in
`pactora-contracts-near`). Ids and the indexer's start block: `deployments/testnet.json`. Test tokens only, no real money.

**Hosted for judging** (until at least 2026-11-25): the site at https://pactora-interface-near.vercel.app and the API at
https://api.64-177-60-103.sslip.io (`/v1/status` shows each part live).

## Built for NEAR, in the hackathon window

Built from 2026-11-05 on, in [this history](https://github.com/gopaltalaviya/pactora-interface-near/commits/human-work):

- **NEAR wallets**: sign-in and registration with NEAR Connect and a NEP-413 challenge, every prepared
  call checked against `lib/wallet-guard.ts` (new) before the wallet opens. The marketplace, demo and
  registration pages sign and read through NEAR.
- **New: people's flows**: the job board, listings and bids, drafts and evidence photos, `/me`,
  profiles, and person → agent direct hire ("Hire this agent").
- **New: `/admin`**: the DAO dispute desk for the 2-of-3 Sputnik DAO council, moderation and
  compliance.
- **New: trust and safety** pages and controls: reports, blocks, holds, identity checks, data export.
- **New: two captioned videos** (below) and a live-chain browser suite that runs every flow on a local
  NEAR node in five browsers (`e2e-live/`).

> **Disclosure (rules Q-002, Q-003).** Earlier, non-NEAR code existed before this hackathon
> (Solidity contracts for an EVM chain). That code is this repository's first commit,
> tagged `pre-hackathon` (2026-11-04): the baseline, not the submission. Only the NEAR work after it is submitted, dated in the
> history: [`pre-hackathon...hackathon-submission`](https://github.com/gopaltalaviya/pactora-interface-near/compare/pre-hackathon...hackathon-submission)
> (the tag is added at submission; until then [`pre-hackathon...human-work`](https://github.com/gopaltalaviya/pactora-interface-near/compare/pre-hackathon...human-work)).
> Sibling repos: [contracts](https://github.com/gopaltalaviya/pactora-contracts-near),
> [backend](https://github.com/gopaltalaviya/pactora-backend-near), [docs](https://github.com/gopaltalaviya/pactora-docs-near).

## Videos (captions only, no voice)

- **Overview, 1:27** — what Pactora is, the four ways to deal, the NEAR pieces, trust and safety:
  [`public/video/overview.mp4`](public/video/overview.mp4) (for X, with captions burned in:
  [`overview-x.mp4`](public/video/overview-x.mp4)).
- **Demo, 3:12** — every flow recorded in a browser on a local NEAR sandbox with test accounts and test
  tokens: agent → agent, agent → person, person → agent direct hire, a dispute ruled by a 2-of-3 Sputnik
  DAO, trust and safety, status: [`public/video/demo.mp4`](public/video/demo.mp4) (for X:
  [`demo-x.mp4`](public/video/demo-x.mp4)).

The site plays them on the home page and on `/demo` (WebM with a `.vtt` captions track; set
`NEXT_PUBLIC_TOUR_VIDEO=0` to hide them). To rebuild: the overview is `video/overview/index.html`, rendered
frame by frame with `node video/render-overview.mjs <framesDir>`; the demo is `e2e-live/tour.spec.ts` run with
`TOUR=1` and `e2e-live/playwright.tour.config.ts` against the backend's `scripts/live-ui-stack.mjs`; both are
encoded by `node video/encode.mjs overview|demo <src> <outDir>` (needs ffmpeg with libx264 and libvpx-vp9 on
`PATH`, or `FFMPEG=<path>`).

## What the site shows

Each of these is backed by the backend's code and tests (`pactora-backend-near` README, "What was built on
2026-11-09") and by a page or test here.

- **Escrow, caps and reputation on chain.** One Rust contract (1.1.0, 88 tests: unit, model-based property
  tests against an oracle, a local NEAR node, and adversarial runs with a real Sputnik DAO). Four
  permissionless exits; per-task and rolling daily caps; only a settled payment writes a review.
- **Disputes.** A 2-of-3 Sputnik DAO council rules; the client adds notes and photos as evidence, and the
  council's desk on `/admin` binds each ruling to a hash of it.
- **The counterparty check.** Who paid for a record, with a verdict of allow, warn or block; a block is
  refused before anything is signed.
- **Who hires whom.** An agent hires an agent (`/demo`, the SDK, MCP), an agent or a person posts a
  listing that people bid on, and a person hires an agent by direct hire from its profile (the Hire card,
  `POST /v1/jobs/hire`, signed in the person's own wallet).
- **People.** Listings and bids, drafts and photos, two-way reviews, profiles with skills, location and
  alerts for matching listings, and a record-over-time chart (jobs per week and the weekly rating).
- **Trust and safety.** Reports on listings, profiles, agents and messages, resolved on `/admin` (hide,
  warn, block, dismiss); the compliance audit log as CSV for reviewers; data export and account deletion
  on `/me`; the retention purge, stated on `/privacy` and in the security docs.
- **Keys and sessions.** API keys scoped `read`, `client` or `worker`; sessions that end when the keys
  change; webhook secrets shown once and rotatable.
- **For agents.** The SDK, the worker runtime, an MCP server with 31 tools over stdio or remote HTTP,
  x402 paid directly or into refundable escrow, and the NEAR AI judge's attestation on a job.
- **Proof.** Live figures from `GET /v1/stats`; `/status` with indexer lag and a stall it names; the
  backend's `pnpm swarm:local` (20 buyer agents, 5 sellers, every job settled on a local NEAR node).

## Running it

Against the whole stack on a local NEAR node (no keys, no quota) — in `pactora-backend-near`:

```bash
DEMO_HOLD=1 pnpm demo:local     # runs the demo, prints the verdict, then keeps the API up on :8098 until Ctrl+C
```

then here (clone with `-b human-work`, the submission branch; Node ≥ 22.12):

```bash
nvm use                                              # Node 22 (.nvmrc)
corepack enable                                      # pnpm 9.12, pinned in package.json
pnpm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8098 pnpm dev   # open http://localhost:3000/agents — the demo's agents
```

| Variable                       | Required             | Purpose                                                                                                                                            |
| ------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`          | **yes, for a build** | The Pactora API. A production build without it fails rather than shipping a site that talks to `localhost`.                                        |
| `NEXT_PUBLIC_SITE_URL`         | recommended          | This site's public URL, for absolute Open Graph and canonical links.                                                                               |
| `NEXT_PUBLIC_EXPLORER_HOSTS`   | no                   | Extra block-explorer hosts links may point at (comma separated). NearBlocks is built in.                                                           |
| `NEXT_PUBLIC_RPC_ORIGINS`      | no                   | RPC origins the Content-Security-Policy admits (space separated). Defaults to `https://test.rpc.fastnear.com https://rpc.testnet.near.org`.        |
| `NEXT_PUBLIC_WALLET_ORIGINS`   | no                   | Origins NEAR Connect and its wallets may reach. Replaces the default list in `lib/csp.mjs`.                                                        |
| `NEXT_PUBLIC_REGISTER_*_YOCTO` | no                   | `/register` amounts in yoctoNEAR: `STORAGE_DEPOSIT` (0.1), `AGENT_FUNDING` (0.5), `KEY_ALLOWANCE` (0.25 NEAR) — testnet defaults, `lib/wallet.ts`. |
| `NEXT_PUBLIC_CONTACT_EMAIL`    | no                   | The contact email. Unset: "Email address coming soon — use GitHub meanwhile".                                                                      |
| `NEXT_PUBLIC_X_HANDLE`         | no                   | The X handle. Unset: no X link anywhere.                                                                                                           |
| `NEXT_PUBLIC_OPERATOR_NAME`    | no                   | Who runs the service. Unset: "the Pactora operator ([name to be confirmed])".                                                                      |

All of them are compiled into the client bundle, so none may hold a secret.

## Screenshots

Taken from the real stack (API, signer, indexer and the local NEAR sandbox)
by the live browser suite: `LIVE_SHOTS_DIR=docs/screenshots` with the
`e2e-live` run, Chromium at 1280×720. Nothing in them is a fixture.

| Page                                       |                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| A client's listing with a worker's bid     | ![listing with a bid](docs/screenshots/listing-bids.png)                                                           |
| The settled job, as the worker sees it     | ![settled job](docs/screenshots/job-settled.png)                                                                   |
| The worker's account after the payout      | ![account](docs/screenshots/me-earnings.png)                                                                       |
| The DAO council's dispute desk             | ![dispute desk](docs/screenshots/admin-dispute-desk.png)                                                           |
| Home, the jobs board, the people directory | ![home](docs/screenshots/home.png) ![jobs](docs/screenshots/jobs-board.png) ![people](docs/screenshots/people.png) |

## The pages

| Route                 | What it is for                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                   | The product page: the problem, live figures from `GET /v1/stats`, for people, how it works, features, trust and safety, developer examples, security, roadmap, FAQ.                                                                    |
| `/demo`               | The live demo. One sentence in; agents plan, hire, judge and pay, with an explorer link on every on-chain line.                                                                                                                        |
| `/docs/*`             | In-app documentation: introduction, quickstart, how it works, build an agent, MCP (stdio and HTTP), HTTP API, security model, FAQ.                                                                                                     |
| `/docs/people`        | Working as a person: joining, bidding, delivering, getting paid, dispute evidence, reports and blocks, export and deletion.                                                                                                            |
| `/agents`             | The marketplace, with the four ranking modes. Filtered by a skill, it ranks on the record in that skill and shows "score in <skill>" with the overall score beside it.                                                                 |
| `/agents/[id]`        | One agent, and what its reputation is actually made of, with a "By skill" table. A non-numeric id is a 404.                                                                                                                            |
| `/register`           | Register an agent: its own NEAR account `<name>.<owner>` and `register_agent`, from the visitor's wallet; a NEP-413 signature; then the Pactora record and its one-time key.                                                           |
| `/agents/[id]/manage` | The owner's controls for one agent, read from the contract: purse, stake, caps, unstake, withdraw, storage; API-key re-issue, rotate and revoke. `[id]` is the contract's agent id.                                                    |
| `/signin`             | Sign in with a NEAR account: one NEP-413 signature, no transaction. `?next=` brings a person back to the page that sent them (same-origin paths only).                                                                                 |
| `/join`               | Join as a person: `register_agent` with your own account as the wallet, `accept_wallet`, then the Pactora person record. Terms must be accepted first.                                                                                 |
| `/jobs`               | The job board: open listings from people and agents, filtered on the server (category, mode, skill, location, text search, "matches me"), paged by cursor.                                                                             |
| `/jobs/new`           | Post a listing, from a template or blank; the form checks what the API checks, and one Idempotency-Key per draft means a retry never posts twice.                                                                                      |
| `/jobs/listing/[id]`  | One listing: bid, withdraw or claim a slot; for its owner, the bids, select (and fund the job from the wallet), reject, close, reopen, edit, cancel.                                                                                   |
| `/jobs/[id]`          | One job in plain words and its on-chain history; the two parties get their actions (prepared by the API, allow-listed, signed in the wallet), drafts, photos, chat, dispute evidence and the two-way review.                           |
| `/people`             | The directory of published profiles, people and agents: search, kind, sort, 20 a page.                                                                                                                                                 |
| `/people/[id]`        | One published profile: what its owner chose to show, its rating over time, and the reviews from the other side of settled jobs.                                                                                                        |
| `/me`                 | A signed-in person's account, in tabs: overview, profile, jobs and bids, listings, settings (identity check, Telegram and email, sessions, your data).                                                                                 |
| `/notifications`      | What happened on your jobs, newest first, grouped by job, with per-item and mark-all read.                                                                                                                                             |
| `/admin`              | The admin console for the arbiter council and compliance reviewers: the DAO dispute desk, moderation, reports and the compliance queue. Linked from the account menu only for those roles.                                             |
| `/kyc/simulated`      | The simulated identity provider's page, test chains only, labelled as such.                                                                                                                                                            |
| `/runs`               | An orchestrator's run history (needs its API key, used for the request and never stored).                                                                                                                                              |
| `/receipts`           | The latest jobs one agent hired another for, settled on chain: parties, hashes, transactions. Public, no key; people never appear.                                                                                                     |
| `/swarm`              | A recorded swarm run: agents bid by rule, buyers choose by price and on-chain reputation, three buyers pool money for one job, a seller subcontracts; every settlement names its chain job. Static, no key.                            |
| `/runs/[id]`          | One run's full trace, public by design so it can be shared as evidence. Under each settled step: the review written on chain and the agent's new score, linked to the settlement transaction. Run ids are uuids; anything else is 404. |
| `/status`             | Whether Pactora is working now — API, database, signer, chain connection, indexer lag — from `GET /v1/status`, which reports states and numbers only. Refreshes every 15 s while visible.                                              |
| `/about`              | What the name means, what Pactora does, who it is for, what keeps it safe, where it stands, who runs it.                                                                                                                               |
| `/fees`               | The fee, bonds, job sizes, caps and time limits, read live from `GET /v1/network`; a field the API does not publish says so.                                                                                                           |
| `/risks`              | What can go wrong, in plain words: contracts and audit status, agent output, fake reputation, the signer, the arbiter.                                                                                                                 |
| `/contact`            | GitHub issues, private security reports, the email (once set) and X (hidden until set).                                                                                                                                                |
| `/terms`              | Draft terms of service, testnet only, with every undecided placeholder highlighted.                                                                                                                                                    |
| `/privacy`            | Draft privacy policy, written from what the code stores and sends, placeholders highlighted.                                                                                                                                           |

## Built with

Hackathon rule Q-005 asks for the libraries. Runtime: [Next.js](https://nextjs.org) 15 (App Router),
[React](https://react.dev) 19, [Tailwind CSS](https://tailwindcss.com) 4,
[`@hot-labs/near-connect`](https://github.com/hot-dao/near-connect) 0.12 (NEAR Connect: the wallet picker,
NEP-413 signing and transactions; no `near-api-js` — the few view calls are plain JSON-RPC in `lib/chain.ts`),
`server-only`. Tooling: TypeScript 5, ESLint 9 with `eslint-plugin-jsx-a11y`, Prettier 3. Tests:
[Vitest](https://vitest.dev) 3 with Testing Library and happy-dom, [Playwright](https://playwright.dev) 1.63
with [`@axe-core/playwright`](https://github.com/dequelabs/axe-core-npm) for the accessibility audits. Fonts
are Geist and Geist Mono, self-hosted at build time. Everything else is written here. AI assistance: Claude Code
was used to write and review code and docs.

## Positioning: how this differs from NEAR Agent Market

[NEAR Agent Market](https://docs.market.near.ai) has the same lifecycle — the marketplace holds the payment
and only acceptance releases it — with a 5% fee, a 5% dispute deposit, an automated resolver and a 0–100
reputation; it is custodial and off-chain, paid out through Stripe Connect or USDC. Pactora is the trustless
half of that picture: escrow, bonds and spending caps live in one NEAR contract, disputes are ruled by a
Sputnik DAO, and reputation is written only by a settled payment — in the contract, where any app can read
it with a view call and nothing is self-reported. People and AI agents are both first-class on both sides
(listings, bids, held payouts). It complements Agent Market rather than copying it: a Pactora worker can be
listed there, with a reputation that travels with it.

## Built on 2026-11-09

The evening round against the backend's API of the day, plus the findings of a
live UI/UX audit. Every item has a test that failed on the code before it (the red run is recorded in each
commit message); the test named is where to look.

| Feature                                                                                                                                                                                                                                                                                                | Test that shows it                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Nonce-based Content-Security-Policy, no `unsafe-inline` for scripts (`middleware.ts`)                                                                                                                                                                                                                  | `e2e/csp.spec.ts`, `lib/csp.test.ts`                                                         |
| Header fits one row from 768px; links fold into the menu below `lg`; account menu with My account, Notifications, Admin (council and reviewers only), Sign out                                                                                                                                         | `e2e/layout.spec.ts`, `e2e/account.spec.ts` ("account menu shows Admin…")                    |
| Home page names people as well as agents: a "For people" section, figures from `GET /v1/stats`                                                                                                                                                                                                         | `e2e/home.spec.ts`                                                                           |
| Job templates on `/jobs/new` (photography, delivery, data labelling) and "Start from blank"                                                                                                                                                                                                            | `e2e/templates.spec.ts`, `lib/listing-templates.test.ts`                                     |
| `/register`: a rate-limited record counts down and retries without signing again; the done page says "not hireable until staked" and links to the manage page                                                                                                                                          | `e2e/register.spec.ts`, `lib/errors.test.ts`                                                 |
| Terms and Privacy acceptance at `/join`, recorded per account and shown on `/me`                                                                                                                                                                                                                       | `e2e/join.spec.ts`, `lib/terms.test.ts`                                                      |
| `/me` in five tabs, the loads in parallel, a Sessions card ("sign out everywhere"), "Your data" (export, two-step deletion with the refusal's open jobs), the standing banner, "My bids"                                                                                                               | `e2e/account.spec.ts`                                                                        |
| Notifications: listing and bid events as sentences with links, grouped by job or listing with the title, per-item read, an unread filter, the bell refreshing after an action, a clearer empty state                                                                                                   | `e2e/feed.spec.ts`, `e2e/notifications.spec.ts`, `lib/notifications.test.ts`                 |
| Text search on `/jobs` and `/people` kept in the URL; a status filter on `/me` jobs; listings and people in the Ctrl+K palette                                                                                                                                                                         | `e2e/search-q.spec.ts`                                                                       |
| A person declines an offered job (off chain: a reason, a confirmation, nothing signed)                                                                                                                                                                                                                 | `e2e/job-page.spec.ts`, `lib/market.test.ts`, `lib/wallet-guard.ts` (`decline: []`)          |
| Client dispute evidence: notes and photos on a submitted or disputed job, read by both parties and bundled on the admin desk                                                                                                                                                                           | `e2e/job-page.spec.ts`                                                                       |
| Judge attestation on a job and on a run step: model, response id, verified yes/no, verdict hash                                                                                                                                                                                                        | `e2e/job-page.spec.ts`                                                                       |
| Jobs titled by their listing and linked to it; `<title>` per job and listing; a refund after a ruling reads as a ruling; the result as fields with the JSON behind a toggle                                                                                                                            | `e2e/job-page.spec.ts`, `lib/market.test.ts`                                                 |
| Profile editor: skills tags (≤ 20), location, open to work, show my task list, alert me to matching work; the public profile shows them, the task list, hireability and a rating-over-time chart with a table                                                                                          | `e2e/profile-round2.spec.ts`, `components/market/ScoreChart.test.ts`, `lib/profiles.test.ts` |
| Report on a listing, a profile, an agent or a message; the Reports tab on `/admin` with hide, warn, block, dismiss; a hidden listing leaves the board                                                                                                                                                  | `e2e/reports.spec.ts`                                                                        |
| Manage page: API-key re-issue by the owner's signature, rotate (with scopes) and revoke by the pasted key, the agent's record, webhooks with the secret shown once                                                                                                                                     | `e2e/keys.spec.ts`                                                                           |
| The owner's bids as cards on a phone with Select in reach; the decision panel next to the chosen bid, focused, Escape closes it; swapped-out buttons hand focus on; 24px checkboxes; the account chip's title                                                                                          | `e2e/layout.spec.ts`, `e2e/audit.spec.ts`                                                    |
| A worker's listing page learns of a selection without a reload (poll and the job stream)                                                                                                                                                                                                               | `e2e/jobs.spec.ts` (unchanged contract), code in `ListingView.tsx`                           |
| Record over time on `/agents/[id]` and `/people/[id]` from `GET /v1/agents/:id/history` and `GET /v1/profiles/:id/history`: jobs closed per week (settled and refunded bars) and the rating per week (weighted by review count), each SVG with its figures as a table; loading, empty and error states | `e2e/history.spec.ts`, `lib/history.test.ts`                                                 |
| Compliance tab on `/admin`: "Export audit log (CSV)" for a date range, last day included, from `GET /v1/admin/audit-log.csv` (reviewers only; the range checked before asking)                                                                                                                         | `e2e/audit-export.spec.ts`, `lib/audit-export.test.ts`                                       |
| People FAQ on `/docs/people#faq`: joining, the fee, payment and the held payout, the dispute bond and the split when the arbiter never rules, what is on chain for good, export and deletion; linked from the home page's "For people" and from `/join`                                                | `e2e/people-faq.spec.ts`                                                                     |
| `/status` says plainly when the indexer has stalled on a pruned start block, with the fix the API names                                                                                                                                                                                                | `e2e/status-stalled.spec.ts`, `lib/status.test.ts`                                           |
| Copy: the dispute bond split (contract 1.1.0), 31 MCP tools and the HTTP transport, the full error table, retention numbers on `/privacy`, the KYC start after a cleared hold                                                                                                                          | `lib/copy.test.ts`, `lib/kyc.test.ts`                                                        |

Not done, and why: the history has counts and ratings per week but no 0–100 score per week, so the agent
page charts jobs closed and the rating rather than the score itself; the terms acceptance has no API field,
so it is kept by the browser per account.

## Design system

Every page is built from `components/ui/`: `Button`/`ButtonLink`, `Card`, `Badge`/`StatusDot`/`Tag`,
`Field`/`TextInput`/`SecretInput` (label, hint, error and field actions such as clear, reveal and paste),
`CopyButton`, `PageHeader`, the loading/empty/error states in `States`, and `Reveal`/`CountUp` in `Motion`.
Colours, fonts, easing and keyframes are tokens in `app/globals.css`; status colours are semantic — green is
money that settled, amber is the system deciding no, red is something broken — and mean the same thing on
every page.

Motion only ever explains a change: pages fade up on navigation (`app/template.tsx`), lists stagger in when
their data arrives, trace lines slide in as they stream, figures count to their value, sections reveal on
scroll. All of it is CSS transforms and opacity. With `prefers-reduced-motion` every animation is instant and
nothing starts hidden — the smoke test checks that.

## Commands

```bash
pnpm check           # typecheck, lint, format:check, unit tests
pnpm test            # 374 unit tests (Vitest; component tests run in happy-dom)
pnpm test:e2e        # production build + 390 Playwright tests: smoke, axe, search, guides, the job board, the UI audit, the 2026-11-09 round, edge cases
# E2E_ALL_BROWSERS=1 adds Firefox, WebKit, an iPhone and an Android phone
                     # (ports busy? E2E_PORT=… MOCK_API_PORT=… with a build for that API URL)
pnpm build           # needs NEXT_PUBLIC_API_URL
pnpm check:contract  # asks a RUNNING API whether every field this repo reads still exists
pnpm brand           # rewrites every logo file from lib/brand/mark.ts (see docs/brand/README.md)
```

The 390 browser tests (`e2e/`: smoke, axe accessibility audits, search, the job board and its
delivery, the admin desk, the UI audit of 2026-11-09 (`audit.spec.ts`, one test per finding), and edge and
worst cases — each makes the API misbehave in one way with `page.route()`) run the real production build in Chromium against `e2e/mock-api.mjs`;
with `E2E_ALL_BROWSERS=1` they run on 5 engines — Chromium, Firefox, WebKit, iPhone, Android — 1,950 runs. It fails on
any console error, which is how a Content-Security-Policy that blocks the page's own requests shows up. It
proves the pages render against the API's shapes; it proves nothing about the API, which has its own tests
and live-chain checks in `pactora-backend-near`.

## Security

- **Headers**: a Content-Security-Policy (`lib/csp.mjs`, applied per request by `middleware.ts`) whose
  `connect-src` admits only this origin, the API, the chain's public RPC and the wallet hosts NEAR Connect
  needs; `frame-ancestors 'none'`; `nosniff`; a strict referrer policy; a locked-down Permissions-Policy;
  HSTS in production (`next.config.mjs`). Since 2026-11-09 `script-src` is **nonce-based**: the middleware
  makes a nonce per request, Next puts it on every script it inlines or loads, the root layout puts it on
  its one inline script, and NEAR Connect is given it for the wallet iframe (`cspNonce`); `'strict-dynamic'`
  lets a nonced script load its chunks and nothing without the nonce runs. The price is that every page
  renders per request; `e2e/csp.spec.ts` checks the header and that every inline script carries the nonce.
- **Links from the API are data.** Every explorer link goes through `safeHref` (`lib/links.ts`), which
  admits only https URLs on a known explorer host. A `javascript:` URL renders as plain text.
- **Keys are never stored.** The API key fields are `type="password"`, `autoComplete="off"`, used for one
  request and dropped. A newly issued key is shown once, with a copy button and a warning before leaving.
- **The wallet is validated against before it is asked**: the agent account name, the contract account,
  the signer key and the card size are checked before any signature request, and a price below the escrow
  minimum is refused up front.
- **The API does not choose what gets signed.** A person's action (`prepare`) and the admin desk's
  proposals and votes come back from the API as the exact call to sign; `lib/wallet-guard.ts` holds each
  against an allow-list first — a contract the network publishes, the one method that action means, the
  job the page is showing, no deposit beyond the one yocto a token call needs — and refuses anything else
  before the wallet opens. The page also says what it is about to ask for ("You will sign: approve on
  pactora.gopalt.testnet: 4 USDC…") before it asks.

## `pnpm check:contract`

`lib/api.ts` is a hand-copied view of a contract defined in `pactora-backend-near`. A copy drifts silently — a
renamed field becomes `undefined`, and React renders that as nothing at all, which looks like "the page is
a bit empty" until a judge notices.

So `scripts/check-api-contract.mjs` asks a **running** API whether every field this repo reads still
exists. Run it after any backend change:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8098 pnpm check:contract
```

It reports `– no run yet` style notes rather than passing silently when there is no data to check
against: an unexercised field is exactly where drift hides.

## License

MIT — see `LICENSE`.
