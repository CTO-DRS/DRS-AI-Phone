import React from 'react';
import {Alert, Keyboard} from 'react-native';
import {render, fireEvent, waitFor} from '@testing-library/react-native';

import {AssistantHeaderRight} from '../AssistantHeaderRight';
import {exportAllAssistants} from '../../../utils/exportUtils';
import {importAssistants} from '../../../utils/importUtils';
import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';

// Mock utilities
jest.mock('../../../utils/exportUtils', () => ({
  exportAllAssistants: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../utils/importUtils', () => ({
  importAssistants: jest.fn().mockResolvedValue(5),
}));

// Mock Menu component
jest.mock('../../Menu', () => {
  const {View, Button} = require('react-native');

  const MockMenuItem = ({onPress, label, submenu}: any) => {
    if (submenu) {
      return (
        <View testID={`menu-item-${label}`}>
          <Button title={label} onPress={() => {}} />
          {submenu.map((item: any, index: number) => (
            <View key={index}>{item}</View>
          ))}
        </View>
      );
    }
    return (
      <Button testID={`menu-item-${label}`} title={label} onPress={onPress} />
    );
  };

  const Menu = ({children, visible, anchor}: any) => (
    <View testID="menu">
      {anchor}
      {visible && <View testID="menu-content">{children}</View>}
    </View>
  );

  Menu.Item = MockMenuItem;

  return {Menu};
});

// Mock Keyboard
jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
jest.spyOn(Keyboard, 'dismiss').mockImplementation();

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('AssistantHeaderRight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders correctly', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      expect(getByTestId('menu')).toBeTruthy();
      expect(getByTestId('assistant-menu-button')).toBeTruthy();
    });

    it('menu is initially closed', () => {
      const {queryByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      expect(queryByTestId('menu-content')).toBeNull();
    });
  });

  describe('Menu Interaction', () => {
    it('opens menu when menu button is pressed', () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      expect(getByTestId('menu-content')).toBeTruthy();
    });

    it('dismisses keyboard before opening menu if keyboard is visible', () => {
      (Keyboard.isVisible as jest.Mock).mockReturnValue(true);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      expect(Keyboard.dismiss).toHaveBeenCalled();
    });

    it('does not dismiss keyboard if keyboard is not visible', () => {
      (Keyboard.isVisible as jest.Mock).mockReturnValue(false);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      expect(Keyboard.dismiss).not.toHaveBeenCalled();
    });
  });

  describe('Export Functionality', () => {
    it('exports all assistants when export option is selected', async () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      // Open menu
      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      // Find and press export all assistants button
      const exportButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.exportAllAssistants}`,
      );
      fireEvent.press(exportButton);

      await waitFor(() => {
        expect(exportAllAssistants).toHaveBeenCalled();
      });
    });

    it('handles export error gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (exportAllAssistants as jest.Mock).mockRejectedValueOnce(
        new Error('Export failed'),
      );

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      const exportButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.exportAllAssistants}`,
      );
      fireEvent.press(exportButton);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Error exporting all assistants:',
          expect.any(Error),
        );
        expect(Alert.alert).toHaveBeenCalledWith(
          'Export Error',
          'Failed to export all assistants.',
        );
      });

      consoleError.mockRestore();
    });

    it('closes menu after successful export', async () => {
      const {getByTestId, queryByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      const exportButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.exportAllAssistants}`,
      );
      fireEvent.press(exportButton);

      await waitFor(() => {
        expect(exportAllAssistants).toHaveBeenCalled();
      });

      await waitFor(
        () => {
          // Menu should be closed
          expect(queryByTestId('menu-content')).toBeNull();
        },
        {timeout: 4000},
      );
    });
  });

  describe('Import Functionality', () => {
    it('imports assistants when import option is selected', async () => {
      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.importAssistants}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(importAssistants).toHaveBeenCalled();
      });
    });

    it('shows success alert when assistants are imported', async () => {
      (importAssistants as jest.Mock).mockResolvedValueOnce(5);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.importAssistants}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Import Success',
          expect.stringContaining('5'),
        );
      });
    });

    it('does not show success alert when no assistants are imported', async () => {
      (importAssistants as jest.Mock).mockResolvedValueOnce(0);

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.importAssistants}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(importAssistants).toHaveBeenCalled();
        expect(Alert.alert).not.toHaveBeenCalled();
      });
    });

    it('handles import error gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      (importAssistants as jest.Mock).mockRejectedValueOnce(
        new Error('Import failed'),
      );

      const {getByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.importAssistants}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Error importing assistants:',
          expect.any(Error),
        );
        expect(Alert.alert).toHaveBeenCalledWith(
          'Import Error',
          l10n.en.components.assistantHeaderRight.importError,
        );
      });

      consoleError.mockRestore();
    });

    it('closes menu after import attempt', async () => {
      const {getByTestId, queryByTestId} = render(
        <L10nContext.Provider value={l10n.en}>
          <AssistantHeaderRight />
        </L10nContext.Provider>,
      );

      const menuButton = getByTestId('assistant-menu-button');
      fireEvent.press(menuButton);

      const importButton = getByTestId(
        `menu-item-${l10n.en.components.assistantHeaderRight.importAssistants}`,
      );
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(importAssistants).toHaveBeenCalled();
      });
      await waitFor(
        () => {
          expect(queryByTestId('menu-content')).toBeNull();
        },
        {timeout: 5000},
      );
    });
  });
});
