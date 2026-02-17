import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  Spinner,
  Divider,
  Progress,
} from '@heroui/react';
import { Chip } from '../components/common/Chip';
import { useSessions } from '../hooks/api/useSessions';
import { useLinearSearch } from '../hooks/api/useLinearTasks';
import { useProjects } from '../hooks/api/useProjects';
import { apiClient } from '../services/client';
import { ROUTES } from '../utils/constants';
import type { LinearIssue } from '../types';

type Step = 'task' | 'name' | 'project' | 'host' | 'review';

const ALL_STEPS: { key: Step; label: string }[] = [
  { key: 'task', label: 'Linear Task' },
  { key: 'name', label: 'Session Name' },
  { key: 'project', label: 'Project' },
  { key: 'host', label: 'Host' },
  { key: 'review', label: 'Review' },
];

function sanitizeSessionName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveSessionName(issue: LinearIssue): string {
  const prefix = issue.identifier.toLowerCase();
  const slug = sanitizeSessionName(issue.title).slice(0, 40);
  return `${prefix}-${slug}`;
}

export function CreateSession() {
  const navigate = useNavigate();
  const { invalidate } = useSessions();
  const { projects, hosts: hostsMap, hasLinear } = useProjects();
  const linearSearch = useLinearSearch();

  const [currentStep, setCurrentStep] = useState<Step>(hasLinear ? 'task' : 'name');
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedHost, setSelectedHost] = useState('local');
  const [repoPath, setRepoPath] = useState('');
  const [selectedEffort, setSelectedEffort] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const hosts = Object.entries(hostsMap).map(([name, config]) => ({
    name,
    ...config,
  }));

  const steps = hasLinear ? ALL_STEPS : ALL_STEPS.filter((s) => s.key !== 'task');
  const stepIndex = steps.findIndex((s) => s.key === currentStep);
  const progressPercent = ((stepIndex + 1) / steps.length) * 100;

  const goToStep = useCallback((step: Step) => {
    setError(null);
    setCurrentStep(step);
  }, []);

  const handleSelectIssue = useCallback(
    (issue: LinearIssue) => {
      setSelectedIssue(issue);
      if (!sessionName) {
        setSessionName(deriveSessionName(issue));
      }
      goToStep('name');
    },
    [sessionName, goToStep],
  );

  const handleSkipTask = useCallback(() => {
    setSelectedIssue(null);
    goToStep('name');
  }, [goToStep]);

  const handleNameNext = useCallback(() => {
    if (!sessionName.trim()) {
      setNameError('Session name is required');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionName)) {
      setNameError('Only alphanumeric characters, hyphens, and underscores');
      return;
    }
    setNameError(null);
    goToStep('project');
  }, [sessionName, goToStep]);

  const handleProjectNext = useCallback(() => {
    goToStep('host');
  }, [goToStep]);

  const handleHostNext = useCallback(() => {
    goToStep('review');
  }, [goToStep]);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      await apiClient.post('/api/sessions', {
        name: sessionName,
        repo: repoPath || selectedProject || undefined,
        host: selectedHost === 'local' ? undefined : selectedHost,
        project: selectedProject || undefined,
        effort: selectedEffort || undefined,
      });
      invalidate();
      navigate(ROUTES.HOME);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  }, [sessionName, repoPath, selectedProject, selectedHost, selectedEffort, invalidate, navigate]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Session</h1>
        <p className="mt-1 text-default-500 text-sm">
          Set up a new Claude Code session with a git worktree
        </p>
      </div>

      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          {steps.map((step, i) => (
            <button
              key={step.key}
              onClick={() => i <= stepIndex && goToStep(step.key)}
              disabled={i > stepIndex}
              className={`text-xs font-medium transition-colors ${
                i === stepIndex
                  ? 'text-primary'
                  : i < stepIndex
                    ? 'text-success cursor-pointer hover:text-success-600'
                    : 'text-default-400'
              }`}
            >
              {step.label}
            </button>
          ))}
        </div>
        <Progress
          value={progressPercent}
          color="primary"
          size="sm"
          aria-label="Creation progress"
        />
      </div>

      {error && (
        <Card className="mb-4 border-danger">
          <CardBody className="text-danger text-sm">{error}</CardBody>
        </Card>
      )}

      {/* Step: Linear Task */}
      {currentStep === 'task' && (
        <Card>
          <CardHeader className="flex-col items-start">
            <h2 className="text-lg font-semibold">Link a Linear Task</h2>
            <p className="text-sm text-default-500">
              Search for a task to automatically set the session name and context
            </p>
          </CardHeader>
          <CardBody className="gap-4">
            <Input
              placeholder="Search Linear issues..."
              value={linearSearch.searchTerm}
              onValueChange={linearSearch.setSearchTerm}
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

            {linearSearch.results.length > 0 && (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {linearSearch.results.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => handleSelectIssue(issue)}
                    className="flex items-start gap-3 p-3 rounded-lg border border-divider hover:bg-default-100 transition-colors text-left"
                  >
                    <Chip size="sm" variant="flat" color="primary">
                      {issue.identifier}
                    </Chip>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{issue.title}</p>
                      {issue.state && (
                        <p className="text-xs text-default-500 mt-0.5">{issue.state}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {linearSearch.searchTerm.length >= 2 &&
              !linearSearch.isSearching &&
              linearSearch.results.length === 0 && (
                <p className="text-sm text-default-500 text-center py-4">
                  No issues found matching "{linearSearch.searchTerm}"
                </p>
              )}

            <Divider />
            <div className="flex justify-end">
              <Button variant="flat" onPress={handleSkipTask}>
                Skip - no Linear task
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step: Session Name */}
      {currentStep === 'name' && (
        <Card>
          <CardHeader className="flex-col items-start">
            <h2 className="text-lg font-semibold">Session Name</h2>
            <p className="text-sm text-default-500">
              Choose a name for this session (alphanumeric, hyphens, underscores)
            </p>
          </CardHeader>
          <CardBody className="gap-4">
            {selectedIssue && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
                <Chip size="sm" variant="flat" color="primary">
                  {selectedIssue.identifier}
                </Chip>
                <span className="text-sm truncate">{selectedIssue.title}</span>
              </div>
            )}
            <Input
              label="Session Name"
              placeholder="my-feature"
              value={sessionName}
              onValueChange={(v) => {
                setSessionName(v);
                setNameError(null);
              }}
              isInvalid={!!nameError}
              errorMessage={nameError}
              autoFocus
              description="Will be prefixed with csm- automatically"
            />
            <div className="flex justify-between">
              {hasLinear ? (
                <Button variant="flat" onPress={() => goToStep('task')}>
                  Back
                </Button>
              ) : (
                <div />
              )}
              <Button color="primary" onPress={handleNameNext}>
                Next
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step: Project */}
      {currentStep === 'project' && (
        <Card>
          <CardHeader className="flex-col items-start">
            <h2 className="text-lg font-semibold">Project</h2>
            <p className="text-sm text-default-500">
              Select a project or specify a repository path
            </p>
          </CardHeader>
          <CardBody className="gap-4">
            {projects.length > 0 && (
              <Select
                label="Project"
                placeholder="Select a project"
                selectedKeys={selectedProject ? new Set([selectedProject]) : new Set()}
                onSelectionChange={(keys) => {
                  const val = Array.from(keys)[0] as string;
                  setSelectedProject(val || '');
                  const proj = projects.find((p) => p.name === val);
                  if (proj) setRepoPath(proj.repoPath);
                }}
              >
                {projects.map((p) => (
                  <SelectItem key={p.name}>{p.name}</SelectItem>
                ))}
              </Select>
            )}
            <Input
              label="Repository Path"
              placeholder="/path/to/repo"
              value={repoPath}
              onValueChange={setRepoPath}
              description="Absolute path or relative to projectsBase"
            />
            <div className="flex justify-between">
              <Button variant="flat" onPress={() => goToStep('name')}>
                Back
              </Button>
              <Button color="primary" onPress={handleProjectNext}>
                Next
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step: Host */}
      {currentStep === 'host' && (
        <Card>
          <CardHeader className="flex-col items-start">
            <h2 className="text-lg font-semibold">Host</h2>
            <p className="text-sm text-default-500">
              Run locally or on a remote machine
            </p>
          </CardHeader>
          <CardBody className="gap-4">
            <Select
              label="Host"
              selectedKeys={new Set([selectedHost])}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                setSelectedHost(val || 'local');
              }}
              items={[
                { key: 'local', label: 'Local Machine' },
                ...hosts.map((h) => ({ key: h.name, label: `${h.name} (${h.host})` })),
              ]}
            >
              {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
            </Select>
            <div className="flex justify-between">
              <Button variant="flat" onPress={() => goToStep('project')}>
                Back
              </Button>
              <Button color="primary" onPress={handleHostNext}>
                Next
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Step: Review */}
      {currentStep === 'review' && (
        <Card>
          <CardHeader className="flex-col items-start">
            <h2 className="text-lg font-semibold">Review & Create</h2>
            <p className="text-sm text-default-500">
              Confirm the details before creating the session
            </p>
          </CardHeader>
          <CardBody className="gap-3">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-default-500">Session Name</span>
                <span className="text-sm font-medium">csm-{sessionName}</span>
              </div>
              {selectedIssue && (
                <div className="flex justify-between">
                  <span className="text-sm text-default-500">Linear Task</span>
                  <Chip size="sm" variant="flat" color="primary">
                    {selectedIssue.identifier}
                  </Chip>
                </div>
              )}
              {selectedProject && (
                <div className="flex justify-between">
                  <span className="text-sm text-default-500">Project</span>
                  <span className="text-sm font-medium">{selectedProject}</span>
                </div>
              )}
              {repoPath && (
                <div className="flex justify-between">
                  <span className="text-sm text-default-500">Repository</span>
                  <span className="text-sm font-mono truncate max-w-[250px]">{repoPath}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-default-500">Host</span>
                <span className="text-sm font-medium">
                  {selectedHost === 'local' ? 'Local Machine' : selectedHost}
                </span>
              </div>
            </div>
            <Divider className="my-2" />
            <Select
              label="Reasoning Effort"
              placeholder="Default (medium)"
              selectedKeys={selectedEffort ? new Set([selectedEffort]) : new Set()}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                setSelectedEffort(val || '');
              }}
              description="Controls how much reasoning Claude uses per response"
            >
              <SelectItem key="low">Low</SelectItem>
              <SelectItem key="medium">Medium</SelectItem>
              <SelectItem key="high">High</SelectItem>
            </Select>
            <Divider className="my-2" />
            <div className="flex justify-between">
              <Button variant="flat" onPress={() => goToStep('host')}>
                Back
              </Button>
              <Button
                color="primary"
                onPress={handleCreate}
                isLoading={isCreating}
              >
                Create Session
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
