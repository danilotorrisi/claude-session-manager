import { useState, useCallback } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Spinner,
} from '@heroui/react';
import type { GitStats, GitFileChange } from '../../types';
import { getFileDiff } from '../../services/diff';

interface GitChangesProps {
  stats: GitStats;
  sessionName: string;
}

const statusColorMap: Record<GitFileChange['status'], 'success' | 'primary' | 'danger' | 'warning'> = {
  added: 'success',
  modified: 'primary',
  deleted: 'danger',
  renamed: 'warning',
};

const statusLabelMap: Record<GitFileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
};

interface ParsedDiffLine {
  type: 'added' | 'removed' | 'context' | 'header';
  content: string;
  oldLine?: number;
  newLine?: number;
}

function parseDiff(diff: string): ParsedDiffLine[] {
  const lines = diff.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      continue;
    } else if (line.startsWith('diff ') || line.startsWith('index ')) {
      continue;
    } else if (line.startsWith('-')) {
      result.push({ type: 'removed', content: line.slice(1), oldLine: oldLine++ });
    } else if (line.startsWith('+')) {
      result.push({ type: 'added', content: line.slice(1), newLine: newLine++ });
    } else if (line.startsWith(' ') || (line === '' && oldLine > 0)) {
      result.push({ type: 'context', content: line.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }

  return result;
}

function DiffViewer({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  if (lines.length === 0) {
    return <p className="text-xs text-default-500 p-4">No diff content available.</p>;
  }

  return (
    <div className="overflow-x-auto bg-[#060e17] text-xs font-mono">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            if (line.type === 'header') {
              return (
                <tr key={i} className="bg-[#0d2137]">
                  <td colSpan={3} className="px-3 py-1 text-blue-400 select-none">
                    {line.content}
                  </td>
                </tr>
              );
            }

            const bgClass =
              line.type === 'added'
                ? 'bg-green-950/40'
                : line.type === 'removed'
                  ? 'bg-red-950/40'
                  : '';

            const textClass =
              line.type === 'added'
                ? 'text-green-300'
                : line.type === 'removed'
                  ? 'text-red-300'
                  : 'text-default-400';

            const gutterClass =
              line.type === 'added'
                ? 'bg-green-950/60 text-green-600'
                : line.type === 'removed'
                  ? 'bg-red-950/60 text-red-600'
                  : 'text-default-600';

            return (
              <tr key={i} className={bgClass}>
                <td className={`w-10 text-right px-2 py-0 select-none border-r border-[#1a2d42] ${gutterClass}`}>
                  {line.oldLine ?? ''}
                </td>
                <td className={`w-10 text-right px-2 py-0 select-none border-r border-[#1a2d42] ${gutterClass}`}>
                  {line.newLine ?? ''}
                </td>
                <td className={`px-3 py-0 whitespace-pre ${textClass}`}>
                  <span className="select-none mr-1 opacity-50">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  {line.content}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DiffModalState {
  open: boolean;
  file: GitFileChange | null;
  diff: string | null;
  loading: boolean;
  error: string | null;
}

export function GitChanges({ stats, sessionName }: GitChangesProps) {
  const [modal, setModal] = useState<DiffModalState>({
    open: false,
    file: null,
    diff: null,
    loading: false,
    error: null,
  });

  // Cache fetched diffs
  const [diffCache, setDiffCache] = useState<Record<string, string>>({});

  const openDiff = useCallback(async (file: GitFileChange) => {
    // Check cache first
    const cached = diffCache[file.file];
    if (cached !== undefined) {
      setModal({ open: true, file, diff: cached, loading: false, error: null });
      return;
    }

    setModal({ open: true, file, diff: null, loading: true, error: null });

    try {
      const diff = await getFileDiff(sessionName, file.file);
      setDiffCache((prev) => ({ ...prev, [file.file]: diff }));
      setModal({ open: true, file, diff, loading: false, error: null });
    } catch (err) {
      setModal({
        open: true,
        file,
        diff: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load diff',
      });
    }
  }, [diffCache, sessionName]);

  const closeModal = useCallback(() => {
    setModal((prev) => ({ ...prev, open: false }));
  }, []);

  return (
    <>
      <Card className="bg-[#0a1520] border border-[#1a2d42]">
        <CardHeader className="pb-1 pt-2 px-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Git Changes</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-default-500">{stats.filesChanged} files</span>
              <span className="text-success">+{stats.insertions}</span>
              <span className="text-danger">-{stats.deletions}</span>
            </div>
          </div>
        </CardHeader>
        <CardBody className="pt-1 px-2 pb-2">
          {stats.fileChanges && stats.fileChanges.length > 0 ? (
            <div className="space-y-0">
              {stats.fileChanges.map((file) => (
                <button
                  key={file.file}
                  type="button"
                  onClick={() => openDiff(file)}
                  className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#0f2030] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Chip
                      size="sm"
                      variant="flat"
                      color={statusColorMap[file.status]}
                      className="shrink-0 h-5 text-[10px] uppercase font-bold"
                    >
                      {statusLabelMap[file.status]}
                    </Chip>
                    <span className="truncate text-xs font-mono text-default-300">
                      {file.file}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2 text-xs">
                    {file.insertions > 0 && (
                      <span className="text-success">+{file.insertions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-danger">-{file.deletions}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-default-500 px-2">
              {stats.filesChanged} files changed, {stats.insertions} insertions(+), {stats.deletions} deletions(-)
            </p>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={modal.open}
        onClose={closeModal}
        size="4xl"
        scrollBehavior="inside"
        classNames={{
          base: 'bg-[#0a1520] border border-[#1a2d42]',
          header: 'border-b border-[#1a2d42]',
          body: 'p-0',
          closeButton: 'text-default-400 hover:text-white',
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-3">
            {modal.file && (
              <>
                <Chip
                  size="sm"
                  variant="flat"
                  color={statusColorMap[modal.file.status]}
                  className="shrink-0 h-5 text-[10px] uppercase font-bold"
                >
                  {statusLabelMap[modal.file.status]}
                </Chip>
                <span className="text-sm font-mono text-default-200">
                  {modal.file.file}
                </span>
                <div className="flex items-center gap-2 ml-auto text-xs">
                  {modal.file.insertions > 0 && (
                    <span className="text-success">+{modal.file.insertions}</span>
                  )}
                  {modal.file.deletions > 0 && (
                    <span className="text-danger">-{modal.file.deletions}</span>
                  )}
                </div>
              </>
            )}
          </ModalHeader>
          <ModalBody>
            {modal.loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-default-500">
                <Spinner size="sm" />
                <span>Loading diff...</span>
              </div>
            ) : modal.error ? (
              <p className="text-sm text-danger p-4">{modal.error}</p>
            ) : modal.diff ? (
              <DiffViewer diff={modal.diff} />
            ) : (
              <p className="text-sm text-default-500 p-4">No changes.</p>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
