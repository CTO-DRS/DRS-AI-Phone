import {View, Keyboard, Alert} from 'react-native';

import React, {useContext, useState} from 'react';

import {observer} from 'mobx-react';
import {IconButton, useTheme} from 'react-native-paper';

import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {t} from '../../locales';

import {Menu} from '..';
import {DotsVerticalIcon, ShareIcon} from '../../assets/icons';

import {exportAllAssistants} from '../../utils/exportUtils';
import {importAssistants} from '../../utils/importUtils';

export const AssistantHeaderRight = observer(() => {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);

  const l10n = useContext(L10nContext);

  const styles = createStyles();

  const openMenu = () => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
    }
    setMenuVisible(true);
  };
  const closeMenu = () => setMenuVisible(false);

  const onPressExportAllAssistants = async () => {
    try {
      await exportAllAssistants();
    } catch (error) {
      console.error('Error exporting all assistants:', error);
      Alert.alert('Export Error', 'Failed to export all assistants.');
    }
    closeMenu();
  };

  const onPressImportAssistants = async () => {
    try {
      const count = await importAssistants();
      if (count > 0) {
        Alert.alert(
          'Import Success',
          t(l10n.components.assistantHeaderRight.importSuccess, {
            count: count.toString(),
          }),
        );
      }
    } catch (error) {
      console.error('Error importing assistants:', error);
      Alert.alert('Import Error', l10n.components.assistantHeaderRight.importError);
    }
    closeMenu();
  };

  return (
    <View style={styles.container}>
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchorPosition="bottom"
        anchor={
          <IconButton
            icon={() => <DotsVerticalIcon fill={theme.colors.primary} />}
            style={styles.menuBtn}
            onPress={openMenu}
            testID="assistant-menu-button"
          />
        }>
        <Menu.Item
          submenu={[
            <Menu.Item
              key="export-all"
              onPress={onPressExportAllAssistants}
              label={l10n.components.assistantHeaderRight.exportAllAssistants}
            />,
            <Menu.Item
              key="import"
              onPress={onPressImportAssistants}
              label={l10n.components.assistantHeaderRight.importAssistants}
            />,
          ]}
          label={l10n.components.headerRight.export}
          leadingIcon={() => <ShareIcon stroke={theme.colors.primary} />}
        />
      </Menu>
    </View>
  );
});
