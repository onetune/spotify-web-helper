var EventEmitter = require('events').EventEmitter;
var childProcess = require('child_process');
var qs = require('querystring');
var os = require('os');
var path = require('path');
var util = require('util');
var got = require('got');
var debug = require('debug')('swh');
var processStatus = require('./lib/process-status');

var START_HTTPS_PORT = 4370;
var END_HTTPS_PORT = 4379;
var START_HTTP_PORT = 4380;
var END_HTTP_PORT = 4389;
var RETURN_ON = ['login', 'logout', 'play', 'pause', 'error', 'ap'];
var DEFAULT_RETURN_AFTER = 60;
var FAKE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36';

var ORIGIN_HEADER = { Origin: 'https://open.spotify.com' };
var KEEPALIVE_HEADER = {
  Connection: 'keep-alive',
  Origin: 'https://open.spotify.com'
};

var SEEK_INTERVAL_LENGTH = 250;

function getJSON(obj) {
  return new Promise(function (resolve, reject) {
    if (obj.params) {
      obj.url += '?' + qs.stringify(obj.params);
    }
    if (obj.headers) {
      obj.headers['User-Agent'] = FAKE_USER_AGENT;
    } else {
      obj.headers = { 'User-Agent': FAKE_USER_AGENT };
    }
    got(obj.url, {
      headers: obj.headers,
      rejectUnauthorized: false,
      useElectronNet: false
    })
      .then(response => {
        try {
          resolve(JSON.parse(response.body));
        } catch (err) {
          reject(err);
        }
      })
      .catch(reject);
  });
}

function parseTime(number) {
  let fullseconds = Math.round(number);
  let minutes = Math.floor(fullseconds / 60);
  let seconds = fullseconds - minutes * 60;
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  return minutes + ':' + seconds;
}

function getWebHelperPath() {
  if (process.platform === 'win32') {
    return path.join(
      os.homedir(),
      '\\AppData\\Roaming\\Spotify\\SpotifyWebHelper.exe'
    );
  }
  return path.join(
    os.homedir(),
    '/Library/Application Support/Spotify/SpotifyWebHelper'
  );
}

function startSpotifyWebHelper() {
  return new Promise(function (resolve, reject) {
    var child = childProcess.spawn(getWebHelperPath(), { detached: true });
    child.on('error', function (err) {
      reject(new Error('Spotify is not installed. ' + err.message));
    });
    child.unref();
    processStatus.of(processStatus.SPOTIFY_WEB_HELPER).then(function (isRunning) {
      if (isRunning) {
        resolve(true);
      } else {
        reject(new Error('Cannot start Spotify Web Helper.'));
      }
    });
  });
}

function SpotifyWebHelper(opts) {
  if (!(this instanceof SpotifyWebHelper)) {
    return new SpotifyWebHelper(opts);
  }

  opts = opts || {};
  var localPort = opts.port || START_HTTPS_PORT;
  var intervals = Object.assign({}, {
    checkIsRunning: 5000,
    checkIsShutdown: 2000,
    delayAfterStart: 3000,
    delayAfterError: 5000,
    retryHelperConnection: 5000
  }, opts.intervals);

  this.getCsrfToken = () => {
    return new Promise((resolve, reject) => {
      return getJSON({
        url: this.generateSpotifyUrl('/simplecsrf/token.json'),
        headers: ORIGIN_HEADER
      })
        .then(function (res) {
          if (res.error) {
            reject(new Error(res.error.message));
          } else {
            resolve(res.token);
          }
        })
        .catch(reject);
    });
  };
  this.ensureSpotify = () => {
    isSpotifyRunning = null;

    return new Promise((resolve, reject) => {
      const waitForSpotify = () => {
        processStatus.of(processStatus.SPOTIFY)
        .then((isRunning) => {
          // Save status on first call, to make emitting 'open' event possible
          if(isSpotifyRunning === null)
            isSpotifyRunning = isRunning;

          if(isRunning) {
            if(!isSpotifyRunning) {
              isSpotifyRunning = true;
              debug('Spotify was just started.');
              this.player.emit('open');

              // Give Spotify a few seconds to finish startup.
              // Prevents "User not logged on" errors.
              setTimeout(resolve, intervals.delayAfterStart);
            } else {
              // Spotify has already been running
              resolve();
            }
          } else {
            debug('Waiting for Spotify to start...');
            setTimeout(waitForSpotify, intervals.checkIsRunning);
          }
        })
        .catch(reject);
      };
      waitForSpotify();
    })
  };
  this.ensureSpotifyWebHelper = () => {
    return new Promise(function (resolve, reject) {
      processStatus.of(processStatus.SPOTIFY_WEB_HELPER)
        .then(isRunning => {
          if (isRunning) {
            return resolve();
          }
          return startSpotifyWebHelper();
        })
        .catch(reject);
    });
  };
  this.generateSpotifyUrl = function (url, port = localPort) {
    var protocol = 'https://';
    if (port >= START_HTTP_PORT && port <= END_HTTP_PORT) {
      protocol = 'http://';
    }
    return util.format('%s%s:%d%s', protocol, '127.0.0.1', port, url);
  };
  this.getOauthToken = function () {
    return new Promise(function (resolve, reject) {
      getJSON({
        url: 'http://open.spotify.com/token'
      })
      .then(function (res) {
        resolve(res.t);
      })
      .catch(reject);
    });
  };
  this.checkForError = status => {
    if (status.error) {
      if (status.error.message === 'Invalid OAuth token') {
        // We probably simply have to reinitialize to grab a new OAuth token
        init();
        return false; // Don't trigger error handling, since we start from the beginning anyway
      }

      this.player.emit('error', new Error(status.error.message));
      return true;
    }
    return false;
  };
  this.checkPort = function (port) {
    return new Promise((resolve, reject) => {
      getJSON({
        url: this.generateSpotifyUrl('/service/version.json', port),
        headers: ORIGIN_HEADER,
        params: {
          service: 'remote'
        }
      })
        .then(() => {
          resolve(port);
        })
        .catch(err => { });
    });
  };
  // Return the first successful port
  this.checkPorts = function (startPort, endPort) {
    return Promise.race(
      [...Array(endPort - startPort + 1).keys()].map(i =>
        this.checkPort(startPort + i)
      )
    );
  };
  // Race to find the first succesful port
  this.detectPort = function () {
    return new Promise((resolve, reject) => {
      const tryToConnect = () => {
        Promise.race([
          this.checkPorts(START_HTTPS_PORT, END_HTTPS_PORT),
          this.checkPorts(START_HTTP_PORT, END_HTTP_PORT),
          new Promise((innerResolve) => {
            setTimeout(() => innerResolve('retry'), intervals.retryHelperConnection);
          })
        ])
        .then(data => {
          if(data === 'retry') {
            debug('No port found in range. Retrying...');
            tryToConnect();
          } else {
            localPort = data;
            resolve();
          }
        })
        .catch(err => this.player.emit('error', err));
      };
      tryToConnect();
    });
  };

  this.player = new EventEmitter();
  this.player.pause = unpause => {
    return getJSON({
      url: this.generateSpotifyUrl('/remote/pause.json'),
      headers: ORIGIN_HEADER,
      params: {
        returnafter: 1,
        returnon: RETURN_ON.join(','),
        oauth: this.oauthtoken,
        csrf: this.csrftoken,
        pause: !unpause
      }
    });
  };
  this.player.play = spotifyUri => {
    if (
      !spotifyUri ||
      (this.status &&
        this.status.track &&
        this.status.track.track_resource &&
        this.status.track.track_resource.uri === spotifyUri)
    ) {
      this.player.pause(true);
      return;
    }
    return getJSON({
      url: this.generateSpotifyUrl('/remote/play.json'),
      headers: ORIGIN_HEADER,
      params: {
        returnafter: 1,
        returnon: RETURN_ON.join(','),
        oauth: this.oauthtoken,
        csrf: this.csrftoken,
        uri: spotifyUri,
        context: spotifyUri
      }
    });
  };
  this.player.seekTo = seconds => {
    this.status.playing_position = seconds; // eslint-disable-line camelcase
    this.player.emit('seek', seconds);
    return this.player.play(
      this.status.track.track_resource.uri + '#' + parseTime(seconds)
    );
  };
  this.status = null;
  var seekingInterval = null;
  var startSeekingInterval = function () {
    seekingInterval = setInterval(() => {
      this.status.playing_position += SEEK_INTERVAL_LENGTH / 1000; // eslint-disable-line camelcase
    }, SEEK_INTERVAL_LENGTH);
  };
  var stopSeekingInterval = function () {
    clearInterval(seekingInterval);
  };
  this.compareStatus = function (status) {
    this.player.emit('status-will-change', status);
    let hasUri = track =>
      track && track.track_resource && track.track_resource.uri;
    if (
      hasUri(this.status.track) &&
      hasUri(status.track) &&
      this.status.track.track_resource.uri !== status.track.track_resource.uri
    ) {
      this.player.emit('track-will-change', status.track);
    }
    if (this.status.playing !== status.playing) {
      if (status.playing) {
        this.player.emit('play');
        startSeekingInterval.call(this);
      } else {
        // When user shuts down Spotify, playing status changes but there is no track property available
        if (!status.hasOwnProperty('track') || Math.abs(status.playing_position - status.track.length) <= 1) {
          this.player.emit('end');
        } else {
          this.player.emit('pause');
        }
        stopSeekingInterval.call(this);
      }
    }
    // Guarantee seekingInterval won't affect the seek event
    if (
      Math.abs(this.status.playing_position - status.playing_position) >
      2 * SEEK_INTERVAL_LENGTH / 1000
    ) {
      this.player.emit('seek', status.playing_position);
    }
  };

  this.getStatus = () => getJSON({
    url: this.generateSpotifyUrl('/remote/status.json'),
    headers: ORIGIN_HEADER,
    params: {
      returnafter: 1,
      returnon: RETURN_ON.join(','),
      oauth: this.oauthtoken,
      csrf: this.csrftoken
    }
  });

  var getStatusAndEmit = () => {
    return new Promise((resolve, reject) => {
      this.getStatus()
        .then(res => {
          this.status = res;
          this.player.emit('ready');
          this.player.emit('status-will-change', res);
          if (res.playing) {
            this.player.emit('play');
            startSeekingInterval.call(this);
            this.player.emit('track-will-change', res.track);
          }
          resolve();
        })
        .catch(err => this.player.emit('error', err));
    });
  };

  var waitForShutdown = () => {
    return new Promise((resolve, reject) => {
      const checkStatus = (retries) => {
        processStatus.of(processStatus.SPOTIFY)
        .then(isRunning => {
          if (isRunning) {
            if (retries > 15)
              reject();
            debug('Waiting for shutdown...');
            setTimeout(checkStatus.bind(null, retries + 1), intervals.checkIsShutdown);
          } else {
            resolve();
          }
        })
        .catch(err => this.player.emit('error', err))
      };
      checkStatus(0);
    });
  };

  var listen = () => {
    getJSON({
      url: this.generateSpotifyUrl('/remote/status.json'),
      headers: KEEPALIVE_HEADER,
      params: {
        returnafter: DEFAULT_RETURN_AFTER,
        returnon: RETURN_ON.join(','),
        oauth: this.oauthtoken,
        csrf: this.csrftoken
      }
    })
    .then(res => {
      debug('Processing status.');

      // Spotify is being shut down
      if(res.online === false) {
        this.player.emit('closing');

        // Restart Web Helper once Spotify process is dead.
        waitForShutdown()
        .then(() => {
          debug('Spotify quit, start waiting for connection again.');
          this.player.emit('close');
          init();
        })
        .catch(init);

        return;
      }

      if(this.checkForError(res)) {
        // Give Spotify a few seconds to recover
        // (Helps with e.g. "User not logged on" errors on starting Spotify, since the user usually WILL
        // be logged on within a second or two...)
        setTimeout(listen, intervals.delayAfterError);
      } else {
        // Compare new and old status stored in this.status
        this.compareStatus(res);
        this.status = res;
        listen();
      }
    })
    .catch(err => this.player.emit('error', err));
  };

  var init = () => {
    this.ensureSpotify()
    .then(() => this.ensureSpotifyWebHelper())
    .then(() => this.detectPort())
    .then(() => this.getOauthToken())
    .then(oauthtoken => {
      this.oauthtoken = oauthtoken;
      return this.getCsrfToken();
    })
    .then(csrftoken => {
      this.csrftoken = csrftoken;
      return getStatusAndEmit();
    })
    .then(() => {
      debug('Starting to listen for events.');
      return listen();
    })
    .catch(err => this.player.emit('error', err));
  };
  init();
}

// Possible error: need to wait until actually started / spotify not installed
module.exports = SpotifyWebHelper;
