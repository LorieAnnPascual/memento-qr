import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * WCAG 2.1 A + AA scan. `exclude` is for third-party widgets we cannot fix
 * (for example the Puck editor canvas); every exclusion is listed where used.
 */
export async function checkA11y(page: Page, pageName: string, exclude: string[] = []): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  for (const selector of exclude) builder = builder.exclude(selector);

  const { violations } = await builder.analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} element(s), e.g. ${v.nodes[0]?.target.join(' ')}`,
  );

  expect(summary, `Accessibility violations on ${pageName}`).toEqual([]);
}
