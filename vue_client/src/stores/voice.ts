// Copyright (c) 2026 Brad Root
// SPDX-License-Identifier: MPL-2.0

// Voice call session for the web client. The browser IS the WebRTC engine here,
// so this is thin: get a room-scoped token from /api/voice/token, connect the
// LiveKit room, publish the mic, and play remote audio through hidden <audio>
// elements.
//
// Bundle bloat, addressed: livekit-client is ~500 KB and voice is off by default
// on most instances, so it is pulled in with a dynamic import() inside the
// connect path — Vite splits it into its own chunk fetched only at first call.
//
// The Room and all Track/element handles are held module-scoped, NOT in Pinia
// state: they are non-serializable and must not be wrapped in Vue's reactive
// proxy, which would break livekit's object identity. State carries only the
// primitives the UI renders.

import { defineStore } from 'pinia';
import type {
  Room,
  RemoteTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  LocalVideoTrack,
  Participant,
} from 'livekit-client';
import { api } from '../api.js';

interface VoiceTokenResponse {
  token: string;
  room: string;
  url: string;
}

// Non-reactive session handles (see header note).
let room: Room | null = null;
// True while OUR OWN toggleMute() is awaiting the SFU — the TrackMuted event
// fires before the await resolves, and without this flag a self-mute is
// indistinguishable from an op's server-mute.
let selfMuteInFlight = false;

const OP_MUTED_MSG = 'a channel operator muted your microphone';
let audioEls: HTMLAudioElement[] = [];
// identity → remote MIC track, for per-participant volume.
let tracksByIdentity = new Map<string, RemoteAudioTrack>();
// `${identity}|${source}` → remote VIDEO track. Non-reactive: a MediaStreamTrack
// must never be wrapped in a Vue proxy, and the tiles look tracks up by key.
let videoByKey = new Map<string, RemoteVideoTrack>();
// Our own published video, for the self-preview tiles.
let localVideoByKey = new Map<string, LocalVideoTrack>();

function videoKey(identity: string, source: string): string {
  return `${identity}|${source}`;
}

export const useVoiceStore = defineStore('voice', {
  state: () => ({
    active: false,
    connecting: false,
    muted: false,
    // Human label for what's being called, e.g. "#dev".
    label: '',
    // The channel/DM this call belongs to, so UI can tell "in THIS call" from
    // "in a call somewhere else".
    networkId: null as number | null,
    target: '',
    // Remote participant identities (their IRC nicks).
    participants: [] as string[],
    // Subset of `participants` currently detected as speaking.
    speaking: [] as string[],
    // Per-identity local playback volume, 0..1 (default 1 when absent).
    volumes: {} as Record<string, number>,
    error: null as string | null,
    // True when we joined via a guest link rather than an account. Guests have
    // no IRC session, so UI that reads channel modes (op moderation) must not
    // render for them.
    isGuest: false,
    // Whether OUR camera / screen share is publishing.
    cameraOn: false,
    screenOn: false,
    // Render list for the video grid — one entry per publishing track.
    videoTiles: [] as Array<{ identity: string; source: 'camera' | 'screen_share'; self: boolean }>,
  }),
  actions: {
    /** Mint a token for a channel/DM on a network, then connect the room. */
    async startCall(networkId: number, target: string, label: string) {
      if (this.active || this.connecting) return;
      this.connecting = true;
      this.error = null;
      this.label = label;
      this.networkId = networkId;
      this.target = target;
      try {
        // Token first, so a 503/403/409 fails fast without paying to load the SDK.
        const { token, url } = await api<VoiceTokenResponse>('/api/voice/token', {
          method: 'POST',
          body: { networkId, target },
        });

        await this.connectRoom(url, token);
      } catch (e: unknown) {
        // Order matters: cleanup() clears `error` (so leaving a call never
        // strands the bar open on a stale message) — set the failure reason
        // AFTER it so the failed-call state still says why.
        await this.cleanup();
        this.error = e instanceof Error ? e.message : 'could not start call';
      } finally {
        this.connecting = false;
      }
    },

    /**
     * Connect an already-minted token and wire the room. Shared by the member
     * path (startCall) and the guest path (joinAsGuest) so a guest gets
     * identical handling — volume, op-mute sync, speaker detection — instead of
     * a second, subtly-different copy of this wiring.
     *
     * `canPublish:false` (a listen-only guest link) skips enabling the mic:
     * the SFU would reject the publish anyway, and asking for the microphone
     * would pop a permission prompt for a device we're forbidden to use.
     */
    async connectRoom(url: string, token: string, canPublish = true) {
      // Lazy chunk: livekit-client only lands over the network at first call.
      const { Room, RoomEvent, Track } = await import('livekit-client');

      const r = new Room({ adaptiveStream: true, dynacast: true });
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub, participant) => {
        if (track.kind !== Track.Kind.Audio) return; // video: PR'd separately
        const audio = track as RemoteAudioTrack;
        // Attach ALL audio so it plays, but only bind the per-participant
        // volume slider to the mic track (a native client may also send
        // screen-share audio, which shares the participant identity).
        const el = audio.attach() as HTMLAudioElement;
        el.autoplay = true;
        document.body.appendChild(el);
        audioEls.push(el);
        if (String(pub.source) === 'microphone') {
          tracksByIdentity.set(participant.identity, audio);
          const stored = this.volumes[participant.identity];
          if (stored != null) audio.setVolume(stored);
        }
      })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          // Only the mic unsubscribing clears the volume mapping — a
          // participant can also carry screen-share audio, and losing THAT
          // must not orphan their volume slider.
          if (String(pub.source) === 'microphone') tracksByIdentity.delete(participant.identity);
          const detached = track.detach();
          detached.forEach((el) => el.remove());
          audioEls = audioEls.filter((el) => !detached.includes(el));
        })
        .on(RoomEvent.TrackMuted, (pub, participant) => {
          // Keep `muted` honest when the mute didn't come from OUR toggle —
          // an op's server-mute would otherwise be invisible to the mutee
          // (icon still live, no feedback at all). selfMuteInFlight excludes
          // our own toggle, whose TrackMuted lands before its await resolves.
          if (
            !selfMuteInFlight &&
            String(pub.source) === 'microphone' &&
            participant.identity === r.localParticipant.identity &&
            !this.muted
          ) {
            this.muted = true;
            this.error = OP_MUTED_MSG;
          }
        })
        .on(RoomEvent.TrackUnmuted, (pub, participant) => {
          // Self-unmute after a server mute is ALLOWED on self-hosted
          // LiveKit (mute-locking is a Cloud feature) — sync the state and
          // retire the op-mute notice rather than leaving it lying around.
          if (
            String(pub.source) === 'microphone' &&
            participant.identity === r.localParticipant.identity
          ) {
            this.muted = false;
            if (this.error === OP_MUTED_MSG) this.error = null;
          }
        })
        .on(RoomEvent.ParticipantConnected, () => this.syncParticipants())
        .on(RoomEvent.ParticipantDisconnected, () => this.syncParticipants())
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const self = r.localParticipant.identity;
          this.speaking = speakers.map((p) => p.identity).filter((id) => id !== self);
        })
        .on(RoomEvent.Disconnected, () => {
          void this.cleanup();
        });

      await r.connect(url, token);
      // Hold the handle BEFORE enabling the mic: if the user denies mic
      // permission, the catch's cleanup() must still disconnect this
      // already-joined room — otherwise they stay in the call as a ghost
      // participant with no UI to leave.
      room = r;
      await r.localParticipant.setMicrophoneEnabled(true);
      this.active = true;
      this.muted = false;
      this.error = null;
      this.syncParticipants();
      this.active = true;
      this.muted = !canPublish;
      this.error = null;
      this.syncParticipants();
    },

    /**
     * Join via a guest link (`/call/:token`) — no account, no IRC session.
     * The link token is exchanged for a room-scoped LiveKit token whose publish
     * right the minting op chose; the SFU enforces it.
     */
    async joinAsGuest(linkToken: string, name: string) {
      if (this.active || this.connecting) return;
      this.connecting = true;
      this.error = null;
      this.isGuest = true;
      this.label = 'Guest call';
      try {
        const r = await api<{ token: string; url: string; canPublish: boolean }>(
          '/api/voice/guest-token',
          { method: 'POST', body: { token: linkToken, name } },
        );
        await this.connectRoom(r.url, r.token, r.canPublish);
      } catch (e: unknown) {
        await this.cleanup();
        this.error = e instanceof Error ? e.message : 'could not join the call';
      } finally {
        this.connecting = false;
      }
    },

    addTile(identity: string, source: string, self: boolean) {
      if (source !== 'camera' && source !== 'screen_share') return;
      if (this.videoTiles.some((t) => t.identity === identity && t.source === source)) return;
      this.videoTiles.push({ identity, source, self });
    },

    removeTile(identity: string, source: string) {
      this.videoTiles = this.videoTiles.filter(
        (t) => !(t.identity === identity && t.source === source),
      );
    },

    /** Publish/unpublish our camera. */
    async toggleCamera() {
      if (!room) return;
      const want = !this.cameraOn;
      try {
        await room.localParticipant.setCameraEnabled(want);
        this.cameraOn = want;
        this.syncLocalVideo();
      } catch (e: unknown) {
        // Denied permission or no device — say so instead of leaving the button
        // silently toggled to a state the SFU never reached.
        this.error = e instanceof Error ? e.message : 'could not start the camera';
      }
    },

    /**
     * Publish/unpublish a screen share, WITH its audio: sharing a video or a
     * game with no sound is the common disappointment here, and the browser
     * folds the choice into the same picker.
     */
    async toggleScreen() {
      if (!room) return;
      const want = !this.screenOn;
      try {
        await room.localParticipant.setScreenShareEnabled(want, { audio: true });
        this.screenOn = want;
        this.syncLocalVideo();
      } catch (e: unknown) {
        // Cancelling the OS picker rejects. That's a normal outcome, not a
        // failure worth shouting about — just leave the toggle off.
        this.screenOn = false;
        this.syncLocalVideo();
        const msg = e instanceof Error ? e.message : '';
        if (!/permission|denied|cancel|abort/i.test(msg)) this.error = msg || 'screen share failed';
      }
    },

    /** Reconcile our own tiles + local track handles with what we publish. */
    syncLocalVideo() {
      const me = room?.localParticipant;
      localVideoByKey = new Map();
      if (!me) {
        this.videoTiles = this.videoTiles.filter((t) => !t.self);
        return;
      }
      const self = me.identity;
      for (const source of ['camera', 'screen_share'] as const) {
        const on = source === 'camera' ? this.cameraOn : this.screenOn;
        const pub = [...me.videoTrackPublications.values()].find(
          (p) => String(p.source) === source,
        );
        const track = pub?.videoTrack as LocalVideoTrack | undefined;
        if (on && track) {
          localVideoByKey.set(videoKey(self, source), track);
          this.addTile(self, source, true);
        } else {
          this.removeTile(self, source);
        }
      }
    },

    /** Called by a VideoTile on mount. Attaching is what makes adaptiveStream
     *  actually deliver the track, so the tile — not the store — owns it. */
    attachVideo(identity: string, source: string, el: HTMLVideoElement) {
      const key = videoKey(identity, source);
      (videoByKey.get(key) ?? localVideoByKey.get(key))?.attach(el);
    },

    detachVideo(identity: string, source: string, el: HTMLVideoElement) {
      const key = videoKey(identity, source);
      (videoByKey.get(key) ?? localVideoByKey.get(key))?.detach(el);
    },

    syncParticipants() {
      this.participants = room
        ? Array.from(room.remoteParticipants.values()).map((p) => p.identity)
        : [];
    },

    /** Set a remote participant's local playback volume (0..1). Kept in state so
     *  it survives a track re-subscribe within the same session. */
    setVolume(identity: string, volume: number) {
      const v = Math.max(0, Math.min(1, volume));
      this.volumes[identity] = v;
      tracksByIdentity.get(identity)?.setVolume(v);
    },

    async toggleMute() {
      if (!room) return;
      // Flip state only after the SFU confirms. An optimistic flip that then
      // rejects (device error, mid-reconnect) would render the mic-slash icon
      // while the track is still transmitting — the worst kind of wrong.
      const wantMuted = !this.muted;
      selfMuteInFlight = true;
      try {
        await room.localParticipant.setMicrophoneEnabled(!wantMuted);
        this.muted = wantMuted;
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : 'could not toggle mute';
      } finally {
        selfMuteInFlight = false;
      }
    },

    clearError() {
      this.error = null;
    },

    async leave() {
      await this.cleanup();
    },

    async cleanup() {
      if (room) {
        try {
          await room.disconnect();
        } catch {
          /* already gone */
        }
        room = null;
      }
      audioEls.forEach((el) => el.remove());
      audioEls = [];
      tracksByIdentity = new Map();
      // Drop video handles too, or the camera light stays on after /leave and
      // the next call opens showing the last one's tiles.
      videoByKey = new Map();
      localVideoByKey = new Map();
      this.active = false;
      this.connecting = false;
      this.muted = false;
      this.participants = [];
      this.speaking = [];
      this.volumes = {};
      this.networkId = null;
      this.target = '';
      this.isGuest = false;
      this.cameraOn = false;
      this.screenOn = false;
      this.videoTiles = [];
      // In-call notices (op-mute, mute-toggle failures) die with the call —
      // otherwise the CallBar stays wedged open showing them after /leave.
      // startCall's catch re-sets its failure reason after calling this.
      this.error = null;
    },
  },
});
