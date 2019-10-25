const CoinMaster = require("./coinmaster");
(async () => {
    var cm = new CoinMaster({});
    const balance = await cm.play();
  })();