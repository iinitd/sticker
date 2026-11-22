// The development build (dev client) gets its own bundle identifier and URL
// scheme so it can sit on a device next to the TestFlight build instead of
// replacing it. EAS sets APP_VARIANT from the build profile in eas.json.
const DEV_VARIANT = "dev";

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== DEV_VARIANT) {
    return config;
  }

  return {
    ...config,
    name: "Sticker Dev",
    scheme: "sticker-dev",
    ios: {
      ...config.ios,
      bundleIdentifier: "lol.milio.sticker.dev",
      // Dev client talks to Metro over the Tailscale/LAN address over plain HTTP.
      // Keep this exception in the dev variant only; production keeps ATS on.
      infoPlist: {
        ...config.ios?.infoPlist,
        NSAppTransportSecurity: {
          ...config.ios?.infoPlist?.NSAppTransportSecurity,
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      ...config.android,
      package: "lol.milio.sticker.dev",
    },
  };
};
