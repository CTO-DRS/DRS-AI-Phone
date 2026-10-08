import React, {useContext, useEffect, useState} from 'react';
import {Modal, TextInput, TouchableOpacity, View} from 'react-native';
import {Text, useTheme} from 'react-native-paper';
import {observer} from 'mobx-react';

import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {chatSessionStore} from '../../store';
import {FolderIcon} from '../../assets/icons';

interface FolderModalProps {
  visible: boolean;
  onClose: () => void;
  sessionId: string | null;
}

/**
 * Pick-or-create folder dialog for a chat session.
 * Existing folders are offered as quick chips; typing a new name creates it
 * on save. "Remove from folder" clears the assignment.
 */
export const FolderModal: React.FC<FolderModalProps> = observer(
  ({visible, onClose, sessionId}) => {
    const [name, setName] = useState('');
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const session = chatSessionStore.sessions.find(s => s.id === sessionId);

    useEffect(() => {
      if (visible) {
        setName(session?.folder ?? '');
      }
    }, [visible, session?.folder]);

    const handleSave = async () => {
      const trimmed = name.trim();
      if (sessionId && trimmed) {
        await chatSessionStore.setSessionFolder(sessionId, trimmed);
      }
      onClose();
    };

    const handleRemove = async () => {
      if (sessionId) {
        await chatSessionStore.setSessionFolder(sessionId, null);
      }
      onClose();
    };

    const pickExisting = async (folder: string) => {
      if (sessionId) {
        await chatSessionStore.setSessionFolder(sessionId, folder);
      }
      onClose();
    };

    return (
      <Modal
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
        animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="folder-modal">
            <Text style={styles.modalTitle}>
              {l10n.components.folderModal.title}
            </Text>
            <View style={styles.body}>
              <Text style={styles.label}>
                {l10n.components.folderModal.inputLabel}
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder={l10n.components.folderModal.inputPlaceholder}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={name}
                maxLength={60}
                onChangeText={setName}
                autoFocus={true}
                onSubmitEditing={handleSave}
                returnKeyType="done"
                testID="folder-modal-input"
              />
              {chatSessionStore.folders.length > 0 && (
                <>
                  <Text style={styles.label}>
                    {l10n.components.folderModal.existing}
                  </Text>
                  <View style={styles.chipWrap} testID="folder-modal-existing">
                    {chatSessionStore.folders.map(folder => (
                      <TouchableOpacity
                        key={folder.name}
                        style={[
                          styles.chip,
                          session?.folder === folder.name && styles.chipActive,
                        ]}
                        onPress={() => pickExisting(folder.name)}>
                        <FolderIcon
                          width={13}
                          height={13}
                          stroke={theme.colors.primary}
                        />
                        <Text style={styles.chipText}>
                          {folder.name} ({folder.count})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
            <View style={styles.buttonContainer}>
              {session?.folder ? (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={handleRemove}
                  testID="folder-modal-remove">
                  <Text
                    style={[styles.cancelText, {color: theme.colors.error}]}>
                    {l10n.components.folderModal.remove}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                  testID="folder-modal-cancel">
                  <Text style={styles.cancelText}>{l10n.common.cancel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  !name.trim() && styles.disabledButton,
                ]}
                onPress={handleSave}
                disabled={!name.trim()}
                testID="folder-modal-save">
                <Text style={styles.confirmText}>{l10n.common.save}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  },
);
