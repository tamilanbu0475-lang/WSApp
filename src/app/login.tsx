import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import ScreenBackground from '../components/ScreenBackground';

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

  const progressAnim = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const pwdRef = useRef<TextInput>(null);

  const BACKEND_URL =
    process.env.EXPO_PUBLIC_BACKEND_URL || 'https://wsapp-9w4r.onrender.com';

  // The free Render server can take up to a minute to wake up, so wait for it.
  const fetchWithTimeout = async (url: string, options: any, ms = 60000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const friendlyError = (err: any) => {
    const msg = err instanceof Error ? err.message : '';
    if (err?.name === 'AbortError') return 'The server is waking up. Please wait a few seconds and try again.';
    if (/network request failed|failed to fetch/i.test(msg)) return 'Cannot reach the server. Check your internet connection and try again.';
    return msg || 'Unable to connect to the backend server.';
  };

  const handleLogin = async () => {
    if (loading) return;

    const normalizedPhone = phone.trim();
    const normalizedPassword = password;

    if (!/^\d{10}$/.test(normalizedPhone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    if (!normalizedPassword.trim()) {
      setError('Please enter your password.');
      return;
    }

    setError('');
    setLoading(true);
    progressAnim.setValue(0);

    Animated.sequence([
      Animated.timing(btnScale, {
        toValue: 0.97,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(btnScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: 0.35,
        duration: 350,
        useNativeDriver: false,
      }),
    ]).start();

    try {
      const response = await fetchWithTimeout(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          password: normalizedPassword,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Unable to sign in.');
      }

      const sessionUser = {
        uid: String(result.user?.uid ?? ''),
        fullName: String(result.user?.fullName ?? ''),
        phone: String(result.user?.phone ?? normalizedPhone),
        email: String(result.user?.email ?? ''),
      };
      await AsyncStorage.setItem('wsUser', JSON.stringify(sessionUser));
      if (result.token) await AsyncStorage.setItem('wsToken', String(result.token));

      // Keep a synchronous browser copy so web refresh can restore the page immediately.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('wsUser', JSON.stringify(sessionUser));
          if (result.token) window.localStorage.setItem('wsToken', String(result.token));
        } catch {}
      }

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }).start(() => {
        setLoading(false);
        router.replace({
          pathname: '/',
          params: {
            fullName: String(result.user?.fullName ?? ''),
            phone: String(result.user?.phone ?? normalizedPhone),
            email: String(result.user?.email ?? ''),
            uid: String(result.user?.uid ?? ''),
          },
        } as any);
      });
    } catch (error) {
      setLoading(false);
      setError(friendlyError(error));
    }
  };

  const handleForgotPassword = async () => {
    const normalizedPhone = forgotPhone.replace(/\D/g, '').slice(0, 10);

    if (!/^\d{10}$/.test(normalizedPhone)) {
      setForgotMessage('Enter the same 10-digit mobile number used during registration.');
      return;
    }

    try {
      setForgotLoading(true);
      setForgotMessage('');

      const response = await fetchWithTimeout(`${BACKEND_URL}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone }),
      });

      const result = await response.json().catch(() => null);

      if (response.status === 404) {
        throw new Error('Password reset is not available on the server yet. Please try again in a few minutes.');
      }

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Unable to process password reset.');
      }

      setForgotMessage(
        'If an account is registered with this number, a password-reset email has been sent to its registered email address.'
      );
      setForgotPhone('');
    } catch (err) {
      setForgotMessage(friendlyError(err));
    } finally {
      setForgotLoading(false);
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.root}>
      {/* BACKGROUND — outside KeyboardAvoidingView so it never shrinks */}
      <ScreenBackground
        opacity={0.18}
        mobileOpacity={0.10}
        desktopWidth="55%"
      />

      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={styles.keyboardRoot}
        enabled={Platform.OS === 'ios'}
        behavior="padding"
      >
        <StatusBar
          barStyle="light-content"
          backgroundColor="#1A0310"
        />

        <View style={styles.glowTL} />
        <View style={styles.glowBR} />

        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            !isMobile && styles.scrollDesktop,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios'
              ? 'interactive'
              : 'on-drag'
          }
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.card,
              !isMobile && styles.cardDesktop,
            ]}
          >
            <View style={styles.cardTopLine} />

            {/* Logo */}
            <View style={styles.logoRow}>
              <View style={styles.logoBox}>
                <Text style={styles.logoTxt}>WS</Text>
              </View>

              <View>
                <Text style={styles.brandName}>WS App</Text>
                <Text style={styles.brandSub}>
                  Women Safety Application
                </Text>
              </View>
            </View>

            <Text style={styles.title}>Welcome Back</Text>

            <Text style={styles.sub}>
              Sign in to continue — you are safe with us
            </Text>

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PHONE NUMBER</Text>

              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>📱</Text>

                <TextInput
                  style={[
                    styles.input,
                    { outlineStyle: 'none' } as any,
                  ]}
                  placeholder="Enter 10-digit mobile number"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={phone}
                  onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 10))}
                  maxLength={10}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() =>
                    pwdRef.current?.focus()
                  }
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>PASSWORD</Text>

              <View style={styles.inputWrap}>
                <Text style={styles.inputIcon}>🔒</Text>

                <TextInput
                  ref={pwdRef}
                  style={[
                    styles.input,
                    { outlineStyle: 'none' } as any,
                  ]}
                  placeholder="Enter your password"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPwd}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />

                <TouchableOpacity
                  onPress={() => setShowPwd(!showPwd)}
                >
                  <Text style={styles.eyeBtn}>
                    {showPwd ? '🙈' : '👁'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTxt}>
                  ⚠️ {error}
                </Text>
              </View>
            ) : null}

            {/* Forgot */}
            <TouchableOpacity
              style={styles.forgotWrap}
              onPress={() => { setError(''); setForgotMessage(''); setShowForgot(true); }}
            >
              <Text style={styles.forgotTxt}>
                Forgot Password?
              </Text>
            </TouchableOpacity>

            <Modal
              visible={showForgot}
              transparent
              animationType="fade"
              onRequestClose={() => setShowForgot(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.forgotCard}>
                  <View style={styles.cardTopLine} />
                  <Text style={styles.forgotTitle}>Reset Password</Text>
                  <Text style={styles.forgotSub}>Enter your registered mobile number. We will send a secure reset link to your registered email.</Text>

                  <Text style={styles.label}>MOBILE NUMBER</Text>
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputIcon}>📱</Text>
                    <TextInput
                      style={[styles.input, { outlineStyle: 'none' } as any]}
                      placeholder="Enter 10-digit mobile number"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={forgotPhone}
                      onChangeText={(text) => setForgotPhone(text.replace(/\D/g, '').slice(0, 10))}
                      maxLength={10}
                      keyboardType="phone-pad"
                    />
                  </View>

                  {!!forgotMessage && (
                    <View style={styles.forgotMessageBox}>
                      <Text style={styles.forgotMessageTxt}>✉️ {forgotMessage}</Text>
                    </View>
                  )}

                  <View style={styles.forgotActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setShowForgot(false)}
                      disabled={forgotLoading}
                    >
                      <Text style={styles.cancelBtnTxt}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.resetBtn, forgotLoading && styles.loginBtnLoading]}
                      onPress={handleForgotPassword}
                      disabled={forgotLoading}
                    >
                      <Text style={styles.resetBtnTxt}>{forgotLoading ? 'Sending...' : 'Send Reset Link'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Login */}
            <Animated.View
              style={{
                transform: [{ scale: btnScale }],
              }}
            >
              <TouchableOpacity
                style={[
                  styles.loginBtn,
                  loading && styles.loginBtnLoading,
                ]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <View style={styles.loadingInner}>
                    <Text style={styles.loginBtnTxt}>
                      Signing In
                    </Text>

                    <View style={styles.progressBg}>
                      <Animated.View
                        style={[
                          styles.progressBar,
                          { width: progressWidth },
                        ]}
                      />
                    </View>
                  </View>
                ) : (
                  <Text style={styles.loginBtnTxt}>
                    🔐  Sign In
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Divider */}
            <View style={styles.divRow}>
              <View style={styles.divLine} />
              <Text style={styles.divTxt}>or</Text>
              <View style={styles.divLine} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={styles.googleBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleTxt}>
                Continue with Google
              </Text>
            </TouchableOpacity>

            {/* Register */}
            <View style={styles.registerRow}>
              <Text style={styles.registerTxt}>
                New to WS App?{' '}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  router.push('/register' as any)
                }
              >
                <Text style={styles.registerLink}>
                  Create Account →
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterTxt}>
                🔒 Secure • Private • Always With You
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A0310',
  },

  keyboardRoot: {
    flex: 1,
    zIndex: 2,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,3,16,0.72)',
    zIndex: 1,
  },

  glowTL: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(92,10,45,0.45)',
  },

  glowBR: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(11,110,79,0.12)',
  },

  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },

  scrollDesktop: {
    paddingVertical: 60,
  },

  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    borderRadius: 28,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 20,
    },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 20,
    overflow: 'hidden',
  },

  cardDesktop: {
    maxWidth: 460,
    padding: 44,
  },

  cardTopLine: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 1,
    backgroundColor: 'rgba(201,168,76,0.5)',
  },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },

  logoBox: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: 'rgba(92,10,45,0.5)',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C9A84C',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  logoTxt: {
    color: '#C9A84C',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },

  brandName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },

  brandSub: {
    color: 'rgba(201,168,76,0.6)',
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 1,
  },

  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 6,
  },

  sub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginBottom: 28,
  },

  fieldGroup: {
    marginBottom: 16,
  },

  label: {
    color: 'rgba(201,168,76,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },

  inputIcon: {
    fontSize: 16,
    marginRight: 10,
  },

  input: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 13,
  },

  eyeBtn: {
    fontSize: 16,
    padding: 4,
  },

  errorBox: {
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },

  errorTxt: {
    color: '#ff8080',
    fontSize: 12,
    fontWeight: '600',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,0,6,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  forgotCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#24101C',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.35)',
    borderRadius: 22,
    padding: 24,
  },

  forgotTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
  },

  forgotSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 18,
  },

  forgotMessageBox: {
    marginTop: 12,
    backgroundColor: 'rgba(11,110,79,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(11,110,79,0.35)',
    borderRadius: 10,
    padding: 10,
  },

  forgotMessageTxt: {
    color: '#8de0bd',
    fontSize: 12,
    lineHeight: 18,
  },

  forgotActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },

  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  cancelBtnTxt: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    fontSize: 12,
  },

  resetBtn: {
    flex: 1.45,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#C9A84C',
  },

  resetBtnTxt: {
    color: '#1A0310',
    fontWeight: '900',
    fontSize: 12,
  },

  forgotWrap: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },

  forgotTxt: {
    color: 'rgba(201,168,76,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },

  loginBtn: {
    backgroundColor: '#C9A84C',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#C9A84C',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },

  loginBtnLoading: {
    backgroundColor: 'rgba(201,168,76,0.7)',
  },

  loadingInner: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },

  loginBtnTxt: {
    color: '#1A0310',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },

  progressBg: {
    width: '80%',
    height: 3,
    backgroundColor: 'rgba(26,3,16,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },

  progressBar: {
    height: '100%',
    backgroundColor: '#1A0310',
    borderRadius: 3,
  },

  divRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },

  divLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  divTxt: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
  },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },

  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '900',
    color: '#C0392B',
    overflow: 'hidden',
  },

  googleTxt: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },

  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  registerTxt: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
  },

  registerLink: {
    color: '#C9A84C',
    fontSize: 13,
    fontWeight: '700',
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 16,
    alignItems: 'center',
  },

  cardFooterTxt: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});