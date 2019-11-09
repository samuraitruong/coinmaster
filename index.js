const CoinMaster = require("./coinmaster");
const fs = require("fs");
const csv = require("csv-parser");
const accountFile = ".account.csv";
var myArgs = process.argv.slice(2);
console.log('myArgs: ', myArgs);

(async () => {
  if (fs.existsSync(accountFile) && myArgs.length>0 ) {
    const accounts = []

    fs.createReadStream(accountFile)
      .pipe(csv())
      .on('data', (data) => accounts.push(data))
      .on('end', async () => {
        console.log(accounts);
        var index = myArgs[0] || "-1";
        for (const account of accounts.filter(x =>x.ID === index || index =="all")) {
          try {
            if(account.EMAIL[0] === "#" && isNaN(index) ) continue;
            console.log("PLAY AS: ", account.EMAIL)
            var cm = new CoinMaster({
              userId: account.USER_ID,
              fbToken: account.FB_TOKEN,
              deviceId: account.DEVICE_ID,
            });
            const balance = await cm.play();
          } catch (err) {
            console.error(err)
          }
        }
      });

    console.log("Multiple play use accout file");
  } else {
    var cm = new CoinMaster({});
    //const friend = await cm.getFriend("A_cj7ui7x6m00imtms1r9sxw8b0");
    // console.log("friends", friend);
    const balance = await cm.play();
  }
})();