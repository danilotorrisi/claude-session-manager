import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";

export interface HorizontalSelectOption {
  value: string;
  label: string;
}

interface HorizontalSelectProps {
  options: HorizontalSelectOption[];
  selectedIndex: number;
  isActive: boolean;
  onSelect?: (index: number) => void;
}

export function HorizontalSelect({
  options,
  selectedIndex,
  isActive,
}: HorizontalSelectProps) {
  if (!isActive && selectedIndex >= 0 && selectedIndex < options.length) {
    // Collapsed view: show only selected value
    return (
      <Text color={colors.success}>
        {options[selectedIndex].label} ✓
      </Text>
    );
  }

  if (!isActive) {
    return <Text color={colors.muted}>(none)</Text>;
  }

  // Active view: show all options as horizontal tags
  return (
    <Box flexDirection="column">
      <Box>
        {options.map((option, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <Box key={option.value} marginRight={1}>
              <Text
                color={isSelected ? colors.textBright : colors.muted}
                backgroundColor={isSelected ? colors.primary : undefined}
                bold={isSelected}
              >
                {isSelected ? `[ ${option.label} ]` : ` ${option.label} `}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text color={colors.muted} dimColor>
        ←/→ navigate · Enter select · Tab skip
      </Text>
    </Box>
  );
}
