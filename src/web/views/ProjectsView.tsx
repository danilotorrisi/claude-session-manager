import { useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Chip,
} from '@heroui/react';
import { useProjects } from '../hooks/api/useProjects';
import { EmptyState } from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/Skeleton';
import type { Project } from '../types';

export function ProjectsView() {
  const { projects, isLoading, error, refetch } = useProjects();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formName, setFormName] = useState('');
  const [formRepoPath, setFormRepoPath] = useState('');
  const [formSetupScript, setFormSetupScript] = useState('');

  const handleAddNew = () => {
    setEditingProject(null);
    setFormName('');
    setFormRepoPath('');
    setFormSetupScript('');
    onOpen();
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormName(project.name);
    setFormRepoPath(project.repoPath);
    setFormSetupScript(project.setupScript || '');
    onOpen();
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-8 w-32 animate-pulse bg-default-200 rounded mb-2" />
            <div className="h-4 w-72 animate-pulse bg-default-200 rounded" />
          </div>
        </div>
        <TableSkeleton rows={3} cols={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-danger">
          <CardBody>
            <p className="text-danger">Failed to load projects: {(error as Error).message}</p>
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
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-default-500 mt-1">
            Manage repository configurations for quick session creation
          </p>
        </div>
        <Button color="primary" onPress={handleAddNew} startContent={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        }>
          Add Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects configured"
          description="Add a project to quickly create sessions with pre-configured repository paths and setup scripts."
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          }
          action={{ label: 'Add Project', onClick: handleAddNew }}
        />
      ) : (
        <Table aria-label="Projects table" isStriped>
          <TableHeader>
            <TableColumn>NAME</TableColumn>
            <TableColumn>REPOSITORY PATH</TableColumn>
            <TableColumn>SETUP SCRIPT</TableColumn>
            <TableColumn width={120}>ACTIONS</TableColumn>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.name}>
                <TableCell>
                  <span className="font-medium">{project.name}</span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-default-600">{project.repoPath}</span>
                </TableCell>
                <TableCell>
                  {project.setupScript ? (
                    <Chip size="sm" variant="flat" color="success">Has script</Chip>
                  ) : (
                    <span className="text-default-400 text-sm">None</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => handleEdit(project)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingProject ? 'Edit Project' : 'Add Project'}
              </ModalHeader>
              <ModalBody>
                <Input
                  label="Project Name"
                  placeholder="my-project"
                  value={formName}
                  onValueChange={setFormName}
                  isDisabled={!!editingProject}
                  autoFocus
                />
                <Input
                  label="Repository Path"
                  placeholder="/path/to/repo or relative-name"
                  value={formRepoPath}
                  onValueChange={setFormRepoPath}
                  description="Absolute path or relative to projectsBase config"
                />
                <Input
                  label="Setup Script (optional)"
                  placeholder="bun install && bun run build"
                  value={formSetupScript}
                  onValueChange={setFormSetupScript}
                  description="Commands to run when creating a new worktree"
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isDisabled={!formName.trim() || !formRepoPath.trim()}
                  onPress={onClose}
                >
                  {editingProject ? 'Save Changes' : 'Add Project'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
