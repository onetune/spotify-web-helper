const processExists = require('process-exists');
const {snapshot} = require("process-list");

const SPOTIFY = Symbol();
const SPOTIFY_WEB_HELPER = Symbol();

function isSpotifyRunning() {
	return new Promise(function (resolve, reject) {
		if (process.platform === 'darwin') {
			return processExists('Spotify', function (err, exists) {
				if (err) {
					reject(err);
				} else {
					resolve(exists);
				}
			});
		} else {
			return snapshot('name')
				.then(tasks => {
					resolve(tasks.filter(task =>
						task.name.toUpperCase() === 'SPOTIFY.EXE' ||
						task.name.toUpperCase() === 'SPOTIFY'
					).length > 0);
				})
				.catch(reject);
		}
	});
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
			return snapshot('name')
				.then(tasks => {
					resolve(tasks.filter(task =>
						task.name.toUpperCase() === 'SPOTIFYWEBHELPER.EXE'
					).length > 0);
				})
				.catch(reject);
		} else {
			// SpotifyWebHelper starts with Spotify by default in Linux
			return resolve(true);
		}
	});
}

/**
 *
 * @param name Name of the tool to check that process status for.
 * @returns {Promise} Provides a boolean on resolving.
 */
function of(which) {
	if (which === SPOTIFY) {
		return isSpotifyRunning();
	} else if (which === SPOTIFY_WEB_HELPER) {
		return isSpotifyWebHelperRunning();
	}
}

module.exports = {
  of,
  SPOTIFY,
  SPOTIFY_WEB_HELPER,
};
