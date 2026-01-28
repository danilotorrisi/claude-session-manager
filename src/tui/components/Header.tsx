import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Claude Session Manager" }: HeaderProps) {
  return (
    <Box
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      marginBottom={1}
    >
      <Box justifyContent="center">
        <Text backgroundColor={colors.primary} color={colors.textBright} bold>
          {"  ◆ "}{title}{" ◆  "}
        </Text>
      </Box>
    </Box>
  );
}
