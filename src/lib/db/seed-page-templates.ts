/**
 * Seeds (or updates) the system landing page templates into page_templates.
 * Safe to re-run: matches existing rows by name + is_system and updates them.
 *
 *   pnpm db:seed-page-templates
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const [{ db }, { pageTemplates }, { eq, and }, { SYSTEM_PAGE_TEMPLATES }] = await Promise.all([
    import('./index'),
    import('./schema'),
    import('drizzle-orm'),
    import('../pages/templates'),
  ]);

  for (const template of SYSTEM_PAGE_TEMPLATES) {
    const [existing] = await db
      .select({ id: pageTemplates.id })
      .from(pageTemplates)
      .where(and(eq(pageTemplates.name, template.name), eq(pageTemplates.isSystem, true)))
      .limit(1);

    if (existing) {
      await db
        .update(pageTemplates)
        .set({
          description: template.description,
          category: template.category,
          puckData: template.puckData,
          updatedAt: new Date(),
        })
        .where(eq(pageTemplates.id, existing.id));
      console.log(`Updated: ${template.name}`);
    } else {
      await db.insert(pageTemplates).values({
        userId: null,
        name: template.name,
        description: template.description,
        category: template.category,
        puckData: template.puckData,
        isPublic: true,
        isSystem: true,
      });
      console.log(`Created: ${template.name}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
