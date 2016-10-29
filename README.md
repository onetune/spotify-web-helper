# Spotify Web Helper for node.js

This is a rewrite of the excellent [node-spotify-webhelper](https://www.npmjs.com/package/node-spotify-webhelper), but with support for events, so you don't have to do `getStatus()` all the time. It also is faster, and starts SpotifyWebHelper on OS X, not just on Windows.

## Install
```
$ npm install @jonny/spotify-web-helper --save
```

## Example
````js
const SpotifyWebHelper = require('@jonny/spotify-web-helper')

const helper = SpotifyWebHelper()

helper.player.on('error', err => { });
helper.player.on('ready', () => {

	// Playback events
	helper.player.on('play', () => { });
	helper.player.on('pause', () => { });
	helper.player.on('end', () => { });
	helper.player.on('track-will-change', track => {});
	helper.player.on('status-will-change', status => {});

	// Playback control. These methods return promises
	helper.player.play('spotify:track:213342152345');
	helper.player.pause();
	helper.player.seek();

	// Get current playback status, including up to date playing position
	console.log(helper.status)
	// 'status': {
	//  	'track': ...,
	//		'shuffle': ...,
	//		'playing_position': ...
	//  }

});
````

## Compatibility
Since 1.3.0 node >=4.0 is required. Use 1.2.0 for older node versions.

## Todo

- [ ] Sometimes Spotify doesn't use the default port. [Want to help implement a mechanism for detecting the correct port?](https://github.com/onetune/spotify-web-helper/issues/6) 
