const professionalAvatars = [
  "/avatars/black-woman-curls.png",
  "/avatars/black-woman-braids.png",
  "/avatars/black-woman-short-hair.png",
  "/avatars/black-woman-locs.png",
  "/avatars/black-man-beard.png",
  "/avatars/black-man-glasses.png",
  "/avatars/black-man-locs.png",
  "/avatars/black-man-cropped.png",
] as const;

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Assigns a stable professional portrait to a user.
 * The selected path is saved with the user during account creation.
 */
export function createUserAvatar(seedValue: string): string {
  return professionalAvatars[hashSeed(seedValue) % professionalAvatars.length];
}