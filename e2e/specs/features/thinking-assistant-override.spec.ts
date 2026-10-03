/**
 * Thinking Toggle Override E2E Tests (issue #744 regression guard)
 *
 * With a assistant active, the thinking toggle in the chat input must reflect and
 * persist the user's choice — not get re-overlaid by the assistant's stored
 * enable_thinking value on every render.
 *
 * Covers:
 * - Assistant active, fresh chat, user flips OFF → toggle stays OFF, model receives
 *   enable_thinking=false (no thinking bubble on first inference).
 * - UI snap-back guard: tapping the toggle in a fresh no-session chat with a
 *   assistant active shows the new state immediately and does not revert.
 * - Override does not leak across new chats: after sending, a fresh chat
 *   (assistant still active) reflects the assistant's default again, not the user's
 *   previous override.
 *
 * Usage:
 *   yarn e2e:ios --spec thinking-assistant-override --skip-build
 *   yarn e2e:android --spec thinking-assistant-override --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {LegacySheetPage} from '../../pages/LegacySheetPage';
import {Selectors, byText} from '../../helpers/selectors';
import {
  downloadAndLoadModel,
  dismissPerformanceWarningIfPresent,
  waitForInferenceComplete,
} from '../../helpers/model-actions';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/** Qwen3-0.6B: small thinking-capable model — matches thinking.spec.ts */
const THINKING_MODEL = {
  id: 'qwen3-0.6b',
  searchQuery: 'bartowski Qwen_Qwen3-0.6B',
  selectorText: 'Qwen_Qwen3-0.6B',
  downloadFile: 'Qwen_Qwen3-0.6B-Q4_0.gguf',
  // Android reinstalls (fullReset) every run and re-downloads the model; the
  // 300s TIMEOUTS.download default is too tight under that pressure late in a
  // long suite. Give the download 10 min.
  downloadTimeout: 600000,
  prompts: [{input: "What's up?", description: 'Casual greeting'}],
};

/**
 * Distinct from talent-tool-use.spec.ts's 'E2E Code Companion' so a stale
 * assistant from a prior run does not collide. A plain Assistant assistant is enough:
 * every assistant carries enable_thinking=true via the v3 backfill migration,
 * which is exactly the condition that produced #744.
 */
const ASSISTANT_NAME = 'E2E Thinking Override';

const getAppBundleId = (): string =>
  (driver as any).isAndroid ? 'com.drsai.app.e2e' : 'com.drsai.app';

describe('Thinking Toggle Override (with assistant active)', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let assistantSheetPage: LegacySheetPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    assistantSheetPage = new LegacySheetPage();

    await chatPage.waitForReady(TIMEOUTS.appReady);

    await chatPage.openGenerationSettings();
    await chatPage.setTemperature('0');
    await chatPage.setSeed('1');
    await chatPage.saveGenerationSettings();

    await downloadAndLoadModel(THINKING_MODEL);

    // Create a plain Assistant assistant. The default Assistant template inherits
    // defaultCompletionParams.enable_thinking=true, so the bug condition is
    // satisfied without any extra configuration.
    await chatPage.openDrawer();
    await drawerPage.navigateToAssistants();

    const addBtn = browser.$(Selectors.assistantsScreen.addButton);
    await addBtn.waitForDisplayed({timeout: 15000});
    await addBtn.click();
    await browser.pause(500);

    const assistantItem = browser.$(byText('Assistant'));
    await assistantItem.waitForDisplayed({timeout: 5000});
    await assistantItem.click();
    await browser.pause(500);

    await assistantSheetPage.setName(ASSISTANT_NAME);
    await assistantSheetPage.submit();

    // Returning from LegacyScreen to Chat via drawer is unreliable
    // (gesture conflicts). Restart and re-load the model. Assistant persists in DB.
    await browser.pause(1000);
    await driver.terminateApp(getAppBundleId());
    await browser.pause(1000);
    await driver.activateApp(getAppBundleId());
    await chatPage.waitForReady(TIMEOUTS.appReady);

    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();

    const modelsPage = new ModelsPage();
    await modelsPage.waitForReady();

    const cardSelector = Selectors.modelCard.cardContainer(
      THINKING_MODEL.downloadFile,
    );
    const modelCard = browser.$(cardSelector);
    await modelCard.waitForDisplayed({timeout: 30000});

    const loadBtn = modelCard.$(Selectors.modelCard.loadButtonElement);
    await loadBtn.waitForDisplayed({timeout: 10000});
    await loadBtn.click();

    await dismissPerformanceWarningIfPresent();
    await chatPage.waitForReady();

    await chatPage.openAssistantPicker();
    await chatPage.selectAssistant(ASSISTANT_NAME);
  });

  beforeEach(async () => {
    chatPage = new ChatPage();
    // Fresh no-session state for every test. resetActiveSession preserves
    // newChatAssistantId from the active session/last selection, so the assistant
    // stays active across resets.
    await chatPage.resetChat();
    await browser.pause(300);
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testName = this.currentTest.title.replace(/\s+/g, '-');
      try {
        if (!fs.existsSync(SCREENSHOT_DIR)) {
          fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
        }
        await driver.saveScreenshot(
          path.join(SCREENSHOT_DIR, `failure-${testName}-${timestamp}.png`),
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  it('toggle does not snap back when tapped in a fresh chat with a assistant active', async () => {
    expect(await chatPage.isThinkingToggleVisible()).toBe(true);
    expect(await chatPage.isThinkingEnabled()).toBe(true);

    await chatPage.tapThinkingToggle();

    // The original #744 symptom: assistant's enable_thinking value would re-overlay
    // immediately on the next render and snap the toggle back. The override
    // field must outlast that render cycle without sending anything.
    expect(await chatPage.isThinkingEnabled()).toBe(false);

    // A second read after a longer settle window guards against a delayed
    // re-resolve that would have shown the bug as a 1–2 frame flicker.
    await browser.pause(1500);
    expect(await chatPage.isThinkingEnabled()).toBe(false);
  });

  it('first inference reflects the override (no thinking bubble) and toggle stays off', async () => {
    expect(await chatPage.isThinkingEnabled()).toBe(true);

    await chatPage.tapThinkingToggle();
    expect(await chatPage.isThinkingEnabled()).toBe(false);

    await chatPage.sendMessage("What's up?");

    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});

    // If the override leaked back to assistant's enable_thinking=true between
    // session creation and prepareCompletion, the Reasoning bubble would
    // appear here. A short timeout is enough — the bubble streams in
    // before the answer if thinking is on.
    const thinkingVisible = await chatPage.isThinkingBubbleVisible(5000);
    expect(thinkingVisible).toBe(false);

    await waitForInferenceComplete();

    // Toggle must still read OFF after the session was created and
    // prepareCompletion finished; otherwise the snap-back happened after
    // inference (still a regression, just shifted in time).
    expect(await chatPage.isThinkingEnabled()).toBe(false);
  });

  it('override does not leak into the next new chat with the assistant still active', async () => {
    await chatPage.tapThinkingToggle();
    expect(await chatPage.isThinkingEnabled()).toBe(false);

    await chatPage.sendMessage("What's up?");

    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});
    await waitForInferenceComplete();

    // resetActiveSession preserves newChatAssistantId and clears the override.
    // Toggle should reflect the assistant's default (enable_thinking=true), not
    // the previous chat's user override.
    await chatPage.resetChat();
    await browser.pause(500);

    expect(await chatPage.isThinkingEnabled()).toBe(true);
  });
});
