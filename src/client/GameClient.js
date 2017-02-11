const io = require('socket.io-client')
const kbd = require('@dasilvacontin/keyboard')
const deepEqual = require('deep-equal')
const capitalize = require('capitalize')
const { PLAYER_EDGE, COIN_RADIUS } = require('../common/constants.js')
const { calculatePlayerAcceleration } = require('../common/utils.js')

const serverEventsNames = [
  'connect', 'gameInit', 'serverPong',
  'playerMoved', 'playerDisconnected',
  'coinSpawned', 'coinCollected'
]

class GameClient {
  constructor (roomId) {
    this.roomId = roomId
    this.socket = io()

    this.myPlayerId = null
    this.myInputs = {
      LEFT_ARROW: false,
      RIGHT_ARROW: false,
      UP_ARROW: false,
      DOWN_ARROW: false
    }

    this.players = {}
    this.coins = {}

    this.ping = Infinity
    this.clockDiff = 0

    serverEventsNames.forEach((serverEventName) => {
      this.socket.on(
        serverEventName,
        this[`on${capitalize(serverEventName)}`].bind(this)
      )
    })
  }

  pingServer () {
    this.pingMessageTimestamp = Date.now()
    this.socket.emit('gamePing')
  }

  onConnect () {
    this.socket.emit('joinGame', this.roomId)
    this.pingServer()
  }

  onServerPong (serverNow) {
    const now = Date.now()
    this.ping = (now - this.pingMessageTimestamp) / 2
    this.clockDiff = (serverNow + this.ping) - now
    setTimeout(() => {
      this.pingServer()
    }, Math.max(200, this.ping))
  }

  onGameInit (myPlayerId, gameState) {
    this.myPlayerId = myPlayerId
    const { players, coins } = gameState
    this.players = players
    this.coins = coins
  }

  onPlayerMoved (player) {
    this.players[player.id] = player
  }

  onCoinSpawned (coin) {
    this.coins[coin.id] = coin
  }

  onCoinCollected (playerId, coinId) {
    delete this.coins[coinId]
    const player = this.players[playerId]
    player.score++
  }

  onPlayerDisconnected (playerId) {
    delete this.players[playerId]
  }

  updateInputs () {
    const { myInputs } = this
    const oldInputs = Object.assign({}, myInputs)

    for (let key in myInputs) {
      myInputs[key] = kbd.isKeyDown(kbd[key])
    }

    if (!deepEqual(myInputs, oldInputs)) {
      this.socket.emit('playerMove', myInputs)

      // update our local player' inputs aproximately when
      // the server takes them into account
      const frozenInputs = Object.assign({}, myInputs)
      setTimeout(() => {
        const myPlayer = this.players[this.myPlayerId]
        const now = Date.now()
        const serverNow = now + this.clockDiff
        this.updatePlayer(myPlayer, serverNow)
        myPlayer.inputs = frozenInputs
        calculatePlayerAcceleration(myPlayer)
      }, this.ping)
    }
  }

  updatePlayer (player, targetTimestamp) {
    // dead reckoning
    const { x, y, vx, vy, ax, ay } = player

    const delta = targetTimestamp - player.timestamp
    const delta2 = Math.pow(delta, 2)

    player.x = x + (vx * delta) + (ax * delta2 / 2)
    player.y = y + (vy * delta) + (ay * delta2 / 2)
    player.vx = vx + (ax * delta)
    player.vy = vy + (ay * delta)
    player.timestamp = targetTimestamp
  }

  logic () {
    const now = Date.now()
    const serverNow = now + this.clockDiff
    this.updateInputs()

    for (let playerId in this.players) {
      const player = this.players[playerId]
      this.updatePlayer(player, serverNow)
    }
  }

  render (canvas, ctx) {
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // render coins
    for (let coinId in this.coins) {
      const coin = this.coins[coinId]
      ctx.fillStyle = 'yellow'
      ctx.beginPath()
      ctx.arc(coin.x, coin.y, COIN_RADIUS, 0, 2 * Math.PI)
      ctx.fill()
    }

    // render players
    for (let playerId in this.players) {
      const { color, x, y, score } = this.players[playerId]
      ctx.save()
      ctx.translate(x, y)
      ctx.fillStyle = color
      const HALF_EDGE = PLAYER_EDGE / 2
      ctx.fillRect(-HALF_EDGE, -HALF_EDGE, PLAYER_EDGE, PLAYER_EDGE)
      if (playerId === this.myPlayerId) {
        ctx.strokeRect(-HALF_EDGE, -HALF_EDGE, PLAYER_EDGE, PLAYER_EDGE)
      }

      // render score inside players
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.font = '20px Arial'
      ctx.fillText(score, 0, 7)
      ctx.restore()
    }

    // render `ping` and `clockDiff`
    ctx.fillStyle = 'black'
    ctx.textAlign = 'left'
    ctx.font = '20px Arial'
    ctx.fillText(`ping: ${this.ping}`, 15, 30)
    ctx.fillText(`clockDiff: ${this.clockDiff}`, 15, 60)
  }
}

module.exports = GameClient
