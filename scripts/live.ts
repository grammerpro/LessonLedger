import 'dotenv/config';
import { safeFetch } from '../src/server/safe-fetch';
import { compare, callCostUpperBound } from '../src/server/evidence';
import { config } from '../src/server/config';
import { stripe } from '../src/server/billing';
import { db } from '../src/server/db';
if (process.env.RUN_LIVE_INTEGRATIONS !== 'true')
  throw new Error(
    'Opt in with RUN_LIVE_INTEGRATIONS=true. This suite may incur a bounded comparison charge.',
  );
if (!config.checks)
  throw new Error('Configure the comparison model, key, and verified input/output prices.');
const source = await safeFetch('https://www.notion.com/help/guides/new-formulas-whats-changed');
if (
  callCostUpperBound(
    [
      {
        location: 'Line 1',
        text: 'Notion formulas let you calculate values from database properties.',
      },
    ],
    source.text,
  ) > 2
)
  throw new Error('The configured model exceeds the $2 live smoke budget.');
const result = await compare(
  [
    {
      location: 'Line 1',
      text: 'Notion formulas let you calculate values from database properties.',
    },
  ],
  source.text,
  'Notion',
);
console.log(
  JSON.stringify({
    sourceFetched: true,
    comparisonParsed: true,
    findings: result.findings.length,
    inconclusive: result.inconclusive,
    tokens: result.tokens,
  }),
);
if (process.env.STRIPE_SECRET_KEY) {
  if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'))
    throw new Error('Only Stripe test keys are permitted in integration checks.');
  await stripe().prices.retrieve(process.env.STRIPE_STARTER_PRICE_ID!);
  console.log(
    'Stripe test price retrieved. Interactive Checkout lifecycle and email delivery still require operator verification.',
  );
}
await db.destroy();
process.exit(0);
