import { UserId } from '../../definitions/index.ts';

export interface Profile {
  readonly displayName: string;
}

export function createProfileLookup(
  loadFromDatabase: (id: UserId) => Promise<Profile | undefined>,
) {
  const cache = UserId.map<Profile>();

  return async function findProfile(id: UserId): Promise<Profile | undefined> {
    // Legacy and current spellings of the same ID share a cache entry.
    const cached = cache.get(id);
    if (cached) return cached;

    const profile = await loadFromDatabase(id);
    if (profile) cache.set(id, profile);
    return profile;
  };
}
