import { exec } from "./ssh";
import { uploadReport } from "./r2";
import { loadSessionMetadata } from "./worktree";
import type { Session, R2Config, FeedbackReport } from "../types";

const REPORT_FILENAME = "feedback-report.html";
const NOTIFICATION_DIR = "/tmp/csm-notifications";

export async function checkForNewReport(
  worktreePath: string,
  hostName?: string
): Promise<boolean> {
  const result = await exec(
    `test -f "${worktreePath}/.csm/${REPORT_FILENAME}"`,
    hostName
  );
  return result.success;
}

function isReportComplete(content: string): boolean {
  return (
    content.includes("<!-- CSM_TASK_COMPLETE -->") ||
    content.includes("<!-- CSM_TASK_FAILED -->")
  );
}

export async function processReport(
  session: Session,
  r2Config?: R2Config
): Promise<FeedbackReport | null> {
  const worktreePath = session.worktreePath;
  if (!worktreePath) return null;

  const hostName = session.host;
  const reportPath = `${worktreePath}/.csm/${REPORT_FILENAME}`;

  // Read report content
  const readResult = await exec(`cat "${reportPath}"`, hostName);
  if (!readResult.success || !readResult.stdout) return null;

  const content = readResult.stdout;

  // Validate report is complete
  if (!isReportComplete(content)) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let url: string;

  if (r2Config) {
    // Upload to R2
    try {
      url = await uploadReport(r2Config, session.name, content, timestamp);
    } catch {
      return null;
    }
  } else {
    // Use local file path
    url = reportPath;
  }

  const report: FeedbackReport = { url, timestamp };

  // Write notification
  try {
    const notification = JSON.stringify({
      type: "feedback-report",
      sessionName: session.name,
      url,
      timestamp,
      title: session.title || session.name,
    });
    await exec(
      `mkdir -p "${NOTIFICATION_DIR}" && echo '${notification.replace(/'/g, "'\\''")}' > "${NOTIFICATION_DIR}/${session.name}-${timestamp}.json"`
    );
  } catch {
    // Non-fatal: notification write failure
  }

  // Append to session metadata
  try {
    await appendFeedbackReport(session.name, report, hostName);
  } catch {
    // Non-fatal
  }

  // Rename the report file to avoid re-processing
  await exec(
    `mv "${reportPath}" "${worktreePath}/.csm/feedback-report-${timestamp}.html"`,
    hostName
  );

  return report;
}

async function appendFeedbackReport(
  sessionName: string,
  report: FeedbackReport,
  hostName?: string
): Promise<void> {
  const metadata = await loadSessionMetadata(sessionName, hostName);
  if (!metadata) return;

  const reports = metadata.feedbackReports || [];
  reports.push(report);
  const updated = { ...metadata, feedbackReports: reports };

  const { getMetadataPath } = await import("./worktree");
  const metadataPath = await getMetadataPath(sessionName);
  const json = JSON.stringify(updated);
  await exec(
    `echo '${json.replace(/'/g, "'\\''")}' > "${metadataPath}"`,
    hostName
  );
}

export async function pollAllSessionReports(
  sessions: Session[],
  r2Config?: R2Config,
  processedFiles?: Set<string>
): Promise<FeedbackReport | null> {
  for (const session of sessions) {
    if (!session.worktreePath) continue;

    const key = `${session.host || "local"}:${session.name}`;
    if (processedFiles?.has(key)) continue;

    const hasReport = await checkForNewReport(
      session.worktreePath,
      session.host
    );
    if (!hasReport) continue;

    const report = await processReport(session, r2Config);
    if (report) {
      processedFiles?.add(key);
      return report;
    }
  }
  return null;
}
