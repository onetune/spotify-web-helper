var request = require('request');
var qs = require('querystring');
var util = require('util');
var child_process = require('child_process');
var process_exists = require('process-exists');
var Promise = require('bluebird');
var EventEmitter = require('events').EventEmitter;

var wintools;
var spotifyWebHelperWinProcRegex;

var DEFAULT_PORT = 4370;
var RETURN_ON = ['login', 'logout', 'play', 'pause', 'error', 'ap'];
var DEFAULT_RETURN_AFTER = 60;

var ORIGIN_HEADER = { 'Origin': 'https://open.spotify.com' }
var KEEPALIVE_HEADER = {'Connection': 'keep-alive', 'Origin': 'https://open.spotify.com'}


function getJSON(obj) {
	return new Promise(function (resolve, reject) {
		if (obj.params)
		    obj.url += '?' + qs.stringify(obj.params)
		request({
			'url': obj.url,
			'headers': obj.headers,
			'rejectUnauthorized': false
		}, function (err, req, body) {
			if (err) { return reject(err); }
			var parsedBody;
			try {
				resolve(JSON.parse(body));
			}
			catch (e) {
				reject(e);
			}
		})
	})
}

var ASCII_LOWER_CASE = "abcdefghijklmnopqrstuvwxyz";
function generateRandomString(length) {
	var text = "";

	for( var i=0; i < length; i++ )
		text += ASCII_LOWER_CASE.charAt(Math.floor(Math.random() * ASCII_LOWER_CASE.length));

	return text;
}

function generateRandomLocalHostName() {
	// Generate a random hostname under the .spotilocal.com domain
	return generateRandomString(10) + '.spotilocal.com'
}

function getWebHelperPath() {
	// possible error: on linux
	if (process.platform == 'win32')  {
		return require('user-home') + "AppData\\Roaming\\Spotify\\Data\\SpotifyWebHelper.exe"
	}
	else {
		return require('user-home') + "/Library/Application Support/Spotify/SpotifyWebHelper"
	}
}

function isSpotifyWebHelperRunning(cb) {
	cb = cb || function () { };

	return new Promise(function (resolve, reject) {
		// OSX
		if (process.platform == 'darwin')  {
			return process_exists('SpotifyWebHelper', function (err, exists) {
				if (err) { reject(err); }
				else {
					resolve(exists);
				}
			})
		}
		// Windows
		if (process.platform == 'win32') {
			wintools = wintools || require('wintools');
			wintools.ps(function (err, list) {
				if (err) {
					reject(err)
				}
				spotifyWebHelperWinProcRegex = spotifyWebHelperWinProcRegex || new RegExp('spotifywebhelper.exe', 'i');

			})
			for (var k in lst) {
				if (spotifyWebHelperWinProcRegex.test(lst[k].desc)) {
					return resolve(true);
				}
				spotifyWebHelperWinProcRegex.lastIndex = 0;
			};
			resolve(false);
		}
		reject(new Error('Spotify integration only works on Windows or OS X'))
	});
}

function startSpotifyWebHelper() {
	return new Promise(function (resolve, reject) {
		var child = child_process.spawn(getWebHelperPath(), { detached: true });
		child.on('error', function (err) {
			reject(new Error("Spotify is not installed."))
		})
		child.unref();
		isSpotifyWebHelperRunning()
		.then(function (isRunning) {
			if (isRunning) {
				resolve(true)
			}
			else {
				reject(new Error('Cannot start Spotify.'))
			}
		})
	})
}

function SpotifyWebHelper(opts) {
	if (!(this instanceof SpotifyWebHelper)) {
		return new SpotifyWebHelper(opts)
	}

	opts = opts || {};
    var localPort = opts.port || DEFAULT_PORT;

    this.getCsrfToken = function(cb) {
    	return new Promise((function (resolve, reject) {
	    	return getJSON({
	    		url: this.generateSpotifyUrl("/simplecsrf/token.json"),
	    		headers: ORIGIN_HEADER,
	    	})
	    	.then(function (res) {
	    		if (res.error) {
	    			throw new Error(res.error.message)
	    		}
	    		else {
		    		resolve(res.token)
	    		}
	    	})
	    	.catch(function (err) {
	    		reject(err);
	    	})
    	}).bind(this))
    }
    this.ensureSpotifyWebHelper = function() {
    	return new Promise(function (resolve, reject) {
    		isSpotifyWebHelperRunning()
    		.then(function (isRunning) {
    			if (isRunning) {
    				return resolve(true);
    			}
    			else {
    				return startSpotifyWebHelper()
    			}
    		})
    		.then(function() {
    			resolve(true)
    			// Fire 'start' event
    		})
    		.catch(function (err) {
    			reject(err)
    		});
    	});
    }
	this.generateSpotifyUrl = function (url) {
		return util.format("https://%s:%d%s", generateRandomLocalHostName(), localPort, url)
	}
	this.getOauthToken = function() {
		return new Promise(function (resolve, reject) {
			getJSON({
				url: 'http://open.spotify.com/token',
			})
			.then(function (res) {
				resolve(res.t)
			})
			.catch(function (err) {
				reject(err)
			})
		})
	}
	this.player = new EventEmitter();
	this.player.pause = (function (unpause) {
		return new Promise((function (resolve, reject) {
			return getJSON({
				url: this.generateSpotifyUrl("/remote/pause.json"),
				headers: ORIGIN_HEADER,
				params: {
					returnafter: 1,
					returnon: RETURN_ON.join(','),
					oauth: this.oauthtoken,
					csrf: this.csrftoken,
					pause: !!!unpause
				}
			})
			.then(function () {
				resolve()
			})
			.catch(function () {
				reject(err)
			})
		}).bind(this))
	}).bind(this)
	this.player.play = (function (spotifyUri) {
		if (!spotifyUri || (this.status && this.status.track && this.status.track.track_resource && this.status.track.track_resource.uri == spotifyUri)) {
			this.player.pause(true)
			return
		}
		return new Promise((function (resolve, reject) {
			return getJSON({
				url: this.generateSpotifyUrl("/remote/play.json"),
				headers: ORIGIN_HEADER,
				params: {
					returnafter: 1,
					returnon: RETURN_ON.join(','),
					oauth: this.oauthtoken,
					csrf: this.csrftoken,
					uri: spotifyUri,
					context: spotifyUri
				}
			})
			.then(function (res) {
				resolve()
			})
			.catch(function (err) {
				reject(err)
			})
		}).bind(this))
	}).bind(this)
	this.status = null;
	var seekingInterval = null;
	var startSeekingInterval = function() {
		seekingInterval = setInterval((function() {
			this.status.playing_position += 0.25
		}).bind(this), 250)
	}
	var stopSeekingInterval = function() {
		clearInterval(seekingInterval)
	}
	this.compareStatus = function(status) {
		if (   this.status.track
			&& this.status.track.track_resource
			&& this.status.track.track_resource.uri
			&& status.track
			&& status.track.track_resource
			&& status.track.track_resource.uri
			&& this.status.track.track_resource.uri
			!= status.track.track_resource.uri) {
			this.player.emit('track-change', status.track)
		}
		if (this.status.playing != status.playing) {
			if (status.playing) {
				this.player.emit('play')
				startSeekingInterval.call(this)
			}
			else {
				if (Math.abs(this.status.playing_position - status.playing_position) <= 1) {
					this.player.emit('end')
				}
				this.player.emit('pause')
				stopSeekingInterval.call(this)
			}
		}
	}
	var getStatus = function() {
		return new Promise((function (resolve, reject) {
			return getJSON({
				url: this.generateSpotifyUrl("/remote/status.json"),
				headers: ORIGIN_HEADER,
				params: {
					returnafter: 1,
					returnon: RETURN_ON.join(','),
					oauth: this.oauthtoken,
					csrf: this.csrftoken
				}
			})
			.then((function (res) {
				this.status = res;
				if (res.playing) {
					this.player.emit('play')
					startSeekingInterval.call(this)
					this.player.emit('track-change', res.track)
				}
				resolve()
			}).bind(this))
			.catch(function (err) {
				reject(err);
			}).bind(this)
		}).bind(this))
	}
	var listenStatus = function() {
		var listen = function() {
	    	return new Promise((function (resolve, reject) {
		    	return getJSON({
		    		url: this.generateSpotifyUrl("/remote/status.json"),
		    		headers: KEEPALIVE_HEADER,
		    		params: {
		    			returnafter: DEFAULT_RETURN_AFTER,
		    			returnon: RETURN_ON.join(','),
		    			oauth: this.oauthtoken,
		    			csrf: this.csrftoken
		    		}
		    	})
		    	.then((function (res) {
		    		listen.call(this)
		    		this.compareStatus(res);
		    		this.status = res;
		    	}).bind(this))
		    	.catch((function (err) {
		    		this.player.emit(err);
		    	}).bind(this))
		    	resolve()
	    	}).bind(this))
		}
		listen.call(this)
	}

	this.ensureSpotifyWebHelper()
	.then((function() {
		return this.getOauthToken()
	}).bind(this))
	.then((function (oauthtoken) {
		this.oauthtoken = oauthtoken;
		return this.getCsrfToken();
	}).bind(this))
	.then((function (csrftoken) {
		this.csrftoken = csrftoken;
		return getStatus.call(this)
	}).bind(this))
	.then((function () {
		this.player.emit('ready')
		return listenStatus.call(this)
	}).bind(this))
	.catch(function (err) {
		helper.player.emit('error', err)
	})

}
 // Possible error: need to wait until  actually started / spotify not installed
module.exports = SpotifyWebHelper