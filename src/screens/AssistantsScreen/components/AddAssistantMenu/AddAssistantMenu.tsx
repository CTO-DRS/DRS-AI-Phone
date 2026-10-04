import React, {useState, useContext} from 'react';
import {TouchableOpacity} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {PlusIcon} from '../../../../assets/icons';
import {Menu} from '../../../../components/Menu';
import {BrandGradient} from '../../../../components/BrandGradient';

import {useTheme} from '../../../../hooks';
import {L10nContext} from '../../../../utils';
import {createStyles} from './styles';

interface AddAssistantMenuProps {
  iconSize: number;
  onCreateAssistant: (type: 'assistant' | 'roleplay' | 'video') => void;
}

export const AddAssistantMenu: React.FC<AddAssistantMenuProps> = observer(
  ({iconSize, onCreateAssistant}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const [menuVisible, setMenuVisible] = useState(false);

    const openMenu = () => setMenuVisible(true);
    const closeMenu = () => setMenuVisible(false);

    const handleCreateAssistant = () => {
      closeMenu();
      onCreateAssistant('assistant');
    };

    const handleCreateRoleplay = () => {
      closeMenu();
      onCreateAssistant('roleplay');
    };

    const handleCreateVideo = () => {
      closeMenu();
      onCreateAssistant('video');
    };

    return (
      <Menu
        visible={menuVisible}
        onDismiss={closeMenu}
        anchorPosition="top"
        anchor={
          <TouchableOpacity
            style={styles.addButton}
            onPress={openMenu}
            testID="bottom-action-add">
            <BrandGradient circle={36} style={styles.iconGradient}>
              <PlusIcon stroke="#FFFFFF" width={iconSize} height={iconSize} />
            </BrandGradient>
            <Text style={styles.actionLabel}>
              {l10n.assistantsScreen.addAssistant}
            </Text>
          </TouchableOpacity>
        }>
        <Menu.Item
          icon="account"
          onPress={handleCreateAssistant}
          label={l10n.assistantsScreen.assistant}
        />
        <Menu.Item
          icon="drama-masks"
          onPress={handleCreateRoleplay}
          label={l10n.assistantsScreen.roleplay}
        />
        <Menu.Item
          icon="video"
          onPress={handleCreateVideo}
          label={l10n.assistantsScreen.video}
        />
      </Menu>
    );
  },
);
