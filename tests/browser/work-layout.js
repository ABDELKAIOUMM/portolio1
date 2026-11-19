const { expect } = require("@playwright/test");

async function alignWorkScene(page) {
  await page.evaluate(() => {
    const stage = document.getElementById("workStage");
    const header = document.getElementById("siteHeader");
    const headerPosition = getComputedStyle(header).position;
    const offset = ["sticky", "fixed"].includes(headerPosition) ? header.getBoundingClientRect().height : 0;
    const trigger = window.ScrollTrigger && window.ScrollTrigger.getById("workCoverflow");
    const y = trigger ? trigger.start : stage.getBoundingClientRect().top + scrollY - offset;
    if (window.writeScroll) window.writeScroll(y);
    else window.scrollTo(0, y);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function expectWholeSceneVisible(page) {
  const layout = await page.locator("#workStage").evaluate((stage) => {
    const bounds = (node) => {
      const { top, bottom, height } = node.getBoundingClientRect();
      return { top, bottom, height };
    };
    const header = document.getElementById("siteHeader");
    const headerHeight = ["sticky", "fixed"].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height : 0;
    return {
      fitted: stage.classList.contains("is-fitted"), headerHeight, viewportHeight: innerHeight,
      stage: bounds(stage), heading: bounds(stage.querySelector(".work-heading")),
      controls: bounds(document.getElementById("workControls")),
      card: bounds(stage.querySelector(".project")),
      actions: bounds(stage.querySelector(".project-actions")),
      bodiesFit: Array.from(stage.querySelectorAll(".project-body")).every((body) => body.scrollHeight <= body.clientHeight + 1),
      actionHeights: Array.from(stage.querySelectorAll(".project-actions > *")).map((button) => button.getBoundingClientRect().height)
    };
  });
  expect(layout.fitted).toBe(true);
  expect(Math.abs(layout.stage.top - layout.headerHeight)).toBeLessThan(1.5);
  expect(layout.stage.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.heading.top).toBeGreaterThanOrEqual(layout.headerHeight - 1);
  expect(layout.card.top).toBeGreaterThanOrEqual(layout.heading.bottom - 1);
  expect(layout.actions.top).toBeGreaterThanOrEqual(layout.headerHeight - 1);
  expect(layout.actions.bottom).toBeLessThanOrEqual(layout.card.bottom + 1);
  expect(layout.card.bottom).toBeLessThanOrEqual(layout.controls.top + 1);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.bodiesFit).toBe(true);
  expect(Math.min(...layout.actionHeights)).toBeGreaterThanOrEqual(43);
}

module.exports = { alignWorkScene, expectWholeSceneVisible };
