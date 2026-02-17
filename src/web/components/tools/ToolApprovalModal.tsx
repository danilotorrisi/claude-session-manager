import { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Code,
} from '@heroui/react';
import { Chip } from '../common/Chip';
import { apiClient } from '../../services/client';

interface ToolApprovalRule {
  tool: string;
  pattern?: string;
  action: 'allow' | 'deny' | 'ask';
}

interface ToolApprovalModalProps {
  isOpen: boolean;
  toolName: string;
  toolInput: Record<string, unknown>;
  description?: string;
  onApprove: () => void;
  onDeny: () => void;
  isApproving?: boolean;
  isDenying?: boolean;
}

function deriveRulePreview(toolName: string, toolInput: Record<string, unknown>, action: 'allow' | 'deny'): { rule: ToolApprovalRule; display: string } {
  if (toolName === 'Bash') {
    const command = (toolInput.command as string) || '';
    const firstWord = command.split(/\s+/)[0];
    if (firstWord) {
      const rule: ToolApprovalRule = { tool: 'Bash', pattern: `${firstWord} *`, action };
      return { rule, display: `${action === 'allow' ? 'Allow' : 'Deny'} Bash: \`${firstWord} *\`` };
    }
    const rule: ToolApprovalRule = { tool: 'Bash', action };
    return { rule, display: `${action === 'allow' ? 'Allow' : 'Deny'} all Bash commands` };
  }

  const rule: ToolApprovalRule = { tool: toolName, action };
  return { rule, display: `${action === 'allow' ? 'Allow' : 'Deny'} all ${toolName}` };
}

export function ToolApprovalModal({
  isOpen,
  toolName,
  toolInput,
  description,
  onApprove,
  onDeny,
  isApproving = false,
  isDenying = false,
}: ToolApprovalModalProps) {
  const inputJson = JSON.stringify(toolInput, null, 2);
  const isProcessing = isApproving || isDenying;
  const [creatingRule, setCreatingRule] = useState<'allow' | 'deny' | null>(null);
  const [ruleCreated, setRuleCreated] = useState<string | null>(null);

  const handleAlwaysAction = async (action: 'allow' | 'deny') => {
    setCreatingRule(action);
    try {
      const { rule, display } = deriveRulePreview(toolName, toolInput, action);
      await apiClient.post('/api/config/rules', { rule });
      setRuleCreated(display);

      // After creating the rule, approve or deny the current request
      if (action === 'allow') {
        onApprove();
      } else {
        onDeny();
      }
    } catch (err) {
      console.error('Failed to create rule:', err);
      // Still approve/deny the current request even if rule creation fails
      if (action === 'allow') onApprove();
      else onDeny();
    } finally {
      setCreatingRule(null);
    }
  };

  const allowPreview = deriveRulePreview(toolName, toolInput, 'allow');
  const denyPreview = deriveRulePreview(toolName, toolInput, 'deny');

  return (
    <Modal
      isOpen={isOpen}
      isDismissable={false}
      hideCloseButton
      size="lg"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Chip color="warning" variant="flat" size="sm">
            Approval Required
          </Chip>
          <span>Tool: {toolName}</span>
        </ModalHeader>
        <ModalBody>
          {description && (
            <p className="text-sm text-default-600 mb-3">{description}</p>
          )}
          <div className="rounded-md bg-default-50 p-3 max-h-64 overflow-y-auto">
            <Code className="text-xs whitespace-pre-wrap break-all block bg-transparent">
              {inputJson}
            </Code>
          </div>
          {ruleCreated && (
            <div className="mt-2 p-2 rounded-md bg-success-50 dark:bg-success-900/20 text-success-700 dark:text-success-400 text-xs">
              Rule created: {ruleCreated}
            </div>
          )}
          <p className="text-xs text-default-400 mt-2">
            Press <kbd className="px-1 py-0.5 rounded bg-default-200 text-default-600 font-mono text-[10px]">Y</kbd> to approve or <kbd className="px-1 py-0.5 rounded bg-default-200 text-default-600 font-mono text-[10px]">N</kbd> to deny
          </p>
        </ModalBody>
        <ModalFooter className="flex-col gap-2">
          {/* Primary approve/deny row */}
          <div className="flex w-full gap-2 justify-end">
            <Button
              color="danger"
              variant="flat"
              onPress={onDeny}
              isLoading={isDenying}
              isDisabled={isProcessing || creatingRule !== null}
            >
              Deny
            </Button>
            <Button
              color="success"
              onPress={onApprove}
              isLoading={isApproving}
              isDisabled={isProcessing || creatingRule !== null}
            >
              Approve
            </Button>
          </div>
          {/* Always allow/deny row */}
          <div className="flex w-full gap-2 justify-end border-t border-divider pt-2">
            <span className="text-xs text-default-400 self-center mr-auto">Create rule:</span>
            <Button
              size="sm"
              color="danger"
              variant="bordered"
              onPress={() => handleAlwaysAction('deny')}
              isLoading={creatingRule === 'deny'}
              isDisabled={isProcessing || creatingRule !== null}
              title={denyPreview.display}
            >
              Always Deny
            </Button>
            <Button
              size="sm"
              color="success"
              variant="bordered"
              onPress={() => handleAlwaysAction('allow')}
              isLoading={creatingRule === 'allow'}
              isDisabled={isProcessing || creatingRule !== null}
              title={allowPreview.display}
            >
              Always Allow
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
