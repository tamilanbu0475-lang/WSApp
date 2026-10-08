import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://10.81.141.192:5000';

export default function RegisterScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('');

  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const focusPassword = () => {
    setTimeout(() => {
      passwordRef.current?.focus();

      if (isMobile) {
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({
            animated: true,
          });
        }, 250);
      }
    }, 100);
  };

  const showError = (message: string) => {
    setStatusType('error');
    setStatusMessage(message);
    if (Platform.OS !== 'web') {
      Alert.alert('Registration Failed', message);
    }
  };

  const handleRegister = async () => {
    if (isLoading) return;

    setStatusMessage('');
    setStatusType('');

    const fullName = name.trim();
    const phoneNumber = phone.trim();
    const emailAddress = email.trim().toLowerCase();
    const userPassword = password;

    if (!fullName) {
      showError('Please enter your full name.');
      return;
    }

    if (!/^\d{10}$/.test(phoneNumber)) {
      showError('Enter a valid 10-digit mobile number.');
      return;
    }

    if (!emailAddress) {
      showError('Please enter your real working email address.');
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailAddress)) {
      showError('Enter your real email address. A secure WS App verification link will be sent to it.');
      return;
    }

    if (!userPassword) {
      showError('Please create a password.');
      return;
    }

    if (userPassword.length < 6) {
      showError('Password must contain at least 6 characters.');
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(
        `${BACKEND_URL}/api/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fullName,
            phone: phoneNumber,
            email: emailAddress,
            password: userPassword,
          }),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || 'Unable to create your account.'
        );
      }

      setStatusType('success');
      setStatusMessage('Welcome email sent. Verify your email, then complete phone OTP.');

      router.replace({
        pathname: '/otp',
        params: {
          email: emailAddress,
          phone: phoneNumber,
          fullName,
          uid: result.user?.uid ?? '',
        },
      } as any);
    } catch (error) {
      console.error('Register API error:', error);

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to connect to the backend server.';

      showError(message);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <View style={styles.root}>
      {/* FIXED BACKGROUND */}
      <View
        style={styles.backgroundLayer}
        pointerEvents="none"
      >
        <ScreenBackground
          opacity={0.18}
          mobileOpacity={0.10}
          desktopWidth="55%"
        />

        <View
          style={styles.overlay}
          pointerEvents="none"
        />
      </View>

      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
          style={styles.keyboardRoot}
          behavior="padding"
        >
          <RegisterContent
            isMobile={isMobile}
            scrollRef={scrollRef}
            phoneRef={phoneRef}
            emailRef={emailRef}
            passwordRef={passwordRef}
            name={name}
            setName={setName}
            phone={phone}
            setPhone={setPhone}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            showPwd={showPwd}
            setShowPwd={setShowPwd}
            focusPassword={focusPassword}
            onRegister={handleRegister}
            isLoading={isLoading}
            statusMessage={statusMessage}
            statusType={statusType}
          />
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.keyboardRoot}>
          <RegisterContent
            isMobile={isMobile}
            scrollRef={scrollRef}
            phoneRef={phoneRef}
            emailRef={emailRef}
            passwordRef={passwordRef}
            name={name}
            setName={setName}
            phone={phone}
            setPhone={setPhone}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            showPwd={showPwd}
            setShowPwd={setShowPwd}
            focusPassword={focusPassword}
            onRegister={handleRegister}
            isLoading={isLoading}
            statusMessage={statusMessage}
            statusType={statusType}
          />
        </View>
      )}
    </View>
  );
}

type RegisterContentProps = {
  isMobile: boolean;
  scrollRef: React.RefObject<ScrollView | null>;
  phoneRef: React.RefObject<TextInput | null>;
  emailRef: React.RefObject<TextInput | null>;
  passwordRef: React.RefObject<TextInput | null>;
  name: string;
  setName: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPwd: boolean;
  setShowPwd: (value: boolean) => void;
  focusPassword: () => void;
  onRegister: () => void;
  isLoading: boolean;
  statusMessage: string;
  statusType: 'success' | 'error' | '';
};

function RegisterContent({
  isMobile,
  scrollRef,
  phoneRef,
  emailRef,
  passwordRef,
  name,
  setName,
  phone,
  setPhone,
  email,
  setEmail,
  password,
  setPassword,
  showPwd,
  setShowPwd,
  focusPassword,
  onRegister,
  isLoading,
  statusMessage,
  statusType,
}: RegisterContentProps) {
  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#1A0310"
      />

      <View
        style={styles.glowTL}
        pointerEvents="none"
      />

      <View
        style={styles.glowBR}
        pointerEvents="none"
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scroll,
          !isMobile && styles.scrollDesktop,
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={
          Platform.OS === 'ios'
            ? 'interactive'
            : 'on-drag'
        }
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={false}
      >
        <View
          style={[
            styles.card,
            !isMobile && styles.cardDesktop,
          ]}
        >
          <View style={styles.cardTopLine} />

          {/* BACK */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backTxt}>
              ← Back
            </Text>
          </TouchableOpacity>

          {/* LOGO */}
          <View style={styles.logoRow}>
            <Image source={require('../../assets/images/splash-icon.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />

            <View>
              <Text style={styles.brandName}>
                Create Account
              </Text>

              <Text style={styles.brandSub}>
                Join WS App — Women Safety
              </Text>
            </View>
          </View>

          {/* TITLE */}
          <Text style={styles.title}>
            Get Started
          </Text>

          <Text style={styles.sub}>
            Create your free account — stay safe always
          </Text>

          {/* FULL NAME */}
          <View style={styles.fg}>
            <Text style={styles.lbl}>
              FULL NAME
            </Text>

            <View style={styles.iw}>
              <Text style={styles.iico}>
                👤
              </Text>

              <TextInput
                style={[
                  styles.inp,
                  { outlineStyle: 'none' } as any,
                ]}
                placeholder="Your full name"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={name}
                onChangeText={setName}
                returnKeyType="next"
                onSubmitEditing={() =>
                  phoneRef.current?.focus()
                }
              />
            </View>
          </View>

          {/* PHONE */}
          <View style={styles.fg}>
            <Text style={styles.lbl}>
              PHONE NUMBER
            </Text>

            <View style={styles.iw}>
              <Text style={styles.iico}>
                📱
              </Text>

              <TextInput
                ref={phoneRef}
                style={[
                  styles.inp,
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
                  emailRef.current?.focus()
                }
              />
            </View>
          </View>

          {/* EMAIL */}
          <View style={styles.fg}>
            <Text style={styles.lbl}>
              GMAIL
            </Text>

            <View style={styles.iw}>
              <Text style={styles.iico}>
                ✉️
              </Text>

              <TextInput
                ref={emailRef}
                style={[
                  styles.inp,
                  { outlineStyle: 'none' } as any,
                ]}
                placeholder="Enter your real working email"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={focusPassword}
              />
            </View>
          </View>

          {/* PASSWORD */}
          <View style={styles.fg}>
            <Text style={styles.lbl}>
              PASSWORD
            </Text>

            <View style={styles.iw}>
              <Text style={styles.iico}>
                🔒
              </Text>

              <TextInput
                ref={passwordRef}
                style={[
                  styles.inp,
                  { outlineStyle: 'none' } as any,
                ]}
                placeholder="Create a strong password"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPwd}
                returnKeyType="done"
                blurOnSubmit={false}
                onFocus={() => {
                  if (isMobile) {
                    setTimeout(() => {
                      scrollRef.current?.scrollToEnd({
                        animated: true,
                      });
                    }, 250);
                  }
                }}
                onSubmitEditing={onRegister}
              />

              <TouchableOpacity
                onPress={() =>
                  setShowPwd(!showPwd)
                }
                activeOpacity={0.7}
              >
                <Text style={styles.eyeBtn}>
                  {showPwd ? '🙈' : '👁'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* REGISTER BUTTON */}
          <TouchableOpacity
            style={styles.regBtn}
            onPress={onRegister}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            <Text style={styles.regBtnTxt}>
              {isLoading ? 'Creating Account...' : '✨  Create Account'}
            </Text>
          </TouchableOpacity>

          {statusMessage ? (
            <Text
              style={[
                styles.statusTxt,
                statusType === 'error'
                  ? styles.statusError
                  : styles.statusSuccess,
              ]}
            >
              {statusMessage}
            </Text>
          ) : null}

          {/* LOGIN */}
          <View style={styles.loginRow}>
            <Text style={styles.loginTxt}>
              Already have an account?{' '}
            </Text>

            <TouchableOpacity
              onPress={() =>
                router.push('/login' as any)
              }
              activeOpacity={0.7}
            >
              <Text style={styles.loginLink}>
                Sign In →
              </Text>
            </TouchableOpacity>
          </View>

          {/* FOOTER */}
          <View style={styles.cardFooter}>
            <Text style={styles.footerTxt}>
              🔒 Your data is safe & encrypted
            </Text>
          </View>
        </View>

        {isMobile && (
          <View style={styles.keyboardSpacer} />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1A0310',
  },

  backgroundLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },

  keyboardRoot: {
    flex: 1,
    zIndex: 10,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,3,16,0.72)',
  },

  glowTL: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(92,10,45,0.45)',
  },

  glowBR: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(11,110,79,0.12)',
  },

  scrollView: {
    flex: 1,
  },

  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
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

  backBtn: {
    marginBottom: 20,
  },

  backTxt: {
    color: 'rgba(201,168,76,0.7)',
    fontSize: 13,
    fontWeight: '700',
  },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },

  logoBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(92,10,45,0.5)',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoTxt: {
    color: '#C9A84C',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },

  brandName: {
    color: '#fff',
    fontSize: 15,
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
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 6,
  },

  sub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginBottom: 24,
  },

  fg: {
    marginBottom: 14,
  },

  lbl: {
    color: 'rgba(201,168,76,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 7,
  },

  iw: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },

  iico: {
    fontSize: 16,
    marginRight: 10,
  },

  inp: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 13,
  },

  eyeBtn: {
    fontSize: 16,
    padding: 4,
  },

  regBtn: {
    backgroundColor: '#C9A84C',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 20,
    shadowColor: '#C9A84C',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },

  regBtnTxt: {
    color: '#1A0310',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },

  statusTxt: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 14,
    paddingHorizontal: 8,
  },

  statusError: {
    color: '#FF7A9A',
  },

  statusSuccess: {
    color: '#7BE0B8',
  },

  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },

  loginTxt: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
  },

  loginLink: {
    color: '#C9A84C',
    fontSize: 13,
    fontWeight: '700',
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 14,
    alignItems: 'center',
  },

  footerTxt: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
  },

  keyboardSpacer: {
    height: 220,
  },
});