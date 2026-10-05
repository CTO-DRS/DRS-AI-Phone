"use strict";

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { jsx as _jsx } from "react/jsx-runtime";
const HighlightedText = ({
  text,
  style,
  highlights = [],
  highlightedStyle,
  onHighlightedPress,
  ...rest
}) => {
  const baseStyle = [style, highlightedStyle ?? styles.isHighlighted];
  const segments = React.useMemo(() => {
    if (!text || !highlights.length) {
      return [];
    }
    let cursor = 0;
    let isSorted = true;
    const parts = [];
    for (let i = 1; i < highlights.length; i++) {
      if (highlights[i - 1].start > highlights[i].start) {
        isSorted = false;
        break;
      }
    }
    const ordered = isSorted ? highlights : [...highlights].sort((a, b) => a.start - b.start);
    for (let i = 0; i < ordered.length; i++) {
      const {
        end,
        start,
        style: segmentStyle
      } = ordered[i];
      if (start >= text.length || end <= cursor) continue;
      const clampedStart = Math.max(cursor, start);
      const clampedEnd = Math.min(end, text.length);
      if (clampedStart > cursor) {
        parts.push({
          isHighlighted: false,
          text: text.slice(cursor, clampedStart)
        });
      }
      parts.push({
        end: clampedEnd,
        start: clampedStart,
        style: segmentStyle,
        isHighlighted: true,
        text: text.slice(clampedStart, clampedEnd)
      });
      cursor = clampedEnd;
    }
    if (cursor < text.length) {
      parts.push({
        isHighlighted: false,
        text: text.slice(cursor)
      });
    }
    return parts;
  }, [highlights, text]);
  const onHighlightedSegmentPress = React.useCallback(segment => {
    if (!segment.isHighlighted) return;
    onHighlightedPress?.({
      end: segment.end,
      start: segment.start,
      text: segment.text
    });
  }, [onHighlightedPress]);
  const renderText = (segment, index) => {
    const segmentStyle = segment.isHighlighted ? segment.style ? [baseStyle, segment.style] : baseStyle : style;
    return /*#__PURE__*/_jsx(Text, {
      style: segmentStyle,
      suppressHighlighting: true,
      onPress: () => onHighlightedSegmentPress(segment),
      children: segment.text
    }, `segment-${index}`);
  };
  return /*#__PURE__*/_jsx(Text, {
    style: style,
    ...rest,
    children: segments.length ? segments.map(renderText) : text
  });
};
export default HighlightedText;
const styles = StyleSheet.create({
  isHighlighted: {
    backgroundColor: '#FFFF00'
  }
});
//# sourceMappingURL=index.js.map