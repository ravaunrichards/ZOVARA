# LiveKit integration

The API signs participant tokens using HS256 with `LIVEKIT_API_KEY` as issuer and the secret only on the server. Tokens last 15 minutes by default and are scoped to a single room. Host grants publish permission; viewers are subscribe-only; host controls are checked on the server. A valid LiveKit server URL, API key/secret, a routable network and media permissions are required for actual audio/video.

The web client uses the documented JS Client SDK pinned to version 2.23.0. Camera/microphone prompts are initiated after the user presses Start or Join. Camera flipping calls the local track restart path and reports unsupported hardware instead of claiming success. Viewer counts must be maintained from participant presence events; do not inject estimated counts. Public room discovery shows the server-maintained count, which remains conservative until the live participant-count trigger and actual participant join/leave events execute against the provisioned database.

Official references: https://docs.livekit.io/reference/client-sdk-js/ and https://docs.livekit.io/frontends/reference/tokens-grants/ .
