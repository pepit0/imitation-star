/**
 * Sync Push Notifications capability on Apple Developer Portal (via ASC API key
 * stored in EAS), then remove the App Store provisioning profile so the next
 * eas build creates one that includes aps-environment.
 *
 * Required because non-interactive `eas build` skips capability sync before
 * profile creation (bestEffortAppStoreAuthenticate returns early).
 */
const path = require("path");
const easRoot = path.join(
  process.env.APPDATA || "",
  "npm",
  "node_modules",
  "eas-cli",
  "build"
);

const { createGraphqlClient } = require(path.join(
  easRoot,
  "commandUtils/context/contextUtils/createGraphqlClient"
));
const { withErrorHandlingAsync } = require(path.join(
  easRoot,
  "graphql/client"
));
const { gql } = require(path.join(easRoot, "../node_modules/graphql-tag"));
const { getStateJsonPath } = require(path.join(easRoot, "utils/paths"));
const JsonFile = require(path.join(easRoot, "../node_modules/@expo/json-file"))
  .default;
const AppStoreApi = require(path.join(
  easRoot,
  "credentials/ios/appstore/AppStoreApi"
)).default;
const {
  tryAuthenticateAppStoreWithEasAscApiKeyAsync,
} = require(path.join(easRoot, "credentials/ios/actions/AscApiKeyUtils"));
const { CredentialsContext } = require(path.join(
  easRoot,
  "credentials/context"
));
const { IosDistributionType } = require(path.join(
  easRoot,
  "graphql/generated"
));

const PROJECT_FULL_NAME = "@danpepito/imitation-star";
const BUNDLE_ID = "com.imitationstar.app";
const ENTITLEMENTS = { "aps-environment": "production" };

async function getAuth(graphqlClient) {
  const auth = JsonFile.read(getStateJsonPath())?.auth;
  if (!auth?.sessionSecret) {
    throw new Error("Not logged in to EAS. Run: eas login");
  }
  return auth;
}

async function deleteAppStoreProfile(graphqlClient) {
  const query = gql`
    query AppStoreProfileQuery($projectFullName: String!) {
      app {
        byFullName(fullName: $projectFullName) {
          iosAppCredentials {
            appleAppIdentifier {
              bundleIdentifier
            }
            iosAppBuildCredentialsList {
              iosDistributionType
              provisioningProfile {
                id
                developerPortalIdentifier
              }
            }
          }
        }
      }
    }
  `;

  const data = await withErrorHandlingAsync(
    graphqlClient.query(query, { projectFullName: PROJECT_FULL_NAME }).toPromise()
  );

  const creds = data?.app?.byFullName?.iosAppCredentials?.find(
    (row) => row.appleAppIdentifier?.bundleIdentifier === BUNDLE_ID
  );
  const profile = creds?.iosAppBuildCredentialsList?.find(
    (row) => row.iosDistributionType === "APP_STORE"
  )?.provisioningProfile;

  if (!profile?.id) {
    console.log("No App Store provisioning profile to delete.");
    return;
  }

  console.log(
    `Deleting App Store profile ${profile.developerPortalIdentifier || profile.id}...`
  );

  const mutation = gql`
    mutation DeleteProfiles($ids: [ID!]!) {
      appleProvisioningProfile {
        deleteAppleProvisioningProfiles(ids: $ids) {
          id
        }
      }
    }
  `;

  await withErrorHandlingAsync(
    graphqlClient
      .mutation(mutation, { ids: [profile.id] })
      .toPromise()
  );
}

async function main() {
  const mobileDir = path.join(__dirname, "..");
  const appJson = require(path.join(mobileDir, "app.json"));

  const auth = await getAuth(null);
  const graphqlClient = createGraphqlClient({
    accessToken: process.env.EXPO_TOKEN ?? null,
    sessionSecret: auth.sessionSecret,
  });

  const app = {
    account: { name: "danpepito" },
    projectName: "imitation-star",
    bundleIdentifier: BUNDLE_ID,
  };

  const ctx = new CredentialsContext({
    projectDir: mobileDir,
    projectInfo: {
      exp: appJson.expo,
      projectId: appJson.expo.extra.eas.projectId,
    },
    user: { accounts: [{ name: "danpepito" }] },
    graphqlClient,
    analytics: { logEvent: () => undefined },
    vcsClient: null,
    nonInteractive: true,
  });

  ctx.appStore = new AppStoreApi();

  const authed = await tryAuthenticateAppStoreWithEasAscApiKeyAsync(
    ctx,
    app,
    "COMPANY_OR_ORGANIZATION"
  );
  if (!authed) {
    throw new Error(
      "Could not authenticate with App Store Connect API key from EAS."
    );
  }

  console.log("Syncing Push Notifications capability on Apple Developer Portal...");
  await ctx.appStore.ensureBundleIdExistsAsync(
    {
      accountName: app.account.name,
      projectName: app.projectName,
      bundleIdentifier: BUNDLE_ID,
    },
    { entitlements: ENTITLEMENTS }
  );
  console.log("Push capability synced.");

  await deleteAppStoreProfile(graphqlClient);
  console.log("Ready for eas build.");
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.cause) console.error(err.cause.message || err.cause);
  process.exit(1);
});
