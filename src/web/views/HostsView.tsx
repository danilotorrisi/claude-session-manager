import {
  Button,
  Card,
  CardBody,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from '@heroui/react';
import { Chip } from '../components/common/Chip';
import { useHosts } from '../hooks/api/useProjects';
import { EmptyState } from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/Skeleton';

export function HostsView() {
  const { hosts, isLoading, error, refetch } = useHosts();

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <div className="h-8 w-32 animate-pulse bg-default-200 rounded mb-2" />
          <div className="h-4 w-64 animate-pulse bg-default-200 rounded" />
        </div>
        <TableSkeleton rows={3} cols={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-danger">
          <CardBody>
            <p className="text-danger">Failed to load hosts: {(error as Error).message}</p>
            <Button className="mt-3" size="sm" onPress={() => refetch()}>
              Retry
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Hosts</h1>
          <p className="text-sm text-default-500 mt-1">
            Remote machines configured for session execution
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardBody className="text-sm text-default-600">
          <p>
            <strong>Note:</strong> Static host configuration is deprecated. Use{' '}
            <code className="text-primary bg-primary-50 dark:bg-primary-900/20 px-1 rounded">csm worker start</code>{' '}
            on remote machines instead. Workers register automatically with the master server.
          </p>
        </CardBody>
      </Card>

      {hosts.length === 0 ? (
        <EmptyState
          title="No hosts configured"
          description="Remote hosts can be added to your CSM config to run sessions on other machines. Consider using 'csm worker start' for automatic registration."
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          }
        />
      ) : (
        <Table aria-label="Hosts table" isStriped>
          <TableHeader>
            <TableColumn>NAME</TableColumn>
            <TableColumn>HOST</TableColumn>
            <TableColumn>DEFAULT REPO</TableColumn>
            <TableColumn>PROJECTS BASE</TableColumn>
            <TableColumn>STATUS</TableColumn>
          </TableHeader>
          <TableBody>
            {hosts.map((host) => (
              <TableRow key={host.name}>
                <TableCell>
                  <span className="font-medium">{host.name}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{host.host}</span>
                </TableCell>
                <TableCell>
                  {host.defaultRepo ? (
                    <span className="font-mono text-sm text-default-600">{host.defaultRepo}</span>
                  ) : (
                    <span className="text-default-400 text-sm">Not set</span>
                  )}
                </TableCell>
                <TableCell>
                  {host.projectsBase ? (
                    <span className="font-mono text-sm text-default-600">{host.projectsBase}</span>
                  ) : (
                    <span className="text-default-400 text-sm">Not set</span>
                  )}
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="dot" color="default">
                    Static
                  </Chip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
