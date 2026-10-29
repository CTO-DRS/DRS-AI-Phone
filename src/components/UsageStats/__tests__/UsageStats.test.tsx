import React from 'react';

import DeviceInfo from 'react-native-device-info';

import {render, fireEvent, act} from '../../../../jest/test-utils';

import {UsageStats} from '../UsageStats';

// PERF-01: the sampling loop is gated on navigation focus. The tests pin
// the focused state (the default the widget ships with on the chat
// header) and flip it explicitly for the not-focused behavior test.
const mockUseIsFocused = jest.fn(() => true);
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useIsFocused: () => mockUseIsFocused(),
  };
});

describe('UsageStats Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsFocused.mockReturnValue(true);
  });

  const mockMeasure = jest.fn(callback => {
    callback(0, 0, 100, 50, 10, 20); // mock x, y, width, height, pageX, pageY
  });

  it('fetches and displays memory stats correctly', async () => {
    const totalMemory = 4 * 1000 * 1000 * 1000;
    const usedMemory = 2 * 1000 * 1000 * 1000;

    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(totalMemory);
    (DeviceInfo.getUsedMemory as jest.Mock).mockResolvedValueOnce(usedMemory);

    const {getByText, queryByText, getByTestId} = render(
      <UsageStats width={100} height={50} />,
    );

    // Tooltip should not be visible
    expect(queryByText('Memory Usage')).toBeNull();

    // Wait for memory stats to be fetched and graph to be updated
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    // Mock the measure function
    const touchable = getByTestId('memory-usage-touchable') as any;
    touchable._nativeTag = 'mock-tag';
    touchable.measure = mockMeasure;

    // Press the graph to display the tooltip
    fireEvent.press(touchable, {
      target: touchable,
      nativeEvent: {pageX: 10, pageY: 20},
    });

    // Check if the tooltip shows the correct values
    expect(getByText('Used: 2 GB')).toBeTruthy();
    expect(getByText('Total: 4 GB')).toBeTruthy();
    expect(getByText('Usage: 50.0%')).toBeTruthy();
  });

  it('renders the memory usage graph as an SVG', async () => {
    const totalMemory = 4 * 1000 * 1000 * 1000;
    const usedMemory = 2 * 1000 * 1000 * 1000;

    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(totalMemory);
    (DeviceInfo.getUsedMemory as jest.Mock).mockResolvedValueOnce(usedMemory);

    const {getByTestId} = render(<UsageStats width={100} height={50} />);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    // Check if the SVG is rendered
    const svgElement = getByTestId('memory-usage-svg');
    expect(svgElement).toBeTruthy();
  });

  it('toggles the tooltip on press', async () => {
    const totalMemory = 4 * 1000 * 1000 * 1000;
    const usedMemory = 2 * 1000 * 1000 * 1000;

    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(totalMemory);
    (DeviceInfo.getUsedMemory as jest.Mock).mockResolvedValueOnce(usedMemory);

    const {queryByTestId, getByTestId} = render(
      <UsageStats width={100} height={50} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    const touchable = getByTestId('memory-usage-touchable') as any;
    touchable._nativeTag = 'mock-tag';
    touchable.measure = mockMeasure;

    // Press the graph to display the tooltip
    fireEvent.press(touchable, {
      target: touchable,
      nativeEvent: {pageX: 10, pageY: 20},
    });

    expect(getByTestId('memory-usage-tooltip')).toBeTruthy();

    // hide the tooltip
    fireEvent.press(getByTestId('memory-usage-touchable'), {
      target: touchable,
      nativeEvent: {pageX: 10, pageY: 20},
    });

    expect(queryByTestId('memory-usage-tooltip')).toBeNull();
  });

  it('does not sample memory while the hosting screen is not focused (PERF-01)', async () => {
    mockUseIsFocused.mockReturnValue(false);
    (DeviceInfo.getUsedMemory as jest.Mock).mockClear();
    (DeviceInfo.getTotalMemory as jest.Mock).mockClear();

    render(<UsageStats width={100} height={50} />);

    await act(async () => {
      jest.advanceTimersByTime(9000);
    });

    // No initial fetch and no interval ticks while unfocused.
    expect(DeviceInfo.getTotalMemory).not.toHaveBeenCalled();
    expect(DeviceInfo.getUsedMemory).not.toHaveBeenCalled();
  });
});
