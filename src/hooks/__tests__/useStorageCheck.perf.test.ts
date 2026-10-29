import {renderHook, act} from '@testing-library/react-native';

import {createModel} from '../../../jest/fixtures/models';

import {useStorageCheck} from '../useStorageCheck';
import {Model} from '../../utils/types';

type RenderProps = {model: Model};

// PERF-02/PERF-03 tests: this file pins the polling lifecycle of the
// storage check. `hasEnoughSpace` is the observable side effect of every
// probe, so it is mocked with a controllable counter.
const mockHasEnoughSpace = jest.fn().mockResolvedValue(true);
jest.mock('../../utils', () => {
  const actual = jest.requireActual('../../utils');
  return {
    ...actual,
    hasEnoughSpace: (...args: unknown[]) => mockHasEnoughSpace(...args),
  };
});

jest.useFakeTimers();

describe('useStorageCheck polling lifecycle (PERF-02 / PERF-03)', () => {
  beforeEach(() => {
    mockHasEnoughSpace.mockClear();
  });

  it('keeps ticking while the model is not downloaded (baseline behavior)', async () => {
    renderHook(() => useStorageCheck(createModel({id: 'm-baseline'})));

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockHasEnoughSpace).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(30000); // 3 ticks at the 10s default
    });
    expect(mockHasEnoughSpace).toHaveBeenCalledTimes(4);
  });

  it('stops the periodic probe once the model is on disk (PERF-02)', async () => {
    const {rerender, unmount} = renderHook(
      ({model}: RenderProps) => useStorageCheck(model),
      {initialProps: {model: createModel({id: 'm-perf2'})}},
    );

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockHasEnoughSpace).toHaveBeenCalledTimes(1);

    // Download completes: a fresh object reference with isDownloaded=true.
    rerender({model: createModel({id: 'm-perf2', isDownloaded: true})});

    await act(async () => {
      jest.advanceTimersByTime(60000); // 6 would-be ticks
    });
    expect(mockHasEnoughSpace).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not re-probe when only the model object identity changes (PERF-03)', async () => {
    const {rerender, unmount} = renderHook(
      ({model}: RenderProps) => useStorageCheck(model),
      {initialProps: {model: createModel({id: 'm-perf3'})}},
    );

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockHasEnoughSpace).toHaveBeenCalledTimes(1);

    // ModelCard-style churn: five re-renders, each passing a fresh object
    // with identical field values.
    for (let i = 0; i < 5; i++) {
      rerender({model: createModel({id: 'm-perf3'})});
    }

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockHasEnoughSpace).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('re-arms the probe if a mounted model is deleted', async () => {
    const {rerender, unmount} = renderHook(
      ({model}: RenderProps) => useStorageCheck(model),
      {initialProps: {model: createModel({id: 'm-del', isDownloaded: true})}},
    );

    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(mockHasEnoughSpace).not.toHaveBeenCalled();

    // Model deleted while the card is still mounted: checks must resume.
    rerender({model: createModel({id: 'm-del', isDownloaded: false})});

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockHasEnoughSpace).toHaveBeenCalledTimes(1);
    unmount();
  });
});
