// Tool approval rule evaluation engine
import type { ToolApprovalRule } from "../types";

/**
 * Extract the primary input string from a tool's input object.
 * Used for pattern matching against rules.
 */
function extractPrimaryInput(toolName: string, toolInput: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case "Bash":
      return toolInput.command as string | undefined;
    case "Read":
    case "Write":
    case "Edit":
      return toolInput.file_path as string | undefined;
    case "Grep":
      return toolInput.pattern as string | undefined;
    case "Glob":
      return toolInput.pattern as string | undefined;
    case "WebFetch":
      return toolInput.url as string | undefined;
    default:
      // For unknown tools, try common field names
      return (toolInput.command ?? toolInput.file_path ?? toolInput.path ?? toolInput.pattern) as string | undefined;
  }
}

/**
 * Convert a simple glob pattern (using `*` as wildcard) to a RegExp.
 * - `*` matches any sequence of characters
 * - All other regex special characters are escaped
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${withWildcards}$`, "s");
}

export interface RuleEvalResult {
  action: "allow" | "deny" | "ask";
  matchedRule?: ToolApprovalRule;
}

/**
 * Evaluate tool approval rules against a tool request.
 * Rules are evaluated in order; first match wins.
 * Returns 'ask' if no rule matches.
 */
export function evaluateToolRules(
  rules: ToolApprovalRule[],
  toolName: string,
  toolInput: Record<string, unknown>
): RuleEvalResult {
  const primaryInput = extractPrimaryInput(toolName, toolInput);

  for (const rule of rules) {
    // Match tool name: exact match or wildcard
    if (rule.tool !== "*" && rule.tool !== toolName) {
      continue;
    }

    // If rule has a pattern, match against primary input
    if (rule.pattern) {
      if (!primaryInput) continue;
      const regex = globToRegex(rule.pattern);
      if (!regex.test(primaryInput)) continue;
    }

    return { action: rule.action, matchedRule: rule };
  }

  return { action: "ask" };
}

/**
 * Derive a suggested rule from a tool approval request.
 * Used by the "Always allow/deny" UI buttons.
 */
export function deriveRuleFromRequest(
  toolName: string,
  toolInput: Record<string, unknown>,
  action: "allow" | "deny"
): ToolApprovalRule {
  if (toolName === "Bash") {
    const command = (toolInput.command as string) || "";
    // Extract the first word (the command binary) and create a glob
    const firstWord = command.split(/\s+/)[0];
    if (firstWord) {
      return { tool: "Bash", pattern: `${firstWord} *`, action };
    }
    return { tool: "Bash", action };
  }

  // For file tools, allow the entire tool without a specific pattern
  return { tool: toolName, action };
}
