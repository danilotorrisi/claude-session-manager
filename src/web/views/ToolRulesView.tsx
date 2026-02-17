import { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@heroui/react';
import { Chip } from '../components/common/Chip';
import { apiClient } from '../services/client';

interface ToolApprovalRule {
  tool: string;
  pattern?: string;
  action: 'allow' | 'deny' | 'ask';
}

const TOOL_OPTIONS = [
  { value: '*', label: 'Any tool (*)' },
  { value: 'Bash', label: 'Bash' },
  { value: 'Read', label: 'Read' },
  { value: 'Write', label: 'Write' },
  { value: 'Edit', label: 'Edit' },
  { value: 'Glob', label: 'Glob' },
  { value: 'Grep', label: 'Grep' },
  { value: 'WebFetch', label: 'WebFetch' },
];

const ACTION_OPTIONS = [
  { value: 'allow', label: 'Allow' },
  { value: 'deny', label: 'Deny' },
  { value: 'ask', label: 'Ask' },
];

function actionColor(action: string): 'success' | 'danger' | 'warning' {
  switch (action) {
    case 'allow': return 'success';
    case 'deny': return 'danger';
    default: return 'warning';
  }
}

export function ToolRulesView() {
  const [rules, setRules] = useState<ToolApprovalRule[]>([]);
  const [originalRules, setOriginalRules] = useState<ToolApprovalRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [newRuleTool, setNewRuleTool] = useState('Bash');
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<'allow' | 'deny' | 'ask'>('allow');

  const loadRules = useCallback(async () => {
    try {
      const response = await apiClient.get<{ config: { toolApprovalRules?: ToolApprovalRule[] } }>('/api/config');
      const loaded = response.data?.config?.toolApprovalRules || [];
      setRules(loaded);
      setOriginalRules(loaded);
    } catch (err) {
      console.error('Failed to load rules:', err);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const hasChanged = JSON.stringify(rules) !== JSON.stringify(originalRules);

  const handleAddRule = (onClose: () => void) => {
    const rule: ToolApprovalRule = {
      tool: newRuleTool,
      action: newRuleAction,
      ...(newRulePattern.trim() ? { pattern: newRulePattern.trim() } : {}),
    };
    setRules([...rules, rule]);
    setNewRulePattern('');
    setNewRuleTool('Bash');
    setNewRuleAction('allow');
    onClose();
  };

  const handleDeleteRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    const newRules = [...rules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newRules.length) return;
    [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
    setRules(newRules);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      await apiClient.patch('/api/config', { toolApprovalRules: rules });
      setOriginalRules([...rules]);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      console.error('Failed to save rules:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tool Approval Rules</h1>
          <p className="text-sm text-default-500 mt-1">
            Auto-approve or deny tool requests. Rules are evaluated in order — first match wins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanged && saveStatus === 'idle' && (
            <Chip size="sm" color="warning" variant="flat">Unsaved</Chip>
          )}
          {saveStatus === 'success' && (
            <Chip size="sm" color="success" variant="flat">Saved</Chip>
          )}
          {saveStatus === 'error' && (
            <Chip size="sm" color="danger" variant="flat">Error</Chip>
          )}
          <Button
            color="primary"
            variant="flat"
            size="sm"
            onPress={handleSave}
            isLoading={saving}
            isDisabled={!hasChanged || saving}
          >
            Save
          </Button>
          <Button color="primary" size="sm" onPress={onOpen}>
            Add Rule
          </Button>
        </div>
      </div>

      <Table aria-label="Tool approval rules" isStriped>
        <TableHeader>
          <TableColumn width={50}>#</TableColumn>
          <TableColumn>TOOL</TableColumn>
          <TableColumn>PATTERN</TableColumn>
          <TableColumn width={100}>ACTION</TableColumn>
          <TableColumn width={140}>ORDER</TableColumn>
          <TableColumn width={80}>DELETE</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No rules configured. All tool requests will prompt for approval.">
          {rules.map((rule, i) => (
            <TableRow key={i}>
              <TableCell>
                <span className="text-default-400 font-mono text-xs">{i + 1}</span>
              </TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color="primary">{rule.tool}</Chip>
              </TableCell>
              <TableCell>
                {rule.pattern ? (
                  <code className="text-xs font-mono bg-default-100 dark:bg-default-50 px-1.5 py-0.5 rounded">
                    {rule.pattern}
                  </code>
                ) : (
                  <span className="text-default-400 text-xs italic">any</span>
                )}
              </TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={actionColor(rule.action)}>
                  {rule.action}
                </Chip>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    isDisabled={i === 0}
                    onPress={() => handleMoveRule(i, 'up')}
                    aria-label="Move up"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    isDisabled={i === rules.length - 1}
                    onPress={() => handleMoveRule(i, 'down')}
                    aria-label="Move down"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isIconOnly
                  onPress={() => handleDeleteRule(i)}
                  aria-label="Delete rule"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Add Rule Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add Rule</ModalHeader>
              <ModalBody className="gap-4">
                <Select
                  label="Tool"
                  selectedKeys={[newRuleTool]}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0] as string;
                    if (val) setNewRuleTool(val);
                  }}
                >
                  {TOOL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value}>{opt.label}</SelectItem>
                  ))}
                </Select>
                <Input
                  label="Pattern (optional)"
                  placeholder="e.g. git *, /home/user/*"
                  value={newRulePattern}
                  onValueChange={setNewRulePattern}
                  description="Use * as wildcard. Matches command (Bash), file_path (Read/Write/Edit), or pattern (Grep/Glob)."
                />
                <Select
                  label="Action"
                  selectedKeys={[newRuleAction]}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys)[0] as string;
                    if (val) setNewRuleAction(val as 'allow' | 'deny' | 'ask');
                  }}
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value}>{opt.label}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>Cancel</Button>
                <Button color="primary" onPress={() => handleAddRule(onClose)}>Add</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
