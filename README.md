# Spotify Web Helper for node.js

This is a rewrite of the excellent [node-spotify-webhelper](https://www.npmjs.com/package/node-spotify-webhelper), but with support for events, so you don't have to do `getStatus()` all the time. It also is faster, and starts SpotifyWebHelper on OS X, not just on Windows.

This module is being used on the upcoming new version of [onetune.fm](http://onetune.fm)!

````javascript
var SpotifyWebHelper = require('@jonny/spotify-web-helper')

var helper = SpotifyWebHelper()

helper.player.on('ready', function() {

	helper.player.on('play', function() {})
	helper.player.on('pause', function() {})
	helper.player.on('end', function() {})
	helper.player.on('track-change', function (track) {})

	helper.player.on('error', function(err) {})

	// These methods return promises
	helper.player.play('spotify:track:213342152345')
	helper.player.pause()
	helper.player.seek()


	console.log(helper.status)
	// 'status': {
	//  	'track': ...,
	//		'shuffle': ...,
	//		'playing_position': ...
	//  }
});
````