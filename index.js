const CoinMaster = require("./coinmaster");
const portfinder = require('portfinder');

const fs = require("fs");
const csv = require("csv-parser");
const accountFile = ".account.csv";
var myArgs = process.argv.slice(2);
let accounts = [];
(async () => {
  const server = require('http').createServer();
  const io = require('socket.io')(server);
  if(!fs.existsSync("data")){
    fs.mkdirSync("data");
  }
  io.on('connection', client => {
    client.on('connected', data => {
      io.emit("connected", true)
    });
    client.on('disconnect', () => {
      /* … */
    });
    client.emit("accounts", accounts);
    client.emit("connected", true)
  });
  portfinder.getPortPromise({
    port: 3001,
    stopPort: 3099
  }).then(port => {

    console.log("start socket server at port ", port)
    server.listen(port);
  }).catch(err => {
    console.log("No port available for start up socker server".red);
    console.log(err)
  })

  if (fs.existsSync(accountFile) && myArgs.length > 0) {
    accounts = []

    fs.createReadStream(accountFile)
      .pipe(csv())
      .on('data', (data) => accounts.push(data))
      .on('end', async () => {
        console.log(accounts);
        var index = myArgs[0] || "-1";
        for (const account of accounts.filter(x => x.ID === index || index == "all")) {
          try {
            if (account.EMAIL[0] === "#" && isNaN(index)) continue;
            console.log("PLAY AS: ", account)
            var cm = new CoinMaster({
              // sycnTarget: account.SYNC_TARGET,
              userId: account.USER_ID,
              fbToken: account.FB_TOKEN,
              deviceId: account.DEVICE_ID,
              onData: (d) => {
                io.emit(d);
              }
            });

            const balance = await cm.play()
          } catch (err) {
            console.error(err)
          }
        }
        process.exit(0);
      });

    console.log("Multiple play use account file");
  } else {
    // await new Promise((resolve) => setTimeout(resolve, 15000))
    var cm = new CoinMaster({
      onData: (d) => {
        io.emit(d);
      }
    });
    //const friend = await cm.getFriend("A_cj7ui7x6m00imtms1r9sxw8b0");
    // console.log("friends", friend);

    const balance = await cm.play();
  }
})();