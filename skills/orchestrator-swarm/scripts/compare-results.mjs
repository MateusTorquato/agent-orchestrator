#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const runDir = path.resolve(args["run-dir"] || ".");
const outputsDir = path.join(runDir, "outputs");
const outputPath = path.join(runDir, "comparison.md");
const mode = args.mode || "competitive";

if (!fs.existsSync(outputsDir)) {
  console.error(`Outputs directory not found: ${outputsDir}`);
  process.exit(1);
}

const outputs = fs.readdirSync(outputsDir)
  .filter((file) => /\.(md|txt|json)$/i.test(file))
  .map((file) => {
    const content = fs.readFileSync(path.join(outputsDir, file), "utf8");
    return {
      file,
      route: file.replace(/\.(md|txt|json)$/i, ""),
      content,
      score: scoreOutput(content, mode),
    };
  })
  .sort((a, b) => b.score.total - a.score.total);

if (!outputs.length) {
  console.error(`No output files found in ${outputsDir}`);
  process.exit(2);
}

const markdown = renderComparison(outputs, mode);
fs.writeFileSync(outputPath, markdown, "utf8");
console.log(outputPath);

function scoreOutput(content, selectedMode) {
  const lower = content.toLowerCase();
  const score = {
    correctness: 0,
    tests: 0,
    evidence: 0,
    actionability: 0,
    risk: 0,
    total: 0,
  };

  if (/done|implemented|fixed|pass|approved|valid|correct/.test(lower)) score.correctness += 25;
  if (/test(s)? (pass|passed)|passing|all tests|✅/.test(lower)) score.tests += 25;
  if (/evidence|because|file:|line|source|command|diff|commit/.test(lower)) score.evidence += 20;
  if (/next step|recommend|fix|apply|merge|cherry-pick|action/.test(lower)) score.actionability += 15;
  if (/risk|concern|blocker|fail|failed|error|regression|security/.test(lower)) score.risk -= 10;

  if (selectedMode === "review_council" && /severity|finding|impact/.test(lower)) score.evidence += 10;
  if (selectedMode === "worktree_competition" && /commit|branch|tests passed/.test(lower)) score.tests += 10;

  score.total = score.correctness + score.tests + score.evidence + score.actionability + score.risk;
  return score;
}

function renderComparison(outputs, selectedMode) {
  const winner = outputs[0];
  const lines = [
    "# Swarm Comparison",
    "",
    `Mode: ${selectedMode}`,
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Recommendation",
    "",
    `Recommended route: ${winner.route}`,
    "",
    "This recommendation is based on the deterministic scorecard below. The controller should still review the actual output before applying any implementation.",
    "",
    "## Scorecard",
    "",
    "| Route | Total | Correctness | Tests | Evidence | Actionability | Risk |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const output of outputs) {
    const s = output.score;
    lines.push(`| ${output.route} | ${s.total} | ${s.correctness} | ${s.tests} | ${s.evidence} | ${s.actionability} | ${s.risk} |`);
  }

  lines.push("", "## Outputs", "");
  for (const output of outputs) {
    lines.push(`### ${output.route}`, "");
    lines.push(`Source: \`outputs/${output.file}\``, "");
    lines.push("```text");
    lines.push(output.content.trim().slice(0, 4000));
    lines.push("```", "");
  }

  lines.push("## Apply Policy", "");
  lines.push("Do not apply a winning implementation to the main repo without explicit user confirmation.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
