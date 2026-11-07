/**
 * Server-only access to the mock-draft data file. Client components fetch
 * /mock/nfl-2027.json instead, so these 110 KB never land in a browser bundle.
 *
 * This is an import rather than the fs read /rosters uses. /rosters only reads
 * at build time, but /mock-draft and the OG route render per request, and a
 * file under public/ isn't guaranteed to be in the function bundle on Vercel.
 */
import raw from '../../../public/mock/nfl-2027.json';
import type { MockDraftData } from './engine';

export function getMockDraftData(): MockDraftData {
  return raw as unknown as MockDraftData;
}
