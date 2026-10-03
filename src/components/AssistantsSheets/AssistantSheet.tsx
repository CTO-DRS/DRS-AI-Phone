import React, {
  useContext,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {View, TextInput as RNTextInput} from 'react-native';

import {z} from 'zod';
import {observer} from 'mobx-react-lite';
import {Button} from 'react-native-paper';
import {zodResolver} from '@hookform/resolvers/zod';
import {useForm, FormProvider, Controller} from 'react-hook-form';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {FormField} from './FormField';
import type {AssistantFormData} from './types';
import {ColorSection} from './ColorSection';
import {TalentSection} from './TalentSection';
import {ModelSelector} from './ModelSelector';
import {GreetingSection} from './GreetingSection';
import {SectionDivider} from './SectionDivider';
import {ModelNotAvailable} from './ModelNotAvailable';
import {SystemPromptSection} from './SystemPromptSection';
import {DynamicParameterForm} from '../DynamicParameters';
import {AssistantGenerationSettingsSheet} from '../AssistantGenerationSettingsSheet';

import {assistantStore} from '../../store';

import type {Assistant, TalentRef} from '../../types/assistant';

import {L10nContext} from '../../utils';

import {Sheet} from '..';

interface LegacySheetProps {
  isVisible: boolean;
  onClose: () => void;
  assistant: Partial<Assistant>; // Single prop for both create and edit scenarios
}

const INITIAL_STATE: AssistantFormData = {
  name: '',
  description: '',
  defaultModel: undefined,
  useAIPrompt: false,
  systemPrompt: '',
  originalSystemPrompt: '',
  isSystemPromptChanged: false,
  color: undefined,
  promptGenerationModel: undefined,
  generatingPrompt: '',
  completionSettings: undefined,
  talents: [],
  greetingText: '',
  suggestedPrompts: [],
};

export const LegacySheet: React.FC<LegacySheetProps> = observer(
  ({isVisible, onClose, assistant}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    // Internal state for generation settings sheet
    const [showGenerationSettings, setShowGenerationSettings] = useState(false);
    const [currentCompletionSettings, setCurrentCompletionSettings] = useState<
      Record<string, any> | undefined
    >(assistant.completionSettings);

    // Handlers for generation settings
    const handleOpenGenerationSettings = useCallback(() => {
      setShowGenerationSettings(true);
    }, []);

    const handleCloseGenerationSettings = useCallback(() => {
      setShowGenerationSettings(false);
    }, []);

    // Determine if we're editing an existing assistant or creating a new one
    const isEditing = !!assistant.id;

    // Use the parameter schema from the assistant object
    const activeSchema = useMemo(() => {
      return assistant.parameterSchema || [];
    }, [assistant.parameterSchema]);

    // Create dynamic validation schema
    const validationSchema = useMemo(() => {
      const baseSchema = z.object({
        name: z
          .string()
          .min(1, l10n.components.assistantSheet.validation.nameRequired),
        description: z.string().nullable().optional(),
        defaultModel: z.any().optional(),
        useAIPrompt: z.boolean(),
        systemPrompt: z.string(),
        originalSystemPrompt: z.string().nullable().optional(),
        isSystemPromptChanged: z.boolean(),
        color: z.tuple([z.string(), z.string()]).optional(),
        promptGenerationModel: z.any().optional(),
        generatingPrompt: z.string().nullable().optional(),
        completionSettings: z.record(z.string(), z.any()).optional(),
        talents: z.array(z.string()).optional(),
        greetingText: z.string().optional(),
        suggestedPrompts: z.array(z.string()).optional(),
      });

      // Add dynamic parameter validation
      const dynamicFields: Record<string, z.ZodTypeAny> = {};
      activeSchema.forEach(param => {
        if (param.required) {
          dynamicFields[param.key] = z
            .string()
            .min(1, `${param.label} is required`);
        } else {
          dynamicFields[param.key] = z.string().optional();
        }
      });

      return baseSchema.extend(dynamicFields);
    }, [activeSchema, l10n]);

    // This is used for "Enter" on an text field to focus the next one
    const inputRefs = useRef<{[key: string]: RNTextInput | null}>({});
    const [isSaving, setIsSaving] = useState(false);

    // Manages values, errors, touches & makes Zod the source of truth for validation.
    const methods = useForm<AssistantFormData>({
      resolver: zodResolver(validationSchema) as any,
      defaultValues: INITIAL_STATE,
    });

    // Watch the current defaultModel value to update ModelNotAvailable component
    const currentDefaultModel = methods.watch('defaultModel');

    // Handler for updating completion settings
    const handleUpdateCompletionSettings = useCallback(
      (settings: Record<string, any> | undefined) => {
        // Update both the form and our local state
        methods.setValue('completionSettings', settings);
        setCurrentCompletionSettings(settings);
      },
      [methods],
    );

    // Initialize form with assistant data
    useEffect(() => {
      const formData: AssistantFormData = {
        name: assistant.name || '',
        description: assistant.description || '',
        defaultModel: assistant.defaultModel,
        useAIPrompt: assistant.useAIPrompt || false,
        systemPrompt: assistant.systemPrompt || '',
        originalSystemPrompt: assistant.originalSystemPrompt || '',
        isSystemPromptChanged: assistant.isSystemPromptChanged || false,
        color: assistant.color,
        promptGenerationModel: assistant.promptGenerationModel,
        generatingPrompt: assistant.generatingPrompt || '',
        completionSettings: assistant.completionSettings,
        talents: assistant.pact?.talents?.map(t => t.name) ?? [],
        greetingText: assistant.greeting?.text ?? '',
        suggestedPrompts: assistant.greeting?.suggestedPrompts ?? [],
        ...assistant.parameters, // Spread dynamic parameters
      };
      setCurrentCompletionSettings(assistant.completionSettings);
      methods.reset(formData);
    }, [assistant, methods]);

    const resetForm = useCallback(() => {
      const formData: AssistantFormData = {
        name: assistant.name || '',
        description: assistant.description || '',
        defaultModel: assistant.defaultModel,
        useAIPrompt: assistant.useAIPrompt || false,
        systemPrompt: assistant.systemPrompt || '',
        originalSystemPrompt: assistant.originalSystemPrompt || '',
        isSystemPromptChanged: assistant.isSystemPromptChanged || false,
        color: assistant.color,
        promptGenerationModel: assistant.promptGenerationModel,
        generatingPrompt: assistant.generatingPrompt || '',
        completionSettings: assistant.completionSettings,
        talents: assistant.pact?.talents?.map(t => t.name) ?? [],
        greetingText: assistant.greeting?.text ?? '',
        suggestedPrompts: assistant.greeting?.suggestedPrompts ?? [],
        ...assistant.parameters, // Spread dynamic parameters
      };
      methods.reset(formData);
    }, [assistant, methods]);

    useEffect(() => {
      resetForm();
    }, [resetForm]);

    const handleClose = () => {
      resetForm();
      onClose();
    };

    // Validation for dynamic parameters
    const validateDynamicFields = async () => {
      const parameterKeys = activeSchema.map(param => param.key);
      const result = await methods.trigger(parameterKeys);

      const formState = methods.getValues();
      if (formState.useAIPrompt) {
        if (!formState.generatingPrompt) {
          methods.setError('generatingPrompt', {
            message:
              l10n.components.assistantSheet.validation.generatingPromptRequired,
          });
        }
        if (!formState.promptGenerationModel) {
          methods.setError('promptGenerationModel', {
            message: l10n.components.assistantSheet.validation.promptModelRequired,
          });
        }
        return Boolean(
          formState.generatingPrompt &&
            formState.promptGenerationModel &&
            result,
        );
      }
      return result;
    };

    const onSubmit = async (data: AssistantFormData) => {
      if (isSaving) {
        return; // Prevent double submission
      }

      setIsSaving(true);
      try {
        // Extract dynamic parameters from form data
        const parameters: Record<string, any> = {};
        activeSchema.forEach(param => {
          parameters[param.key] = data[param.key];
        });

        // For templated assistants, systemPrompt should always contain the template (with placeholders)
        // The rendered prompt is generated on-demand, not stored
        const systemPrompt = data.systemPrompt;
        const originalSystemPrompt = data.originalSystemPrompt;

        // Build pact from selected talents
        // Always pass pact explicitly — using `undefined` would skip the
        // update in AssistantRepository (it checks `if (updates.pact !== undefined)`)
        const selectedTalents = data.talents ?? [];
        const pact =
          selectedTalents.length > 0
            ? {
                talents: selectedTalents.map(name => ({
                  name,
                  necessity: 'required' as const,
                })),
              }
            : {talents: [] as TalentRef[]};

        // Empty-object sentinel clears stale greeting via AssistantRepository's
        // `!== undefined` update gate. Greeting text is not trimmed (raw
        // length matches the wire-side text predicate); prompts are trimmed
        // + de-empted here as an editor-side UX cleanup.
        const greetingText = data.greetingText ?? '';
        const cleanedPrompts = (data.suggestedPrompts ?? [])
          .map(p => p.trim())
          .filter(p => p.length > 0);
        const hasGreeting =
          greetingText.length > 0 || cleanedPrompts.length > 0;
        const greeting: Assistant['greeting'] = hasGreeting
          ? cleanedPrompts.length > 0
            ? {text: greetingText, suggestedPrompts: cleanedPrompts}
            : {text: greetingText}
          : {text: '', suggestedPrompts: []};

        // Create assistant data
        // For updates, if we don't set values, it will preserve the original assistant's values
        const assistantData: Partial<Assistant> = {
          type: assistant.type || 'local',
          name: data.name,
          description: data.description,
          defaultModel: data.defaultModel,
          useAIPrompt: data.useAIPrompt,
          systemPrompt,
          originalSystemPrompt,
          isSystemPromptChanged: data.isSystemPromptChanged,
          color: data.color,
          promptGenerationModel: data.promptGenerationModel,
          generatingPrompt: data.generatingPrompt,
          parameters,
          parameterSchema: activeSchema,
          source: assistant.source || 'local',
          capabilities: assistant.capabilities || {},
          // Include (local) completion settings if they exist
          completionSettings: data.completionSettings,
          pact,
          greeting,
        };

        if (isEditing) {
          // Update existing assistant
          await assistantStore.updateAssistant(assistant.id!, assistantData);
        } else {
          // Create new assistant
          await assistantStore.createAssistant(assistantData as Omit<Assistant, 'id'>);
        }

        handleClose();
      } catch (error) {
        console.error('Error saving assistant:', error);
        // TODO: Show error message to user
        // For now, we'll just log the error and not close the sheet
        // so the user can try again
      } finally {
        setIsSaving(false);
      }
    };

    // Determine sheet title - simple and clear
    const getSheetTitle = () => {
      if (isEditing) {
        return l10n.components.assistantSheet.title.edit;
      }

      // For new assistants, check capabilities for specific types
      if (assistant.capabilities?.video) {
        return l10n.components.assistantSheet.title.newVideoAssistant;
      }

      // Default to "New Assistant" for all other types (assistant, roleplay, etc.)
      return l10n.components.assistantSheet.title.newAssistant;
    };

    // Determine if we should show parameters section
    const showParametersSection = activeSchema.length > 0;

    return (
      <>
        <Sheet
          title={getSheetTitle()}
          isVisible={isVisible}
          displayFullHeight
          onClose={handleClose}>
          <FormProvider {...methods}>
            <Sheet.ScrollView
              bottomOffset={16}
              contentContainerStyle={styles.scrollviewContainer}>
              <View style={styles.form}>
                <FormField
                  ref={ref => {
                    inputRefs.current.name = ref;
                  }}
                  name="name"
                  label={
                    l10n.components.assistantLegacySheet?.assistantName || 'Assistant Name'
                  }
                  placeholder={
                    l10n.components.assistantLegacySheet?.assistantNamePlaceholder ||
                    'Enter assistant name'
                  }
                  required
                  onSubmitEditing={() => inputRefs.current.description?.focus()}
                />

                <FormField
                  ref={ref => {
                    inputRefs.current.description = ref;
                  }}
                  name="description"
                  label={l10n.components.assistantSheet.description}
                  placeholder={l10n.components.assistantSheet.descriptionPlaceholder}
                  multiline
                  onSubmitEditing={() =>
                    inputRefs.current.defaultModel?.focus()
                  }
                />

                <Controller
                  name="defaultModel"
                  control={methods.control}
                  render={({field: {onChange, value}, fieldState: {error}}) => (
                    <ModelSelector
                      value={value}
                      onChange={onChange}
                      label={
                        l10n.components.assistantLegacySheet?.defaultModel ||
                        'Default Model'
                      }
                      placeholder={
                        l10n.components.assistantLegacySheet
                          ?.defaultModelPlaceholder || 'Select model'
                      }
                      error={!!error}
                      helperText={error?.message}
                      testID="assistant-default-model-selector"
                    />
                  )}
                />

                <ModelNotAvailable
                  model={assistant.defaultModel}
                  currentlySelectedModel={currentDefaultModel}
                  closeSheet={handleClose}
                />

                {showParametersSection && (
                  <>
                    <SectionDivider
                      label={l10n.components.assistantSheet.parameters}
                    />
                    <DynamicParameterForm schema={activeSchema} />
                  </>
                )}

                <SystemPromptSection
                  validateFields={validateDynamicFields}
                  closeSheet={handleClose}
                  parameterSchema={activeSchema}
                />

                <GreetingSection />

                <ColorSection />

                <TalentSection />

                {/* Generation Settings Section - only for existing local assistants */}
                {assistant.id && (
                  <>
                    <SectionDivider
                      label={l10n.components.assistantSheet.generationSettings}
                    />
                    <View style={styles.generationSettingsSection}>
                      <Button
                        mode="outlined"
                        onPress={handleOpenGenerationSettings}
                        style={styles.generationSettingsButton}>
                        {l10n.components.assistantSheet.configureGenerationSettings}
                      </Button>
                    </View>
                  </>
                )}
              </View>
            </Sheet.ScrollView>

            <Sheet.Actions>
              <View style={styles.actions}>
                <Button
                  style={styles.actionBtn}
                  mode="text"
                  onPress={handleClose}>
                  {l10n.common?.cancel || 'Cancel'}
                </Button>
                <Button
                  style={styles.actionBtn}
                  mode="contained"
                  loading={isSaving}
                  disabled={isSaving}
                  onPress={methods.handleSubmit(onSubmit)}
                  testID="submit-button">
                  {isEditing
                    ? l10n.common.save
                    : l10n.components.assistantLegacySheet.create}
                </Button>
              </View>
            </Sheet.Actions>
          </FormProvider>
        </Sheet>

        {/* Generation Settings Sheet */}
        <AssistantGenerationSettingsSheet
          isVisible={showGenerationSettings}
          onClose={handleCloseGenerationSettings}
          assistantName={assistant.name || 'Assistant'}
          completionSettings={currentCompletionSettings}
          onUpdateSettings={handleUpdateCompletionSettings}
        />
      </>
    );
  },
);
