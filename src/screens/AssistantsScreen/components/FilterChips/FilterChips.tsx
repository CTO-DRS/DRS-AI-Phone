import React, {useContext} from 'react';
import {View, ScrollView} from 'react-native';
import {Chip} from 'react-native-paper';
import {observer} from 'mobx-react-lite';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';
import {getAssistantFilterLabels} from '../../../../utils/drshub-display';
import {L10nContext} from '../../../../utils';

export type FilterType =
  | 'all'
  | 'my-assistants'
  | 'local'
  | 'video'
  | 'free'
  | 'premium'; // Changed from 'paid' to 'premium'

interface FilterChipsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  isAuthenticated: boolean;
}

interface FilterOption {
  key: FilterType;
  label: string;
  showWhenUnauthenticated?: boolean;
}

export const FilterChips: React.FC<FilterChipsProps> = observer(
  ({activeFilter, onFilterChange, isAuthenticated}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const FILTER_LABELS = getAssistantFilterLabels(l10n);

    const filterOptions: FilterOption[] = [
      {
        key: 'all',
        label: FILTER_LABELS.all,
        showWhenUnauthenticated: true,
      },
      {
        key: 'my-assistants',
        label: FILTER_LABELS['my-assistants'],
        showWhenUnauthenticated: false,
      },
      {
        key: 'local',
        label: FILTER_LABELS.local,
        showWhenUnauthenticated: true,
      },
      {
        key: 'video',
        label: FILTER_LABELS.video,
        showWhenUnauthenticated: true,
      },
      {
        key: 'free',
        label: FILTER_LABELS.free,
        showWhenUnauthenticated: true,
      },
      {
        key: 'premium',
        label: FILTER_LABELS.premium,
        showWhenUnauthenticated: true,
      },
    ];

    const visibleFilters = filterOptions.filter(
      option => isAuthenticated || option.showWhenUnauthenticated,
    );

    return (
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {visibleFilters.map(option => (
            <Chip
              testID={`filter-chip-${option.key}`}
              key={option.key}
              mode={activeFilter === option.key ? 'flat' : 'outlined'}
              selected={activeFilter === option.key}
              onPress={() => onFilterChange(option.key)}
              style={[
                styles.chip,
                activeFilter === option.key && styles.activeChip,
              ]}
              textStyle={[
                styles.chipText,
                activeFilter === option.key && styles.activeChipText,
              ]}
              compact>
              {option.label}
            </Chip>
          ))}
        </ScrollView>
      </View>
    );
  },
);
