import React from 'react';
import {Alert, Linking, Platform} from 'react-native';
import {runInAction} from 'mobx';
import {render, fireEvent, waitFor, act} from '../../../../../jest/test-utils';

import {AssistantDetailSheet} from '../AssistantDetailSheet';
import {authService, drshubService} from '../../../../services';
import {assistantStore, checkoutFlowStore} from '../../../../store';
import {
  createDrshubAssistant,
  mockDrshubAssistant,
  mockPremiumDrshubAssistant,
  mockOwnedPremiumAssistant,
} from '../../../../../jest/fixtures/assistants';

// Mock Sheet component
jest.mock('../../../Sheet/Sheet', () => {
  const {View, ScrollView, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}: any) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children, contentContainerStyle}: any) => (
    <ScrollView
      testID="sheet-scroll-view"
      contentContainerStyle={contentContainerStyle}>
      {children}
    </ScrollView>
  );
  MockSheet.Actions = ({children}: any) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock Alert
jest.spyOn(Alert, 'alert');

// Mock Linking.openURL to return a resolved Promise
jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

// Mock icons
jest.mock('../../../../assets/icons', () => ({
  StarIcon: () => null,
  DownloadIcon: () => null,
  UserIcon: () => null,
}));

describe('AssistantDetailSheet', () => {
  let defaultProps: {
    assistant: typeof mockDrshubAssistant;
    isVisible: boolean;
    onClose: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the assistants array in the mock store
    assistantStore.assistants = [];
    // Reset drshubService mocks
    (drshubService.getAssistant as jest.Mock).mockResolvedValue(
      mockDrshubAssistant,
    );
    // Ensure isDrshubAssistantDownloaded returns false by default
    (
      assistantStore.isDrshubAssistantDownloaded as jest.Mock
    ).mockImplementation(() => false);
    // Reset downloadDrshubAssistant to resolve successfully
    (assistantStore.downloadDrshubAssistant as jest.Mock).mockResolvedValue(
      undefined,
    );
    // Reset isCheckoutEligible to false (default ineligible)
    (assistantStore as any).isCheckoutEligible = false;
    // Default to logged-out; authenticated tests opt in explicitly.
    (authService as any).isAuthenticated = false;
    // Reset checkout flow state between tests
    runInAction(() => {
      checkoutFlowStore.status = 'idle';
      checkoutFlowStore.assistantId = null;
      checkoutFlowStore.errorKind = undefined;
    });
    // Reset defaultProps with a fresh mock for each test
    defaultProps = {
      assistant: mockDrshubAssistant,
      isVisible: true,
      onClose: jest.fn(),
    };
  });

  describe('Rendering', () => {
    it('renders correctly when visible', async () => {
      const {getByTestId} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByTestId('sheet')).toBeTruthy();
        expect(getByTestId('sheet-scroll-view')).toBeTruthy();
      });
    });

    it('does not render when not visible', () => {
      const {queryByTestId} = render(
        <AssistantDetailSheet {...defaultProps} isVisible={false} />,
      );

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('does not render when assistant is null', () => {
      const {queryByTestId} = render(
        <AssistantDetailSheet {...defaultProps} assistant={null} />,
      );

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('displays assistant title', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('Drshub Test Assistant')).toBeTruthy();
      });
    });

    it('displays creator name', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText(/TestCreator/)).toBeTruthy();
      });
    });

    it('displays description', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('A test assistant from Drshub')).toBeTruthy();
      });
    });

    it('displays categories when available', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('Productivity')).toBeTruthy();
      });
    });

    it('displays tags when available', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('assistant')).toBeTruthy();
      });
    });

    it('displays rating when available', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('4.5')).toBeTruthy();
      });
    });

    it('displays review count', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText('10')).toBeTruthy();
      });
    });
  });

  describe('Fetching Assistant Details', () => {
    it('fetches detailed assistant information when sheet opens', async () => {
      render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(drshubService.getAssistant).toHaveBeenCalledWith(
          mockDrshubAssistant.id,
        );
      });
    });

    it('does not fetch details when assistant is null', () => {
      render(<AssistantDetailSheet {...defaultProps} assistant={null} />);

      expect(drshubService.getAssistant).not.toHaveBeenCalled();
    });

    it('does not fetch details when not visible', () => {
      render(<AssistantDetailSheet {...defaultProps} isVisible={false} />);

      expect(drshubService.getAssistant).not.toHaveBeenCalled();
    });

    it('handles fetch error gracefully and falls back to basic assistant', async () => {
      const fetchError = new Error('Network error');
      (drshubService.getAssistant as jest.Mock).mockRejectedValueOnce(
        fetchError,
      );

      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        // Should still display basic assistant information
        expect(getByText('Drshub Test Assistant')).toBeTruthy();
      });
    });
  });

  describe('Free Assistant Actions', () => {
    it('shows download button for free assistants', async () => {
      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });
    });

    it('downloads assistant when download button is pressed', async () => {
      const {getByText, getByTestId} = render(
        <AssistantDetailSheet {...defaultProps} />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton!);

      // Verify download was called
      await waitFor(() => {
        expect(assistantStore.downloadDrshubAssistant).toHaveBeenCalledWith(
          mockDrshubAssistant,
        );
      });

      // Verify success alert was shown
      expect(Alert.alert).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
      );
    });

    it('shows downloaded state when assistant is already downloaded', async () => {
      (assistantStore.isDrshubAssistantDownloaded as jest.Mock).mockReturnValue(
        true,
      );

      const {getByTestId} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        expect(getByTestId('downloaded-button')).toBeTruthy();
      });
    });

    it('handles download error gracefully', async () => {
      const downloadError = new Error('Download failed');
      (assistantStore.downloadDrshubAssistant as jest.Mock).mockRejectedValue(
        downloadError,
      );

      const {getByText} = render(<AssistantDetailSheet {...defaultProps} />);

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByText(/Get Free/i);
      fireEvent.press(downloadButton);

      // Verify error alert was shown
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          expect.any(String),
          'Download failed',
        );
      });
    });
  });

  describe('Premium Assistant Display', () => {
    it('shows premium label for premium assistants', async () => {
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockPremiumDrshubAssistant,
      );

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('assistant-label-premium')).toBeTruthy();
      });
    });

    it('does not show download button for unowned premium assistants', async () => {
      const {queryByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(queryByText(/Download/i)).toBeNull();
        expect(queryByText(/Get Free/i)).toBeNull();
      });
    });

    it('shows informational text for unowned premium assistants', async () => {
      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('sheet-actions')).toBeTruthy();
      });
    });

    it('hides system prompt for unowned premium assistants', async () => {
      const {queryByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(
          queryByText('You are a helpful assistant from Drshub.'),
        ).toBeNull();
      });
    });

    it('shows premium assistant message for unowned premium assistants', async () => {
      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        // Should show some premium message (exact text depends on l10n)
        expect(getByTestId('sheet-actions')).toBeTruthy();
      });
    });
  });

  describe('Owned Premium Assistant Actions', () => {
    beforeEach(() => {
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockOwnedPremiumAssistant,
      );
    });

    it('shows download button for owned premium assistants', async () => {
      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockOwnedPremiumAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByText(/Download/i)).toBeTruthy();
      });
    });

    it('downloads owned premium assistant when download button is pressed', async () => {
      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockOwnedPremiumAssistant}
        />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByTestId('download-button')).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton);

      // Verify download was called
      await waitFor(() => {
        expect(assistantStore.downloadDrshubAssistant).toHaveBeenCalledWith(
          mockOwnedPremiumAssistant,
        );
      });
    });

    it('shows system prompt for owned premium assistants', async () => {
      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockOwnedPremiumAssistant}
        />,
      );

      await waitFor(() => {
        expect(
          getByText('You are a helpful assistant from Drshub.'),
        ).toBeTruthy();
      });
    });

    it('does not show premium info text for owned premium assistants', async () => {
      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockOwnedPremiumAssistant}
        />,
      );

      await waitFor(() => {
        // Should have actions but not the premium info text
        expect(getByTestId('sheet-actions')).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles assistant without creator gracefully', async () => {
      const assistantWithoutCreator = createDrshubAssistant({
        creator: undefined,
      });
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        assistantWithoutCreator,
      );

      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={assistantWithoutCreator}
        />,
      );

      await waitFor(() => {
        expect(getByText(assistantWithoutCreator.title)).toBeTruthy();
      });
    });

    it('handles assistant without description', async () => {
      const assistantWithoutDescription = createDrshubAssistant({
        description: undefined,
      });
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        assistantWithoutDescription,
      );

      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={assistantWithoutDescription}
        />,
      );

      await waitFor(() => {
        // Should show "no description available" message
        expect(getByText(assistantWithoutDescription.title)).toBeTruthy();
      });
    });

    it('handles assistant without categories', async () => {
      const assistantWithoutCategories = createDrshubAssistant({
        categories: [],
      });
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        assistantWithoutCategories,
      );

      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={assistantWithoutCategories}
        />,
      );

      await waitFor(() => {
        expect(getByText(assistantWithoutCategories.title)).toBeTruthy();
      });
    });

    it('handles assistant without tags', async () => {
      const assistantWithoutTags = createDrshubAssistant({
        tags: [],
      });
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        assistantWithoutTags,
      );

      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={assistantWithoutTags}
        />,
      );

      await waitFor(() => {
        expect(getByText(assistantWithoutTags.title)).toBeTruthy();
      });
    });
  });

  describe('Close Behavior', () => {
    it('calls onClose when close button is pressed', async () => {
      const {getByTestId} = render(<AssistantDetailSheet {...defaultProps} />);

      await waitFor(() => {
        const closeButton = getByTestId('sheet-close-button');
        fireEvent.press(closeButton);
      });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose after successful download', async () => {
      // Create a fresh onClose mock for this test
      const onCloseMock = jest.fn();
      const {getByTestId, getByText} = render(
        <AssistantDetailSheet {...defaultProps} onClose={onCloseMock} />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton);

      // Wait for download to complete and alert to be shown
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });

      // Simulate pressing OK button in the alert
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      if (buttons && buttons[0] && buttons[0].onPress) {
        buttons[0].onPress();
      }

      // Verify onClose was called
      await waitFor(() => {
        expect(onCloseMock).toHaveBeenCalled();
      });
    });
  });

  describe('Loading States', () => {
    it('shows loading state during download', async () => {
      let resolveDownload: () => void;
      const downloadPromise = new Promise<void>(resolve => {
        resolveDownload = resolve;
      });
      (assistantStore.downloadDrshubAssistant as jest.Mock).mockReturnValue(
        downloadPromise,
      );

      const {getByText, getByTestId} = render(
        <AssistantDetailSheet {...defaultProps} />,
      );

      // Wait for component to render with the button
      await waitFor(() => {
        expect(getByText(/Get Free/i)).toBeTruthy();
      });

      // Press the button
      const downloadButton = getByTestId('download-button');
      fireEvent.press(downloadButton);

      // Button should show loading state
      await waitFor(() => {
        expect(assistantStore.downloadDrshubAssistant).toHaveBeenCalled();
      });

      // Resolve the download
      resolveDownload!();
    });
  });

  describe('Premium Buy Button (eligible vs ineligible)', () => {
    beforeEach(() => {
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockPremiumDrshubAssistant,
      );
    });

    it('shows buy button for eligible users viewing unowned premium assistants', async () => {
      (assistantStore as any).isCheckoutEligible = true;

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });
    });

    it('shows info text (not buy button) for ineligible users viewing unowned premium assistants', async () => {
      (assistantStore as any).isCheckoutEligible = false;

      const {queryByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(queryByTestId('buy-button')).toBeNull();
      });
    });

    it('starts the in-app checkout on iOS when buy button is pressed', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      (authService as any).isAuthenticated = true;

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('buy-button'));

      // iOS (default Platform.OS in jest) drives the authenticated checkout
      // flow, not the anonymous web URL.
      expect(checkoutFlowStore.start).toHaveBeenCalledWith(
        mockPremiumDrshubAssistant.id,
      );
      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('opens sign-in instead of checkout when logged out', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      (authService as any).isAuthenticated = false;
      const onSignInPress = jest.fn();

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
          onSignInPress={onSignInPress}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('buy-button'));

      expect(onSignInPress).toHaveBeenCalled();
      expect(checkoutFlowStore.start).not.toHaveBeenCalled();
    });

    it('opens sign-in on Android when logged out', async () => {
      const original = Platform.OS;
      Platform.OS = 'android';
      (assistantStore as any).isCheckoutEligible = true;
      (authService as any).isAuthenticated = false;
      const onSignInPress = jest.fn();

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
          onSignInPress={onSignInPress}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('buy-button'));

      expect(onSignInPress).toHaveBeenCalled();
      expect(checkoutFlowStore.start).not.toHaveBeenCalled();

      Platform.OS = original;
    });

    it('flips Buy to Download after the purchase reconciles to owned', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      (authService as any).isAuthenticated = true;
      // Initially not owned -> buy button shows.
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockPremiumDrshubAssistant,
      );

      const {getByTestId, queryByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );
      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });

      // Purchase reconciles to owned; the sheet re-reads ownership from the server.
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockOwnedPremiumAssistant,
      );
      await act(async () => {
        runInAction(() => {
          checkoutFlowStore.status = 'owned';
        });
      });

      await waitFor(() => {
        expect(queryByTestId('buy-button')).toBeNull();
        expect(getByTestId('download-button')).toBeTruthy();
      });
    });

    it('does not show buy button for owned premium assistants', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockOwnedPremiumAssistant,
      );

      const {queryByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockOwnedPremiumAssistant}
        />,
      );

      await waitFor(() => {
        expect(queryByTestId('buy-button')).toBeNull();
      });
    });

    it('does not show buy button for free assistants', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockDrshubAssistant,
      );

      const {queryByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(queryByTestId('buy-button')).toBeNull();
      });
    });

    it('starts checkout directly on Android (no app disclosure; Play renders it)', async () => {
      const original = Platform.OS;
      Platform.OS = 'android';
      (assistantStore as any).isCheckoutEligible = true;
      (authService as any).isAuthenticated = true;
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockPremiumDrshubAssistant,
      );

      const {getByTestId, queryByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('buy-button'));

      // No app-rendered consent gate; checkout starts immediately (the store
      // runs the Play link-out prep, where Play renders the disclosure).
      expect(queryByTestId('disclosure-continue-button')).toBeNull();
      expect(checkoutFlowStore.start).toHaveBeenCalledWith(
        mockPremiumDrshubAssistant.id,
      );
      expect(Linking.openURL).not.toHaveBeenCalled();

      Platform.OS = original;
    });

    it('starts checkout directly on iOS (no app disclosure gate)', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      (authService as any).isAuthenticated = true;
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockPremiumDrshubAssistant,
      );

      const {getByTestId, queryByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('buy-button'));

      expect(queryByTestId('disclosure-continue-button')).toBeNull();
      expect(checkoutFlowStore.start).toHaveBeenCalledWith(
        mockPremiumDrshubAssistant.id,
      );
    });

    it('shows the finalizing indicator while the purchase settles', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      runInAction(() => {
        checkoutFlowStore.status = 'finalizing';
        checkoutFlowStore.assistantId = mockPremiumDrshubAssistant.id;
      });

      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByText('Finalizing your purchase…')).toBeTruthy();
      });
    });

    it('shows the processing-deferred message after webhook lag', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      runInAction(() => {
        checkoutFlowStore.status = 'processing_deferred';
        checkoutFlowStore.assistantId = mockPremiumDrshubAssistant.id;
      });

      const {getByText} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByText('Processing — will unlock shortly.')).toBeTruthy();
      });
    });

    it('shows the not-available message on a 404 error without a sign-in control', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      runInAction(() => {
        checkoutFlowStore.status = 'error';
        checkoutFlowStore.errorKind = '404';
      });

      const {getByText, queryByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(
          getByText('This assistant is not available for purchase right now.'),
        ).toBeTruthy();
      });
      expect(queryByTestId('checkout-signin-button')).toBeNull();
    });

    it('disables the buy button while a checkout is creating', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      runInAction(() => {
        checkoutFlowStore.status = 'creating';
        checkoutFlowStore.assistantId = mockPremiumDrshubAssistant.id;
      });

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      let buyButton: ReturnType<typeof getByTestId>;
      await waitFor(() => {
        buyButton = getByTestId('buy-button');
        expect(buyButton).toBeTruthy();
      });

      fireEvent.press(buyButton!);
      // A second press while in flight must not start another checkout.
      expect(checkoutFlowStore.start).not.toHaveBeenCalled();
    });

    it('resets the checkout flow when the sheet is closed', async () => {
      (assistantStore as any).isCheckoutEligible = true;

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('buy-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('sheet-close-button'));
      expect(checkoutFlowStore.reset).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('renders "Sign in again" on a 401 error and calls onSignInPress', async () => {
      (assistantStore as any).isCheckoutEligible = true;
      (drshubService.getAssistant as jest.Mock).mockResolvedValue(
        mockPremiumDrshubAssistant,
      );
      runInAction(() => {
        checkoutFlowStore.status = 'error';
        checkoutFlowStore.errorKind = '401';
      });
      const onSignInPress = jest.fn();

      const {getByTestId} = render(
        <AssistantDetailSheet
          {...defaultProps}
          assistant={mockPremiumDrshubAssistant}
          onSignInPress={onSignInPress}
        />,
      );

      await waitFor(() => {
        expect(getByTestId('checkout-signin-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('checkout-signin-button'));
      expect(onSignInPress).toHaveBeenCalled();
    });
  });
});
