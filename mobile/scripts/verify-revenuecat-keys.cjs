/**
 * Guard checks for RevenueCat API keys — run before shipping a release build.
 * Usage: node scripts/verify-revenuecat-keys.cjs
 */
const assert = require("assert");

function isTestStoreKey(apiKey) {
  return String(apiKey).startsWith("test_");
}

function canUseApiKeyInThisBuild(apiKey, isDev) {
  if (isTestStoreKey(apiKey) && !isDev) return false;
  return true;
}

assert.strictEqual(
  canUseApiKeyInThisBuild("test_abc", false),
  false,
  "test_ keys must be refused in release builds"
);
assert.strictEqual(
  canUseApiKeyInThisBuild("test_abc", true),
  true,
  "test_ keys are allowed in dev"
);
assert.strictEqual(
  canUseApiKeyInThisBuild("appl_abc", false),
  true,
  "appl_ keys are allowed in release"
);

const productionKey =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ||
  "";

if (productionKey) {
  assert.ok(
    !isTestStoreKey(productionKey),
    `Production env still has a Test Store key (${productionKey.slice(0, 8)}…). That will crash TestFlight.`
  );
  assert.ok(
    productionKey.startsWith("appl_") || productionKey.startsWith("goog_"),
    `Expected appl_/goog_ production key, got ${productionKey.slice(0, 8)}…`
  );
  console.log("OK: production-style key looks safe:", productionKey.slice(0, 8) + "…");
} else {
  console.log(
    "OK: no production key in local env (EAS may still inject one). Guard logic verified."
  );
}

console.log("verify-revenuecat-keys: all checks passed");
