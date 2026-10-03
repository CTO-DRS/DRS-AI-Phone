import {useEffect, useState} from 'react';

import {chatSessionStore, modelStore} from '../store';
import {talentRegistry} from '../services/talents';
import {Assistant} from '../types/assistant';

interface UseAssistantLoadHintOptions {
  activeAssistant: Assistant | undefined;
  // Only evaluate while the chat surface is mounted and visible, so the hint
  // never fires over drawers / settings. The suppressor is set only after the
  // predicate ran, so a re-focus with the same signature can re-fire.
  isFocused: boolean;
}

interface UseAssistantLoadHintReturn {
  // Set when a heavy-talent assistant loads below its recommended context. Cleared
  // by the host on dismiss or when superseded by the reload snackbar.
  hintVisible: boolean;
  dismiss: () => void;
}

// One-shot snackbar trigger when a assistant with a heavy talent loads into a chat
// whose runtime n_ctx is below the talent's recommendation. Declarative only —
// reads recommendedContextTokens, never moves a banner trigger.
export const useAssistantLoadHint = ({
  activeAssistant,
  isFocused,
}: UseAssistantLoadHintOptions): UseAssistantLoadHintReturn => {
  const [hintVisible, setHintVisible] = useState(false);

  const nCtx = modelStore.activeContextSettings?.n_ctx;
  const assistantId = activeAssistant?.id;
  const talentNames = (activeAssistant?.pact?.talents ?? [])
    .map(ref => ref.name)
    .sort()
    .join(',');

  useEffect(() => {
    if (!isFocused || !assistantId || nCtx === undefined) {
      return;
    }

    const recommendation = (activeAssistant?.pact?.talents ?? []).reduce(
      (max, ref) => {
        const rec = talentRegistry.get(ref.name)?.recommendedContextTokens;
        return rec != null && rec > max ? rec : max;
      },
      0,
    );

    if (recommendation <= nCtx) {
      return;
    }

    const signature = `${assistantId}|${nCtx}|${talentNames}`;
    if (chatSessionStore.assistantLoadHintSeen.has(signature)) {
      return;
    }

    chatSessionStore.markAssistantLoadHintSeen(signature);
    setHintVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, assistantId, nCtx, talentNames]);

  return {
    hintVisible,
    dismiss: () => setHintVisible(false),
  };
};
