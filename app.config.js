// The Maps key comes from the environment (EAS env var GOOGLE_MAPS_API_KEY),
// never from source. `extra.mapsEnabled` is the runtime echo of it: expo strips
// `android.config` from the config the app can read, so without this flag the
// app could not tell whether the key was baked in. See components/MapUnavailable.tsx.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
  config.android.config.googleMaps.apiKey = key;
  config.extra = { ...config.extra, mapsEnabled: !!key };
  return config;
};
