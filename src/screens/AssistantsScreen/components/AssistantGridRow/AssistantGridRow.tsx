import React from 'react';
import {View} from 'react-native';

import {SquareAssistantCard} from '../SquareAssistantCard';

import {styles} from './styles';

import {isLocalAssistant} from '../../../../utils/assistant-type-guards';

import type {
  AssistantGridItem,
  AssistantGridRowData,
} from '../../assistantGridLayout';

interface AssistantGridRowProps {
  row: AssistantGridRowData;
  cardWidth: number;
  onAssistantPress: (assistant: AssistantGridItem) => void;
}

export const AssistantGridRow: React.FC<AssistantGridRowProps> = ({
  row,
  cardWidth,
  onAssistantPress,
}) => (
  <View style={styles.row}>
    {row.items.map(item => (
      <View key={item.id} style={[styles.cell, {width: cardWidth}]}>
        <SquareAssistantCard
          assistant={item}
          onPress={() => onAssistantPress(item)}
          isLocal={isLocalAssistant(item)}
        />
      </View>
    ))}
  </View>
);
