require("dotenv").config();
const qs = require("querystring");
const getConfig = require("./config");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const numeral = require("numeral");
var colors = require("colors");
const axiosRetry = require("axios-retry");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const uuid = require("uuid");
const util = require("./util");
const excludedAttack = [
  "rof4__cjzn7tig40149hdli9tzz8f7g",
  "rof4__cjzgkbk3s02cib3k76fci3yw6",
  "rof4__ck09czjio03i2aulcfp5d1653",
  "rof4__cjzq2ta7s01qgasl87kg5dmro"
];
// axiosRetry(axios, {
//   retries: 3
// })
axios.interceptors.response.use(null, error => {
  if (error.config && error.response && error.response.status === 502) {
    console.log("axios retry due to 502 response");
    console.log("url", error.config.url);
    return axios.request(error.config);
  }

  return Promise.reject(error);
});

class CoinMaster {
  /**
   *
   * @param {*} options
   * @example
   * {
   *  dumpResponseToFile: true,
   *  userId: "xxx",
   *  fbToken: "xxx",
   *  deviceId: "deviceId"
   *  onData : function(resonse) {},
   *  upgradeInterval : 10
   * }
   */
  constructor(options) {
    this.authToken = process.env.AUTH_TOKEN;
    this.syncTarget = options.syncTarget || process.env.SYNC_TARGET || null;
    this.questLevelLimit = parseInt(process.env.QUEST_LEVEL_LIMIT || "6");
    this.allowUpgrade = false;
    this.allowUpgrade = options.allowUpgrade || process.env.ALLOW_UPGRADE === "true";
    this.enableQuest = process.env.ENABLE_QUEST === "true";
    this.options = options || {};
    this.dumpResponseToFile = options.dumpResponseToFile || true;
    this.lastNoCoinIndex = -1;
    this.userId = options.userId || process.env.USER_ID;
    this.fbToken = options.fbToken || process.env.FB_TOKEN;
    this.sleep = options.sleep || process.env.SLEEP;
    this.verbose = options.verbose || process.env.VERBOSE === "true";
    this.bet = options.bet || process.env.BET || 1;
    this.fbUserToken = options.fbUserToken || process.env.FB_USER_TOKEN;
    this.numberOfDailyReward = parseInt(process.env.REWARDS_COUNT || "3", 10)
    this.upgradeInterval =
      options.upgradeInterval ||
      parseInt(process.env.UPGRADE_INTERVAL || "10", 10);
    this.enableTracking =
      options.enableTracking || process.env.TRACKING_EVENT === true;
    this.deviceId = options.deviceId || process.env.DEVICE_ID;
    this.deviceChange = options.deviceChange || process.env.DEVICE_CHANGE;
    this.config = getConfig(this.deviceId, this.deviceChange, this.fbToken);
    this.attackPrefer = options.attackPrefer || process.env.ATTACK_PREFER;
    this.attackTarget = options.attackTarget || process.env.ATTACK_TARGET || "";
    this.attackRaidGap = options.attackRaidGap || parseInt(process.env.ATTACK_RAID_GAP || "5", 10),
      this.onData = options.onData || function () {};
    this.spinCountFromAttack = 0;
    this.spinCountFromRaid = 0;
    this.priorityUpgrade = options.priorityUpgrade || process.env.PRIORITY_UPGRADE;
    this.enemyId = options.enemyId || process.env.ENEMY_ID;
    this.raidBetSwitch =
      this.options.raidBetSwitch ||
      parseInt(process.env.RAID_BET_SWITCH || "30", 10);
    this.attackBetSwitch =
      this.options.attackBetSwitch ||
      parseInt(process.env.ATTACK_BET_SWITCH || "16", 10);
    this.autoBet =
      this.options.autoBet || process.env.AUTO_BET === "true" || true;
    this.maxAutoBet = this.config.maxAutoBet || parseInt(process.env.MAX_AUTO_BET || "3", 10);
    this.raidBetMinLimit =
      this.options.raidBetMinLimit ||
      parseInt(process.env.RAID_BET_MIN_LIMIT || "25000000", 10);
    this.attackCountFromRaid = 0;
    this.shieldCountFromAttack = 0;
    console.log("Auto switcher at", this.raidBetSwitch, this.attackBetSwitch);
    console.log("Enemy target", this.attackTarget);
    this.axiosConfig = {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "authorization": "Bearer " + this.authToken,
        "x-client-version": "3.5.165",
        "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.163 Safari/537.36",
        "x-platform": "WebGL"
      }
    };
    fs.mkdirSync(path.join(__dirname, "data", this.userId), {recursive : true});
    this.dataFile = path.join(__dirname, "data", this.userId,  "spin.csv");
    this.spinResult = null;
    this.rewardLogFile = path.join(__dirname, "data", this.userId, "rewards.json");
    this.upgradeCost = {};
    if(fs.existsSync(this.rewardLogFile)){
      this.rewards = JSON.parse(fs.readFileSync(this.rewardLogFile, "utf8"));
    }
    console.log("USER:", this.userId, this.authToken);
  }
  async syncCardToAllFriends(){
    const {friends } = await this.post("friends");
    this.friends = friends;
    for (const f of friends) {
      console.log("Share card to friend", f.name);
      await this.syncCard(f.mid);
    }
  }
  async syncCard(to,ignoreDuplicate) {

    if (!to || to === this.userId || to ==='rof4__ck0vls1jl0122lhlbf8uihclr')  {
      console.log("NO SYNC_TARGET set, ignore syncing process".yellow)
      return;
    }
    //read the desk 
    const existingFilename = `data/${to}/sets.json`;
    if(!fs.existsSync(existingFilename)) {
      console.log("IGNORE - do not send card to unmanaged friend".yellow, to);
      return;
    }
    const existing = JSON.parse(fs.readFileSync(existingFilename, "utf8"));
    const toDecks = existing.decks;
    if (!this.cardCollection) {
      return;
    }
    const decks = this.cardCollection.decks;
    let cardToSends = [];
    for (const deck in decks) {
      if (decks.hasOwnProperty(deck)) {
        const items = decks[deck].cards;
        for (const card of items) {
          if (card.count > 1 && card.swappable && (ignoreDuplicate || !toDecks[deck] || toDecks[deck].cards.filter(x => x.name == card.name) === 0)) {
            cardToSends.push(card.name);
            if (cardToSends.length === 5) {
              const result = await this.sendCard(to, cardToSends);
              if(!result) {
                return;
              }
              cardToSends = [];
            }
          }
        }
      }
    }
    if (cardToSends.length > 0) {
      await this.sendCard(to, cardToSends);
    }
  }
  
  async sendGifts(){

    const {friends} = await this.post("friends");
    const data = {
      // to: friend.mid,
      reward: "spins",
      collect_all: "spins",
      request_id: uuid.v4()
    };
    friends.forEach((friend, index) => {
      data[`to[${index}]`] = friend.mid;

    })
      const res = await this.post("gifts/send", data);
      if(res) {
        console.log(`GIFT - Successful send spin to all friends `.green)
      }
    }
  
  async sendCard(to, cards) {
    console.log("Sending card ", to, cards);
    await this.waitFor(1000);
    const request = {
      to,
      request_id: uuid.v4(),
    };
    for (let i = 0; i < cards.length; i++) {
      request[`cards[${i}]`] = cards[i]
    }
    const results = await this.post("cards/send", request)
    if(results){
    this.cardCollection = results;
    }
  }
  async readHistoryData() {
    return new Promise(resolve => {
      if (!fs.existsSync(this.dataFile)) {
        fs.writeFileSync(this.dataFile, "r1,r2,r3,type\n");
      }
      const data = [];
      fs.createReadStream(this.dataFile)
        .pipe(csv())
        .on("data", row => {
          data.push(row);
        })
        .on("end", () => {
          resolve(data);
        });
    });
  }
  async updateHistoryData(r1, r2, r3, type, spinCount) {
    if (!this.csvStream) {
      this.csvStream = fs.createWriteStream(this.dataFile, {
        flags: "a"
      });
    }
    this.csvStream.write(`${r1},${r2},${r3},${type},${spinCount}\n`);
  }
  dumpFile(name, response) {
    name = name || "response";
    const dir = path.join(__dirname, "data",this.userId);
    // console.log("dir", dir)
    if (this.dumpResponseToFile) {
      fs.mkdirSync(dir , {recursive: true});
      fs.writeJsonSync(path.join(dir, name+".json"), response, {
        spaces: 4
      });
    }
  }
  async getFriend(friendId) {
    const info = await this.post(`friends/${friendId}`);
    info.id = friendId;
    info.village = {
      ...info
    };
    // console.log(`FRIEND: ${friendId}`, info.name);
    return info;
  }
  async fetchMetadata() {
    const response = await axios.get(
      "https://static.moonactive.net/data/vikings/production-3_5_fbweb_Pool-all.json"
    );
    // console.log("metadata", response.data.data.profile);
    this.profile = response.data.data.profile;
    this.config["Device[change]"] = response.data.data.profile.change_purpose;
    // console.log("config", this.config);
    // throw new Error("tata");
  }
  async startQuestMode() {
    const response = await this.post('rewards/VQ_ENTRY_REWARD/collect');
    console.log("startQuestMode", response);
  }
  async playQuest() {
    if (!this.enableQuest) return;
    const questCoins = this.vikingQuestBetOptions || [12500, 400000, 550000, 1250000, 3000000, 6500000]; //3000000
    let response = await this.getBalance(true);
    if (response && ( response.active_events && !response.active_events.viking_quest) || !response.active_events) {
      console.log("No Viking quest event, skip play quest".yellow);
      return response;
    }
    const allowUpgrade = this.allowUpgrade;
    this.allowUpgrade = false;
    let questLevel = 0;

    console.log("Quest coins to play: ", response.coins)
    let coins = response.coins;
    const refill = async () => {
      if (coins < questCoins[questLevel]) {
        console.log("Do quick spin to  get  more  money for quest  20 spin or 10m")
        const quickSpin = await this.doQuickSpin(20, 10000000);
        if (quickSpin) {
          coins = quickSpin.coins;
        }
      }
    }
    console.log(questCoins, questLevel)
    await refill();
    while (coins > questCoins[questLevel]) {

      if (this.currentQuestLevel > this.questLevelLimit) {
        console.log("Quest level limit reached. exiting", this.questLevelLimit, this.currentQuestLevel);
        return;
      }

      const data = {
        requestId: uuid.v4(),
        coins: questCoins[questLevel]
      };
      // console.log("Vikings quest: ", {
      //   questLevel,
      //   bet: questCoins[questLevel]
      // })
      response = await this.post("vquest/spin", data);
      if (response) {
        this.dumpFile("vikingquest", response);
        coins = response.coins;
        const vk = response.viking_quest;
        const wheelResult = vk.reels.join(" ");
        const outMessage = `QUEST ${wheelResult}: lv${vk.qn} ${vk.qd} \tBet: ${questCoins[questLevel]} \tPay: ${this.numberFormat(vk.p)} \t\tCoins: ${this.numberFormat(coins)}  \t Complete: ${vk.qcx}%`;
        console.log(vk.p > questCoins[questLevel] ? outMessage.magenta : outMessage.green)
        await this.handleMessage(response);
        this.currentQuestLevel = vk.qn;

      } else {
        questLevel++;
        console.log("Error when doing viking quest spin, please check".red)
      }
      await refill();
    }
    this.allowUpgrade = allowUpgrade;
    console.log("End vikings, out of money or reach target");
  }
  async getAllMessages() {
    //console.log("********************Spins*******************".green);
    const info = await this.post(`all_messages`);
    await this.handleMessage(info);
    //console.log(`All Message:`, info.messages.length);
    return info;
  }
  async dailySpin() {
    const result = await this.post("dailybonus/collect", {
      segmented: true,
      extra: false
    });
    console.log("Daily spin : ", result.reward);
  }
  async post(url, data, retry) {
    if (url.indexOf("http") === -1) {
      url = `https://vik-game.moonactive.net/api/v1/users/${this.userId}/${url}`;
    }
    data = data || {};
    retry = retry || 0;
    const formData = {
      ...this.config,
      ...data
    };
    try {
      if (this.verbose) {
        console.log(colors.dim(`#${retry + 1} Request Url : ${url}`), data);
        console.log("Form data", qs.stringify(formData));
      }

      const response = await axios.post(
        url,
        qs.stringify(formData),
        this.axiosConfig
      );
      const info = response.data;

      return info;
    } catch (err) {
      console.log("Error".red, err.response.status, err.response.statusText, url);
      console.log(err.response.data)
      // if (retry < 3) {
      // return this.post(url, data, retry + 1);
      //}
    }
    return null;
  }
  async getDailyFreeRewards() {
    const sss =
      await this.post("https://vik-game.moonactive.net/external/facebook/CoinMaster_3.5.162_prod_2591/connect?minScreenSize=1300&pid=FB_PAGE&c=%28_%29VKpenjlwl00SkioYg0ZC6zw_382EWrI3LoCnT7qirDQ&campaign=%28_%29VKpenjlwl00SkioYg0ZC6zw_382EWrI3LoCnT7qirDQ&af_deeplink=true");
    console.log(sss);
    const campaign = "(_)VKpenjlwl00SkioYg0ZC6zw_382EWrI3LoCnT7qirDQ";
    const response = await this.post(`campaigns/${campaign}/click`);
    console.log(response);
  }
  numberFormat(num, digit) {
    digit = digit || 2;
    switch(digit) {
      case 1:
          return numeral(num).format("$(0.0a)");
      case 2: return numeral(num).format("$(0.00a)");
      case 3: return numeral(num).format("$(0.000a)");
    }
    return numeral(num).format("$(0.00a)")

  }
  async spin(lastRespponse) {
    const remainSpins = lastRespponse.spins;
    this.spinCountFromAttack++;
    this.spinCountFromRaid++;
    let bet = this.bet || 1;
    if (
      this.autoBet &&
      ((this.spinCountFromAttack >= this.attackBetSwitch && this.spinCountFromAttack % this.attackBetSwitch <= 5) ||
        (this.spinCountFromAttack >= 21 && this.spinCountFromAttack <= 23) ||
        (lastRespponse.raid &&
          lastRespponse.raid.coins > this.raidBetMinLimit &&
          (this.spinCountFromRaid >= this.raidBetSwitch ||
            (this.attackCountFromRaid >= 3 && this.spinCountFromAttack >= this.attackRaidGap) ||
            this.spinCountFromRaid > 60)))
    ) {
      //find the max valid bet
      const superBet = lastRespponse.superBet;
      let validBet = 3;
      if (superBet && superBet.betOptions) {
        const validBets = superBet.betOptions.filter(x => x <= this.maxAutoBet);
        if (validBets.length > 0) {
          validBet = validBets[validBets.length - 1];
        }
      }
      bet = Math.min(validBet, remainSpins);
    }
    let response = await this.post("spin", {
      seq: this.seq + 1,
      auto_spin: "True",
      bet
    });
    if (!response) {
      response = this.getBalance(true);
    }
    let extraInfo = "";

    const {
      pay,
      r1,
      r2,
      r3,
      seq,
      coins,
      spins,
      shields,
      raid = {},
      accumulation,
      attackRaidMaster
    } = response;
    if (accumulation) {
      let reward = accumulation.reward;
      if (reward.coins) {
        reward.coins = numeral(reward.coins).format("$(0.0a)")
      }
      extraInfo = `Rewards: ${JSON.stringify(reward)}, progress: ${accumulation.currentAmount}/${accumulation.totalAmount}`.magenta
    }

    if (attackRaidMaster) {
      let reward = attackRaidMaster.reward;
      if (reward.coins) {
        reward.coins = numeral(reward.coins).format("$(0.0a)")
      }
      extraInfo = `Rewards: ${JSON.stringify(reward)}, progress: ${attackRaidMaster.counter}/${attackRaidMaster.required}`.magenta
    }

    this.updateSeq(seq);
    console.log(
      colors.green(
        `SPIN: ${r1} ${r2} ${r3} - Bet: X${bet} Pay ${pay}, Coins : ${numeral(
          coins
        ).format(
          "$(0.000a)"
        )}, Shields: ${shields}, Spins : ${spins} \t| Raid :${
          raid.name
        }(${numeral(raid.coins).format("$(0.000a)")}) H: ${
          this.spinCountFromAttack
        }  R: ${this.spinCountFromRaid} Attack Count: ${this.attackCountFromRaid} | ${extraInfo}`
      )
    );
    this.dumpFile("spin", response);
    return response;
  }
  async readSyncMessage(t) {
    this.track = this.track || {};
    if (this.track[t]) return;
    const data = {};
    data[t] = "delete";
    console.log("Read sync message", data);
    this.track[t] = true;

    return await this.post(`read_sys_messages`, data);
  }
  async popBallon(index, currentSpins) {
    // console.log("Popping baloon", index);
    const result = await this.post(`balloons/${index}/pop`);
    const {
      pay,
      coins,
      spins
    } = result;
    console.log(
      `Pop ballop result :  pay ${pay ||
        0}, coins : ${coins}, spins : ${spins} +${spins - currentSpins}`.red
    );
    return result;
  }
  async handleTriplePromotion(extended) {
    if (!extended || !extended.activeTriplePromotions) {
      return;
    }
    // console.log("activeTriplePromotions", extended.activeTriplePromotions);
    for (const promotion of extended.activeTriplePromotions) {
      const {
        offers
      } = promotion;
      let index = 1;
      for (const offer of offers) {
        if (offer.status === "READY_TO_PURCHASE" && (offer.productDetails.price === 0 || offer.currency === "COINS")) {
          console.log("Purchasing offer", offer);
          const res = await this.post(`triple-promotion/${promotion.id}/purchase`, {
            "Purchase[item_code]": offer.sku,
            "Purchase[offer_index]": index
          });
          if (res) {
            const {
              coins,
              spins
            } = res
            console.log("Purchased result", {
              coin: this.numberFormat(coins),
              spins
            })
          }
        }
        index++;
      }
    }
  }
  // apart of handle messages list
  async collectRewards(rewardType) {
    rewardType = rewardType || "GENERIC_ACCUMULATION_REWARD";
    const url = `rewards/rewardType/collect`;
    const data = await this.post(url);
    return data;
  }
  async getBalance(silient) {
    const response = await this.post("balance", {
      extended: "true",
      config: "all",
      segmented: "true"
    });
    this.updateSeq(response.seq);
    const {
      coins,
      spins,
      name,
      shields,
      extended
    } = response;
    await this.handleTriplePromotion(extended);
    if (!silient) {
      if (extended && extended.activeEvents && extended.activeEvents.viking_quest) {
        this.vikingQuestBetOptions = extended.activeEvents.viking_quest.options.bet_coins;
        this.currentQuestLevel = extended.activeEvents.viking_quest.options.qn;
      }
      console.log(
        `BALANCE: Hello ${name}, You have ${spins} spins and ${numeral(
          coins
        ).format("$(0.000a)")} coins ${shields} shields`
      );
    }
    this.dumpFile("balance", response);
    this.onData(response);

    return response;
  }
  async feedFox(res) {

    /*selectedPet: {type: "fox", xp: 7789, paused: false, level: 27, messages: [], ttl: 899961, nextXp: 100000,…}
    currentStealPercent: 61
    level: 27
    messages: []
    nextStealPercent: 62
    nextXp: 100000
    paused: false
    scoreBonus: 40
    ttl: 899961
    type: "fox"
    xp: 7789

    https://vik-game.moonactive.net/api/v1/users/rof4__cjzgkbk3s02cib3k76fci3yw6/pets/selected/feed

    ttl: 14400000
// request_id: 80a17e33-74d0-4fdc-9f17-bd4b8c895ab9

*/

    const {
      selectedPet
    } = res;
    if (selectedPet) {
      console.log("Your pet", selectedPet);
    }
    console.log("Feed the fox with free snack");

    res = await this.post("pets/fox/daily-mini-snack");
    if (res) {
      console.log("Your pet after feed", res.selectedPet);
    }
    this.usedFreeSnack = true;
  }
  updateSeq(sed) {
    // console.log("SEQ", sed);
    this.seq = sed;
  }
  async getSet() {
    const sets = await this.post("sets");
    if(!sets) return;
    this.cardCollection = sets;
    this.onData({
      cards: this.cardCollection
    });
    this.dumpFile(`sets`, this.cardCollection);
    const {
      decks
    } = this.cardCollection;
    if (decks) {
      for (const key in decks) {
        if (decks.hasOwnProperty(key)) {
          const item = decks[key];
          const h = item.cards.reduce((a, b) => {
            a[b.name] = b;
            return a
          }, {});
          let cards = "";
          for (let i = 1; i <= 9; i++) {
            const name = key + "_" + i;
            const c = h[name];
            let cardText = `[${name}]`;
            if (c) {
              cardText += "x" + c.count;
              switch (c.rarity) {
                case 1:
                  cardText = cardText.cyan;
                  break;
                case 2:
                  cardText = cardText.white;
                  break;
                case 3:
                  cardText = cardText.green;
                  break;
                case 4:
                  cardText = cardText.brightRed;
                  break;
                case 5:
                  cardText = cardText.brightYellow;
              }
            } else {
              cardText = cardText.grey;
            }
            cards += cardText + "  ";
          }
          let logMessage = `CARD - ${key.rainbow} ${cards} `;
          if (item.cards.length === 9) {
            logMessage += " Completed".brightMagenta;
            logMessage = logMessage;
          }
          console.log(logMessage);

        }
      }
    }
  }
  async waitFor(ts) {
    return new Promise(resolve => setTimeout(resolve, ts));
  }
  async update_fb_data() {
    console.log("update fb user data", this.fbUserToken);
    if (this.fbUserToken) {
      const response = await this.post("update_fb_data", {
        "User[fb_token]": this.fbUserToken,
        p: "fb",
        fbToken: null
      });
      this.fbUser = response;
      console.log("user data", response);
    }
  }
  async claimTodayRewardsV1() {
    const {
      data //https://raw.githubusercontent.com/samuraitruong/cm-spin/master/public/data.json
    } = await axios.get("https://raw.githubusercontent.com/samuraitruong/cm-spin/master/public/freespinandcoin.blogspot.com.json");
    for (const item of data) {
      await this.claimReward(item.code);
    }
  }
  async claimTodayRewards() {
    try {
      const {
        data
      } = await axios.get("https://cm-spin.herokuapp.com/");
      const ids = []
      for (let i = 0; i < Math.min(this.numberOfDailyReward, data.length); i++) {
        try {
          let query = qs.parse(data[i].url.split('?')[1], "&", "=");
          if (query.c) {
            await this.claimReward(query.c);
          } else {
            const htmlResposne = await axios.get(data[i].url);
            //for (var x in htmlResposne.request) console.log(x);
            query = qs.parse(htmlResposne.request.path.split('?')[1], "&", "=");
            if (query.c) {
              await this.claimReward(query.c);
            }
            if (htmlResposne.request.path.indexOf("next=") > 0) {
              const code = util.findCodeInQuery(htmlResposne.request.path);
              if (code) {
                await this.claimReward(code);
                continue;
              }
            }
            query = qs.parse(htmlResposne.data.split('?')[1], "&", "=");
            if (query.c) {
              await this.claimReward(query.c);

            }

          }
        } catch (err) {

        }
      }
    } catch (err) {
      console.log("Error claimTodayRewards".red)
    }
  }
  async claimReward(id) {
    this.rewards = this.rewards || {};
    if (!id || this.rewards[id]) {
      return;
    }
    console.log("getting daily reward using code", id);
    const response = await this.post(`campaigns/${id}/click`, {
      source_url: `coinmaster://promotions?af_deeplink=true&campaign=${id}&media_source=FB_PAGE`
    });
    if (response) {
      this.dumpFile("dailyreward", response);
      if(response.messages) {
        const item = response.messages.find(x =>x.data && x.data.reason == "CAMPAIGN_CLICK");
        if(item){
          this.rewards[id] = item.reward;
        }
      }
      await this.handleMessage(response);
    } else {
      this.rewards[id] = {claimed: true};
      console.log("You already collect  this reward or it expired: code = ".yellow + id.red)
    }
    this.dumpFile("rewards", this.rewards);
    return response;
  }
  async login(useToken) {
    let data = {
      seq: 0,
      fbToken: ""
    };
    if (useToken) data.fbToken = this.config.fbToken;

    const res = await this.post(
      "https://vik-game.moonactive.net/api/v1/users/login",
      data
    );
    console.log("Login result", res);
  }
  async doQuickSpin(spinLimit, moneyLimit) {
    let res = await this.getBalance();
    let spins = res.spins;
    let spinCount = 0;
    while (spins >= this.bet) {
      await this.waitFor(this.sleep || 1000);
      let deltaSpins = "";

      res = await this.spin(res);
      spins = res.spins;
      const {
        pay,
        r1,
        r2,
        r3,
        seq
      } = res;
      const result = `${r1}${r2}${r3}`;
      this.histories.push({
        r1,
        r2,
        r3
      });
      let type = "";
      switch (result) {
        case "333":
          type = "attack";
          res = await this.hammerAttach(res);
          deltaSpins = this.spinCountFromAttack.toString();
          this.spinCountFromAttack = 0;
          this.shieldCountFromAttack = 0;
          this.attackCountFromRaid++;
          break;
        case "444":
          type = "raid"
          console.log("Piggy Raid....", r1, r2, r3);
          deltaSpins = this.spinCountFromRaid.toString();
          this.spinCountFromRaid = 0;
          this.attackCountFromRaid = 0;
          this.shieldCountFromAttack = 0;
          res = await this.raid(res);
          break;
        case "666":
          type = "spins"
          console.log("get spin rewards", res.spins)
          break;
        case "555":
          this.shieldCountFromAttack++;
          type = "shields"
          console.log("get shield rewards")
          break;


      }
      this.updateHistoryData(r1, r2, r3, type, deltaSpins);

      await this.handleMessage(res);

      if (spinLimit && spinCount > spinLimit) return res;
      if (moneyLimit && res.coins > moneyLimit) return res;
    }
    return res;

  }
  async play(recursive) {
    recursive = recursive || false;
    this.histories = await this.readHistoryData();
    //await this.fetchMetadata();

    //await this.login();
    //await this.update_fb_data();

    let res = await this.getBalance();
    await this.getSet();

    //console.log(res)
    await this.upgradePet(res.selectedPet, res.petXpBank);
    await this.syncCard(this.syncTarget, true);
    //await this.getDailyFreeRewards();
    await this.handleMessage(res);
    const firstResponse = await this.getAllMessages();
    await this.handleMessage(firstResponse);
    await this.getSet();
    console.log("Active Events: ", firstResponse.active_events)
    if (!recursive) {
      //await this.claimTodayRewards();
      await this.claimTodayRewardsV1();
      const firstResponse = await this.getAllMessages();
      await this.handleMessage(firstResponse);
      await this.dailySpin();

    }
    await this.playQuest();
    //process.exit(0);
    res = await this.getBalance();
    let spins = res.spins;
    // res = await this.collectGift(res);
    // res = await this.getBalance();
    res = await this.fixBuilding(res);
    res = await this.upgrade(res);
    var spinCount = 0;
    while (spins >= this.bet) {

      if (spins > 300 && !this.usedFreeSnack) {
        await this.feedFox(res);
      }
      // await this.waitFor(this.sleep || 1000);
      let deltaSpins = "";

      res = await this.spin(res);
      const {
        pay,
        r1,
        r2,
        r3,
        seq
      } = res;
      const result = `${r1}${r2}${r3}`;
      this.histories.push({
        r1,
        r2,
        r3
      });
      let type = "";
      switch (result) {
        case "333":
          type = "attack";
          res = await this.hammerAttach(res);
          deltaSpins = this.spinCountFromAttack.toString();
          this.spinCountFromAttack = 0;
          this.shieldCountFromAttack = 0;
          this.attackCountFromRaid++;
          break;
        case "444":
          type = "raid"
          console.log("Piggy Raid....", r1, r2, r3);
          deltaSpins = this.spinCountFromRaid.toString();
          this.spinCountFromRaid = 0;
          this.attackCountFromRaid = 0;
          this.shieldCountFromAttack = 0;
          res = await this.raid(res);
          break;
        case "666":
          type = "spins"
          console.log("get spin rewards", res.spins)
          break;
        case "555":
          this.shieldCountFromAttack++;
          type = "shields"
          console.log("get shield rewards")
          break;


      }
      this.updateHistoryData(r1, r2, r3, type, deltaSpins);

      const messageResult = await this.handleMessage(res);
      if (messageResult) spins = messageResult.spins;
      if (++spinCount % this.upgradeInterval === 0) {
        await this.upgrade(res);
      }
    }
    console.log("No more spins, no more fun, good bye!".yellow);

    res = await this.collectGift(res);
    if (res.spins > 0) {
      console.log("Recursive play", res.spins)
      await this.play(true);
    }
    if (this.csvStream) {
      this.csvStream.close();
    }
    await this.upgrade(res);
    await this.sendGifts();
    await this.syncCardToAllFriends();

  }
  async upgradePet(selectedPet, petXpBank) {
    if(!selectedPet) return;
    if(selectedPet.level === 0) {
      console.log("-------------------Hatching Pet-----------------", selectedPet)
    const result = await this.post(`pets/${selectedPet.type}/upgrade`, {
      "include[0]": "pets",
      request_id: uuid.v4()
    });
    if(result) {
      console.log("Selected pet:", result.selectedPet);
    }

  }
  else {
    const requireXp = selectedPet.nextXp - selectedPet.xp;
    if(petXpBank ==0) {
      console.log("No XP to upgrade");
      return;
    };
    console.log("Upgrade pet with xp", petXpBank,  selectedPet.nextXp)
    const feedResult = await this.post("pets/selected/feed", {
      petv2: true,
      request_id: uuid.v4(),
      xp: Math.min(requireXp, petXpBank )
    });
    console.log("Upgrade bet result", feedResult.selectedPet, feedResult.petXpBank);
    if(feedResult.petXpBank >0) {
      await this.upgradePet(feedResult.selectedPet, feedResult.petXpBank);
    }
  }
  }
  async handleMessage(spinResult) {
    if (!spinResult) {
      console.log("something wrong handleMessage with null".red);
      return null;
    }
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
    let spins = spinResult.spins;

    for (const message of messages) {
      const {
        data,
        e
      } = message;
      let baloonsCount = 0;
     
      if (data && data.status === "PENDING_COLLECT" && data.collectUrl) {
        if (data.reward && data.reward.coins) {
          data.reward.coins = numeral(data.reward.coins).format("$(0.000a)")
        }
        console.log(
          "######## Collect rewards ####".magenta,
          (data.rewardId || "noid").green,
          data.reason,
          data.reward
        );

        await this.post("https://vik-game.moonactive.net" + data.collectUrl);
        if (data.reward && data.reward.coins && !this.enableQuest) {
          await this.upgrade(spinResult);
        }
      } else if (data && data.foxFound) {
        // acttion to elimited foxFound message
      } else if (e && e.chest) {
         // console.log("You got free chest, collect it", e.chest);
         // await this.post('read_messages', {last: message.t});
         await this.readSyncMessage(message.t);
         continue;
      } else {
        // 3 -attack
        if (
          !message.data ||
          Object.keys(message.data).length == 0 || [
            "attack_master",
            "village_complete_bonus",
            "raid_master",
            "card_swap",
            "accumulation",
            "cards_boom",
            "baloons",
            "tournaments",
            "set_blast",
            "bet_blast",
            "bet_master",
            "viking_quest"
          ].some(x => x === message.data.type)
        ) {
          await this.readSyncMessage(message.t);
          continue;
        }
        console.log("Need Attention: --->UNHANDLED MESSAGE<----", message);
      }
    }
    if (spinResult.balloons) {
      for (const key in spinResult.balloons) {
        if (spinResult.balloons.hasOwnProperty(key)) {
          spins = (await this.popBallon(key, spins)).spins;
        }
      }
    }
    // spinResult = await this.getBalance();
    return spinResult;
  }
  async raid(spinResult, retry) {
    console.log("************** RAID **************".magenta);
    this.dumpFile("raid", spinResult);

    const {
      raid
    } = spinResult;
    let raidVillige = raid.village;
    if (!raidVillige) {
      console.log("Raid response invalid, missing villige".red);
      raidVillige = {};
    }
    const ts = new Date().getTime();
    let time = spinResult.now;
    await this.track({
      event: "raid_start",
      msg: {
        raid_userid: spinResult.raid.id,
        raid_name: raid.name,
        raid_balance: raid.coins.toString(),
        raid_target: raid.target,
        raid_village: raidVillige.village,
        raid_house: raidVillige.House,
        raid_ship: raidVillige.Ship,
        raid_crop: raidVillige.Crop,
        raid_statue: raidVillige.Statue,
        raid_farm: raidVillige.Farm
        //"all_time_raids":"3"
      },
      time
    });
    retry = retry || 0;
    console.log(
      `Raid: ${spinResult.raid.name} Coins:  ${numeral(
        spinResult.raid.coins
      ).format("$(0.000a)")}, target: ${raid.raid_target} `
    );
    const originalCoins = spinResult.coins;

    let response = null;
    const list = [1, 2, 3, 4]
      .sort(() => Math.random() - 0.5)
      .filter(x => x != this.lastNoCoinIndex);
    const raided = [];
    let totalAmount = 0;
    for (var i = 0; i < 3; i++) {
      const slotIndex = list[i];
      response = await this.post(`raid/dig/${slotIndex}`);
      const {
        res,
        pay,
        coins,
        chest
      } = response;
      raided.push(pay);

      totalAmount += pay;
      if (chest) {
        console.log(`You found ${chest.type}:`.green, chest);
      }
      if (!chest && pay === 0) {
        this.lastNoCoinIndex = slotIndex;
      }
      this.dumpFile(`raid_${slotIndex}`, response);

      console.log(
        colors.magenta(
          `Raid : index ${slotIndex},  Raid Result: ${res} - Pay ${pay} => Coins : ${numeral(
            coins
          ).format("$(0.000a)")}`
        )
      );
    }
    response = await this.getBalance(true);

    const afterRaidCoins = response.coins;
    console.log(
      "######### RAID TOTAL AMOUNT ######## ".green,
      colors.red(numeral(afterRaidCoins - originalCoins).format("$(0.000a)"))
    );

    /*if (afterRaidCoins === originalCoins && retry < 1000) {
      response = await this.getBalance();
      console.log("Retry raid: ", retry + 1);
      return this.raid(response, retry + 1);
    }*/
    // raided end, update tracking

    time += new Date().getTime() - ts;
    this.track({
      event: "raid_end",
      msg: {
        dig_1_type: raided[0] > 0 ? "coins" : "no coins",
        dig_1_amount: raided[0].toString(),
        dig_2_type: raided[1] > 0 ? "coins" : "no coins",
        dig_2_amount: raided[1].toString(),
        dig_3_type: raided[2] > 0 ? "coins" : "no coins",
        dig_3_amount: raided[2].toString(),
        duration: new Date().getTime() - ts,
        target_name: spinResult.raid.name,
        attackedPerson: spinResult.raid.id,
        amount_total: parseInt(raided[0], 10) +
          parseInt(raided[1], 10) +
          parseInt(raided[2], 10)
      },
      time
    });
    return response;
  }
  async track(event) {
    if (!this.enableTracking) return;

    console.log("Update tracking data".yellow);
    const deviceInfo = {
      event: "device_info",
      msg: {
        os: "WebGL",
        app_version: "3.5.27",
        model: "",
        brand: "",
        manufacturer: "",
        os_version: "",
        screen_dpi: "",
        screen_height: "1440",
        screen_width: "2560",
        has_telephone: "",
        carrier: "",
        wifi: "",
        device_id: this.config["Device[udid]"],
        fullscreen: "False"
      }
      //i: "1939300993-24"
    };
    const finalEvent = {
      ...event
    };
    finalEvent.msg = {
      ...event.msg,
      device_id: this.config["Device[udid]"],
      user_id: this.userId,
      change_purpose: this.config["Device[change]"],
      ...this.profile
    };

    var data = JSON.stringify(deviceInfo) + "\n" + JSON.stringify(event);
    if (this.verbose) {
      console.log("Tracking event", event);
    }
    const result = await this.post(
      "https://vik-analytics.moonactive.net/vikings/track", {
        data
      }
    );
    console.log("tracking result", result);
  }
  async collectGift(spinResult) {
    console.log("Collect gift");

    let response = await this.post("inbox/pending");
    if(!response) return spinResult;
    const {
      messages
    } = response ;
    let hasCard = false;
    if (messages && messages.length > 0) {
      // console.log("Your have gifts", messages);

      for (const message of messages) {
        if (message.type !== "gift" && message.type != "send_cards") continue;
        console.log("Collect gift", message);
        try {
          hasCard = true;
          response = await this.post(`inbox/pending/${message.id}/collect`);
          //await this.handleMessage(response);
        } catch (err) {
          console.log("Error to collect gift", err.response || "Unknow");
        }
      }
    } else {
      console.log("No gift pending");
    }
    await this.getSet();
    return response;
  }
  isAttackableVillage(userId, user) {
    //console.log("isAttackableVillage", user.id)
    if (!user) return false;
    const village = user.village || user;
    //console.log("going to validate ", village)

    const attackPriorities = ["Ship", "Statue", "Crop", "Farm", "House"];
    if (excludedAttack.some(x => x === userId)) return false;
    for (const item of attackPriorities) {
      if (village[item] && village[item] > 0 && village[item] < 6) return true;
    }
    return false;
  }

  //return the target
  async findRevengeAttack(spinResult) {
    if (this.enemyId) {
      const enemy = await this.getFriend(this.enemyId);
      if (this.isAttackableVillage(this.enemyId, enemy)) {
        console.log("Revent the stupid enemey", enemy.id, enemy.name);
        return enemy;
      }
    }
    if (
      this.attackTarget === "random" &&
      spinResult.random &&
      this.isAttackableVillage(spinResult.random.id, spinResult.random)
    ) {
      console.log("Prefer attack random target", spinResult.random.name);
      return spinResult.random;
    }

    if (this.attackTarget.indexOf("_") >= 0) {
      console.log("get attack target", this.attackTarget);
      var friend = await this.getFriend(this.attackTarget);
      //console.log("Enemy found", friend);
      if (this.isAttackableVillage(friend.id, friend)) {
        return friend;
      }
    }

    console.log("Find revenge target".yellow);
    const data = await this.getAllMessages();
    const attackable = [];

    const hash = {};
    if (data.messages) {
      for (const message of data.messages) {
        if (!message.u) continue;
        // DO NOT ATTACK FRIENDLY EXCLUDES
        if (hash[message.u]) continue;

        const village = await this.getFriend(message.u);
        hash[message.u] = village;
        if (this.isAttackableVillage(message.u, village)) {
          attackable.push(village);
          if (this.attackPrefer === "shield" && village.shields > 0)
            return village;
          if (village.shields === 0) return village;
        }
      }
    }
    if (attackable.length > 0) return attackable[0];
    return spinResult.attack;
  }
  async hammerAttach(spinResult, desireTarget) {
    console.log("------------> Hammer Attack <-------------".blue);
    //console.log("attack", spinResult.attack);

    desireTarget = desireTarget || await this.findRevengeAttack(spinResult);
    desireTarget = desireTarget || spinResult.attack;

    if (
      desireTarget.id != this.enemyId &&
      desireTarget.id != this.attackTarget &&
      ((desireTarget.village.shields > 0 && this.attackPrefer !== "shield") ||
        excludedAttack.some(x => x === desireTarget.id))
    ) {
      desireTarget = spinResult.random;
    }
    if (!desireTarget) {
      console.error("No target to attack, something went wrong, exited");
      throw new Error("Bad process");
    }
    // console.log("desireTarget", desireTarget);
    const attackPriorities = ["Ship", "Statue", "Crop", "Farm", "House"];

    this.dumpFile("attack", spinResult);

    const targetId = desireTarget.id;

    const village = desireTarget.village;
    if (village.shields > 0) {
      console.log("Attach target has shield");
    }

    //console.log(`Attacking `, desireTarget);
    for (const item of attackPriorities) {
      if (!village[item] || village[item] === 0 || village[item] > 6) continue;
      console.log(
        colors.green(
          `Attacking ${desireTarget.name} , item = ${item}, state = ${village[item]}`
        )
      );

      const response = await this.post(
        `targets/${targetId}/attack/structures/${item}`, {
          state: village[item],
          item
        }
      );
      if (!response) {
        excludedAttack.push(desireTarget.id);
        return this.hammerAttach(spinResult, spinResult.random);
      }
      //this.updateSeq(response.data.seq)
      const {
        res,
        pay,
        coins
      } = response;
      console.log(`Attack Result : ${res} - Pay ${pay} => coins : ${this.numberFormat(coins)}`);
      if (res != "ok" && res != "shield") {
        console.log("Attack failed".red, response);
      }
      if (res == "shield") {
        console.log("Your attack has been blocked by shiled".yellow);
      }
      this.dumpFile("attacked", response);
      // throw new Error("stop !!!!");
      return response;
    }
    console.log("Warining : something wrong with attack".red);
    // throw new Error("STOP !!!!");
    return spinResult;
  }
  async fixBuilding(spinResult) {
    if (!this.allowUpgrade) return spinResult;
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
  /**
   * 
   * @param {*} type wooden, golden, magical
   */
  async purchase(type) {
    const response = await this.post("purchase", {
      type,
      request_id: uuid.v4()
    });
    console.log("Purchase", response.chest);
  }
  async upgrade(spinResult) {
    // this.allowUpgrade=false;

    if (!spinResult || !this.allowUpgrade) return spinResult;
    console.log("************************* Running Upgrade **********************".magenta);

    let maxDelta = 0;
    let coins = spinResult.coins;
    let villageLevel = spinResult.village;
    this.upgradeCost[villageLevel] = this.upgradeCost[villageLevel] = {};

    const priority = ["Ship", "Farm", "Crop", "Statue", "House"];
    for (const item of priority) {
      if (this.priorityUpgrade && item != this.priorityUpgrade && spinResult[this.priorityUpgrade] < 5) continue;
      this.upgradeCost[villageLevel] = this.upgradeCost[villageLevel] || {};
      this.upgradeCost[villageLevel][item] = this.upgradeCost[villageLevel][item] || 0;
      if (spinResult[item] === 5) continue;
      if (this.upgradeCost[villageLevel][item] > coins) {
        console.log("Skipped!!!. Not enought coins to upgrade, last upgrade need ", this.upgradeCost[villageLevel][item])
        continue;
      }
      console.log(
        colors.rainbow(`Upgrade structure = ${item} State = ${spinResult[item]}`)
      );
      spinResult = await this.post("upgrade", {
        item,
        state: spinResult[item]
      });
      await this.handleMessage(spinResult);
      const deltaCoins = coins - spinResult.coins;
      if (deltaCoins > 0) {
        this.upgradeCost[villageLevel][item] = deltaCoins;
        maxDelta = Math.max(maxDelta, deltaCoins);
      } else {
        this.upgradeCost[villageLevel][item] = Math.max(this.upgradeCost[villageLevel][item], coins);
      }
      villageLevel = spinResult.village;

      let {
        Farm,
        House,
        Ship,
        Statue,
        Crop,
        village
      } = spinResult;
      // await this.handleMessage(spinResult);
      const printMessage = `Upgrade Result: Village ${village} \t Farm: ${Farm} \t House: ${House} \t Statue: ${Statue} \t Crop: ${Crop} \t Ship: ${Ship} \t | Cost ${deltaCoins}`;

      if (deltaCoins > 0) {
        console.log(printMessage.green);
      } else {
        console.log(printMessage.grey);
      }
      coins = spinResult.coins;
    }
    if (maxDelta > 0 && maxDelta < spinResult.coins) {
      console.log("recursive upgrade")
      await this.upgrade(spinResult);
    }
    return spinResult;
  }
}

module.exports = CoinMaster;
