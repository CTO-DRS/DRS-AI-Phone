import React, {useRef, useContext, useEffect} from 'react';
import {Alert, Dimensions, View, Pressable, Keyboard} from 'react-native';
import {observer} from 'mobx-react';
import {Text} from 'react-native-paper';
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetFlatListMethods,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {modelStore, assistantStore, chatSessionStore} from '../../store';
import {CustomBackdrop} from '../Sheet/CustomBackdrop';
import {getModelSkills, L10nContext, Model} from '../../utils';
import {t} from '../../locales';
import type {Assistant} from '../../types/assistant';
import {CloseIcon, SettingsIcon} from '../../assets/icons';
import {SkillsDisplay} from '../SkillsDisplay';
import {logger} from '../../utils/logger';

type Tab = 'models' | 'assistants';

interface ChatAssistantModelPickerSheetProps {
  isVisible: boolean;
  chatInputHeight: number;
  onClose: () => void;
  onModelSelect?: (modelId: string) => void;
  onAssistantSelect?: (assistantId: string | undefined) => void;
  onAssistantSettingsSelect?: (assistant: Assistant) => void;
}

const ObservedSkillsDisplay = observer(({model}) => {
  const hasProjectionModelWarning =
    model.supportsMultimodal &&
    model.visionEnabled &&
    modelStore.getProjectionModelStatus(model).state === 'missing';

  const toggleVision = async () => {
    if (!model.supportsMultimodal) {
      return;
    }
    try {
      await modelStore.setModelVisionEnabled(
        model.id,
        !modelStore.getModelVisionPreference(model),
      );
    } catch (error) {
      console.error('Failed to toggle vision setting:', error);
      // The error is already handled in setModelVisionEnabled (vision state is reverted)
      // We could show a toast/snackbar here if needed
    }
  };
  const visionEnabled = modelStore.getModelVisionPreference(model);

  return (
    <SkillsDisplay
      model={model}
      hasProjectionModelWarning={hasProjectionModelWarning}
      onVisionPress={toggleVision}
      onProjectionWarningPress={() =>
        model.defaultProjectionModel &&
        modelStore.checkSpaceAndDownload(model.defaultProjectionModel)
      }
      visionEnabled={visionEnabled}
    />
  );
});

export const ChatAssistantModelPickerSheet = observer(
  ({
    isVisible,
    onClose,
    onModelSelect,
    onAssistantSelect,
    onAssistantSettingsSelect,
    chatInputHeight,
  }: ChatAssistantModelPickerSheetProps) => {
    const [activeTab, setActiveTab] = React.useState<Tab>('models');
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles({theme});
    const bottomSheetRef = useRef<BottomSheet>(null);
    const flatListRef = useRef<BottomSheetFlatListMethods>(null);

    const TABS = React.useMemo(
      () => [
        {
          id: 'assistants' as Tab,
          label: l10n.components.chatAssistantModelPickerSheet.assistantsTab,
        },
        {
          id: 'models' as Tab,
          label: l10n.components.chatAssistantModelPickerSheet.modelsTab,
        },
      ],
      [
        l10n.components.chatAssistantModelPickerSheet.assistantsTab,
        l10n.components.chatAssistantModelPickerSheet.modelsTab,
      ],
    );

    // Dismiss keyboard when sheet becomes visible
    useEffect(() => {
      if (isVisible) {
        Keyboard.dismiss();
      }
    }, [isVisible]);

    // Close sheet when keyboard opens
    useEffect(() => {
      const keyboardDidShowListener = Keyboard.addListener(
        'keyboardDidShow',
        () => {
          if (isVisible) {
            onClose();
          }
        },
      );

      return () => {
        keyboardDidShowListener.remove();
      };
    }, [isVisible, onClose]);

    const handleTabPress = (tab: Tab, index: number) => {
      setActiveTab(tab);
      flatListRef.current?.scrollToIndex({
        index,
        animated: true,
      });
    };

    const renderTab = (tab: Tab, label: string, index: number) => (
      <Pressable
        key={tab}
        style={[styles.tab, activeTab === tab && styles.activeTab]}
        onPress={() => handleTabPress(tab, index)}>
        <Text
          style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
          {label}
        </Text>
      </Pressable>
    );

    const handleModelSelect = React.useCallback(
      async (model: (typeof modelStore.availableModels)[0]) => {
        try {
          onModelSelect?.(model.id);
          onClose();
          modelStore.selectModel(model);
        } catch (e) {
          logger.debug(`Error: ${e}`);
        }
      },
      [onModelSelect, onClose],
    );

    const handleAssistantSelect = React.useCallback(
      async (assistant: (typeof assistantStore.assistants)[0] | undefined) => {
        await chatSessionStore.setActiveAssistant(assistant?.id);
        if (
          assistant?.defaultModel &&
          modelStore.activeModel &&
          assistant.defaultModel?.id !== modelStore.activeModelId
        ) {
          const assistantDefaultModel = modelStore.availableModels.find(
            m => m.id === assistant.defaultModel?.id,
          );
          if (assistantDefaultModel) {
            Alert.alert(
              l10n.components.chatAssistantModelPickerSheet.confirmationTitle,
              t(
                l10n.components.chatAssistantModelPickerSheet
                  .modelSwitchMessage,
                {
                  modelName: assistantDefaultModel.name,
                },
              ),
              [
                {
                  text: l10n.components.chatAssistantModelPickerSheet
                    .keepButton,
                  style: 'cancel',
                },
                {
                  text: l10n.components.chatAssistantModelPickerSheet
                    .switchButton,
                  onPress: () => {
                    modelStore.selectModel(assistantDefaultModel);
                  },
                },
              ],
            );
          }
        }
        onAssistantSelect?.(assistant?.id);
        onClose();
      },
      [
        onAssistantSelect,
        onClose,
        l10n.components.chatAssistantModelPickerSheet,
      ],
    );

    const renderDisableAssistantItem = React.useCallback(() => {
      const noActiveAssistant = !chatSessionStore.activeAssistantId;
      if (noActiveAssistant) {
        return null;
      }
      return (
        <Pressable
          key="disable-assistant"
          style={styles.listItem}
          onPress={() => handleAssistantSelect(undefined)}>
          <CloseIcon stroke={theme.colors.onSurface} />
          <View style={styles.itemContent}>
            <Text style={styles.itemTitle}>
              {l10n.components.chatAssistantModelPickerSheet.noAssistant}
            </Text>
            <Text style={styles.itemSubtitle}>
              {l10n.components.chatAssistantModelPickerSheet.disableAssistant}
            </Text>
          </View>
        </Pressable>
      );
    }, [
      styles,
      theme.colors.onSurface,
      l10n.components.chatAssistantModelPickerSheet.noAssistant,
      l10n.components.chatAssistantModelPickerSheet.disableAssistant,
      handleAssistantSelect,
    ]);

    const renderModelItem = React.useCallback(
      (model: Model) => {
        const isActiveModel = model.id === modelStore.activeModelId;
        const modelSkills = getModelSkills(model)
          .flatMap(skill => skill.labelKey)
          .join(', ');
        return (
          <Pressable
            key={model.id}
            style={[styles.listItem, isActiveModel && styles.activeListItem]}
            onPress={() => handleModelSelect(model)}>
            <View style={styles.itemContent}>
              <Text
                style={[
                  styles.itemTitle,
                  isActiveModel && styles.activeItemTitle,
                ]}>
                {model.name}
              </Text>
              {modelSkills && <ObservedSkillsDisplay model={model} />}
            </View>
          </Pressable>
        );
      },
      [styles, handleModelSelect],
    );

    const getCapabilityText = React.useCallback(
      (assistant: Assistant): string => {
        if (assistant.capabilities?.video) {
          return l10n.components.chatAssistantModelPickerSheet.videoType;
        }

        // TODO: Add support for other capabilities
        // Use assistant for now.
        return l10n.components.chatAssistantModelPickerSheet.assistantType;
      },
      [l10n.components.chatAssistantModelPickerSheet],
    );

    const renderAssistantItem = React.useCallback(
      (assistant: (typeof assistantStore.assistants)[0]) => {
        const isActiveAssistant =
          assistant.id === chatSessionStore.activeAssistantId;
        return (
          <Pressable
            key={assistant.id}
            style={[
              styles.listItem,
              isActiveAssistant && styles.activeListItem,
            ]}
            onPress={() => handleAssistantSelect(assistant)}>
            <View style={styles.itemContent}>
              <View style={styles.itemTextContent}>
                <Text
                  style={[
                    styles.itemTitle,
                    isActiveAssistant && styles.activeItemTitle,
                  ]}>
                  {assistant.name}
                </Text>
                <Text
                  style={[
                    styles.itemSubtitle,
                    isActiveAssistant && styles.activeItemSubtitle,
                  ]}>
                  {getCapabilityText(assistant)}
                </Text>
              </View>
              {isActiveAssistant &&
                assistant.type === 'local' &&
                onAssistantSettingsSelect && (
                  <Pressable
                    style={styles.settingsButton}
                    onPress={e => {
                      e.stopPropagation();
                      onAssistantSettingsSelect(assistant);
                    }}>
                    <SettingsIcon
                      width={16}
                      height={16}
                      stroke={
                        isActiveAssistant
                          ? styles.activeItemTitle.color
                          : styles.itemSubtitle.color
                      }
                    />
                  </Pressable>
                )}
            </View>
          </Pressable>
        );
      },
      [
        styles.listItem,
        styles.activeListItem,
        styles.itemContent,
        styles.itemTextContent,
        styles.settingsButton,
        styles.itemTitle,
        styles.activeItemTitle,
        styles.itemSubtitle,
        styles.activeItemSubtitle,
        getCapabilityText,
        handleAssistantSelect,
        onAssistantSettingsSelect,
      ],
    );

    const renderContent = React.useCallback(
      ({item}: {item: (typeof TABS)[0]}) => (
        <View style={{width: Dimensions.get('window').width}}>
          <BottomSheetScrollView
            contentContainerStyle={{paddingBottom: chatInputHeight + 66}}>
            {item.id === 'models'
              ? modelStore.availableModels.map(renderModelItem)
              : [
                  renderDisableAssistantItem(),
                  ...assistantStore.assistants.map(renderAssistantItem),
                ]}
          </BottomSheetScrollView>
        </View>
      ),
      [
        chatInputHeight,
        renderDisableAssistantItem,
        renderModelItem,
        renderAssistantItem,
      ],
    );

    const onViewableItemsChanged = React.useCallback(
      ({viewableItems}: {viewableItems: any[]}) => {
        if (viewableItems[0]) {
          setActiveTab(viewableItems[0].item.id);
        }
      },
      [],
    );

    const viewabilityConfig = React.useRef({
      itemVisiblePercentThreshold: 90,
      minimumViewTime: 100,
    }).current;

    // If the snapPoints not memoized, the sheet gets closed when the tab is changed for the first time.
    const snapPoints = React.useMemo(() => ['70%'], []);

    return (
      <BottomSheet
        ref={bottomSheetRef}
        // index={-1} // remove this line to make it visible by default
        onClose={onClose}
        enablePanDownToClose
        snapPoints={snapPoints} // Dynamic sizing is not working properly in all situations, like keyboard open/close android/ios ...
        enableDynamicSizing={false}
        backdropComponent={isVisible ? CustomBackdrop : undefined} // on android we need this check to ensure it doenst' block interaction
        backgroundStyle={{
          backgroundColor: theme.colors.background,
        }}
        handleIndicatorStyle={{
          backgroundColor: theme.colors.primary,
        }}
        // Add these props to better handle gestures
        enableContentPanningGesture={false}
        enableHandlePanningGesture
        // Disable accessible so Appium/e2e tests can access child elements on iOS.
        // Without this, BottomSheet sets accessible={true} which collapses all
        // children from the accessibility tree. Same fix as Sheet.tsx.
        // See: https://github.com/gorhom/react-native-bottom-sheet/issues/1141
        accessible={false}>
        <View style={styles.tabs}>
          {TABS.map((tab, index) => renderTab(tab.id, tab.label, index))}
        </View>
        <BottomSheetFlatList
          ref={flatListRef}
          data={TABS}
          renderItem={renderContent}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item: (typeof TABS)[0]) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      </BottomSheet>
    );
  },
);
