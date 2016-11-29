var EventEmitter = require('events').EventEmitter;
var childProcess = require('child_process');
var qs = require('querystring');
var util = require('util');
var request = require('request');
var processExists = require('process-exists');
var chalk = require('chalk');

var spotifyWebHelperWinProcRegex;

var DEFAULT_PORT = 4370;
var RETURN_ON = ['login', 'logout', 'play', 'pause', 'error', 'ap'];
var DEFAULT_RETURN_AFTER = 60;

var ORIGIN_HEADER = {Origin: 'https://open.spotify.com'};
var KEEPALIVE_HEADER = {Connection: 'keep-alive', Origin: 'https://open.spotify.com'};

function getJSON(obj) {
	return new Promise(function (resolve, reject) {
		if (obj.params) {
			obj.url += '?' + qs.stringify(obj.params);
		}
		request({
			url: obj.url,
			headers: obj.headers,
			rejectUnauthorized: false
		}, function (err, req, body) {
			if (err) {
				return reject(err);
			}
			try {
				resolve(JSON.parse(body));
			} catch (err) {
				reject(err);
			}
		});
	});
}

function parseTime(number) {
	let fullseconds = Math.round(number);
	let minutes = Math.floor(fullseconds / 60);
	let seconds = fullseconds - (minutes * 60);
	if (seconds < 10) {
		seconds = '0' + seconds;
	}
	return minutes + ':' + seconds;
}

var ASCII_LOWER_CASE = 'abcdefghijklmnopqrstuvwxyz';
function generateRandomString(length) {
	var text = '';

	for (var i = 0; i < length; i++) {
		text += ASCII_LOWER_CASE.charAt(Math.floor(Math.random() * ASCII_LOWER_CASE.length));
	}

	return text;
}

function generateRandomLocalHostName() {
	// Generate a random hostname under the .spotilocal.com domain
	return generateRandomString(10) + '.spotilocal.com';
}

function getWebHelperPath() {
	if (process.platform === 'win32') {
		return require('user-home') + '\\AppData\\Roaming\\Spotify\\SpotifyWebHelper.exe';
	}
	return require('user-home') + '/Library/Application Support/Spotify/SpotifyWebHelper';
}

function isSpotifyWebHelperRunning() {
	return new Promise(function (resolve, reject) {
		if (process.platform === 'darwin') {
			return processExists('SpotifyWebHelper', function (err, exists) {
				if (err) {
					reject(err);
				} else {
					resolve(exists);
				}
			});
		} else if (process.platform === 'win32') {
			var ps = require('./lib/wintools-ps');

			ps(function (err, lst) {
				if (err) {
					return reject(err);
				}
				spotifyWebHelperWinProcRegex = spotifyWebHelperWinProcRegex || new RegExp('spotifywebhelper.exe', 'i');

				for (var k in lst) {
					if (spotifyWebHelperWinProcRegex.test(lst[k].desc)) {
						return resolve(true);
					}
					spotifyWebHelperWinProcRegex.lastIndex = 0;
				}
				return resolve(false);
			});
		} else {
			// SpotifyWebHelper starts with Spotify by default in Linux
			return resolve(true);
		}
	});
}

function startSpotifyWebHelper() {
	return new Promise(function (resolve, reject) {
		var child = childProcess.spawn(getWebHelperPath(), {detached: true});
		child.on('error', function (err) {
			reject(new Error('Spotify is not installed. ' + err.message));
		});
		child.unref();
		isSpotifyWebHelperRunning()
		.then(function (isRunning) {
			if (isRunning) {
				resolve(true);
			} else {
				reject(new Error('Cannot start Spotify.'));
			}
		});
	});
}

function SpotifyWebHelper(opts) {
	if (!(this instanceof SpotifyWebHelper)) {
		return new SpotifyWebHelper(opts);
	}

	opts = opts || {};
	var localPort = opts.port || DEFAULT_PORT;

	this.getCsrfToken = () => {
		return new Promise((resolve, reject) => {
			return getJSON({
				url: this.generateSpotifyUrl('/simplecsrf/token.json'),
				headers: ORIGIN_HEADER
			})
			.then(function (res) {
				if (res.error) {
					throw new Error(res.error.message);
				} else {
					resolve(res.token);
				}
			})
			.catch(reject);
		});
	};
	this.ensureSpotifyWebHelper = function () {
		return new Promise(function (resolve, reject) {
			isSpotifyWebHelperRunning()
			.then(isRunning => {
				if (isRunning) {
					return resolve();
				}
				return startSpotifyWebHelper();
			})
			.catch(function (err) {
				reject(err);
			});
		});
	};
	this.generateSpotifyUrl = function (url) {
		return util.format('https://%s:%d%s', generateRandomLocalHostName(), localPort, url);
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
		if (!spotifyUri || (this.status && this.status.track && this.status.track.track_resource && this.status.track.track_resource.uri === spotifyUri)) {
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
		return this.player.play(this.status.track.track_resource.uri + '#' + parseTime(seconds));
	};
	this.status = null;
	var seekingInterval = null;
	var startSeekingInterval = function () {
		seekingInterval = setInterval(() => {
			this.status.playing_position += 0.25; // eslint-disable-line camelcase
		}, 250);
	};
	var stopSeekingInterval = function () {
		clearInterval(seekingInterval);
	};
	this.compareStatus = function (status) {
		this.player.emit('status-will-change', status);
		let hasUri = track => track && track.track_resource && track.track_resource.uri;
		if (hasUri(this.status.track) && hasUri(status.track) && this.status.track.track_resource.uri !== status.track.track_resource.uri) {
			this.player.emit('track-will-change', status.track);
			let hadListeners = this.player.emit('track-change', status.track);
			if (hadListeners) {
				console.log(chalk.yellow(`WARN: 'track-change' was renamed to 'track-will-change'. Please update your listener.`))
			}
		}
		if (this.status.playing !== status.playing) {
			if (status.playing) {
				this.player.emit('play');
				startSeekingInterval.call(this);
			} else {
				if (Math.abs(status.playing_position - status.track.length) <= 1) {
					this.player.emit('end');
				}
				this.player.emit('pause');
				stopSeekingInterval.call(this);
			}
		}
	};
	var getStatus = () => {
		return new Promise((resolve, reject) => {
			getJSON({
				url: this.generateSpotifyUrl('/remote/status.json'),
				headers: ORIGIN_HEADER,
				params: {
					returnafter: 1,
					returnon: RETURN_ON.join(','),
					oauth: this.oauthtoken,
					csrf: this.csrftoken
				}
			})
			.then(res => {
				this.status = res;
				this.player.emit('ready');
				this.player.emit('status-will-change', res);
				if (res.playing) {
					this.player.emit('play');
					startSeekingInterval.call(this);
					this.player.emit('track-will-change', res.track);
					let hadListeners = this.player.emit('track-change', this.status.track);
					if (hadListeners) {
						console.log(chalk.yellow(`WARN: 'track-change' was renamed to 'track-will-change'. Please update your listener.`))
					}
				}
				resolve();
			})
			.catch(reject);
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
			listen();
			this.compareStatus(res);
			this.status = res;
		})
		.catch(err => this.player.emit('error', err));
	};

	this.ensureSpotifyWebHelper()
	.then(() => this.getOauthToken())
	.then(oauthtoken => {
		this.oauthtoken = oauthtoken;
		return this.getCsrfToken();
	})
	.then(csrftoken => {
		this.csrftoken = csrftoken;
		return getStatus();
	})
	.then(() => {
		return listen();
	})
	.catch(err => this.player.emit('error', err));
}
 // Possible error: need to wait until actually started / spotify not installed
module.exports = SpotifyWebHelper;
