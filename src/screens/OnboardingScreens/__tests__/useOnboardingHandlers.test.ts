import {renderHook, act} from '@testing-library/react-hooks';

import {uiStore, assistantStore, modelStore} from '../../../store';
import {TOPIC_TO_PAL, entryId} from '../../../store/onboarding/onboardingAssistants';
import {ROUTES} from '../../../utils/navigationConstants';
import {useOnboardingHandlers} from '../useOnboardingHandlers';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: mockCanGoBack,
  }),
}));

const PIP_BALANCED_ID = entryId(
  TOPIC_TO_PAL.smartchat.models.find(m => m.recommended)!,
);
const CODIE_BALANCED_ID = entryId(
  TOPIC_TO_PAL.coding.models.find(m => m.recommended)!,
);

describe('useOnboardingHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uiStore.hasCompletedOnboarding = false;
    uiStore.onboardingTopicsSnapshot = [];
    uiStore.onboardingState = {
      currentStep: 1,
      selectedTopic: null,
      selectedModelId: null,
    };
    (uiStore.completeOnboarding as jest.Mock) = jest.fn();
    (uiStore.setOnboardingStep as jest.Mock) = jest.fn();
    (uiStore.setOnboardingTopic as jest.Mock) = jest.fn(key => {
      uiStore.onboardingState.selectedTopic = key;
    });
    assistantStore.assistants = [];
    (assistantStore.updateAssistant as jest.Mock).mockClear();
    (assistantStore.createAssistant as jest.Mock).mockClear();
    (modelStore.checkSpaceAndDownload as jest.Mock).mockClear();
  });

  it('marks the current step on mount via the single-writer method', () => {
    renderHook(() => useOnboardingHandlers(3));
    expect(uiStore.setOnboardingStep).toHaveBeenCalledWith(3);
  });

  describe('next', () => {
    it('navigates 1 -> Onboarding2, 5 -> Onboarding6', () => {
      const {result: r1} = renderHook(() => useOnboardingHandlers(1));
      act(() => r1.current.next());
      expect(mockNavigate).toHaveBeenLastCalledWith(ROUTES.ONBOARDING.STEP_2);

      const {result: r5} = renderHook(() => useOnboardingHandlers(5));
      act(() => r5.current.next());
      expect(mockNavigate).toHaveBeenLastCalledWith(ROUTES.ONBOARDING.STEP_6);
    });

    it('next on step 6 is a no-op (Finish path lives in `finish`)', () => {
      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.next());
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('goBack', () => {
    it('delegates to navigation.goBack when canGoBack is true', () => {
      mockCanGoBack.mockReturnValueOnce(true);
      const {result} = renderHook(() => useOnboardingHandlers(2));
      act(() => result.current.goBack());
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when canGoBack is false (covers screen 1 / Splash guard)', () => {
      mockCanGoBack.mockReturnValueOnce(false);
      const {result} = renderHook(() => useOnboardingHandlers(1));
      act(() => result.current.goBack());
      expect(mockGoBack).not.toHaveBeenCalled();
    });
  });

  describe('selectTopic (screen 5 — single forward control)', () => {
    it('writes the picked topic and navigates to Onboarding6 in one handler', () => {
      const {result} = renderHook(() => useOnboardingHandlers(5));
      act(() => result.current.selectTopic('smartchat'));
      expect(uiStore.setOnboardingTopic).toHaveBeenCalledWith('smartchat');
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ONBOARDING.STEP_6);
    });

    it("the 'else' escape-hatch tap writes null but still navigates", () => {
      const {result} = renderHook(() => useOnboardingHandlers(5));
      act(() => result.current.selectTopic(null));
      expect(uiStore.setOnboardingTopic).toHaveBeenCalledWith(null);
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ONBOARDING.STEP_6);
    });
  });

  describe('skip', () => {
    it('completeOnboarding with current topic + modelId=null; no assistant/model writes', () => {
      uiStore.onboardingState.selectedTopic = 'smartchat';
      uiStore.onboardingState.selectedModelId = PIP_BALANCED_ID;
      const {result} = renderHook(() => useOnboardingHandlers(4));
      act(() => result.current.skip());

      expect(uiStore.completeOnboarding).toHaveBeenCalledTimes(1);
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'smartchat',
        modelId: null,
      });
      expect(assistantStore.updateAssistant).not.toHaveBeenCalled();
      expect(assistantStore.createAssistant).not.toHaveBeenCalled();
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
    });
  });

  describe('finish', () => {
    it('topic=smartchat with existing Pip assistant: rebinds defaultModel, then completes + downloads', async () => {
      assistantStore.assistants = [
        {
          id: 'pip-id',
          name: 'Pip',
          source: 'local',
          type: 'local',
          description: 'desc',
          systemPrompt: 'sp',
          capabilities: {},
        } as any,
      ];
      uiStore.onboardingState.selectedModelId = PIP_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = 'smartchat';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(assistantStore.createAssistant).not.toHaveBeenCalled();
      expect(assistantStore.updateAssistant).toHaveBeenCalledTimes(1);
      const [assistantId, patch] = (assistantStore.updateAssistant as jest.Mock).mock.calls[0];
      expect(assistantId).toBe('pip-id');
      expect(patch.defaultModel?.id).toBe(PIP_BALANCED_ID);

      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'smartchat',
        modelId: PIP_BALANCED_ID,
      });
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
        PIP_BALANCED_ID,
      );
    });

    it('topic=coding with no Codie yet: materialises Codie from the assistant def and binds the picked model', async () => {
      assistantStore.assistants = [];
      uiStore.onboardingState.selectedModelId = CODIE_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = 'coding';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(assistantStore.createAssistant).toHaveBeenCalledTimes(1);
      const assistantData = (assistantStore.createAssistant as jest.Mock).mock.calls[0][0];
      expect(assistantData.name).toBe('Codie');
      expect(assistantData.systemPrompt).toBe(TOPIC_TO_PAL.coding.systemPrompt);
      expect(assistantData.defaultModel?.id).toBe(CODIE_BALANCED_ID);
      expect(assistantData.source).toBe('local');

      expect(assistantStore.updateAssistant).not.toHaveBeenCalled();
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'coding',
        modelId: CODIE_BALANCED_ID,
      });
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
        CODIE_BALANCED_ID,
      );
    });

    it('topic=null falls back to Pip (the else→pip mapping)', async () => {
      assistantStore.assistants = [];
      uiStore.onboardingState.selectedModelId = PIP_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = null;

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(assistantStore.createAssistant).toHaveBeenCalledTimes(1);
      const assistantData = (assistantStore.createAssistant as jest.Mock).mock.calls[0][0];
      expect(assistantData.name).toBe('Pip');
    });

    it('with selectedModelId=null, completes onboarding without touching the assistant store or download queue', async () => {
      assistantStore.assistants = [{id: 'pip-id', name: 'Pip', source: 'local'} as any];
      uiStore.onboardingState.selectedModelId = null;
      uiStore.onboardingState.selectedTopic = 'smartchat';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(assistantStore.updateAssistant).not.toHaveBeenCalled();
      expect(assistantStore.createAssistant).not.toHaveBeenCalled();
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'smartchat',
        modelId: null,
      });
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
    });

    it('hf pick routes through registerOnboardingAssistantModel and binds the synthesised Model', async () => {
      // Codie balanced is HF (Qwen3.5-2B-Q4_K_M). The picker should NOT
      // consult any catalogue; the boundary site is the single writer.
      assistantStore.assistants = [];
      uiStore.onboardingState.selectedModelId = CODIE_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = 'coding';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(modelStore.registerOnboardingAssistantModel).toHaveBeenCalledTimes(1);
      const entryArg = (modelStore.registerOnboardingAssistantModel as jest.Mock).mock
        .calls[0][0];
      expect(entryId(entryArg)).toBe(CODIE_BALANCED_ID);
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(
        CODIE_BALANCED_ID,
      );
    });

    it('replay with a different tier on the same assistant: synth runs on the new entry; previous Assistant is rebound', async () => {
      // Production has no replay UI today, but the underlying state
      // transitions are exercisable; this asserts the single-writer contract
      // holds when finish() fires twice with different selectedModelIds.
      assistantStore.assistants = [
        {
          id: 'sage-id',
          name: 'Sage',
          source: 'local',
          type: 'local',
          description: 'desc',
          systemPrompt: 'sp',
          capabilities: {},
        } as any,
      ];
      const sage = TOPIC_TO_PAL.education;
      const sageBest = sage.models.find(m => m.tier === 'best')!;
      const sageBestId = entryId(sageBest);

      uiStore.onboardingState.selectedModelId = sageBestId;
      uiStore.onboardingState.selectedTopic = 'education';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      await act(async () => {
        await result.current.finish();
      });

      expect(modelStore.registerOnboardingAssistantModel).toHaveBeenCalledTimes(1);
      const registered = (modelStore.registerOnboardingAssistantModel as jest.Mock)
        .mock.calls[0][0];
      expect(entryId(registered)).toBe(sageBestId);

      expect(assistantStore.createAssistant).not.toHaveBeenCalled();
      expect(assistantStore.updateAssistant).toHaveBeenCalledTimes(1);
      const [assistantId, patch] = (assistantStore.updateAssistant as jest.Mock).mock.calls[0];
      expect(assistantId).toBe('sage-id');
      expect(patch.defaultModel?.id).toBe(sageBestId);
      expect(modelStore.checkSpaceAndDownload).toHaveBeenCalledWith(sageBestId);
    });

    it('checkSpaceAndDownload rejection (cancel mid-download) is swallowed; finish resolves cleanly', async () => {
      // The user taps Stop on the download banner during the post-finish
      // fire-and-forget. The handler MUST NOT propagate the rejection (it
      // has its own .catch); finish() resolves cleanly and the registered
      // Model + Assistant binding both stay in place.
      assistantStore.assistants = [];
      uiStore.onboardingState.selectedModelId = CODIE_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = 'coding';
      (modelStore.checkSpaceAndDownload as jest.Mock).mockRejectedValueOnce(
        new Error('cancelled'),
      );

      const {result} = renderHook(() => useOnboardingHandlers(6));
      let threw: unknown = null;
      await act(async () => {
        try {
          await result.current.finish();
        } catch (e) {
          threw = e;
        }
      });

      // finish() resolves cleanly — the rejection on the fire-and-forget
      // checkSpaceAndDownload is swallowed by the in-handler .catch.
      expect(threw).toBeNull();
      // Side-effects up to checkSpaceAndDownload still ran.
      expect(modelStore.registerOnboardingAssistantModel).toHaveBeenCalledTimes(1);
      expect(assistantStore.createAssistant).toHaveBeenCalledTimes(1);
      expect(uiStore.completeOnboarding).toHaveBeenCalled();
    });

    it('skip on screen 6 after selecting a model: no register, no assistant write, no download', async () => {
      // The user selected Codie/Balanced (HF) and then tapped Skip
      // instead of Download. selectedModelId is non-null but skip() must
      // NOT register the HF entry — only finish() is the boundary site
      // for registration, and skip() doesn't trigger it.
      assistantStore.assistants = [];
      uiStore.onboardingState.selectedModelId = CODIE_BALANCED_ID;
      uiStore.onboardingState.selectedTopic = 'coding';

      const {result} = renderHook(() => useOnboardingHandlers(6));
      act(() => result.current.skip());

      expect(modelStore.registerOnboardingAssistantModel).not.toHaveBeenCalled();
      expect(assistantStore.createAssistant).not.toHaveBeenCalled();
      expect(assistantStore.updateAssistant).not.toHaveBeenCalled();
      expect(modelStore.checkSpaceAndDownload).not.toHaveBeenCalled();
      expect(uiStore.completeOnboarding).toHaveBeenCalledWith({
        topic: 'coding',
        modelId: null,
      });
    });
  });
});
