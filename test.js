var SpotifyWebHelper = require('./index')

var helper = SpotifyWebHelper()

helper.player.on('ready', function() {

	helper.player.on('play', function() {})
	helper.player.on('pause', function() {})
	helper.player.on('end', function() {})
	helper.player.on('track-change', function (track) {})

	console.log(helper.status)
	// 'status': {
	//  	'track': ...,
	//		'shuffle': ...,
	//		'playing_position': ...
	//  }
})