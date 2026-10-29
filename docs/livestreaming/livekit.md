# Livestreaming with LiveKit

The API creates livestream records and issues short-lived LiveKit access tokens when LiveKit credentials exist. A user-facing start/join flow is not equivalent to a tested production broadcast pipeline.

Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` as server secrets. Do not expose the API secret in the browser. Validate the host/participant roles, room lifecycle, viewer count reconciliation, reconnect behavior, recording/retention policy, moderation and abuse reporting using real supported devices.

Without provider credentials, start/join operations return a feature-unavailable response instead of showing a fake live session.
