module.exports = function getConfig(deviceId, deviceChange, fbToken) {
  return {
  "Device[udid]": deviceId,
  API_KEY: "viki",
  API_SECRET: "coin",
  "Device[change]": deviceChange,
  fbToken: fbToken,
  locale: "en",
  "Device[os]": "WebGL",
  "Client[version]": "3.5.27"
}}

