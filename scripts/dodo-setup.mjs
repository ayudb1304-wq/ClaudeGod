#!/usr/bin/env node
/**
 * One-shot Dodo Payments setup for local testing.
 *
 * Creates, in test mode: a product with license keys enabled, a test customer,
 * and an imported license key. Prints the checkout URL and the licence key so
 * they can go straight into .env and the extension's settings page.
 *
 * Why this exists: the manual path needs a real checkout run with a test card.
 * The admin API can create a licence key directly, so no payment flow, no card
 * entry, and the result is identical for activate/validate purposes.
 *
 * THE API KEY IS READ FROM .env AND NEVER PRINTED. It is used only here, on
 * your machine. It must never reach src/ — Vite only inlines VITE_-prefixed
 * variables, so a plain DODO_API_KEY cannot be bundled, and a guard test
 * asserts src/ never references it.
 *
 * Usage:
 *   node scripts/dodo-setup.mjs            # test mode (default, safe)
 *   node scripts/dodo-setup.mjs --live     # refuses unless --i-mean-it too
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');

const args = new Set(process.argv.slice(2));
const LIVE = args.has('--live');

if (LIVE && !args.has('--i-mean-it')) {
  console.error(
    'Refusing to touch live mode. Live creates a real, purchasable product.\n' +
      'Re-run with --live --i-mean-it if that is genuinely what you want.',
  );
  process.exit(1);
}

const BASE = LIVE ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';
const MODE = LIVE ? 'LIVE' : 'test';

/** Reads .env without a dependency. Values are never logged. */
function readEnvFile() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnvFile(), ...process.env };
const API_KEY = env.DODO_API_KEY;

if (!API_KEY) {
  console.error(
    'DODO_API_KEY not found.\n\n' +
      'Add it to .env (already gitignored):\n' +
      '  DODO_API_KEY=your_test_mode_key\n\n' +
      'Use the TEST-mode key from https://test.dodopayments.com. It is not\n' +
      'VITE_-prefixed, so Vite will never inline it into the extension bundle.',
  );
  process.exit(1);
}

async function api(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    // Deliberately does not dump request headers: that would print the key.
    throw new Error(`POST ${path} → ${response.status}\n${JSON.stringify(parsed, null, 2)}`);
  }
  return parsed;
}

/** Matches PRD §6: $29 one-time founder tier. Price is in cents. */
const PRODUCT = {
  name: 'ClaudeGod Pro (lifetime)',
  description: 'Lifetime Pro licence for ClaudeGod: unlimited search, folders, prompts and export.',
  tax_category: 'digital_products',
  price: {
    type: 'one_time_price',
    currency: 'USD',
    price: 2900,
    discount: 0,
    purchasing_power_parity: true,
    pay_what_you_want: false,
    tax_inclusive: false,
  },
  license_key_enabled: true,
  /*
   * 5 seats. A seat is consumed per Chrome profile, and the instance id lives
   * in storage.local, so ordinary churn (reinstall, new laptop, work + personal
   * profiles) burns seats that are never released. A tight limit therefore
   * generates support tickets from honest customers, and at $29 lifetime one
   * support exchange eats the margin.
   *
   * 5 is headroom, not generosity: once the instance id moves to storage.sync
   * it persists across reinstalls and profiles, so one person consumes one
   * seat however many machines they own, and this ceiling only ever binds on
   * a key that has been shared with strangers.
   */
  license_key_activations_limit: 5,
  license_key_activation_message: 'Paste this key into ClaudeGod → Settings → Pro licence.',
};

function randomKey() {
  const block = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
  return `CGOD-${block()}-${block()}-${block()}-${block()}`;
}

async function main() {
  console.log(`Mode: ${MODE}  (${BASE})\n`);

  console.log('1/3  Creating product…');
  const product = await api('/products', PRODUCT);
  const productId = product.product_id ?? product.id;
  console.log(`     product_id: ${productId}`);

  console.log('2/3  Creating test customer…');
  const customer = await api('/customers', {
    name: 'ClaudeGod Test Buyer',
    email: `claudegod-test+${Date.now().toString(36)}@example.com`,
  });
  const customerId = customer.customer_id ?? customer.id;
  console.log(`     customer_id: ${customerId}`);

  console.log('3/3  Importing licence key…');
  const key = randomKey();
  await api('/license_keys', {
    key,
    customer_id: customerId,
    product_id: productId,
    activations_limit: 5,
    // Lifetime licence (PRD §6): null means the key never expires.
    expires_at: null,
  });

  const checkoutUrl = `https://checkout.dodopayments.com/buy/${productId}`;

  console.log('\n' + '='.repeat(58));
  console.log(`LICENCE KEY   ${key}`);
  console.log(`CHECKOUT URL  ${checkoutUrl}`);
  console.log('='.repeat(58));

  if (!env.VITE_DODO_CHECKOUT_URL) {
    appendFileSync(ENV_PATH, `\nVITE_DODO_CHECKOUT_URL=${checkoutUrl}\n`);
    console.log('\nAppended VITE_DODO_CHECKOUT_URL to .env');
  } else {
    console.log('\n.env already has VITE_DODO_CHECKOUT_URL; left it alone.');
  }

  console.log('\nNext:');
  console.log('  1. Ensure .env has VITE_DODO_ENV=test');
  console.log('  2. pnpm build');
  console.log('  3. Reload the extension, open Settings, paste the licence key.');
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
