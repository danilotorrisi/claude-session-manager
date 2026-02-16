import { Button } from '@heroui/react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4 text-default-300 text-5xl">{icon}</div>}
      <h3 className="text-lg font-semibold text-default-700">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-default-500 max-w-md">{description}</p>
      )}
      {action && (
        <Button
          color="primary"
          className="mt-6"
          onPress={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
