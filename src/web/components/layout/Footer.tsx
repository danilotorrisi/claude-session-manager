import { Kbd, Tooltip } from '@heroui/react';
import { Chip } from '../common/Chip';
import { useNotifications } from '../../hooks/ui/useNotifications';
import { useClaudeUsage } from '../../hooks/api/useClaudeUsage';

const WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getUsageColor(utilization: number): string {
  if (utilization >= 0.8) return 'bg-danger';
  if (utilization >= 0.5) return 'bg-warning';
  return 'bg-success';
}

function formatTimeUntil(isoDate: string): string {
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Compute the "even pace" position: what fraction of the window has elapsed.
 * If you're at this % usage, you're on track to use exactly 100% by reset.
 */
function getWeeklyPace(resetsAt: string): number | null {
  if (!resetsAt) return null;
  const remainingMs = new Date(resetsAt).getTime() - Date.now();
  if (remainingMs <= 0) return null;
  const elapsed = WEEKLY_WINDOW_MS - remainingMs;
  if (elapsed <= 0) return null;
  return Math.min(Math.max(elapsed / WEEKLY_WINDOW_MS, 0), 1);
}

function UsageBar({ label, utilization, resetsAt }: { label: string; utilization: number; resetsAt?: string }) {
  const pct = Math.round(utilization * 100);
  const color = getUsageColor(utilization);

  return (
    <Tooltip
      content={
        <div className="text-xs py-1">
          <div>{label}: {pct}% used</div>
          {resetsAt && <div>Resets in {formatTimeUntil(resetsAt)}</div>}
        </div>
      }
      delay={300}
    >
      <span className="flex items-center gap-1.5 cursor-default">
        <span className="text-default-400">{label}</span>
        <span className="text-default-500">{pct}%</span>
        <span className="hidden sm:inline-flex w-[60px] h-1 rounded-full bg-default-200 overflow-hidden">
          <span
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
        </span>
      </span>
    </Tooltip>
  );
}

function getWeeklyColor(utilization: number, pace: number | null): string {
  if (pace === null) return getUsageColor(utilization);
  const ahead = utilization - pace;
  if (ahead <= 0) return 'bg-success';
  if (ahead <= 0.15) return 'bg-warning';
  return 'bg-danger';
}

function WeeklyUsageBar({ utilization, resetsAt }: { utilization: number; resetsAt: string }) {
  const pct = Math.round(utilization * 100);
  const pace = getWeeklyPace(resetsAt);
  const pacePct = pace !== null ? Math.round(pace * 100) : null;
  const color = getWeeklyColor(utilization, pace);
  const onTrack = pace !== null && utilization <= pace;

  return (
    <Tooltip
      content={
        <div className="text-xs py-1">
          <div>Weekly: {pct}% used</div>
          {pacePct !== null && (
            <div>
              Even pace: {pacePct}%
              {onTrack ? ' — on track' : ' — ahead of pace'}
            </div>
          )}
          <div>Resets in {formatTimeUntil(resetsAt)}</div>
        </div>
      }
      delay={300}
    >
      <span className="flex items-center gap-1.5 cursor-default">
        <span className="text-default-400">Weekly</span>
        <span className="text-default-500">{pct}%</span>
        <span className="hidden sm:inline-flex w-[60px] h-1 rounded-full bg-default-200 overflow-hidden relative">
          {/* Usage fill */}
          <span
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
          {/* Pace indicator — vertical tick extending beyond the bar */}
          {pacePct !== null && (
            <span
              className="absolute top-[-3px] w-[3px] h-[10px] rounded-full bg-success"
              style={{ left: `${pacePct}%` }}
            />
          )}
        </span>
      </span>
    </Tooltip>
  );
}

export function Footer() {
  const { isGranted, isSupported } = useNotifications();
  const { session, weekly, sonnet, isLoading, error } = useClaudeUsage();

  return (
    <footer className="border-t border-divider px-4 py-2 flex items-center justify-between text-xs text-default-500 bg-content1">
      <div className="flex items-center gap-2">
        <Chip size="sm" variant="dot" color="success">
          Connected
        </Chip>
        <span className="hidden sm:inline">Claude Session Manager</span>
      </div>
      {!error && (
        <div className="hidden md:flex items-center gap-3 text-[11px]">
          {isLoading ? (
            <span className="text-default-400">...</span>
          ) : (
            session && weekly && sonnet && (
              <>
                <UsageBar label="Session" utilization={session.utilization} resetsAt={session.resetsAt} />
                <span className="text-default-300">|</span>
                <WeeklyUsageBar utilization={weekly.utilization} resetsAt={weekly.resetsAt} />
                <span className="text-default-300">|</span>
                <UsageBar label="Sonnet" utilization={sonnet.utilization} resetsAt={sonnet.resetsAt} />
              </>
            )
          )}
        </div>
      )}
      <div className="hidden md:flex items-center gap-3">
        {isSupported && (
          <Chip
            size="sm"
            variant="dot"
            color={isGranted ? 'success' : 'default'}
          >
            {isGranted ? 'Notifications on' : 'Notifications off'}
          </Chip>
        )}
        <span className="flex items-center gap-1.5 text-default-400">
          <Kbd className="text-[10px]">/</Kbd>
          <span>search</span>
        </span>
        <span className="flex items-center gap-1.5 text-default-400">
          <Kbd className="text-[10px]">?</Kbd>
          <span>shortcuts</span>
        </span>
        <span>v1.4.0</span>
      </div>
    </footer>
  );
}
