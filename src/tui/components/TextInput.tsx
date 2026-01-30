import React, { useState, useEffect, useRef } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  showCursor?: boolean;
}

/**
 * Custom TextInput that uses a ref to track the latest value,
 * preventing dropped characters during fast typing.
 * Drop-in replacement for ink-text-input.
 */
export default function TextInput({
  value: originalValue,
  placeholder = "",
  focus = true,
  mask,
  showCursor = true,
  onChange,
  onSubmit,
}: TextInputProps) {
  const [state, setState] = useState({
    cursorOffset: (originalValue || "").length,
    cursorWidth: 0,
  });

  // Ref tracks the latest value to avoid stale closures when typing fast
  const valueRef = useRef(originalValue);
  useEffect(() => {
    valueRef.current = originalValue;
  }, [originalValue]);

  const cursorOffsetRef = useRef(state.cursorOffset);

  const { cursorOffset, cursorWidth } = state;

  useEffect(() => {
    setState((previousState) => {
      if (!focus || !showCursor) {
        return previousState;
      }
      const newValue = originalValue || "";
      if (previousState.cursorOffset > newValue.length - 1) {
        const next = {
          cursorOffset: newValue.length,
          cursorWidth: 0,
        };
        cursorOffsetRef.current = next.cursorOffset;
        return next;
      }
      return previousState;
    });
  }, [originalValue, focus, showCursor]);

  const cursorActualWidth = cursorWidth;
  const value = mask ? mask.repeat(originalValue.length) : originalValue;
  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(" ");
    renderedValue = value.length > 0 ? "" : chalk.inverse(" ");
    let i = 0;
    for (const char of value) {
      renderedValue +=
        i >= cursorOffset - cursorActualWidth && i <= cursorOffset
          ? chalk.inverse(char)
          : char;
      i++;
    }
    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(" ");
    }
  }

  useInput(
    (input, key) => {
      if (
        key.upArrow ||
        key.downArrow ||
        (key.ctrl && input === "c") ||
        key.tab ||
        (key.shift && key.tab)
      ) {
        return;
      }

      if (key.return) {
        if (onSubmit) {
          onSubmit(valueRef.current);
        }
        return;
      }

      // Use ref for the latest value to avoid stale closures
      const currentValue = valueRef.current;
      const currentOffset = cursorOffsetRef.current;

      let nextCursorOffset = currentOffset;
      let nextValue = currentValue;
      let nextCursorWidth = 0;

      if (key.leftArrow && key.meta) {
        // Alt+Left: move cursor to start of previous word
        if (showCursor) {
          let i = currentOffset - 1;
          while (i > 0 && currentValue[i - 1] === " ") i--;
          while (i > 0 && currentValue[i - 1] !== " ") i--;
          nextCursorOffset = i;
        }
      } else if (key.rightArrow && key.meta) {
        // Alt+Right: move cursor to end of next word
        if (showCursor) {
          let i = currentOffset;
          while (i < currentValue.length && currentValue[i] === " ") i++;
          while (i < currentValue.length && currentValue[i] !== " ") i++;
          nextCursorOffset = i;
        }
      } else if (key.leftArrow) {
        if (showCursor) {
          nextCursorOffset--;
        }
      } else if (key.rightArrow) {
        if (showCursor) {
          nextCursorOffset++;
        }
      } else if ((key.backspace || key.delete) && key.meta) {
        // Alt+Backspace: delete previous word
        if (currentOffset > 0) {
          let i = currentOffset - 1;
          while (i > 0 && currentValue[i - 1] === " ") i--;
          while (i > 0 && currentValue[i - 1] !== " ") i--;
          nextValue = currentValue.slice(0, i) + currentValue.slice(currentOffset);
          nextCursorOffset = i;
        }
      } else if (key.backspace || key.delete) {
        if (currentOffset > 0) {
          nextValue =
            currentValue.slice(0, currentOffset - 1) +
            currentValue.slice(currentOffset, currentValue.length);
          nextCursorOffset--;
        }
      } else {
        nextValue =
          currentValue.slice(0, currentOffset) +
          input +
          currentValue.slice(currentOffset, currentValue.length);
        nextCursorOffset += input.length;
        if (input.length > 1) {
          nextCursorWidth = input.length;
        }
      }

      if (nextCursorOffset < 0) {
        nextCursorOffset = 0;
      }
      if (nextCursorOffset > nextValue.length) {
        nextCursorOffset = nextValue.length;
      }

      cursorOffsetRef.current = nextCursorOffset;
      setState({
        cursorOffset: nextCursorOffset,
        cursorWidth: nextCursorWidth,
      });

      if (nextValue !== currentValue) {
        valueRef.current = nextValue;
        onChange(nextValue);
      }
    },
    { isActive: focus }
  );

  return (
    <Text>
      {placeholder
        ? value.length > 0
          ? renderedValue
          : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}
