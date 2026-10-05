import React, {useState, useEffect, useContext} from 'react';
import {View, Alert} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, Button, TextInput, ActivityIndicator} from 'react-native-paper';

import {GoogleIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';

import {Sheet} from '../../Sheet';
import {createStyles} from './styles';

import {authService, DrshubErrorHandler} from '../../../services';
import {L10nContext} from '../../../utils';

interface AuthSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

const GoogleButtonIcon = () => <GoogleIcon width={20} height={20} />;

export const AuthSheet: React.FC<AuthSheetProps> = observer(
  ({isVisible, onClose}) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);

    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const authState = authService.authState;

    // Close sheet automatically when user becomes authenticated
    useEffect(() => {
      if (authState.isAuthenticated && isVisible) {
        onClose();
      }
    }, [authState.isAuthenticated, isVisible, onClose]);

    const handleEmailAuth = async () => {
      if (!email.trim() || !password.trim()) {
        Alert.alert(
          l10n.common.error,
          l10n.components.authSheet.fillRequiredFields,
        );
        return;
      }

      if (isSignUp && !fullName.trim()) {
        Alert.alert(l10n.common.error, l10n.components.authSheet.enterFullName);
        return;
      }

      try {
        setIsLoading(true);
        authService.clearError();

        if (isSignUp) {
          const ok = await authService.signUpWithEmail(
            email.trim(),
            password,
            fullName.trim(),
          );
          if (ok) {
            Alert.alert(
              l10n.components.authSheet.accountCreatedTitle,
              l10n.components.authSheet.accountCreatedMessage,
              [{text: l10n.common.ok, onPress: onClose}],
            );
          }
        } else {
          const ok = await authService.signInWithEmail(email.trim(), password);
          if (ok) {
            Alert.alert(
              l10n.components.authSheet.welcomeBackTitle,
              l10n.components.authSheet.welcomeBackMessage,
              [{text: l10n.common.ok, onPress: onClose}],
            );
          }
        }
      } catch (error) {
        const errorInfo = DrshubErrorHandler.handle(error);
        Alert.alert(
          l10n.components.authSheet.authErrorTitle ?? l10n.common.error,
          errorInfo.userMessage,
        );
      } finally {
        setIsLoading(false);
      }
    };

    const handleGoogleAuth = async () => {
      try {
        setIsLoading(true);
        authService.clearError();

        await authService.signInWithGoogle();
        // Sheet will close automatically via useEffect when auth state changes
      } catch (error) {
        const errorInfo = DrshubErrorHandler.handle(error);
        Alert.alert(
          l10n.components.authSheet.googleErrorTitle,
          errorInfo.userMessage,
        );
      } finally {
        setIsLoading(false);
      }
    };

    const handleForgotPassword = async () => {
      if (!email.trim()) {
        Alert.alert(
          l10n.common.error,
          l10n.components.authSheet.enterEmailFirst,
        );
        return;
      }

      try {
        setIsLoading(true);
        const ok = await authService.resetPassword(email.trim());
        if (ok) {
          Alert.alert(
            l10n.components.authSheet.passwordResetTitle,
            l10n.components.authSheet.passwordResetMessage,
            [{text: l10n.common.ok}],
          );
        }
      } catch (error) {
        const errorInfo = DrshubErrorHandler.handle(error);
        Alert.alert(l10n.common.error, errorInfo.userMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const resetForm = () => {
      setEmail('');
      setPassword('');
      setFullName('');
      setIsSignUp(false);
      authService.clearError();
    };

    const handleClose = () => {
      resetForm();
      onClose();
    };

    return (
      <Sheet
        title={
          isSignUp
            ? l10n.components.authSheet.signUpTitle
            : l10n.components.authSheet.signInTitle
        }
        isVisible={isVisible}
        onClose={handleClose}
        snapPoints={['85%']}>
        <Sheet.ScrollView
          contentContainerStyle={[
            styles.authSheet,
            {paddingBottom: insets.bottom + 16},
          ]}>
          {/* Loading Indicator */}
          {authState.isLoading && (
            <View style={styles.authLoadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.authSubtitle}>
                {l10n.components.authSheet.signingIn}
              </Text>
            </View>
          )}

          {/* Error Message */}
          {authState.error && (
            <Text style={[styles.authSubtitle, styles.authErrorText]}>
              {authState.error}
            </Text>
          )}

          {/* Email/Password Form */}
          <View style={styles.authForm}>
            {isSignUp && (
              <TextInput
                testID="full-name-input"
                label={l10n.components.authSheet.fullNameLabel}
                value={fullName}
                onChangeText={setFullName}
                style={styles.authInput}
                mode="outlined"
                disabled={isLoading || authState.isLoading}
              />
            )}

            <TextInput
              testID="email-input"
              label={l10n.components.authSheet.emailLabel}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.authInput}
              mode="outlined"
              disabled={isLoading || authState.isLoading}
            />

            <TextInput
              testID="password-input"
              label={l10n.components.authSheet.passwordLabel}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.authInput}
              mode="outlined"
              disabled={isLoading || authState.isLoading}
            />

            <Button
              testID="auth-submit-button"
              mode="contained"
              onPress={handleEmailAuth}
              loading={isLoading}
              disabled={authState.isLoading}
              style={styles.authButton}
              contentStyle={styles.authButtonContent}>
              {isSignUp
                ? l10n.components.authSheet.signUpButton
                : l10n.components.authSheet.signInButton}
            </Button>

            {!isSignUp && (
              <Button
                mode="text"
                onPress={handleForgotPassword}
                disabled={isLoading || authState.isLoading}>
                {l10n.components.authSheet.forgotPassword}
              </Button>
            )}
          </View>

          {/* Divider */}
          <View style={styles.authDivider}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerText}>
              {l10n.components.authSheet.or}
            </Text>
            <View style={styles.authDividerLine} />
          </View>

          {/* Google Sign-In */}
          <Button
            mode="outlined"
            onPress={handleGoogleAuth}
            loading={isLoading}
            disabled={authState.isLoading}
            style={styles.authSocialButton}
            contentStyle={styles.authButtonContent}
            icon={GoogleButtonIcon}>
            {l10n.components.authSheet.continueWithGoogle}
          </Button>

          {/* Toggle Sign Up/Sign In */}
          <View style={styles.authToggle}>
            <Text style={styles.authToggleText}>
              {isSignUp
                ? l10n.components.authSheet.haveAccount
                : l10n.components.authSheet.noAccount}
            </Text>
            <Button
              mode="text"
              onPress={() => setIsSignUp(!isSignUp)}
              disabled={isLoading || authState.isLoading}
              compact
              labelStyle={styles.authToggleLink}
              contentStyle={styles.authToggleButtonContent}>
              {isSignUp
                ? l10n.components.authSheet.signInLink
                : l10n.components.authSheet.signUpLink}
            </Button>
          </View>
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
