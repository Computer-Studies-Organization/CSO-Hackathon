// Above this size the browser cannot hold source bytes + WASM heap + encoded
// output at once, so the file is uploaded untouched and the local batch script
// (scripts/reduce-videos.mjs) reduces it instead.
export const TRANSCODE_MAX_BYTES = 400 * 1024 * 1024
