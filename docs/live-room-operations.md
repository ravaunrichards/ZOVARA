# ZOVARA public LIVE room operations

## Public room lifecycle

A creator must be authenticated to start a broadcast. POST /api/v1/lives creates a database row in scheduled state, creates a LiveKit room, and returns a short-lived host publishing token. A session is not listed as LIVE yet.

The browser connects the host to LiveKit and enables camera and microphone publishing. It then calls POST /api/v1/lives/:id/activate. The API verifies that LiveKit's room participant list contains the authenticated host identity before changing the session to live. If the host never connects, no public LIVE card is shown.

The activation check retries briefly to account for propagation between the LiveKit client connection and RoomService participant listing. If connection or activation fails, the host client ends the scheduled room rather than leaving a public placeholder.

## Public viewing and account actions

- GET /api/v1/live is public and lists only public sessions whose host is actually connected to LiveKit.
- POST /api/v1/lives/:id/token gives an anonymous visitor a subscribe-only guest token for a public LIVE session. It cannot publish audio, video, or data.
- Signed-in users use the same endpoint and are admitted by join_live_session; public rooms are open to all accounts unless a block rule applies.
- Anonymous guests may read public LIVE chat. Sending chat messages and sending gifts still require an account.
- Private, followers-only and other restricted rooms continue to use their audience checks.

## Participant and viewer count source

The API calls LiveKit RoomService ListParticipants for each live room snapshot. The host identity is excluded from the viewer total. Guest, cohost, and moderator participants are excluded from the viewer total because they are on-stage participants rather than viewers. All other connected remote LiveKit participants—including temporary anonymous guest identities—are counted as viewers.

The API returns viewer_count_verified: true and viewer_count_source: "livekit" only when it has successfully queried the session service. When LiveKit is not reachable, the public discovery endpoint does not advertise unverified database rows as LIVE. The room overlay polls /api/v1/lives/:id/presence and shows the count from that verified snapshot. The service also writes current_viewer_count and actual_peak_viewers back to live_sessions.

The participant snapshot has a short server cache to prevent high-frequency room-list calls. It is not a fabricated count or a client-side increment.

## Room capacity

LIVEKIT_DEFAULT_ROOM_MAX_PARTICIPANTS=0 removes the repository's previous hard-coded 100 participant ceiling. LiveKit's room service defines zero as no room-specific maximum; the LiveKit account/plan and infrastructure limits still apply. The application does not claim to override provider-level quotas.

## Cleanup and failure handling

- Old scheduled rows with no scheduled start are considered abandoned after three minutes only if LiveKit confirms that the host is absent or the room no longer exists.
- A connected host in scheduled state is preserved so activation can be retried.
- A live row whose host is absent for more than 45 seconds is ended and its LiveKit room is deleted.
- An absent LiveKit room is treated as ended rather than advertised as LIVE.
- GET /api/v1/live/health performs a LiveKit RoomService health check without exposing credentials.

## Verification requirements

A real device test is still required for camera/microphone permissions, host track publishing, anonymous viewer playback, signed-in viewer playback, public chat read, signed-in chat send, leave/end behavior, and participant counts. Counts must be compared against LiveKit RoomService participants during the test; the database row by itself is not proof that a room is live.
