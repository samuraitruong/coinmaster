# coinmaster
## Introduction
Coin Master is great game however, game animation is very annoy because it took time to finish, sometime I need to spin and do action as fast as I wish to avoid other player steal my money, or Sometime I have couple thounsand of spins and i want to spin them all but I don't want to hold the phone for an hours. Everything is easy, lets automate it

this program will automate spin, attack, raid (work with bug) and auto collect rewards, dailly reward, upgrade building, pretty much everything you need to do when you play game.


## Setup
create .env file in the and setup below property. see sample.env file for details

- USER_ID=xxx
- FB_TOKEN=xxx
- DEVICE_ID=xxx
- DEVICE_CHANGE=20191002_2

BET =1
To get above information, You need to follow below step
- Login to the game using FB
- Using network tab in inspect mode(F11) of chrome browser
- Wait until game load and start check in the network and find the request to coin master
- All above information will be in the body and header of the request

## run

```sh 
npm install //for first use no package module
node index.js

```


