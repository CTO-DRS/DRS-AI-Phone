import React from 'react';
import {render} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {ChatHeader} from '../ChatHeader';

// Mock the child components
jest.mock('../../HeaderLeft', () => ({
  HeaderLeft: () => {
    const {View} = require('react-native');
    return <View testID="header-left" />;
  },
}));

jest.mock('../../HeaderRight', () => ({
  HeaderRight: () => {
    const {View} = require('react-native');
    return <View testID="header-right" />;
  },
}));

jest.mock('../../ChatHeaderTitle', () => ({
  ChatHeaderTitle: () => {
    const {View} = require('react-native');
    return <View testID="chat-header-title" />;
  },
}));

// Create a mock store object
const mockChatSessionStore = {
  shouldShowHeaderDivider: false,
};

// Mock the stores
jest.mock('../../../store', () => ({
  chatSessionStore: mockChatSessionStore,
}));

describe('ChatHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock store value
    mockChatSessionStore.shouldShowHeaderDivider = false;
  });

  it('renders all child components', () => {
    const {getByTestId} = render(<ChatHeader />);

    expect(getByTestId('header-view')).toBeTruthy();
    expect(getByTestId('header-left')).toBeTruthy();
    expect(getByTestId('header-right')).toBeTruthy();
    expect(getByTestId('chat-header-title')).toBeTruthy();
  });

  it('applies correct styles when header divider should not be shown', () => {
    mockChatSessionStore.shouldShowHeaderDivider = false;
    const {getByTestId} = render(<ChatHeader />, {withSafeArea: true});

    const headerView = getByTestId('header-view');
    // Regression (v1.35.0): the header background MUST be the opaque theme
    // background. It was 'transparent' for a while, which let the root
    // container's assistant accent tint (e.g. Pip's near-white #FAFAFA)
    // bleed through and made the theme-colored title texts invisible in
    // dark theme.
    expect(headerView.props.style[1]).toMatchObject({
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 0,
      backgroundColor: themeFixtures.lightTheme.colors.background,
    });
  });

  it('applies correct styles when header divider should be shown', () => {
    mockChatSessionStore.shouldShowHeaderDivider = true;
    const {getByTestId} = render(<ChatHeader />, {withSafeArea: true});

    const headerView = getByTestId('header-view');
    expect(headerView.props.style[1]).toMatchObject({
      backgroundColor: themeFixtures.lightTheme.colors.background,
    });
  });
});
