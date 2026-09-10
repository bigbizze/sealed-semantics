import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { UserId } from '../definitions/index.ts';

export interface Profile {
  readonly displayName: string;
}

export function createProfileLookup(
  loadFromDatabase: (id: UserId) => Promise<Profile | undefined>,
) {
  const cache = new Map<UserId, Profile>();

  return async function findProfile(id: UserId): Promise<Profile | undefined> {
    // Legacy and current spellings of the same ID share a cache entry.
    const cached = cache.get(id);
    if (cached) return cached;

    const profile = await loadFromDatabase(id);
    if (profile) cache.set(id, profile);
    return profile;
  };
}

// Run directly; importing the application functions in tests does not run the demo.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // ############################################################
  console.log(
    '\n\u001b[1m========== Profile cache: aliases share a database lookup ==========\u001b[22m\n',
  );

  const currentUser = 'usr_0123456789abcdef0123456789abcdef';
  const alice = UserId.codec.parse(currentUser);
  let reads = 0;
  const findProfile = createProfileLookup(async (id) => {
    reads++;
    console.log('  Database read:', z.encode(UserId.codec, id));
    return { displayName: id === alice ? 'Alice' : 'Bob' };
  });
  const spellings = [
    'user:01234567-89ab-cdef-0123-456789abcdef',
    currentUser,
    'usr_abcdef0123456789',
    'usr_abcdef0123456789',
  ];
  for (const spelling of spellings) {
    console.log('\nLookup input:', spelling);
    const readsBefore = reads;
    const user = UserId.codec.parse(spelling);
    const profile = await findProfile(user);
    console.log('  Source:', reads === readsBefore ? 'cache' : 'database');
    console.log('  Profile:', profile?.displayName);
    console.log('  User suffix:', user.view.suffix);
  }
  console.log('\nDatabase reads for four lookups:', reads);
  assert.equal(reads, 2);
}
