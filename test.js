var SpotifyWebHelper = require('./index');

var helper = new SpotifyWebHelper();

helper.player.on('ready', () => {
	helper.player.on('play', function () {
		console.log('play');
	});
	helper.player.on('pause', function () {
		console.log('paused');
	});
	helper.player.on('end', function () {
		console.log('ended');
	});
	helper.player.on('track-will-change', function (track) {
		console.log('new track', track);
	});
	helper.player.on('status-will-change', function (status) {
		console.log('updated status', status);
	});
	console.log(helper.status);
	// 'status': {
	//  	'track': ...,
	//		'shuffle': ...,
	//		'playing_position': ...
	//  }
});

helper.player.on('error', error => console.error(error));
