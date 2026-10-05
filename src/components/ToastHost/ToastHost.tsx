import React from 'react';
import {StyleSheet, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {Snackbar} from 'react-native-paper';

import {uiStore} from '../../store';
import {useTheme} from '../../hooks';

/**
 * App-wide toast host. Mounted once near the navigation root; renders the
 * latest `uiStore.toast` (error/success) as a Snackbar. The toast key is
 * used as the component key so back-to-back identical messages re-show.
 */
export const ToastHost: React.FC = observer(() => {
  const theme = useTheme();
  const toast = uiStore.toast;

  if (!toast) {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="box-none">
      <Snackbar
        key={toast.key}
        visible={true}
        onDismiss={uiStore.clearToast}
        duration={toast.kind === 'error' ? 5000 : 3000}
        style={[
          styles.snackbar,
          {
            backgroundColor:
              toast.kind === 'error'
                ? theme.colors.errorContainer
                : theme.colors.primaryContainer,
          },
        ]}>
        {toast.message}
      </Snackbar>
    </View>
  );
});

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  snackbar: {
    marginBottom: 8,
  },
});
