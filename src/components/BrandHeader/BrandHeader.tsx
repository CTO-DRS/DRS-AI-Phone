import React from 'react';
import {View, Image, Text} from 'react-native';

import {BrandGradient} from '../BrandGradient';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

/**
 * Brand header shown at the top of the navigation drawer.
 *
 * A full-bleed brand-gradient panel with the DRS AI mark, wordmark and
 * tagline — the identity anchor of the app's navigation surface.
 */
export const BrandHeader: React.FC = () => {
  const l10n = React.useContext(L10nContext);
  const styles = createStyles();

  return (
    <BrandGradient style={styles.container} testID="brand-header">
      <View style={styles.row}>
        <View style={styles.logoCircle}>
          <Image
            source={require('../../assets/drs-ai-mark.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.wordmark}>DRS AI</Text>
          <Text style={styles.tagline} numberOfLines={1}>
            {l10n.components.brandHeader.tagline}
          </Text>
        </View>
      </View>
    </BrandGradient>
  );
};
