const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

/** Remove push entitlements until Push Notifications is enabled on the App ID in Apple Developer. */
module.exports = function withPushEntitlementsDeferred(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
  config = withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      cfg.modResults.UIBackgroundModes = modes.filter(
        (mode) => mode !== "remote-notification"
      );
      if (cfg.modResults.UIBackgroundModes.length === 0) {
        delete cfg.modResults.UIBackgroundModes;
      }
    }
    return cfg;
  });
  return config;
};
