/**
 * Seeds (or updates) the system QR design templates into qr_templates.
 * Safe to re-run — matches existing rows by name + is_system and updates
 * their style_config instead of creating duplicates.
 *
 *   pnpm db:seed-templates
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const [{ db }, { qrTemplates }, { eq, and }, { SYSTEM_QR_TEMPLATES }] = await Promise.all([
    import('./index'),
    import('./schema'),
    import('drizzle-orm'),
    import('../qr/templates'),
  ]);

  for (const template of SYSTEM_QR_TEMPLATES) {
    const [existing] = await db
      .select({ id: qrTemplates.id })
      .from(qrTemplates)
      .where(and(eq(qrTemplates.name, template.name), eq(qrTemplates.isSystem, true)))
      .limit(1);

    if (existing) {
      await db
        .update(qrTemplates)
        .set({
          description: template.description,
          category: template.category,
          styleConfig: template.styleConfig,
          updatedAt: new Date(),
        })
        .where(eq(qrTemplates.id, existing.id));
      console.log(`Updated: ${template.name}`);
    } else {
      await db.insert(qrTemplates).values({
        userId: null,
        name: template.name,
        description: template.description,
        category: template.category,
        styleConfig: template.styleConfig,
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
