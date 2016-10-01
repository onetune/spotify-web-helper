var SpotifyWebHelper = require('./index');

var helper = new SpotifyWebHelper();

helper.player.on('ready', function () {
	helper.player.on('play', function () {
		console.log('play');
	});
	helper.player.on('pause', function () {
		console.log('paused');
	});
	helper.player.on('end', function () {
		console.log('ended');
	});
	helper.player.on('track-change', function (track) {
		console.log('track changed', track);
	});
	helper.player.on('error', function (error) {
		console.error(error);
	});
	console.log(helper.status);
	// 'status': {
	//  	'track': ...,
	//		'shuffle': ...,
	//		'playing_position': ...
	//  }
});
