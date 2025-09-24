// ElevenLabs + TTS runtime config

/** Default voice (can be overridden from UI/state) */
export const DEFAULT_VOICE_ID = "1SM7GgM6IMuvQlz2BwM3"; // placeholder

/** ElevenLabs model (keep editable) */
export const ELEVEN_MODEL_ID = "1SM7GgM6IMuvQlz2BwM3";

/** Cap spoken length to control cost/latency (client should trim `say`) */
export const MAX_SAY_SECONDS = 12;

/** Base URL for ElevenLabs API */
export const ELEVEN_BASE_URL = "https://api.elevenlabs.io/v1";
