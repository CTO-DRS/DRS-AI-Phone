import React, {useContext} from 'react';
import {View, TouchableOpacity, Image, Alert} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useNavigation} from '@react-navigation/native';
import {Text, Card, Chip, IconButton} from 'react-native-paper';

import {
  StarIcon,
  LockIcon,
  ChatIcon,
  CameraIcon,
  TrashIcon,
  ShareIcon,
} from '../../../../assets/icons';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';

import type {Assistant} from '../../../../store/LegacyStore';
import {assistantStore} from '../../../../store/LegacyStore';
import {chatSessionStore, modelStore} from '../../../../store';

import type {DrshubAssistant} from '../../../../types/drshub';

import {L10nContext} from '../../../../utils';
import {t} from '../../../../locales';
import {exportAssistant} from '../../../../utils/exportUtils';
import {ROUTES} from '../../../../utils/navigationConstants';
import {getContrastColor} from '../../../../utils/colorUtils';
import {getFullThumbnailUri} from '../../../../utils/imageUtils';
import {getAssistantDisplayLabel} from '../../../../utils/drshub-display';
import {hasVideoCapability} from '../../../../utils/assistant-capabilities';
import {isLocalAssistant, isDrshubAssistant} from '../../../../utils/assistant-type-guards';

interface SquareAssistantCardProps {
  assistant: DrshubAssistant | Assistant;
  onPress: () => void;
  isLocal?: boolean;
}

const generateParameterSummary = (assistant: Assistant): string => {
  // Safety check for parameters
  if (!assistant.parameters || typeof assistant.parameters !== 'object') {
    return '';
  }

  // Generate a generic summary from any parameters
  const paramEntries = Object.entries(assistant.parameters).filter(
    ([_, value]) => value && typeof value === 'string' && value.trim() !== '',
  );

  if (paramEntries.length === 0) {
    return '';
  }

  // Take the first few meaningful parameters and create a summary
  const meaningfulParams = paramEntries.slice(0, 3);
  return meaningfulParams.map(([_, value]) => value).join(' • ');
};

const cleanSystemPrompt = (systemPrompt: string): string => {
  // Safety check for undefined or null values
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return '';
  }

  // Remove common prefixes and clean up the prompt for display
  let cleaned = systemPrompt
    .replace(/^You are\s+/i, '')
    .replace(/^You're\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove technical instructions at the end
  cleaned = cleaned.replace(
    /\.\s*(Use few words|Be concise|If unsure, say so clearly).*$/i,
    '',
  );

  return cleaned;
};

const getDisplayContent = (assistant: DrshubAssistant | Assistant): string => {
  // Priority 1: Drshub description
  if (assistant.description) {
    return assistant.description;
  }

  // Priority 2: Parameter-based summary (for local assistants with meaningful parameters)
  if (isLocalAssistant(assistant)) {
    const summary = generateParameterSummary(assistant);
    if (summary) {
      return summary;
    }
  }

  // Priority 3: Cleaned system prompt
  const systemPrompt = isDrshubAssistant(assistant) ? assistant.system_prompt : assistant.systemPrompt;

  if (systemPrompt) {
    return cleanSystemPrompt(systemPrompt);
  }

  // Priority 4: Fallback based on capabilities (local assistants only)
  if (isLocalAssistant(assistant)) {
    // Check capabilities
    if (hasVideoCapability(assistant)) {
      return 'Video AI Assistant';
    }

    // Check if it has any advanced capabilities
    if (assistant.capabilities && Object.keys(assistant.capabilities).length > 0) {
      return 'Advanced AI Assistant';
    }

    return 'AI Assistant';
  }

  return '';
};

const AssistantThumbnail: React.FC<{
  assistant: DrshubAssistant | Assistant;
  isLocal?: boolean;
  onChatPress: () => void;
}> = ({assistant, isLocal, onChatPress}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const assistantName = isDrshubAssistant(assistant) ? assistant.title : assistant.name;
  const firstLetter = assistantName?.[0]?.toUpperCase() || 'P';

  // Get thumbnail image URL - convert relative paths to full URIs for Image component
  const thumbnailUrl = assistant.thumbnail_url
    ? getFullThumbnailUri(assistant.thumbnail_url)
    : undefined;

  // Get assistant colors for gradient background (local assistants only)
  const assistantColors = isLocalAssistant(assistant) ? assistant.color : null;
  const gradientColors =
    Array.isArray(assistantColors) && assistantColors.length >= 2
      ? assistantColors
      : ['#333333', '#e5e5e6']; // Default colors

  // Get chat navigation icon (combines type + chat functionality)
  const getChatNavigationIcon = () => {
    // Use capability-based detection for video assistants (local assistants only)
    if (isLocalAssistant(assistant) && hasVideoCapability(assistant)) {
      return (
        <CameraIcon stroke={theme.colors.primary} width={18} height={18} />
      );
    }

    // Default to chat icon for all other assistants
    return <ChatIcon stroke={theme.colors.primary} width={18} height={18} />;
  };

  // TODO: Create gradient style, or remove gradients
  const gradientStyle = assistantColors
    ? {
        backgroundColor: gradientColors[0],
        // Note: For true gradients, we'd need react-native-linear-gradient
        // For now, using solid color with the first color
      }
    : {};

  const thumbnailStyle = [styles.thumbnail, gradientStyle];

  const textColor = assistantColors
    ? getContrastColor(gradientColors[0])
    : theme.colors.onPrimaryContainer;

  return (
    <View style={thumbnailStyle}>
      {thumbnailUrl ? (
        <Image
          source={{uri: thumbnailUrl}}
          style={styles.thumbnailImage}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.thumbnailText, {color: textColor}]}>
          {firstLetter}
        </Text>
      )}

      {/* Chat Navigation Button (only for downloaded/local assistants) */}
      {(isLocal ||
        (isDrshubAssistant(assistant) && assistantStore.isDrshubAssistantDownloaded(assistant.id))) && (
        <TouchableOpacity style={styles.chatButton} onPress={onChatPress}>
          {getChatNavigationIcon()}
        </TouchableOpacity>
      )}

      {/* Badges */}
      {isDrshubAssistant(assistant) && assistant.protection_level === 'reveal_on_purchase' && (
        <View style={styles.protectionBadge}>
          <LockIcon stroke={theme.colors.onPrimary} width={10} height={10} />
        </View>
      )}
    </View>
  );
};

export const SquareAssistantCard: React.FC<SquareAssistantCardProps> = observer(
  ({assistant, onPress, isLocal = false}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const navigation = useNavigation();

    // Check if assistant needs a model warning
    // Only for local assistants (downloaded assistants) that have a default model
    const shouldShowModelWarning =
      isLocal &&
      isLocalAssistant(assistant) &&
      assistant.defaultModel &&
      !modelStore.isModelAvailable(assistant.defaultModel.id);

    // Chat handler with 3-step assistant activation logic
    const handleStartChat = async () => {
      try {
        // Handle Drshub assistants that need to be downloaded first
        let localAssistant: Assistant | undefined;

        if (isDrshubAssistant(assistant)) {
          // Check if this Drshub assistant is already downloaded
          localAssistant = assistantStore.assistants.find(p => p.drshub_id === assistant.id);

          if (!localAssistant) {
            // Need to download first
            Alert.alert(
              'Download Assistant',
              `Download "${assistant.title}" to start chatting?`,
              [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Download',
                  onPress: async () => {
                    try {
                      const downloadedAssistant =
                        await assistantStore.downloadDrshubAssistant(assistant);
                      await activateAssistantAndNavigate(downloadedAssistant);
                    } catch (error) {
                      console.error('Error downloading assistant:', error);
                      Alert.alert(
                        'Download Error',
                        'Failed to download assistant. Please try again.',
                      );
                    }
                  },
                },
              ],
            );
            return;
          }
        } else {
          localAssistant = assistant;
        }

        await activateAssistantAndNavigate(localAssistant);
      } catch (error) {
        console.error('Error starting chat:', error);
        Alert.alert('Error', 'Failed to start chat. Please try again.');
      }
    };

    // 3-step assistant activation logic from ChatAssistantModelPickerSheet
    const activateAssistantAndNavigate = async (localAssistant: Assistant) => {
      // Step 1: Set the assistant as active
      await chatSessionStore.setActiveAssistant(localAssistant.id);

      // Step 2 & 3: Handle model loading logic
      if (localAssistant.defaultModel) {
        if (!modelStore.activeModel) {
          // Step 2: No model loaded, load the assistant's default model
          const assistantDefaultModel = modelStore.availableModels.find(
            m => m.id === localAssistant.defaultModel?.id,
          );
          if (assistantDefaultModel) {
            await modelStore.selectModel(assistantDefaultModel);
          }
        } else if (localAssistant.defaultModel.id !== modelStore.activeModelId) {
          // Step 3: Different model loaded, ask user
          const assistantDefaultModel = modelStore.availableModels.find(
            m => m.id === localAssistant.defaultModel?.id,
          );
          if (assistantDefaultModel) {
            Alert.alert(
              'Switch Model?',
              `Switch to "${assistantDefaultModel.name}" for this assistant?`,
              [
                {text: 'Keep Current', style: 'cancel'},
                {
                  text: 'Switch',
                  onPress: () => {
                    modelStore.selectModel(assistantDefaultModel);
                  },
                },
              ],
            );
          }
        }
      }

      // Navigate to chat
      (navigation as any).navigate(ROUTES.CHAT);
    };

    // Action handlers for local assistants only
    const handleDelete = () => {
      const assistantName = isDrshubAssistant(assistant) ? assistant.title : assistant.name;
      Alert.alert(
        l10n.assistantsScreen.deleteAssistant,
        t(l10n.assistantsScreen.deleteAssistantConfirmation, {assistantName}),
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: () => assistantStore.deleteAssistant(assistant.id),
          },
        ],
      );
    };

    const handleShare = async () => {
      try {
        await exportAssistant(assistant.id);
      } catch (error) {
        console.error('Error sharing assistant:', error);
        Alert.alert('Share Error', 'Failed to share assistant. Please try again.', [
          {text: 'OK'},
        ]);
      }
    };

    // Get display label for assistant
    const getDisplayLabel = (pal_: DrshubAssistant) => {
      return getAssistantDisplayLabel(pal_);
    };

    const assistantColors = isLocalAssistant(assistant) ? assistant.color : null;
    const assistantName = isDrshubAssistant(assistant) ? assistant.title : assistant.name;
    const assistantLabel = isDrshubAssistant(assistant) ? getDisplayLabel(assistant) : null;
    const assistantRating = isDrshubAssistant(assistant) ? assistant.average_rating : assistant.rating;
    const assistantReviewCount = isDrshubAssistant(assistant)
      ? assistant.review_count
      : assistant.review_count;
    const assistantTags = isDrshubAssistant(assistant) ? assistant.tags : undefined;
    const assistantCreator = isDrshubAssistant(assistant) ? assistant.creator : undefined;
    const isProtected =
      isDrshubAssistant(assistant) && assistant.protection_level === 'reveal_on_purchase';

    // Create card style with optional color theming
    const cardStyle = [
      styles.card,
      assistantColors && {
        borderColor: assistantColors[1],
        borderWidth: 0.5,
      },
    ];

    return (
      <View style={styles.cardOuter}>
        <TouchableOpacity
          testID={`${isDrshubAssistant(assistant) ? 'drshub' : 'local'}-assistant-card-${assistant.id}`}
          style={styles.container}
          onPress={onPress}
          activeOpacity={0.7}>
          <Card elevation={0} style={cardStyle} contentStyle={styles.cardInner}>
            <View style={styles.cardContent}>
              {/* Thumbnail */}
              <AssistantThumbnail
                assistant={assistant}
                isLocal={isLocal}
                onChatPress={handleStartChat}
              />

              {/* Content */}
              <View style={styles.content}>
                {/* Header with name and actions */}
                <View style={styles.header}>
                  <View style={styles.nameSection}>
                    <Text style={styles.assistantName} numberOfLines={1}>
                      {assistantName}
                    </Text>
                    {isProtected && (
                      <LockIcon
                        stroke={theme.colors.onSurfaceVariant}
                        width={14}
                        height={14}
                      />
                    )}
                  </View>

                  {/* Action buttons */}
                  <View style={styles.headerActions}>
                    {/* Share button for local assistants only */}
                    {isLocal && (
                      <IconButton
                        icon={() => (
                          <ShareIcon
                            stroke={theme.colors.onSurface}
                            width={16}
                            height={16}
                          />
                        )}
                        size={20}
                        style={styles.actionButton}
                        onPress={handleShare}
                      />
                    )}

                    {/* Delete button for local assistants only */}
                    {isLocal && (
                      <IconButton
                        icon={() => (
                          <TrashIcon
                            stroke={theme.colors.error}
                            width={16}
                            height={16}
                          />
                        )}
                        size={20}
                        style={styles.actionButton}
                        onPress={handleDelete}
                      />
                    )}
                  </View>
                </View>

                {/* Middle content */}
                <View style={styles.middleContent}>
                  {/* Creator */}
                  {assistantCreator && (
                    <Text style={styles.creator} numberOfLines={1}>
                      by {assistantCreator.display_name}
                    </Text>
                  )}

                  {/* Description */}
                  {(() => {
                    const displayContent = getDisplayContent(assistant);
                    return displayContent ? (
                      <Text
                        style={styles.description}
                        numberOfLines={shouldShowModelWarning ? 1 : 2}>
                        {displayContent}
                      </Text>
                    ) : null;
                  })()}

                  {/* Model Warning */}
                  {shouldShowModelWarning && (
                    <View style={styles.warningContainer}>
                      <IconButton
                        icon="alert-circle-outline"
                        iconColor={theme.colors.error}
                        size={14}
                        style={styles.warningIcon}
                      />
                      <Text style={styles.warningText} numberOfLines={1}>
                        {
                          l10n.components.modelNotAvailable
                            .modelNotDownloadedShort
                        }
                      </Text>
                    </View>
                  )}
                </View>

                {/* Footer with rating, price, and tags */}
                <View style={styles.footer}>
                  <View style={styles.leftFooter}>
                    {assistantRating && (
                      <View style={styles.ratingContainer}>
                        <StarIcon
                          stroke={theme.colors.tertiary}
                          fill={theme.colors.tertiary}
                          width={12}
                          height={12}
                        />
                        <Text style={styles.rating}>
                          {assistantRating.toFixed(1)}
                        </Text>
                        {assistantReviewCount && assistantReviewCount > 0 && (
                          <Text style={styles.reviewCount}>
                            ({assistantReviewCount})
                          </Text>
                        )}
                      </View>
                    )}

                    {assistantTags && assistantTags.length > 0 && (
                      <View style={styles.tagsContainer}>
                        <Chip
                          mode="outlined"
                          compact
                          style={styles.tag}
                          textStyle={styles.tagText}>
                          {assistantTags[0].name}
                        </Chip>
                        {assistantTags.length > 1 && (
                          <Text style={styles.moreTagsText}>
                            +{assistantTags.length - 1}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Premium Badge - Top right corner of entire card */}
            {isDrshubAssistant(assistant) &&
              assistantLabel &&
              assistantLabel.showLabel &&
              assistantLabel.type === 'premium' && (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText} numberOfLines={1}>
                    {assistantLabel.label}
                  </Text>
                </View>
              )}
          </Card>
        </TouchableOpacity>
      </View>
    );
  },
);
