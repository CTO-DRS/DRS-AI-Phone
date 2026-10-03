import React, {useState, useEffect, useContext} from 'react';
import {View, Image, Alert} from 'react-native';

import {observer} from 'mobx-react-lite';
import {Text, Button, Divider} from 'react-native-paper';

import {Surface} from '../../ui';
import {StarIcon, DownloadIcon, UserIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {getFullThumbnailUri} from '../../../utils/imageUtils';

import {Sheet} from '../../Sheet';
import {createStyles} from './styles';

import {authService, drshubService} from '../../../services';

import {assistantStore, checkoutFlowStore} from '../../../store';

import type {DrshubAssistant} from '../../../types/drshub';

import {
  getAssistantDisplayLabel,
  getAssistantActionText,
  shouldShowAssistantContent,
  getPremiumInfoText,
} from '../../../utils/drshub-display';

interface AssistantDetailSheetProps {
  assistant: DrshubAssistant | null;
  isVisible: boolean;
  onClose: () => void;
  onSignInPress?: () => void;
}

export const AssistantDetailSheet: React.FC<AssistantDetailSheetProps> = observer(
  ({assistant, isVisible, onClose, onSignInPress}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailedAssistant, setDetailedAssistant] = useState<DrshubAssistant | null>(null);
    const [_isFetchingDetails, setIsFetchingDetails] = useState(false);

    // Use detailed assistant information if available, otherwise fall back to basic assistant
    const displayAssistant = detailedAssistant || assistant;
    const checkoutStatus = checkoutFlowStore.status;

    // Fetch detailed assistant information when sheet opens
    useEffect(() => {
      const fetchAssistantDetails = async () => {
        if (!assistant || !isVisible) {
          return;
        }

        try {
          setIsFetchingDetails(true);
          setError(null);
          const detailed = await drshubService.getAssistant(assistant.id);
          setDetailedAssistant(detailed);
        } catch (fetchError) {
          console.error('Failed to fetch assistant details:', fetchError);
          // Fallback to basic assistant information if detailed fetch fails
          setDetailedAssistant(assistant);
          const errorMessage =
            fetchError instanceof Error
              ? fetchError.message
              : l10n.assistantsScreen.assistantDetailSheet.failedToLoadDetails;
          setError(errorMessage);
        } finally {
          setIsFetchingDetails(false);
        }
      };

      fetchAssistantDetails();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assistant, isVisible]);

    // After a purchase reconciles to owned, re-read the assistant so the Buy button
    // flips to Download. Ownership stays server-derived (re-fetched, not written).
    useEffect(() => {
      if (checkoutStatus === 'owned' && assistant) {
        drshubService
          .getAssistant(assistant.id)
          .then(setDetailedAssistant)
          .catch(() => {});
      }
    }, [checkoutStatus, assistant]);

    if (!displayAssistant) {
      return null;
    }

    const isDownloaded = assistantStore.isDrshubAssistantDownloaded(displayAssistant.id);
    const canViewContent = shouldShowAssistantContent(displayAssistant);
    const assistantLabel = getAssistantDisplayLabel(displayAssistant);
    const actionText = getAssistantActionText(
      displayAssistant,
      displayAssistant.is_owned || false,
    );

    const handleAction = async () => {
      // This function is only called for free assistants or owned assistants
      // Use detailed assistant if available for download
      const assistantToDownload = displayAssistant;
      try {
        setIsLoading(true);
        setError(null);
        await assistantStore.downloadDrshubAssistant(assistantToDownload);
        Alert.alert(
          l10n.assistantsScreen.assistantDetailSheet.success,
          l10n.assistantsScreen.assistantDetailSheet.assistantAddedToCollection,
          [{text: l10n.common.ok, onPress: onClose}],
        );
      } catch (downloadError) {
        const errorMessage =
          downloadError instanceof Error
            ? downloadError.message
            : l10n.assistantsScreen.assistantDetailSheet.failedToDownload;
        setError(errorMessage);
        Alert.alert(l10n.assistantsScreen.assistantDetailSheet.error, errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const handleClose = () => {
      checkoutFlowStore.reset();
      onClose();
    };

    const handleBuyPress = () => {
      // Send the user to sign-in rather than a 401 error when logged out.
      if (!authService.isAuthenticated) {
        onSignInPress?.();
        return;
      }
      // Both platforms start directly. On Android the store runs the Play
      // link-out prep (Play renders its own disclosure); there is no app sheet.
      checkoutFlowStore.start(displayAssistant.id);
    };

    const isCheckoutInFlight =
      checkoutStatus === 'creating' ||
      checkoutStatus === 'linking' ||
      checkoutStatus === 'browser_open' ||
      checkoutStatus === 'finalizing';

    const renderCheckoutFeedback = () => {
      if (checkoutStatus === 'finalizing') {
        return (
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoText}>
              {l10n.assistantsScreen.assistantDetailSheet.finalizingPurchase}
            </Text>
          </View>
        );
      }
      if (checkoutStatus === 'processing_deferred') {
        return (
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoText}>
              {l10n.assistantsScreen.assistantDetailSheet.processingPurchase}
            </Text>
          </View>
        );
      }
      if (checkoutStatus === 'error') {
        const kind = checkoutFlowStore.errorKind;
        const message =
          kind === '401'
            ? l10n.assistantsScreen.assistantDetailSheet.checkoutSessionExpired
            : kind === '404'
              ? l10n.assistantsScreen.assistantDetailSheet.assistantNotAvailable
              : l10n.assistantsScreen.assistantDetailSheet.checkoutFailed;
        return (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{message}</Text>
            {kind === '401' && (
              <Button
                testID="checkout-signin-button"
                mode="contained"
                onPress={() => onSignInPress?.()}
                style={styles.errorButton}>
                {l10n.assistantsScreen.assistantDetailSheet.signInAgain}
              </Button>
            )}
          </View>
        );
      }
      return null;
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString();
    };

    const renderHeader = () => (
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <View style={styles.thumbnailContainer}>
            {displayAssistant.thumbnail_url ? (
              <Image
                source={{uri: getFullThumbnailUri(displayAssistant.thumbnail_url)}}
                style={styles.thumbnail}
              />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <UserIcon stroke={theme.colors.onSurfaceVariant} />
              </View>
            )}
          </View>

          <View style={styles.headerContent}>
            <Text style={styles.title} numberOfLines={2}>
              {displayAssistant.title}
            </Text>

            {displayAssistant.creator && (
              <Text style={styles.creator}>
                {l10n.assistantsScreen.assistantDetailSheet.by}{' '}
                {displayAssistant.creator.display_name ||
                  l10n.assistantsScreen.assistantDetailSheet.unknown}
              </Text>
            )}

            <View style={styles.labelRow}>
              {assistantLabel.showLabel && (
                <Text
                  testID={`assistant-label-${assistantLabel.type}`}
                  style={[
                    styles.priceLabel,
                    assistantLabel.type === 'free' && styles.freeLabel,
                    assistantLabel.type === 'premium' && styles.premiumLabel,
                  ]}>
                  {assistantLabel.label}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );

    const renderStats = () => (
      <Surface style={styles.statsSection} elevation={0}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={styles.ratingContainer}>
              <StarIcon
                stroke={theme.colors.primary}
                fill={theme.colors.primary}
              />
              <Text style={styles.ratingText}>
                {displayAssistant.average_rating
                  ? displayAssistant.average_rating.toFixed(1)
                  : l10n.assistantsScreen.assistantDetailSheet.notAvailable}
              </Text>
            </View>
            <Text style={styles.statLabel}>
              {l10n.assistantsScreen.assistantDetailSheet.rating}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{displayAssistant.review_count || 0}</Text>
            <Text style={styles.statLabel}>
              {l10n.assistantsScreen.assistantDetailSheet.reviews}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {displayAssistant.created_at
                ? formatDate(displayAssistant.created_at)
                : l10n.assistantsScreen.assistantDetailSheet.unknown}
            </Text>
            <Text style={styles.statLabel}>
              {l10n.assistantsScreen.assistantDetailSheet.created}
            </Text>
          </View>
        </View>
      </Surface>
    );

    return (
      <Sheet
        isVisible={isVisible}
        onClose={handleClose}
        title={displayAssistant.title}
        snapPoints={['85%']}>
        <Sheet.ScrollView contentContainerStyle={styles.scrollContent}>
          {renderHeader()}
          <Divider style={styles.divider} />
          {renderStats()}
          <Divider style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {l10n.assistantsScreen.assistantDetailSheet.description}
            </Text>
            <Text style={styles.description}>
              {displayAssistant.description ||
                l10n.assistantsScreen.assistantDetailSheet.noDescriptionAvailable}
            </Text>
          </View>

          {displayAssistant.categories && displayAssistant.categories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {l10n.assistantsScreen.assistantDetailSheet.categories}
              </Text>
              <View style={styles.categoriesContainer}>
                {displayAssistant.categories.map((category, index) => (
                  <View key={index} style={styles.category}>
                    <Text style={styles.categoryText}>{category.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {displayAssistant.tags && displayAssistant.tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {l10n.assistantsScreen.assistantDetailSheet.tags}
              </Text>
              <View style={styles.tagsContainer}>
                {displayAssistant.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {canViewContent && displayAssistant.system_prompt && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {l10n.assistantsScreen.assistantDetailSheet.systemPrompt}
              </Text>
              <View style={styles.systemPromptContainer}>
                <Text style={styles.systemPrompt}>
                  {displayAssistant.system_prompt}
                </Text>
              </View>
            </View>
          )}

          {!canViewContent && (
            <View style={styles.section}>
              <View style={styles.protectedContent}>
                <Text style={styles.protectedText}>
                  {l10n.assistantsScreen.assistantDetailSheet.premiumAssistantMessage}
                </Text>
              </View>
            </View>
          )}
        </Sheet.ScrollView>

        <Sheet.Actions>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Show action button for free assistants (regardless of ownership) or owned premium assistants */}
          {actionText &&
            (displayAssistant.price_cents === 0 ||
              (displayAssistant.price_cents > 0 && displayAssistant.is_owned)) && (
              <>
                {isDownloaded ? (
                  <Button
                    testID="downloaded-button"
                    mode="contained"
                    disabled
                    icon={() => (
                      <DownloadIcon stroke={theme.colors.onPrimary} />
                    )}
                    style={styles.primaryButton}>
                    {l10n.assistantsScreen.assistantDetailSheet.downloaded}
                  </Button>
                ) : (
                  <Button
                    testID="download-button"
                    mode="contained"
                    onPress={handleAction}
                    loading={isLoading}
                    icon={() => (
                      <DownloadIcon stroke={theme.colors.onPrimary} />
                    )}
                    style={styles.primaryButton}>
                    {actionText}
                  </Button>
                )}
              </>
            )}

          {/* Show buy button (eligible) or informational text (ineligible) for premium assistants */}
          {assistantLabel.type === 'premium' &&
            !displayAssistant.is_owned &&
            (assistantStore.isCheckoutEligible ? (
              <View style={styles.buyActionColumn}>
                <Button
                  testID="buy-button"
                  mode="contained"
                  onPress={handleBuyPress}
                  loading={
                    checkoutStatus === 'creating' ||
                    checkoutStatus === 'linking'
                  }
                  disabled={isCheckoutInFlight}
                  style={styles.buyButton}>
                  {l10n.assistantsScreen.assistantDetailSheet.buyOnDrshub}
                </Button>
                {renderCheckoutFeedback()}
              </View>
            ) : (
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoText}>{getPremiumInfoText()}</Text>
              </View>
            ))}
        </Sheet.Actions>
      </Sheet>
    );
  },
);
