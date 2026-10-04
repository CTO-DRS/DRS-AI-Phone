import {StyleSheet} from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  sessionTitle: {
    fontWeight: '600' as const,
  },
  modelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginTop: 2,
  },
  modelName: {
    flexShrink: 1,
    letterSpacing: 0.2,
  },
  dotWrap: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  dotIdle: {
    backgroundColor: '#9CA3AF',
  },
  dotHalo: {
    position: 'absolute' as const,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
});
