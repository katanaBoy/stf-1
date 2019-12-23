const request = require('request-promise')
const Promise = require('bluebird')
const syrup = require('stf-syrup')
const logger = require('../../../../util/logger')
const iosutil = require('../util/iosutil')

const WDA_UNAVAILABLE_MSG = 'RequestError'
const LOG_API_REQUEST_MSG = 'Has been sent api request to WDA with data :'

module.exports = syrup.serial()
  .dependency(require('../devicenotifier'))
  .define((options, notifier) => {
    const log = logger.createLogger('wdaClient')

    const WdaClient = {
      touchDownParams: {},
      isMove: false,
      port: null,
      baseUrl: '',
      sessionId: null,
      tapStartAt: '',
      orientation: 'PORTRAIT',
      deviceSize: null,
      connect: function(port) {
        this.port = port
        this.baseUrl = iosutil.getUri(options.wdaHost, options.wdaPort)
        log.info('baseUrl :', this.baseUrl)
        return new Promise((resolve, reject) => {
          request.get(`${this.baseUrl}/status`)
            .then(response => {
              try {
                this.sessionId = JSON.parse(response).sessionId
                log.info('sessionId: ' + this.sessionId)
                return resolve()
              }
              catch (e) {
                log.error('Failed to parse json object', e)
                return reject(e)
              }
            })
            .catch(err => {
              log.error('No valid response from web driver!', err)
              return reject(err)
            })
        })
      },
      setScaleByRotation: function(params, deviceSize) {
        return iosutil.swipe(this.orientation, params, deviceSize)
      },
      swipe: function(params) {
        const scale = this.setScaleByRotation(params, this.deviceSize)
        this.isMove = true
        return this.handleRequest({
          method: 'POST',
          uri: `${this.baseUrl}/session/${this.sessionId}/wda/dragfromtoforduration`,
          body: scale,
          json: true
        })
      },
      touchUp: function() {
        if(!this.isMove) {
          const {x, y} = this.touchDownParams
          let params = {
            x: x * this.deviceSize.width,
            y: y * this.deviceSize.height
          }

          if(((new Date()).getTime() - this.tapStartAt) <= 1000) {
            return this.handleRequest({
              method: 'POST',
              uri: `${this.baseUrl}/session/${this.sessionId}/wda/tap/0`,
              body: params,
              json: true
            })
          }
          else {
            return this.handleRequest({
              method: 'POST',
              uri: `${this.baseUrl}/session/${this.sessionId}/wda/touchAndHold`,
              body: Object.assign(params, {duration: 1}),
              json: true
            })
          }
        }
      },
      tapDeviceTreeElement: function(message) {
        const params = {
          using: 'link text',
          value: 'label=' + message.label,
        }

        return new Promise((resolve, reject) => {
          this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/elements`,
            body: params,
            json: true
          })
            .then(response => {
              const {ELEMENT} = response.value[0]
              return this.handleRequest({
                method: 'POST',
                uri: `${this.baseUrl}/session/${this.sessionId}/element/${ELEMENT}/click`,
                body: {},
                json: true
              })
            })
            .catch(err => {
              console.log(err)
            })
        })
      },
      doubleClick: function() {
        if(!this.isMove) {
          const {x, y} = this.touchDownParams
          const params = {
            x: x * this.deviceSize.width,
            y: y * this.deviceSize.height
          }

          return this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/doubleTap`,
            body: params,
            json: true
          })
        }
      },
      tap: function(params) {
        this.tapStartAt = (new Date()).getTime()
        this.touchDownParams = params
        this.isMove = false
      },
      homeBtn: function() {
        return this.handleRequest({
          method: 'POST',
          uri: `${this.baseUrl}/wda/homescreen`
        })
      },
      size: function() {
        log.info(`window size: ${this.baseUrl}/session/${this.sessionId}/window/size`)

        return new Promise((resolve, reject) => {
          this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/session/${this.sessionId}/window/size`
          })
            .then(response => {
              try {
                this.deviceSize = JSON.parse(response).value
                return resolve(this.deviceSize)
              }
              catch (e) {
                return reject(new Error('Failed to parse json object'))
              }
            })
            .catch(err => {
              console.log(err)
              return reject(err)
            })
        })
      },
      typeKey: function(params) {
        if (!params.value || !params.value[0]) {
          return
        }

        return this.handleRequest({
          method: 'POST',
          uri: `${this.baseUrl}/session/${this.sessionId}/wda/keys`,
          body: params,
          json: true
        })
      },
      openUrl: function(message) {
        const params = {
          desiredCapabilities: {
            bundleId: 'com.apple.mobilesafari',
            arguments: ['-u', message.url],
            shouldWaitForQuiescence: true
          }
        }

        return new Promise((resolve, reject) => {
          this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/`,
            body: params,
            json: true
          })
            .then(response => {
              this.sessionId = response.value.sessionId
              return resolve()
            })
            .catch(err => reject(err))
        })
      },
      rotation: function(params) {
        this.orientation = params.orientation

          return this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/orientation`,
            body: params,
            json: true
          })
      },
      screenshot: function() {
        return new Promise((resolve, reject) => {
          this.handleRequest({
            method: 'GET',
            uri: `${this.baseUrl}/screenshot`,
            json: true
          })
            .then(response => {
              try {
                resolve(response)
              } catch(e) {
                reject(e)
              }
            })
            .catch(err => reject(err))
        })
      },
      setScaleByRotation: function(params, deviceSize) {
        switch(this.orientation) {
          case 'PORTRAIT':
            return {
              fromX: params.fromX * deviceSize.width,
              fromY: params.fromY * deviceSize.height,
              toX: params.toX * deviceSize.width,
              toY: params.toY * deviceSize.height,
              duration: params.duration
            }
          case 'LANDSCAPE':
            return {
              toX: params.fromY * deviceSize.width,
              toY: params.fromX * deviceSize.height,
              fromX: params.toY * deviceSize.width,
              fromY: params.toX * deviceSize.height,
              duration: params.duration
            }
          default:
            return {
              fromX: params.fromX * deviceSize.width,
              fromY: params.fromY * deviceSize.height,
              toX: params.toX * deviceSize.width,
              toY: params.toY * deviceSize.height,
              duration: params.duration
            }
        }
      },
      getTreeElements: function() {
        return this.handleRequest({
          method: 'GET',
          uri: `${this.baseUrl}/source?format=json`,
          json: true
        })
      },
      batteryIosEvent: function() {
        return this.handleRequest({
          method: 'GET',
          uri: `${this.baseUrl}/session/${this.sessionId}/wda/batteryInfo`,
          json: true
        })
      },
      sdkVersion: function() {
      return this.handleRequest({
          method: 'GET',
          uri: `${this.baseUrl}/session/${this.sessionId}`,
          json: true
        })
      },
      pressButton: function(params) {
        return this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/pressButton`,
            body: {
              name: params
            },
            json: true
        })
      },
      appActivate: function(params) {
        return this.handleRequest({
            method: 'POST',
            uri: `${this.baseUrl}/session/${this.sessionId}/wda/apps/activate`,
            body: {
              bundleId: params
            },
            json: true
        })
      },
      pressPower: function() {
        return this.handleRequest({
        method: 'GET',
        uri: `${this.baseUrl}/session/${this.sessionId}/wda/locked`,
        json: true
      })
      .then(response => {
        let url = ''
          if(response.value === true) {
            url = `${this.baseUrl}/session/${this.sessionId}/wda/unlock`
          }
          else{
            url = `${this.baseUrl}/session/${this.sessionId}/wda/lock`
          }
          return this.handleRequest({
            method: 'POST',
            uri: url,
            json: true
          })
      })
      },
      removeSession: function() {
        return this.handleRequest({
          method: 'DELETE',
          uri: `${this.baseUrl}/session/${this.sessionId}`
        })
      },
      handleRequest: function(requestOpt) {
        return new Promise((resolve, reject) => {
          request(requestOpt)
            .then(response => {
              log.verbose(LOG_API_REQUEST_MSG, JSON.stringify(requestOpt))
              return resolve(response)
            })
            .catch(err => {
              // in case if session is expired
              if (err.statusCode === 404) {
                const oldSessionId = this.sessionId

                this.connect()
                .then(() => {
                  const newUri = requestOpt.uri.replace(oldSessionId, this.sessionId)
                  log.verbose(LOG_API_REQUEST_MSG, JSON.stringify(requestOpt))

                  this.handleRequest(Object.assign({}, requestOpt, {
                    uri: newUri
                  }))
                    .then(response => resolve(response))
                })
                .catch(err => {
                  notifier.setDeviceTemporaryUnavialable(err)
                  return reject(err)
                })
              } else if(err.name === WDA_UNAVAILABLE_MSG) {
                notifier.setDeviceTemporaryUnavialable(err)
                return reject(err)
              } else {
                log.error('Failed to send request with error', err)
              }
            })
        })
      }
    }

  /* eslint-disable */
  return new Proxy(WdaClient, {
    get(target, prop) {
      if (['touchUp', 'doubleClick', 'swipe'].includes(prop) && !target.deviceSize) {
          return (...args) => {
            console.log(args, arguments)
            target.size()
              .then(response => {
                let value = target[prop];
                return (typeof value === 'function') ? value.call(target, args[0]) : value;
              })
              .catch(err => {
                let value = target['connect'];
                return (typeof value === 'function') ? value.call(target) : value;
            })
          }

      } else {
        let value = target[prop];
        return (typeof value === 'function') ? value.bind(target) : value;
      }
    }
  })
})
