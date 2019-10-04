require("dotenv").config();
const qs = require("querystring");
const config = require("./config");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
var colors = require("colors");
const axiosRetry = require('axios-retry');

const excludedAttack = [
  "rof4__cjzn7tig40149hdli9tzz8f7g",
  "rof4__cjzgkbk3s02cib3k76fci3yw6"
];
// axiosRetry(axios, {
//   retries: 3
// })
axios.interceptors.response.use(null, error => {
  if (error.config && error.response && error.response.status === 502) {
    console.log("axios retry due to 502 response");
    console.log("config", error.config)
    return axios.request(error.config);
  }

  return Promise.reject(error);
});

class CoinMaster {
  constructor(options) {
    this.options = options || {};
    this.userId = process.env.USER_ID;
    this.axiosConfig = {

      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    };
  }
  async getFriend(friendId) {
    //console.log("********************Spins*******************".green);
    const info = await this.post(`friends/${friendId}`);
    info.village = {
      ...info
    };
    console.log(`FRIEND: ${friendId}`, info);
    return info;
  }
  async getAllMessages(friendId) {
    //console.log("********************Spins*******************".green);
    const info = await this.post(`all_messages`);
    console.log(`All Message:`, info.messages);
    return info;
  }

  async post(url, data, retry) {
    if (url.indexOf("http") === -1) {
      url = `https://vik-game.moonactive.net/api/v1/users/${this.userId}/${url}`;
    }
    data = data || {};
    retry = retry || 0;
    const formData = {
      ...this.options,
      ...data
    };
    try {
      console.log(colors.dim(`#${retry+1} Request Url : ${url}`));
      const response = await axios.post(
        url,
        qs.stringify(formData),
        this.axiosConfig
      );
      const info = response.data;
      return info;
    } catch (err) {
      // console.log("");
      // if (retry < 3) {
      // return this.post(url, data, retry + 1);
      //}
    }
    return null;
  }
  async spin() {
    console.log("********************Spins*******************".green);

    const response = await this.post("spin", {
      seq: this.seq + 1,
      auto_spin: "False",
      bet: process.env.BET || 1
    });

    const {
      pay,
      r1,
      r2,
      r3,
      seq,
      coins,
      spins
    } = response;
    this.updateSeq(seq);
    console.log(
      colors.gray(
        `SPIN: ${r1} ${r2} ${r3} - pay ${pay}, coins : ${coins}, spins : ${spins}`
      )
    );
    return response;
  }
  async readSyncMessage() {
    return await this.post(`read_sys_messages`);
  }
  async popBallon(index) {
    return await this.post(`balloons/${index}/pop`);
  }
  // apart of handle messages list
  async collectRewards(rewardType) {
    rewardType = rewardType || "GENERIC_ACCUMULATION_REWARD";
    const url = `rewards/rewardType/collect`;
    const data = await this.post(url);
    return data;
  }
  async getBalance() {
    console.log("get balance");

    const response = await this.post("balance", {
      extended: "true",
      config: "all",
      segmented: "true"
    });
    this.updateSeq(response.seq);
    const {
      coins,
      spins,
      name
    } = response;
    console.log(`Hello ${name}, You have ${spins} spins and ${coins} coins`);
    fs.writeJsonSync(path.join(__dirname, "data", "balance.json"), response, {
      spaces: 4
    });
    return response;
  }
  updateSeq(sed) {
    // console.log("SEQ", sed);
    this.seq = sed;
  }
  async sleep(ts) {
    return new Promise(resolve => setTimeout(resolve, ts));
  }
  async play() {
    let res = await this.getBalance();
    res = await this.collectGift(res);
    res = await this.getBalance();
    res = await this.fixBuilding(res);
    res = await this.upgrade(res);
    var spinCount = 0;
    let spins = res.spins;
    while (spins > 0) {
      await this.sleep(1000);
      let spinResult = await this.spin();
      const {
        pay,
        r1,
        r2,
        r3,
        seq
      } = spinResult;
      const result = `${r1}${r2}${r3}`;
      switch (result) {
        case "333":
          console.log("Hammer Attack");
          spinResult = await this.hammerAttach(spinResult);
          break;
        case "111":
          console.log("Piggy Raid....");
          spinResult = await this.raid(spinResult);
          break;
      }
      //collect rewards
      //const accumulation = spinResult.accumulation;
      // if (
      //   accumulation &&
      //   accumulation.currentAmount === accumulation.totalAmount
      // ) {
      //   //collect requard
      //   console.log("Collect rewards");
      //   await this.collectRewards();
      //   return await this.readSyncMessage();
      // }
      spinResult = await this.handleMessage(spinResult);
      spins = spinResult.spins;

      if (++spinCount % 10 === 0) {
        await this.upgrade(spinResult);
      }
    }
    console.log("No more spins, no more fun, good bye!".yellow);
  }
  async handleMessage(spinResult) {
    const {
      messages
    } = spinResult;
    if (!messages) return spinResult;

    //   "messages": [
    //     {
    //         "t": 1570163726965,
    //         "a": 112,
    //         "data": {
    //             "reward": {
    //                 "coins": 15000000
    //             },
    //             "rewardId": "GENERIC_ACCUMULATION_REWARD",
    //             "reason": "accumulation",
    //             "status": "PENDING_COLLECT",
    //             "collectUrl": "/api/v1/users/rof4__cjzgkbk3s02cib3k76fci3yw6/rewards/GENERIC_ACCUMULATION_REWARD/collect"
    //         }
    //     }
    // ],

    for (const message of messages) {
      const {
        data
      } = message;
      if (data && data.status === "PENDING_COLLECT" && data.collectUrl) {
        console.log("Collect rewards ", data.rewardId, data.reason);
        spinResult = await this.post(
          "https://vik-game.moonactive.net" + data.collectUrl
        );
      } else {
        const type = message.a;
        // 3 -attack
        if (!message.data || Object.keys(message.data).length == 0) continue;
        console.log(" Attention : UNHANDLED MESSAGE", message);
      }
    }
    return spinResult;
  }
  async raid(spinResult, retry) {
    await this.readSyncMessage();
    retry = retry || 0;
    console.log("************** RAID **************".magenta);
    console.log("raid", spinResult.raid);
    const originalCoins = spinResult.coins;
    //await this.sleep(3000);
    // raid {
    //     name: 'Lork',
    //     id: '222222',
    //     image: '3',
    //     coins: 348000,
    //     raid_target: 'nf'
    //   }
    let response = null;
    const list = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
    for (var i = 0; i < 3; i++) {
      await this.sleep(1000);
      const slotIndex = list[i];
      console.log("selected slotIndex", slotIndex);

      response = await this.post(`raid/dig/${slotIndex}`);
      //this.updateSeq(response.data.seq)
      const {
        res,
        pay,
        coins,
        chest
      } = response;
      if (chest) {
        console.log(`You found ${chest.type}:`, chest);
      }
      fs.writeJsonSync(
        path.join(__dirname, "data", `raid_${slotIndex}.json`),
        response, {
          spaces: 4
        }
      );

      console.log(
        `Raid : index ${slotIndex},  result: ${res} - Pay ${pay} => coins : ${coins}`
      );

      // response = await this.getBalance();
    }
    const afterRaidCoins = response.coins;
    if (afterRaidCoins === originalCoins && retry < 2) {
      response = await this.getBalance();
      console.log("Retry raid: ", retry + 1);
      return this.raid(response, retry + 1);
    }
    return response;
  }
  async collectGift(spinResult) {
    console.log("Collect gift");

    const response = await this.post("inbox/pending");
    const {
      messages
    } = response;
    if (messages && messages.length > 0) {
      console.log("Your have gifts", messages);

      for (const message of messages) {
        if (message.type !== "gift") continue;
        console.log("Collect gift", message);
        try {
          await this.post(`inbox/pending/${message.id}/collect`);
        } catch (err) {
          console.log("Error to collect gift", err.response || "Unknow");
        }
      }
    } else {
      console.log("No gift pending");
    }
  }
  async hammerAttach(spinResult) {
    console.log("Hammer Attack:");
    //console.log("attack", spinResult.attack);
    let desireTarget = spinResult.attack;

    if (
      desireTarget.village.shields > 0 ||
      excludedAttack.some(x => x === desireTarget.id)
    ) {
      desireTarget = spinResult.random;
    }
    if (!desireTarget) {
      console.error("No target to attack, something went wrong, exited");
      throw new Error("Bad process");
    }
    const attackPriorities = ["Ship", "Statue", "Crop", "Farm", "House"];

    fs.writeJsonSync(path.join(__dirname, "data", "attack.json"), spinResult, {
      spaces: 4
    });
    //   attack {
    //     id: '11111111',
    //     image: 'm:174896585403061',
    //     name: 'Anna',
    //     village: {
    //       shields: 1,
    //       village: 1,
    //       Ship: 2,
    //       Farm: 11,
    //       Crop: 1,
    //       Statue: 13,
    //       House: 4
    //     }
    //   }
    const targetId = desireTarget.id;

    const village = desireTarget.village;
    if (village.shields > 0) {
      console.log("Attach target has shield");
    }

    console.log(`Attacking `, desireTarget);
    for (const item of attackPriorities) {
      if (!village[item] || village[item] === 0) continue;
      console.log(
        `Attacking ${desireTarget.name} , item = ${item}, state = ${village[item]}`
      );
      var options = {
        method: "POST",
        url: `targets/${targetId}/attack/structures/House`,

        form: {
          ...this.options,
          state: village[item],
          item
        }
      };
      const response = await this.post(
        `targets/${targetId}/attack/structures/House`, {
          state: village[item],
          item
        }
      );
      //this.updateSeq(response.data.seq)
      const {
        res,
        pay,
        coins
      } = response;
      console.log(`Attack Result : ${res} - Pay ${pay} => coins : ${coins}`);
      return response;
    }
  }
  async fixBuilding(spinResult) {
    console.log("Fix damage building if any".red);
    const priority = ["Farm", "House", "Ship", "Statue", "Crop"];
    let response = spinResult;
    for (const item of priority) {
      if (spinResult[item] && spinResult[item] > 6) {
        response = await this.post("upgrade", {
          item,
          state: response[item]
        });
        const data = response;
        console.log(`Fix Result`.green, {
          Farm: data.Farm,
          House: data.House,
          Ship: data.Ship,
          Statue: data.Statue,
          Crop: data.Crop
        });
      }
    }
    return response;
  }
  async upgrade(spinResult) {
    console.log("upgrade task");
    const priority = ["Farm", "House", "Ship", "Statue", "Crop"];
    let {
      Farm,
      House,
      Ship,
      Statue,
      Crop
    } = spinResult;
    for (const item of priority) {
      console.log("before upgrade", {
        Farm,
        House,
        Ship,
        Statue,
        Crop
      });
      console.log(`Upgrade item = ${item} state = ${spinResult[item]}`);

      spinResult = await this.post("upgrade", {
        item,
        state: spinResult[item]
      });
      //this.updateSeq(response.data.seq)
      const data = spinResult;
      console.log(`upgrade Result`, {
        Farm: data.Farm,
        House: data.House,
        Ship: data.Ship,
        Statue: data.Statue,
        Crop: data.Crop
      });
    }
    return spinResult;
  }
}

(async () => {
  var cm = new CoinMaster(config);
  //console.log("ello");
  //console.log(process.env);
  const balance = await cm.play();
  //console.log(balance);
})();