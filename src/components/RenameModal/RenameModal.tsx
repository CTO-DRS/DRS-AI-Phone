import React, {useContext, useEffect} from 'react';
import {Modal, TextInput, TouchableOpacity, View} from 'react-native';
import {Text, useTheme} from 'react-native-paper';

import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {chatSessionStore, SessionMetaData} from '../../store';

interface RenameModalProps {
  visible: boolean;
  onClose: () => void;
  session: SessionMetaData | null;
  /** When provided, the modal renames this folder instead of the session. */
  folder?: string | null;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  visible,
  onClose,
  session,
  folder = null,
}) => {
  const [newTitle, setNewTitle] = React.useState(
    folder || session?.title || '',
  );
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);

  useEffect(() => {
    setNewTitle(folder || session?.title || '');
  }, [folder, session, visible]);

  const handleRename = async () => {
    const trimmed = newTitle.trim();
    if (folder) {
      if (trimmed) {
        await chatSessionStore.renameFolder(folder, trimmed);
        onClose();
      }
      return;
    }
    if (session?.id && trimmed) {
      await chatSessionStore.updateSessionTitleBySessionId(
        session?.id,
        trimmed,
      );
      onClose();
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
      animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {folder
              ? l10n.components.sidebarContent.renameFolderTitle
              : l10n.common.rename}
          </Text>
          <TextInput
            style={styles.textInput}
            placeholder={
              folder
                ? l10n.components.folderModal.inputPlaceholder
                : 'New Title'
            }
            placeholderTextColor={theme.colors.onSurfaceVariant}
            value={newTitle}
            maxLength={100}
            onChangeText={setNewTitle}
            autoFocus={true}
            onSubmitEditing={handleRename}
            returnKeyType="done"
          />
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelText}>{l10n.common.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                !newTitle.trim() && styles.disabledButton,
              ]}
              onPress={handleRename}
              disabled={!newTitle.trim()}>
              <Text style={styles.confirmText}>{l10n.common.save}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
