import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Claude Session Manager" }: HeaderProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      marginBottom={1}
    >
      <Box justifyContent="center">
        <Text bold color="cyan">
          {title}
        </Text>
      </Box>
    </Box>
  );
}
