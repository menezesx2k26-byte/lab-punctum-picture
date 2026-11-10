import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAxeAudit } from "./accessibility-evidence.mjs";

test("preserves every axe node and check message for incomplete and violating rules", () => {
  const nodes = Array.from({ length: 10 }, (_, index) => ({
    target: [`#target-${index}`],
    html: `<span id="target-${index}">label</span>`,
    impact: "serious",
    xpath: [`/html/body/span[${index + 1}]`],
    ancestry: [`body > span#target-${index}`],
    failureSummary: `failure ${index}`,
    any: [{
      id: `any-${index}`,
      impact: "serious",
      message: `any ${index}`,
      data: { fgColor: "#ffffff", bgColor: "#777777", contrastRatio: 4.48, messageKey: "bgImage" },
      relatedNodes: [{ target: [`#background-${index}`], html: `<div id="background-${index}"></div>` }],
    }],
    all: [{ id: `all-${index}`, impact: null, message: `all ${index}` }],
    none: [{ id: `none-${index}`, impact: "moderate", message: `none ${index}` }],
  }));
  const result = summarizeAxeAudit({
    passes: [{ id: "rule-pass" }],
    incomplete: [{
      id: "color-contrast",
      description: "Ensure sufficient contrast",
      impact: "serious",
      help: "Check contrast",
      helpUrl: "https://example.invalid/contrast",
      tags: ["wcag2aa", "wcag21aa"],
      error: {
        name: "AuditError",
        message: "synthetic error",
        stack: "synthetic stack",
        ruleId: "color-contrast",
        method: "evaluate",
        cause: { name: "CauseError", message: "synthetic cause", stack: "cause stack" },
        errorNode: { private: "not part of axe IncompleteResult.error" },
      },
      nodes,
    }],
    violations: [{ id: "label", impact: "critical", help: "Provide labels", nodes }],
  });

  assert.equal(result.passes, 1);
  assert.equal(result.incompleteCount, 1);
  assert.equal(result.incompleteNodeCount, 10);
  assert.equal(result.violationNodeCount, 10);
  assert.equal(result.incomplete[0].nodes.length, 10);
  assert.equal(result.violations[0].nodes.length, 10);
  assert.equal(result.incomplete[0].nodes[9].any[0].message, "any 9");
  assert.equal(result.violations[0].nodes[9].none[0].message, "none 9");
  assert.deepEqual(result.incomplete[0].nodes[9].any[0].data, {
    fgColor: "#ffffff",
    bgColor: "#777777",
    contrastRatio: 4.48,
    messageKey: "bgImage",
  });
  assert.deepEqual(result.incomplete[0].nodes[9].any[0].relatedNodes, [{
    target: ["#background-9"],
    html: '<div id="background-9"></div>',
  }]);
  assert.equal(result.incomplete[0].nodes[9].html, '<span id="target-9">label</span>');
  assert.equal(result.incomplete[0].nodes[9].impact, "serious");
  assert.deepEqual(result.incomplete[0].nodes[9].xpath, ["/html/body/span[10]"]);
  assert.deepEqual(result.incomplete[0].tags, ["wcag2aa", "wcag21aa"]);
  assert.deepEqual(result.incomplete[0].error, {
    name: "AuditError",
    message: "synthetic error",
    stack: "synthetic stack",
    ruleId: "color-contrast",
    method: "evaluate",
    cause: { name: "CauseError", message: "synthetic cause", stack: "cause stack" },
  });
});
