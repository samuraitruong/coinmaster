const CoinMaster = require("./coinmaster");
(async () => {
    var cm = new CoinMaster({});
    //const friend = await cm.getFriend("A_cj7ui7x6m00imtms1r9sxw8b0");
    // console.log("friends", friend);
    const balance = await cm.play();
  })();