module.exports = {
  "Device[udid]": process.env.DEVICE_ID,
  API_KEY: "viki",
  API_SECRET: "coin",
  "Device[change]": process.env.DEVICE_CHANGE,
  fbToken: process.env.FB_TOKEN,
  locale: "en",
  "Device[os]": "WebGL",
  "Client[version]": "3.5.27"
};

function JSON_to_URLEncoded(element, key, list) {
  var list = list || [];
  if (typeof element == "object") {
    for (var idx in element)
      JSON_to_URLEncoded(element[idx], key ? key + "[" + idx + "]" : idx, list);
  } else {
    list.push(key + "=" + encodeURIComponent(element));
  }
  return list.join("&");
}

//lt8s9sef6z@montokop.pw
//get balance request
// Device[udid]": fb117353049649064
// API_KEY: viki
// API_SECRET: coin
// Device[change]: 20191002_2
// fbToken: 74d9259efddbe83d4b5e
// locale: en
// Device[os]: WebGL
// Client[version]: 3.5.27
// extended: true
// config: all
// segmented: true
