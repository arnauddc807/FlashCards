/** Turns the embedded base64 skill back into a downloadable file. */

import { SKILL_BASE64, SKILL_FILENAME, SKILL_BYTES } from './skillfile.js';

export { SKILL_FILENAME, SKILL_BYTES };

/**
 * The skill ships as a zip archive embedded in the bundle, so the download
 * works offline and from a home-screen install with no network at all.
 */
export async function skillBlob() {
  const binary = atob(SKILL_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/zip' });
}
