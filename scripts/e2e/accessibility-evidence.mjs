function summarizeRelatedNode(node) {
  const summary = { target: node.target, html: node.html };
  if (node.xpath !== undefined) summary.xpath = node.xpath;
  if (node.ancestry !== undefined) summary.ancestry = node.ancestry;
  return summary;
}

function summarizeChecks(checks = []) {
  return checks.map((check) => {
    const summary = { id: check.id, impact: check.impact, message: check.message };
    if (check.data !== undefined) summary.data = check.data;
    if (check.relatedNodes?.length) summary.relatedNodes = check.relatedNodes.map(summarizeRelatedNode);
    return summary;
  });
}

function summarizeNode(node) {
  const summary = {
    target: node.target,
    html: node.html,
    any: summarizeChecks(node.any),
    all: summarizeChecks(node.all),
    none: summarizeChecks(node.none),
  };
  if (node.impact !== undefined) summary.impact = node.impact;
  if (node.xpath !== undefined) summary.xpath = node.xpath;
  if (node.ancestry !== undefined) summary.ancestry = node.ancestry;
  if (node.failureSummary !== undefined) summary.summary = node.failureSummary;
  return summary;
}

function summarizeError(error) {
  if (!error) return undefined;
  const summary = {};
  for (const key of ["name", "message", "stack", "ruleId", "method"]) {
    if (error[key] !== undefined) summary[key] = error[key];
  }
  if (error.cause) summary.cause = summarizeError(error.cause);
  return summary;
}

function summarizeRule(rule) {
  return {
    id: rule.id,
    description: rule.description,
    impact: rule.impact,
    help: rule.help,
    helpUrl: rule.helpUrl,
    tags: rule.tags,
    nodes: rule.nodes.map(summarizeNode),
    ...(rule.error ? { error: summarizeError(rule.error) } : {}),
  };
}

export function summarizeAxeAudit(result) {
  return {
    passes: result.passes.length,
    incompleteCount: result.incomplete.length,
    incompleteNodeCount: result.incomplete.reduce((count, rule) => count + rule.nodes.length, 0),
    violationNodeCount: result.violations.reduce((count, rule) => count + rule.nodes.length, 0),
    incomplete: result.incomplete.map(summarizeRule),
    violations: result.violations.map(summarizeRule),
  };
}
