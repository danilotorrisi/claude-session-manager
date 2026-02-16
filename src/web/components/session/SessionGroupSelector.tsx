import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from '@heroui/react';
import { useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';

interface SessionGroupSelectorProps {
  /** Currently selected group filter (null = "All") */
  selectedGroup: string | null;
  onSelectGroup: (groupId: string | null) => void;
}

export function SessionGroupSelector({
  selectedGroup,
  onSelectGroup,
}: SessionGroupSelectorProps) {
  const groups = useSessionStore((s) => s.groups);
  const addGroup = useSessionStore((s) => s.addGroup);
  const removeGroup = useSessionStore((s) => s.removeGroup);
  const [newGroupName, setNewGroupName] = useState('');

  const selectedLabel = selectedGroup
    ? groups.find((g) => g.id === selectedGroup)?.name ?? 'All'
    : 'All';

  const handleAddGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    addGroup(trimmed);
    setNewGroupName('');
  };

  // Build items array: "All" + each group
  const groupItems = [
    { key: 'all', label: 'All Sessions', count: undefined as number | undefined },
    ...groups.map((g) => ({ key: g.id, label: g.name, count: g.sessionNames.length })),
  ];

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button variant="flat" size="sm">
          Group: {selectedLabel}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Session groups"
        items={groupItems}
        onAction={(key) => {
          const k = String(key);
          if (k === '__create') return;
          onSelectGroup(k === 'all' ? null : k);
        }}
      >
        {(item) => (
          <DropdownItem
            key={item.key}
            className={
              (selectedGroup === null && item.key === 'all') ||
              selectedGroup === item.key
                ? 'bg-primary-50 dark:bg-primary-50/10'
                : ''
            }
            endContent={
              item.key !== 'all' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeGroup(item.key);
                    if (selectedGroup === item.key) onSelectGroup(null);
                  }}
                  className="text-danger text-xs hover:underline ml-2"
                >
                  remove
                </button>
              ) : undefined
            }
          >
            {item.label}
            {item.count != null ? ` (${item.count})` : ''}
          </DropdownItem>
        )}
      </DropdownMenu>
    </Dropdown>
  );
}
