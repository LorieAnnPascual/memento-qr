/** What to call someone on screen: their name, else the part of their email before the @. */
export function displayName(profile: { fullName: string | null; email: string }): string {
  return profile.fullName?.trim() || profile.email.split('@')[0];
}
