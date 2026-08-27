/**
 * Remove stale App Store provisioning profile from EAS so the next build
 * creates a new one with Push Notifications enabled.
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
const JsonFile = require(path.join(easRoot, "../node_modules/@expo/json-file")).default;

const PROJECT_FULL_NAME = "@danpepito/imitation-star";
const BUNDLE_ID = "com.imitationstar.app";

async function main() {
  const auth = JsonFile.read(getStateJsonPath())?.auth;
  if (!auth?.sessionSecret) {
    throw new Error("Not logged in to EAS. Run: eas login");
  }

  const graphqlClient = createGraphqlClient({
    accessToken: process.env.EXPO_TOKEN ?? null,
    sessionSecret: auth.sessionSecret,
  });

  const query = gql`
    query AppStoreProfileQuery($projectFullName: String!) {
      app {
        byFullName(fullName: $projectFullName) {
          id
          iosAppCredentials {
            id
            appleAppIdentifier {
              id
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

  const app = data?.app?.byFullName;
  if (!app) {
    throw new Error(`App not found: ${PROJECT_FULL_NAME}`);
  }

  const creds = app.iosAppCredentials.find(
    (row) => row.appleAppIdentifier?.bundleIdentifier === BUNDLE_ID
  );
  if (!creds) {
    throw new Error(`No iOS credentials for ${BUNDLE_ID}`);
  }

  const appStoreBuild = creds.iosAppBuildCredentialsList.find(
    (row) => row.iosDistributionType === "APP_STORE"
  );
  const profile = appStoreBuild?.provisioningProfile;
  if (!profile?.id) {
    console.log("No App Store provisioning profile on EAS — nothing to delete.");
    return;
  }

  console.log(
    `Deleting App Store provisioning profile ${profile.developerPortalIdentifier || profile.id}...`
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
    graphqlClient.mutation(mutation, { ids: [profile.id] }).toPromise()
  );

  console.log("Done. Next eas build will create a fresh profile with push enabled.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
