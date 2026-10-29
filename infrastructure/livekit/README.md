# LiveKit integration

The API provider creates a room through the LiveKit RoomService API and signs short-lived participant JWTs using the API key/secret. The key and secret are server-only. Participant grants are derived from the authorized host/participant record: host may publish; a viewer receives subscribe-only rights; accepted co-hosts require a host decision and a persisted participant role. The browser uses the LiveKit JS SDK pinned to v2.23.0 from jsDelivr in this build.

Set `LIVEKIT_URL` (the `wss://` URL shown by your deployment), `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Confirm websocket connectivity and TURN/UDP/TCP routing on the actual host network. Room token issuance is implemented; end-to-end video/audio operation still requires live credentials and device testing.

Official SDK reference: https://docs.livekit.io/reference/client-sdk-js/ . Token grants: https://docs.livekit.io/frontends/reference/tokens-grants/ .
