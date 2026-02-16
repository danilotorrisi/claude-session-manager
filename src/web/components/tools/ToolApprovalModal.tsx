import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Code,
  Chip,
} from '@heroui/react';

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
          <p className="text-xs text-default-400 mt-2">
            Press <kbd className="px-1 py-0.5 rounded bg-default-200 text-default-600 font-mono text-[10px]">Y</kbd> to approve or <kbd className="px-1 py-0.5 rounded bg-default-200 text-default-600 font-mono text-[10px]">N</kbd> to deny
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            color="danger"
            variant="flat"
            onPress={onDeny}
            isLoading={isDenying}
            isDisabled={isProcessing}
          >
            Deny
          </Button>
          <Button
            color="success"
            onPress={onApprove}
            isLoading={isApproving}
            isDisabled={isProcessing}
          >
            Approve
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
