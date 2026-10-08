import React, {useContext, useEffect, useState} from 'react';
import {Modal, TextInput, TouchableOpacity, View} from 'react-native';
import {Text, useTheme} from 'react-native-paper';
import {observer} from 'mobx-react';

import {createStyles} from './styles';
import {L10nContext} from '../../utils';
import {chatSessionStore} from '../../store';
import {TagIcon} from '../../assets/icons';

interface TagsModalProps {
  visible: boolean;
  onClose: () => void;
  sessionId: string | null;
}

const parseTagsInput = (input: string): string[] =>
  input
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

/**
 * Edit-tags dialog for a chat session: comma-separated input plus quick
 * toggles for every tag already used anywhere in the sidebar.
 */
export const TagsModal: React.FC<TagsModalProps> = observer(
  ({visible, onClose, sessionId}) => {
    const [input, setInput] = useState('');
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const session = chatSessionStore.sessions.find(s => s.id === sessionId);

    useEffect(() => {
      if (visible) {
        setInput((session?.tags ?? []).join(', '));
      }
    }, [visible, session?.tags]);

    const handleSave = async () => {
      if (sessionId) {
        await chatSessionStore.setSessionTags(sessionId, parseTagsInput(input));
      }
      onClose();
    };

    const toggleSuggestion = (tag: string) => {
      const current = parseTagsInput(input);
      if (current.includes(tag)) {
        setInput(current.filter(t => t !== tag).join(', '));
      } else {
        setInput([...current, tag].join(', '));
      }
    };

    const currentTags = parseTagsInput(input);

    return (
      <Modal
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
        animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="tags-modal">
            <Text style={styles.modalTitle}>
              {l10n.components.tagsModal.title}
            </Text>
            <View style={styles.body}>
              <Text style={styles.label}>
                {l10n.components.tagsModal.inputLabel}
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder={l10n.components.tagsModal.inputPlaceholder}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={input}
                maxLength={200}
                multiline={true}
                onChangeText={setInput}
                autoFocus={true}
                onSubmitEditing={handleSave}
                returnKeyType="done"
                blurOnSubmit={true}
                testID="tags-modal-input"
              />
              {chatSessionStore.tags.length > 0 && (
                <>
                  <Text style={styles.label}>
                    {l10n.components.tagsModal.suggestions}
                  </Text>
                  <View style={styles.chipWrap} testID="tags-modal-suggestions">
                    {chatSessionStore.tags.map(tag => (
                      <TouchableOpacity
                        key={tag.name}
                        style={[
                          styles.chip,
                          currentTags.includes(tag.name) && styles.chipActive,
                        ]}
                        onPress={() => toggleSuggestion(tag.name)}>
                        <TagIcon
                          width={13}
                          height={13}
                          stroke={theme.colors.primary}
                        />
                        <Text style={styles.chipText}>
                          {tag.name} ({tag.count})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                testID="tags-modal-cancel">
                <Text style={styles.cancelText}>{l10n.common.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleSave}
                testID="tags-modal-save">
                <Text style={styles.confirmText}>{l10n.common.save}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  },
);
