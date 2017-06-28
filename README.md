# Spotify Web Helper for node.js

This is a rewrite of the excellent [node-spotify-webhelper](https://www.npmjs.com/package/node-spotify-webhelper), but with support for events, so you don't have to do `getStatus()` all the time. It also is faster, and starts SpotifyWebHelper on OS X, not just on Windows.  
I am also trying to maintain the project and handle issues, at least every 2 months. Pull requests welcome!

## Install
```
$ npm install spotify-web-helper --save
```

## Example
````js
const SpotifyWebHelper = require('spotify-web-helper');

const helper = SpotifyWebHelper();

helper.player.on('error', err => {
  if (error.message.match(/No user logged in/)) {
    // also fires when Spotify client quits
  } else {
    // other errors: /Cannot start Spotify/ and /Spotify is not installed/
  }
});
helper.player.on('ready', () => {

  // Playback events
  helper.player.on('play', () => { });
  helper.player.on('pause', () => { });
  helper.player.on('seek', newPosition => {});
  helper.player.on('end', () => { });
  helper.player.on('track-will-change', track => {});
  helper.player.on('status-will-change', status => {});

  // Playback control. These methods return promises
  helper.player.play('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
  helper.player.pause();
  helper.player.seekTo(60); // 60 seconds

  // Get current playback status, including up to date playing position
  console.log(helper.status);
  // 'status': {
  //    'track': ...,
  //    'shuffle': ...,
  //    'playing_position': ...
  //  }

});
````

## API

### Class: SpotifyWebHelper ###

#### new SpotifyWebHelper([opts])

 - `opts` `<object>` Options.
   - `opts.port` `<number>` Web helper port. Default is 4370.

#### helper.player
 - `<`[`PlayerEventEmitter`](#class-playereventemitter)`>`

#### helper.status
 - `<`[`SpotifyStatus`](#typedef-spotifystatus)`>`



### Class: PlayerEventEmitter ###
Inherits from [EventEmitter](https://nodejs.org/dist/latest/docs/api/events.html#events_class_eventemitter).

#### Event: 'end'
Playback has ended.

#### Event: 'error'
An error has occurred. The listener callback receive the `<Error>` as first
argument. An error occurs when Spotify cannot be started, is not installed, or quits.
Refer to the example above to see how to distinguish errors.

#### Event: 'pause'
Playback has paused.

#### Event: 'play'
Playback has started.

#### Event: 'seek'
User has changed the current playing positon.

#### Event: 'ready'
This player object is ready to use.

#### Event: 'status-will-change'
Current status has changed. The listener callback receive a `<`[`SpotifyStatus`](#typedef-spotifystatus)`>`
object as first argument.

`helper.status` will be changed by the new status after this event is emitted.

#### Event: 'track-will-change'
Current track has changed. The listener callback receive a `<`[`SpotifyTrack`](#typedef-spotifytrack)`>`
object as first argument.

#### player.pause([unpause]);
 - `unpause` `<boolean>` `true` to resume playback. Default is false.
 - Returns `<Promise<`[`SpotifyStatus`](#typedef-spotifystatus)`>>`

#### player.play(spotifyUri);
 - `spotifyUri` `<string>` Spotify URI.
 - Returns `<Promise<`[`SpotifyStatus`](#typedef-spotifystatus)`>>`



### Typedef: SpotifyStatus ###

#### status.version
 - `<number>`
Web helper API version. Currently 9.

#### status.client_version
 - `<string>`
Client version.

#### status.playing
 - `<boolean>`
`true` if a track is playing.

#### status.shuffle
 - `<boolean>`
`true` if shuffle is enabled.

#### status.repeat
 - `<boolean>`
`true` if repeat is enabled.

#### status.play_enabled
 - `<boolean>`
`true` if playing is available.

#### status.prev_enabled
 - `<boolean>`
`true` if skipping to previous track is available.

#### status.next_enabled
 - `<boolean>`
`true` if skipping to next track is available.

#### status.track
 - `<`[`SpotifyTrack`](#typedef-spotifytrack)`>`
Current track.

#### status.context
 - `<object>`

#### status.playing_position
 - `<number>`
Current track position, in counting seconds.

#### status.server_time
 - `<number>`
Server time in UNIX time.

#### status.volume
 - `<number>`
Audio volume, from 0 to 1.

#### status.online
 - `<boolean>`

#### status.open_graph_state
 - `<object>`

#### status.running
 - `<boolean>`



### Typedef: SpotifyTrack ###

#### track.track_resource
 - `<`[`SpotifyResource`](#typedef-spotifyresource)`>`
Song resource.

#### track.artist_resource
 - `<`[`SpotifyResource`](#typedef-spotifyresource)`>`
Artist resource.

#### track.album_resource
 - `<`[`SpotifyResource`](#typedef-spotifyresource)`>`
Album resource.

#### track.length
 - `<number>`
Track length in seconds.

#### track.track_type
 - `<string>`



### Typedef: SpotifyResource ###

#### res.name
 - `<string>`
Name.

#### res.uri
 - `<string>`
Spotify URI.

#### res.location
 - `<object>`
Object containing attribute `og`, which represent an HTTPS URL to the resource.



## Compatibility
Since 1.3.0 node >=4.0 is required. Use 1.2.0 for older node versions.
