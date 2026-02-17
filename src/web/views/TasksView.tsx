import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  Input,
  Spinner,
  Tabs,
  Tab,
  Link,
} from '@heroui/react';
import { Chip } from '../components/common/Chip';
import { useLinearSearch, useMyLinearIssues } from '../hooks/api/useLinearTasks';
import { useProjects } from '../hooks/api/useProjects';
import { EmptyState } from '../components/common/EmptyState';
import { TaskCardsSkeleton } from '../components/common/Skeleton';
import type { LinearIssue } from '../types';

const PRIORITY_LABELS: Record<number, { label: string; color: 'danger' | 'warning' | 'primary' | 'default' }> = {
  1: { label: 'Urgent', color: 'danger' },
  2: { label: 'High', color: 'warning' },
  3: { label: 'Medium', color: 'primary' },
  4: { label: 'Low', color: 'default' },
};

function IssueCard({ issue }: { issue: LinearIssue }) {
  const navigate = useNavigate();
  const priority = issue.priority ? PRIORITY_LABELS[issue.priority] : null;

  const handleCardClick = () => {
    navigate(`/tasks/${issue.identifier}`);
  };

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      isPressable
      onPress={handleCardClick}
    >
      <CardBody className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <Chip size="sm" variant="flat" color="primary" className="shrink-0">
              {issue.identifier}
            </Chip>
            {issue.state && (
              <Chip size="sm" variant="bordered" className="shrink-0">
                {issue.state}
              </Chip>
            )}
            <span className="font-medium text-sm truncate">{issue.title}</span>
          </div>
          {priority && (
            <Chip size="sm" variant="flat" color={priority.color} className="shrink-0">
              {priority.label}
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-default-500">
          <Link
            href={issue.url}
            isExternal
            showAnchorIcon
            size="sm"
            className="text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            Open in Linear
          </Link>
        </div>
        {issue.description && (
          <p className="text-xs text-default-500 line-clamp-2 mt-1">
            {issue.description}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

export function TasksView() {
  const [activeTab, setActiveTab] = useState<string>('my-issues');
  const { hasLinear } = useProjects();
  const linearSearch = useLinearSearch();
  const { issues: myIssues, isLoading: myIssuesLoading, error: myIssuesError, refetch } = useMyLinearIssues();

  if (!hasLinear) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-default-500 mt-1">
            Browse and search Linear issues
          </p>
        </div>
        <EmptyState
          title="Linear integration not configured"
          description="Add your Linear API key in ~/.config/csm/config.json to browse tasks here."
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="text-sm text-default-500 mt-1">
          Browse and search Linear issues
        </p>
      </div>

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        className="mb-6"
      >
        <Tab key="my-issues" title="My Issues" />
        <Tab key="search" title="Search" />
      </Tabs>

      {activeTab === 'my-issues' && (
        <div>
          {myIssuesLoading ? (
            <TaskCardsSkeleton />
          ) : myIssuesError ? (
            <Card className="border-danger">
              <CardBody>
                <p className="text-danger text-sm">
                  Failed to load issues. Make sure your Linear API key is configured in settings.
                </p>
                <Button className="mt-3" size="sm" onPress={() => refetch()}>
                  Retry
                </Button>
              </CardBody>
            </Card>
          ) : myIssues.length === 0 ? (
            <EmptyState
              title="No assigned issues"
              description="You don't have any active Linear issues assigned to you, or your Linear API key may not be configured."
              icon={
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              }
            />
          ) : (
            <div className="grid gap-3">
              {myIssues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <div>
          <Input
            placeholder="Search Linear issues..."
            value={linearSearch.searchTerm}
            onValueChange={linearSearch.setSearchTerm}
            className="mb-4"
            autoFocus
            startContent={
              linearSearch.isSearching ? (
                <Spinner size="sm" />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-default-400"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )
            }
          />

          {linearSearch.searchTerm.length < 2 && (
            <p className="text-sm text-default-500 text-center py-8">
              Type at least 2 characters to search
            </p>
          )}

          {linearSearch.searchTerm.length >= 2 && linearSearch.isSearching && (
            <TaskCardsSkeleton count={3} />
          )}

          {linearSearch.searchTerm.length >= 2 &&
            !linearSearch.isSearching &&
            linearSearch.results.length === 0 && (
              <EmptyState
                title="No results"
                description={`No issues found matching "${linearSearch.searchTerm}"`}
              />
            )}

          {linearSearch.results.length > 0 && (
            <div className="grid gap-3">
              {linearSearch.results.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
