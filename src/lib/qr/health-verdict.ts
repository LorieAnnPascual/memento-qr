import type { DestinationCheck } from './check-destination';
import type { DesignIssue } from './design-checks';
import type { DecodeResult } from './scan-test';
import type { QrStatus } from './status';

export type VerdictLevel = 'good' | 'attention' | 'broken';

export interface HealthVerdict {
  level: VerdictLevel;
  /** "Looks good", "Needs attention" or "Not working". */
  headline: string;
  /** Everything found, most serious first, each with a suggested fix. */
  issues: DesignIssue[];
}

export const VERDICT_HEADLINES: Record<VerdictLevel, string> = {
  good: 'Looks good',
  attention: 'Needs attention',
  broken: 'Not working',
};

interface VerdictInput {
  status: QrStatus;
  destination: DestinationCheck;
  /** The content the code is meant to hold (what a scan should read back). */
  expectedContent: string;
  /** Null when the scan test has not run (or could not run). */
  scan: { full: DecodeResult; small: DecodeResult } | null;
  designIssues: DesignIssue[];
}

/** Turns every signal (server status, destination, scan test, design rules) into one plain result. */
export function buildVerdict(input: VerdictInput): HealthVerdict {
  const issues: DesignIssue[] = [];

  if (input.status.health === 'problem') {
    issues.push({
      severity: 'problem',
      text: `${input.status.label}. ${input.status.detail}`,
      fix: fixForStatus(input.status.label),
    });
  } else if (input.status.health === 'warning') {
    issues.push({ severity: 'warning', text: `${input.status.label}. ${input.status.detail}`, fix: fixForStatus(input.status.label) });
  }

  if (input.destination.result === 'unreachable') {
    issues.push({
      severity: 'problem',
      text: input.destination.message,
      fix: 'Open the destination yourself. If the page is gone, point this code at a working page (or restore an earlier destination).',
    });
  }

  if (input.scan) {
    if (!input.scan.full.found) {
      issues.push({
        severity: 'problem',
        text: 'A QR reader could not read this code when it was rendered.',
        fix: 'Increase contrast, shrink or remove the logo, or use a simpler dot style.',
      });
    } else if (input.scan.full.text !== input.expectedContent) {
      issues.push({
        severity: 'problem',
        text: 'A QR reader read something different from what this code should contain.',
        fix: 'Re-save the code, then check again. If it persists, remove the logo and try again.',
      });
    } else if (!input.scan.small.found) {
      issues.push({
        severity: 'warning',
        text: 'It reads fine large, but a reader failed when it was shown small.',
        fix: 'Print it larger, simplify the design, or shorten the content.',
      });
    }
  }

  issues.push(...input.designIssues);

  const ordered = [...issues].sort((a, b) => Number(b.severity === 'problem') - Number(a.severity === 'problem'));
  const level: VerdictLevel = ordered.some((i) => i.severity === 'problem')
    ? 'broken'
    : ordered.length > 0
      ? 'attention'
      : 'good';

  return { level, headline: VERDICT_HEADLINES[level], issues: ordered };
}

function fixForStatus(label: string): string {
  if (label === 'Paused') return 'Resume the code in the editor.';
  if (label === 'Expired') return 'Change or remove the expiry date in the editor.';
  if (label === 'Scan limit reached') return 'Raise or remove the scan limit in the editor.';
  if (label === 'No destination') return 'Set a destination URL in the editor.';
  if (label.includes('expires soon')) return 'Extend the expiry date if the code is still needed.';
  if (label.includes('limit')) return 'Raise the scan limit if the code is still needed.';
  return 'Open the code in the editor to fix it.';
}
