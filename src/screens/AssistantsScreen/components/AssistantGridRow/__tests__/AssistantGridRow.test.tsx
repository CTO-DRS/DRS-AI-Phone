import React from 'react';
import {StyleSheet, View} from 'react-native';

import {render} from '../../../../../../jest/test-utils';
import {createAssistant} from '../../../../../../jest/fixtures/assistants';

import {AssistantGridRow} from '../AssistantGridRow';
import {styles} from '../styles';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: jest.fn()}),
}));

describe('AssistantGridRow', () => {
  const items = [createAssistant({id: 'cell-a'}), createAssistant({id: 'cell-b'})];

  const renderCells = () => {
    const {UNSAFE_getAllByType} = render(
      <AssistantGridRow
        row={{key: 'row-0', items}}
        cardWidth={180}
        onAssistantPress={jest.fn()}
      />,
    );

    return UNSAFE_getAllByType(View).filter(
      view =>
        Array.isArray(view.props.style) && view.props.style[0] === styles.cell,
    );
  };

  it('gives every cell the card width and no flex of its own', () => {
    const cells = renderCells();

    expect(cells).toHaveLength(items.length);
    cells.forEach(cell => {
      const style = StyleSheet.flatten(cell.props.style);

      expect(style.width).toBe(180);
      expect(style.flex).toBeUndefined();
      expect(style.flexGrow).toBeUndefined();
      expect(style.flexBasis).toBeUndefined();
    });
  });
});
