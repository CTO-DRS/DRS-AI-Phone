import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import NativeRestart from '../../specs/NativeRestart';

interface State {
  hasError: boolean;
  message: string;
  detail: string;
}

/**
 * Root-level crash shield.
 *
 * React Native release builds render nothing (a frozen splash) when the
 * first render throws, and close silently when an error escapes later —
 * neither of which tells the user (or us) what happened. This boundary
 * wraps the entire app so any startup or render failure shows a visible,
 * bilingual (EN + AR) error screen with the message and a restart button
 * instead of a silent freeze.
 *
 * It is intentionally theme-free and context-free: it must render even
 * when the failure happened inside the theme/i10n providers themselves.
 */
export class GlobalErrorBoundary extends React.Component<
  {children: React.ReactNode},
  State
> {
  state: State = {hasError: false, message: '', detail: ''};

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');
    return {hasError: true, message};
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'unknown');
    const detail =
      error instanceof Error && error.stack
        ? error.stack
        : String(error ?? 'unknown');
    const component = info?.componentStack ?? '';

    console.error(
      '[GlobalErrorBoundary]',
      message,
      '\n',
      detail,
      '\n',
      component,
    );
    this.setState({detail: `${detail}\n${component}`.slice(0, 4000)});
  }

  private reset = () => {
    this.setState({hasError: false, message: '', detail: ''});
  };

  private restart = () => {
    try {
      NativeRestart.restart();
    } catch {
      // Native module unavailable (e.g. inside some dev tools) — fall
      // back to resetting the boundary so the app retries rendering.
      this.reset();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.emoji}>!</Text>
          <Text style={styles.titleAr}>حدث خطأ غير متوقع</Text>
          <Text style={styles.titleEn}>An unexpected error occurred</Text>
          <View style={styles.card}>
            <Text style={styles.message}>{this.state.message}</Text>
            {this.state.detail.length > 0 && (
              <Text style={styles.detail}>{this.state.detail}</Text>
            )}
          </View>
          <TouchableOpacity style={styles.button} onPress={this.restart}>
            <Text style={styles.buttonText}>
              إعادة تشغيل التطبيق · Restart app
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={this.reset}>
            <Text style={styles.secondaryText}>إعادة المحاولة · Retry</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#101418'},
  scroll: {flexGrow: 1, justifyContent: 'center', padding: 24},
  emoji: {
    fontSize: 44,
    color: '#ffb4a9',
    textAlign: 'center',
    marginBottom: 12,
  },
  titleAr: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  titleEn: {
    color: '#9aa4af',
    fontSize: 16,
    marginTop: 4,
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#1b2129',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    maxHeight: 320,
  },
  message: {color: '#ffb4a9', fontSize: 14, fontWeight: '600'},
  detail: {color: '#8fa1b3', fontSize: 11, marginTop: 10, lineHeight: 15},
  button: {
    backgroundColor: '#3d6fe0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {color: '#ffffff', fontSize: 16, fontWeight: '700'},
  secondary: {paddingVertical: 10, alignItems: 'center'},
  secondaryText: {color: '#9aa4af', fontSize: 14},
});
