import { asc } from 'drizzle-orm';

import { db } from '@/lib/db';
import { userProfiles } from '@/lib/db/schema';

import { displayName } from './display-name';

export interface TeamMember {
  id: string;
  name: string;
}

/** Everyone on the team (a handful of people), for assignee pickers and "who" labels. */
export async function getTeamMembers(): Promise<TeamMember[]> {
  const rows = await db
    .select({ id: userProfiles.id, fullName: userProfiles.fullName, email: userProfiles.email })
    .from(userProfiles)
    .orderBy(asc(userProfiles.fullName), asc(userProfiles.email));

  return rows.map((row) => ({ id: row.id, name: displayName(row) }));
}
