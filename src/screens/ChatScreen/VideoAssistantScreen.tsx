import React, {useState, useCallback, useContext, useEffect} from 'react';
import {View, StyleSheet} from 'react-native';
import {observer} from 'mobx-react';
import {ChatView, EmbeddedVideoView} from '../../components';
import {LegacySheet} from '../../components/AssistantsSheets';
import {L10nContext, UserContext, safeAlert} from '../../utils';
import {modelStore, assistantStore} from '../../store';
import {Assistant} from '../../types/assistant';
import 'react-native-get-random-values';
import {user as defaultUser} from '../../utils/chat';

import {hasVideoCapability} from '../../utils/assistant-capabilities';

interface VideoAssistantScreenProps {
  activeAssistant: Assistant;
}

export const VideoAssistantScreen = observer(({activeAssistant}: VideoAssistantScreenProps) => {
  const l10n = useContext(L10nContext);

  const contextUser = useContext(UserContext);
  const user = contextUser || defaultUser;

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [promptText, setPromptText] = useState('What do you see?');
  const [captureInterval, setCaptureInterval] = useState(1000); // Default to 1 second
  const [lastAnalysisTime, setLastAnalysisTime] = useState(0);
  const [isStoppingCamera, setIsStoppingCamera] = useState(false);

  // State for assistant sheet
  const [isLegacySheetVisible, setIsLegacySheetVisible] = useState(false);

  // Use active assistant if it has video capability, otherwise fallback to first video assistant
  // TODO: need to figure out why the fallback is needed, if the active assistant is not video why wer are here in the first place.
  const activeVideoAssistant =
    activeAssistant && hasVideoCapability(activeAssistant)
      ? activeAssistant
      : assistantStore.assistants.find(p => hasVideoCapability(p));

  // Initialize captureInterval from the active VideoAssistant
  useEffect(() => {
    if (activeVideoAssistant?.parameters?.captureInterval) {
      setCaptureInterval(activeVideoAssistant.parameters.captureInterval);
    }
  }, [activeVideoAssistant]);

  // Initialize the model with the projection model if needed
  useEffect(() => {
    if (
      activeVideoAssistant &&
      !modelStore.activeModel &&
      activeVideoAssistant.defaultModel
    ) {
      const assistantDefaultModel = modelStore.availableModels.find(
        m => m.id === activeVideoAssistant.defaultModel?.id,
      );

      if (assistantDefaultModel) {
        console.log('Initializing Video Assistant model with projection model');

        // Check if this model supports multimodal and has a default projection model
        if (
          assistantDefaultModel.supportsMultimodal &&
          assistantDefaultModel.defaultProjectionModel
        ) {
          // Find the default projection model
          const projectionModel = modelStore.availableModels.find(
            m => m.id === assistantDefaultModel.defaultProjectionModel,
          );

          if (projectionModel) {
            console.log(
              'Found default projection model:',
              projectionModel.name,
            );
            // Get the projection model path
            modelStore
              .getModelFullPath(projectionModel)
              .then(projectionModelPath => {
                console.log(
                  'Initializing with projection model path:',
                  projectionModelPath,
                );
                // Initialize with both the main model and projection model
                modelStore.initContext(assistantDefaultModel, projectionModelPath);
              })
              .catch(error => {
                console.error('Failed to get projection model path:', error);
                // Fall back to initializing without projection model
                modelStore.initContext(assistantDefaultModel);
              });
          } else {
            console.warn(
              'Default projection model not found, initializing without it',
            );
            modelStore.initContext(assistantDefaultModel);
          }
        } else {
          console.log(
            'Model does not support multimodal or has no default projection model',
          );
          modelStore.initContext(assistantDefaultModel);
        }
      }
    }
  }, [activeVideoAssistant]);

  // Handle starting the camera
  const handleStartCamera = useCallback(async () => {
    if (!modelStore.context) {
      safeAlert(l10n.chat.modelNotLoaded, l10n.chat.pleaseLoadModel, [
        {
          text: l10n.common.ok,
        },
      ]);
      return;
    }

    // Check if multimodal is enabled
    try {
      if (!modelStore.activeModelCaps.visionActive) {
        safeAlert(
          'Multimodal Not Enabled',
          'This model does not support image analysis. Please load a multimodal model.',
          [
            {
              text: l10n.common.ok,
            },
          ],
        );
        return;
      }

      setIsCameraActive(true);
    } catch (error) {
      console.error('Error checking multimodal capability:', error);
      safeAlert('Error', 'Failed to check if model supports images.', [
        {
          text: l10n.common.ok,
        },
      ]);
    }
  }, [l10n]);

  // Handle stopping the camera
  const handleStopCamera = useCallback(async () => {
    setIsStoppingCamera(true);

    // Stop any ongoing completion first
    if (modelStore.inferencing || modelStore.isStreaming) {
      try {
        await modelStore.context?.stopCompletion();
      } catch (error) {
        console.error('Error stopping completion:', error);
      }
    }

    // Clear response text and stop camera
    setResponseText('');
    setIsCameraActive(false);
    setIsStoppingCamera(false);
  }, []);

  // Callback handler for opening assistant sheet
  const handleOpenLegacySheet = useCallback((_assistant: Assistant) => {
    // We expect this to be called with the activeAssistant, but we use activeAssistant directly
    setIsLegacySheetVisible(true);
  }, []);

  const handleCloseLegacySheet = useCallback(() => {
    setIsLegacySheetVisible(false);
  }, []);

  // Handle capture interval change
  const handleCaptureIntervalChange = useCallback(
    (interval: number) => {
      setCaptureInterval(interval);

      // Update the VideoAssistant's captureInterval setting
      if (activeVideoAssistant) {
        assistantStore.updateAssistant(activeVideoAssistant.id, {
          parameters: {
            ...activeVideoAssistant.parameters,
            captureInterval: interval,
          },
        });
      }
    },
    [activeVideoAssistant],
  );

  // Handle image capture from the video stream
  const handleImageCapture = useCallback(
    async (imageBase64: string) => {
      // Don't process if we're stopping the camera
      if (isStoppingCamera) {
        return;
      }

      // Throttle analysis to avoid overwhelming the model
      const now = Date.now();
      if (now - lastAnalysisTime < captureInterval) {
        return;
      }

      setLastAnalysisTime(now);

      // Clear the previous response text before starting a new analysis
      setResponseText('');

      // Get the system prompt from the active VideoAssistant
      const systemPrompt = activeVideoAssistant?.systemPrompt || '';

      try {
        // Start the completion with the base64 image using the user-editable prompt
        await modelStore.startImageCompletion({
          prompt: promptText,
          image_path: imageBase64, // Now passing base64 data URL instead of file path
          systemMessage: systemPrompt,
          onToken: token => {
            // Only update response text if we're not stopping the camera
            if (!isStoppingCamera) {
              setResponseText(prev => prev + token);
            }
          },
          onComplete: () => {
            // This is called when the entire completion is done
            // We don't need to set the text again as we've been building it token by token
          },
          onError: error => {
            console.error('Error processing image:', error);
          },
        });
      } catch (error) {
        console.error('Error processing image:', error);
      }
    },
    [
      promptText,
      captureInterval,
      lastAnalysisTime,
      activeVideoAssistant,
      isStoppingCamera,
    ],
  );

  // Render the chat view with embedded camera when active
  return (
    <UserContext.Provider value={user}>
      <View style={styles.container}>
        {isCameraActive ? (
          // Full-screen camera view with response overlay
          <View style={styles.fullScreenContainer}>
            <EmbeddedVideoView
              onCapture={handleImageCapture}
              onClose={handleStopCamera}
              captureInterval={captureInterval}
              onCaptureIntervalChange={handleCaptureIntervalChange}
              responseText={responseText}
            />
          </View>
        ) : (
          // Regular chat view when camera is not active
          <ChatView
            messages={[]}
            onSendPress={() => {}}
            onStopPress={() => modelStore.context?.stopCompletion()}
            onAssistantSettingsSelect={handleOpenLegacySheet}
            user={user}
            isStopVisible={modelStore.inferencing}
            isStreaming={modelStore.isStreaming}
            sendButtonVisibilityMode="editing"
            textInputProps={{
              editable: !modelStore.isStreaming && !isCameraActive,
              value: promptText,
              onChangeText: setPromptText,
            }}
            inputProps={{
              isCameraActive: isCameraActive,
              onStartCamera: handleStartCamera,
              promptText: promptText,
              onPromptTextChange: setPromptText,
            }}
          />
        )}
      </View>
      {activeAssistant && (
        <LegacySheet
          isVisible={isLegacySheetVisible}
          onClose={handleCloseLegacySheet}
          assistant={activeAssistant}
        />
      )}
    </UserContext.Provider>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fullScreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
});
