const CoinMaster = require("./coinmaster");
const config = require("./config");
(async () => {
    var cm = new CoinMaster({});
    //console.log("ello");
    //console.log(process.env);
    const balance = await cm.play();
    //console.log(balance);
  })();