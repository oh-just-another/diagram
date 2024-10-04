import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * axe-core sweep over the demo's initial render. Fails the build on
 * any critical / serious WCAG violation; serious-but-tolerated issues
 * should land in `` as deferred items and be
 * scoped out here via `.disableRules(...)`.
 */
test("demo passes axe-core critical / serious rules", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
});
