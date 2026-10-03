import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import ScreenBackground from '../components/ScreenBackground';

const MSG91_MOBILE_WIDGET_ID =
  process.env.EXPO_PUBLIC_MSG91_WIDGET_ID || 'PASTE_MOBILE_WIDGET_ID_HERE';

const MSG91_MOBILE_TOKEN_AUTH =
  process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH || 'PASTE_MOBILE_WIDGET_TOKEN_HERE';

const MSG91_WEB_WIDGET_ID =
  process.env.EXPO_PUBLIC_MSG91_WEB_WIDGET_ID || 'PASTE_WEB_WIDGET_ID_HERE';

const MSG91_WEB_TOKEN_AUTH =
  process.env.EXPO_PUBLIC_MSG91_WEB_TOKEN_AUTH || 'PASTE_WEB_WIDGET_TOKEN_HERE';

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://10.81.141.192:5000';

type WebOtpApi = {
  sendOtp: (
    identifier: string,
    success?: (data: any) => void,
    failure?: (error: any) => void
  ) => void;

  verifyOtp: (
    otp: string,
    success?: (data: any) => void,
    failure?: (error: any) => void,
    reqId?: string
  ) => void;
};

declare global {
  interface Window {
    sendOtp?: WebOtpApi['sendOtp'];
    verifyOtp?: WebOtpApi['verifyOtp'];
    initSendOTP?: (configuration: any) => void;
  }
}

export default function OTPScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const params = useLocalSearchParams<{
    phone?: string;
    email?: string;
    fullName?: string;
    uid?: string;
  }>();

  const phone = String(params.phone ?? '').replace(/\D/g, '').slice(-10);
  const uid = String(params.uid ?? '');

  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [mobileReqId, setMobileReqId] = useState('');
  const [mobileOtp, setMobileOtp] = useState('');
  const [mobileBusy, setMobileBusy] = useState(false);
  const [mobileReady, setMobileReady] = useState(false);

  const [webReqId, setWebReqId] = useState('');
  const [webOtp, setWebOtp] = useState('');
  const [webBusy, setWebBusy] = useState(false);

  const mobileWidgetRef = useRef<any>(null);
  const mobileInitializedRef = useRef(false);

  const goHome = useCallback(() => {
    router.replace({
      pathname: '/',
      params: {
        fullName: String(params.fullName ?? ''),
        phone,
        email: String(params.email ?? ''),
        uid,
      },
    } as any);
  }, [params.fullName, params.email, phone, uid]);

  const verifyAccessToken = useCallback(
    async (accessToken: string) => {
      const response = await fetch(
        `${BACKEND_URL}/api/otp/verify-access-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accessToken,
            phone,
            uid,
          }),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || 'Server could not verify the OTP token.'
        );
      }

      return result;
    },
    [phone, uid]
  );

  const initializeMobileWidget = useCallback(async () => {
    if (Platform.OS === 'web') return null;

    if (
      !MSG91_MOBILE_WIDGET_ID ||
      MSG91_MOBILE_WIDGET_ID.includes('PASTE_')
    ) {
      throw new Error('MSG91 Mobile Widget ID is not configured.');
    }

    if (
      !MSG91_MOBILE_TOKEN_AUTH ||
      MSG91_MOBILE_TOKEN_AUTH.includes('PASTE_')
    ) {
      throw new Error('MSG91 Mobile Widget token is not configured.');
    }

    if (mobileInitializedRef.current && mobileWidgetRef.current) {
      return mobileWidgetRef.current;
    }

    const module = await import('@msg91comm/sendotp-react-native');
    const OTPWidget = module.OTPWidget;

    if (!OTPWidget) {
      throw new Error('MSG91 OTPWidget is unavailable.');
    }

    OTPWidget.initializeWidget(
      MSG91_MOBILE_WIDGET_ID,
      MSG91_MOBILE_TOKEN_AUTH
    );

    mobileWidgetRef.current = OTPWidget;
    mobileInitializedRef.current = true;
    setMobileReady(true);

    return OTPWidget;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      initializeMobileWidget().catch((e) => {
        setError(
          e instanceof Error
            ? e.message
            : 'Unable to initialize MSG91 OTP.'
        );
      });
    }
  }, [initializeMobileWidget]);

  const sendMobileOtp = async () => {
    if (!phone || mobileBusy) return;

    try {
      setMobileBusy(true);
      setError('');
      setStatus('Sending OTP...');

      const OTPWidget = await initializeMobileWidget();

      if (!OTPWidget) {
        throw new Error('MSG91 OTPWidget is unavailable.');
      }

      const response = await OTPWidget.sendOTP({
        identifier: `91${phone}`,
      });

      const responseType = String(response?.type ?? '').toLowerCase();

      if (responseType && responseType !== 'success') {
        throw new Error(
          response?.message || 'MSG91 could not send the OTP.'
        );
      }

      const invisibleToken = String(
        response?.['access-token'] ??
          response?.accessToken ??
          ''
      ).trim();

      if (invisibleToken) {
        setStatus('Phone verified successfully.');
        await verifyAccessToken(invisibleToken);
        goHome();
        return;
      }

      const reqId = String(
        response?.message ??
          response?.reqId ??
          response?.reqID ??
          response?.requestId ??
          ''
      ).trim();

      if (!reqId) {
        throw new Error(
          'MSG91 did not return a request ID for this OTP.'
        );
      }

      setMobileReqId(reqId);
      setMobileOtp('');
      setStatus('OTP sent to your phone.');
    } catch (e) {
      setStatus('');
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to send OTP.'
      );
    } finally {
      setMobileBusy(false);
    }
  };

  const verifyMobileOtp = async () => {
    if (
      mobileOtp.length !== 4 ||
      !mobileReqId ||
      mobileBusy
    ) {
      return;
    }

    try {
      setMobileBusy(true);
      setError('');
      setStatus('Verifying OTP...');

      const OTPWidget = await initializeMobileWidget();

      if (!OTPWidget) {
        throw new Error('MSG91 OTPWidget is unavailable.');
      }

      const response = await OTPWidget.verifyOTP({
        reqId: mobileReqId,
        otp: mobileOtp,
      });

      const responseType = String(response?.type ?? '').toLowerCase();

      if (responseType && responseType !== 'success') {
        throw new Error(
          response?.message || 'Invalid OTP.'
        );
      }

      const accessToken = String(
        response?.['access-token'] ??
          response?.accessToken ??
          response?.message ??
          ''
      ).trim();

      if (!accessToken) {
        throw new Error(
          'OTP verification completed but no access token was returned.'
        );
      }

      await verifyAccessToken(accessToken);

      setStatus('Phone verified successfully.');
      goHome();
    } catch (e) {
      setStatus('');

      setError(
        e instanceof Error
          ? e.message
          : 'Invalid OTP.'
      );
    } finally {
      setMobileBusy(false);
    }
  };

  const loadWebSdk = async () => {
    if (typeof window === 'undefined') {
      throw new Error('Web OTP is unavailable.');
    }

    if (
      !MSG91_WEB_WIDGET_ID ||
      MSG91_WEB_WIDGET_ID.includes('PASTE_')
    ) {
      throw new Error('MSG91 Web Widget ID is not configured.');
    }

    if (
      !MSG91_WEB_TOKEN_AUTH ||
      MSG91_WEB_TOKEN_AUTH.includes('PASTE_')
    ) {
      throw new Error('MSG91 Web Widget token is not configured.');
    }

    if (window.sendOtp && window.verifyOtp) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const initialize = () => {
        try {
          if (!window.initSendOTP) {
            reject(
              new Error(
                'MSG91 Web SDK initialization is unavailable.'
              )
            );
            return;
          }

          window.initSendOTP({
            widgetId: MSG91_WEB_WIDGET_ID,
            tokenAuth: MSG91_WEB_TOKEN_AUTH,
            exposeMethods: true,
            captchaRenderId: '',
            success: () => undefined,
            failure: () => undefined,
          });

          const started = Date.now();

          const timer = window.setInterval(() => {
            if (window.sendOtp && window.verifyOtp) {
              window.clearInterval(timer);
              resolve();
              return;
            }

            if (Date.now() - started > 10000) {
              window.clearInterval(timer);
              reject(
                new Error(
                  'MSG91 Web OTP methods were not exposed.'
                )
              );
            }
          }, 100);
        } catch (e) {
          reject(
            e instanceof Error
              ? e
              : new Error(
                  'MSG91 Web SDK initialization failed.'
                )
          );
        }
      };

      const existing =
        document.getElementById('msg91-otp-sdk');

      if (existing) {
        initialize();
        return;
      }

      const script = document.createElement('script');

      script.id = 'msg91-otp-sdk';
      script.type = 'text/javascript';
      script.src =
        'https://verify.msg91.com/otp-provider.js';
      script.async = true;

      script.onload = initialize;

      script.onerror = () =>
        reject(
          new Error(
            'Unable to load MSG91 Web OTP SDK.'
          )
        );

      document.head.appendChild(script);
    });
  };

  const sendWebOtp = async () => {
    if (!phone || webBusy) return;

    try {
      setWebBusy(true);
      setError('');
      setStatus('Sending OTP...');

      await loadWebSdk();

      await new Promise<void>((resolve, reject) => {
        window.sendOtp!(
          `91${phone}`,
          (data: any) => {
            const reqId = String(
              data?.reqId ??
                data?.reqID ??
                data?.requestId ??
                data?.message ??
                ''
            ).trim();

            if (!reqId) {
              reject(
                new Error(
                  data?.message ||
                    'MSG91 did not return a request ID.'
                )
              );
              return;
            }

            setWebReqId(reqId);
            setStatus('OTP sent to your phone.');
            resolve();
          },
          (e: any) =>
            reject(
              new Error(
                e?.message || 'Unable to send OTP.'
              )
            )
        );
      });
    } catch (e) {
      setStatus('');
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to send OTP.'
      );
    } finally {
      setWebBusy(false);
    }
  };

  const verifyWebOtp = async () => {
    if (
      !webOtp ||
      webOtp.length !== 4 ||
      !webReqId ||
      webBusy
    ) {
      return;
    }

    try {
      setWebBusy(true);
      setError('');
      setStatus('Verifying OTP...');

      await loadWebSdk();

      await new Promise<void>((resolve, reject) => {
        window.verifyOtp!(
          webOtp,
          async (data: any) => {
            try {
              const token = String(
                data?.message ??
                  data?.['access-token'] ??
                  data?.accessToken ??
                  ''
              ).trim();

              if (!token) {
                throw new Error(
                  'No access token received.'
                );
              }

              await verifyAccessToken(token);

              setStatus(
                'Phone verified successfully.'
              );

              resolve();
              goHome();
            } catch (e) {
              reject(e);
            }
          },
          (e: any) =>
            reject(
              new Error(
                e?.message || 'Invalid OTP.'
              )
            ),
          webReqId
        );
      });
    } catch (e) {
      setStatus('');
      setError(
        e instanceof Error
          ? e.message
          : 'Invalid OTP.'
      );
    } finally {
      setWebBusy(false);
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <ScreenBackground
          opacity={0.18}
          mobileOpacity={0.10}
          desktopWidth="55%"
        />

        <View style={styles.overlay} />

        <StatusBar
          barStyle="light-content"
          backgroundColor="#1A0310"
        />

        <View style={styles.glowTL} />
        <View style={styles.glowBR} />

        <View
          style={[
            styles.card,
            !isMobile && styles.cardDesktop,
          ]}
        >
          <View style={styles.cardTopLine} />

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() =>
              router.replace('/register' as any)
            }
          >
            <Text style={styles.backTxt}>
              ← Back
            </Text>
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <View style={styles.iconBox}>
              <Text style={{ fontSize: 32 }}>
                🔐
              </Text>
            </View>
          </View>

          <Text style={styles.title}>
            Verify OTP
          </Text>

          <Text style={styles.sub}>
            Securely verify your mobile number to
            activate your WS App account.
          </Text>

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              mobileBusy &&
                styles.disabledBtn,
            ]}
            onPress={sendMobileOtp}
            disabled={mobileBusy}
          >
            <Text style={styles.primaryBtnTxt}>
              {mobileBusy
                ? 'PROCESSING...'
                : mobileReqId
                  ? 'RESEND OTP'
                  : 'SEND OTP'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.phoneHint}>
            Mobile: +91 {phone}
          </Text>

          {!!mobileReqId && (
            <View style={styles.webInputWrap}>
              <Text style={styles.webLabel}>
                ENTER OTP
              </Text>

              <TextInput
                style={styles.webTextInput}
                value={mobileOtp}
                onChangeText={(v) =>
                  setMobileOtp(
                    v
                      .replace(/\D/g, '')
                      .slice(0, 4)
                  )
                }
                keyboardType="number-pad"
                maxLength={4}
                placeholder="4-digit OTP"
                placeholderTextColor="rgba(255,255,255,0.22)"
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.verifyBtnSpacing,
                  (mobileOtp.length !== 4 ||
                    mobileBusy) &&
                    styles.disabledBtn,
                ]}
                disabled={
                  mobileOtp.length !== 4 ||
                  mobileBusy
                }
                onPress={verifyMobileOtp}
              >
                <Text style={styles.primaryBtnTxt}>
                  VERIFY OTP
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!!status && (
            <Text style={styles.statusTxt}>
              {status}
            </Text>
          )}

          {!!error && (
            <Text style={styles.errorTxt}>
              {error}
            </Text>
          )}

          <View style={styles.cardFooter}>
            <Text style={styles.footerTxt}>
              🔒 MSG91 secure mobile OTP verification
            </Text>

            <Text style={styles.sdkStateTxt}>
              {mobileReady
                ? 'MSG91 ready'
                : 'Preparing MSG91...'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenBackground
        opacity={0.18}
        mobileOpacity={0.10}
        desktopWidth="55%"
      />

      <View style={styles.overlay} />
      <StatusBar
        barStyle="light-content"
        backgroundColor="#1A0310"
      />

      <View style={styles.glowTL} />
      <View style={styles.glowBR} />

      <View
        style={[
          styles.card,
          styles.cardDesktop,
        ]}
      >
        <View style={styles.cardTopLine} />

        <TouchableOpacity
          style={styles.backBtn}
          onPress={() =>
            router.replace('/register' as any)
          }
        >
          <Text style={styles.backTxt}>
            ← Back
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Verify OTP
        </Text>

        <Text style={styles.sub}>
          Enter the 4-digit code sent to your phone.
        </Text>

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            webBusy && styles.disabledBtn,
          ]}
          onPress={sendWebOtp}
          disabled={webBusy}
        >
          <Text style={styles.primaryBtnTxt}>
            {webBusy
              ? 'PROCESSING...'
              : webReqId
                ? 'RESEND OTP'
                : 'SEND OTP'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.phoneHint}>
          Mobile: +91 {phone}
        </Text>

        {!!status && (
          <Text style={styles.statusTxt}>
            {status}
          </Text>
        )}

        {!!error && (
          <Text style={styles.errorTxt}>
            {error}
          </Text>
        )}

        <View style={styles.webInputWrap}>
          <Text style={styles.webLabel}>
            ENTER OTP
          </Text>

          <TextInput
            style={styles.webTextInput}
            value={webOtp}
            onChangeText={(v) =>
              setWebOtp(
                v.replace(/\D/g, '').slice(0, 4)
              )
            }
            keyboardType="number-pad"
            maxLength={4}
            placeholder="4-digit OTP"
            placeholderTextColor="rgba(255,255,255,0.22)"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            (webOtp.length !== 4 ||
              !webReqId ||
              webBusy) &&
              styles.disabledBtn,
          ]}
          disabled={
            webOtp.length !== 4 ||
            !webReqId ||
            webBusy
          }
          onPress={verifyWebOtp}
        >
          <Text style={styles.primaryBtnTxt}>
            VERIFY OTP
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor:
      'rgba(26,3,16,0.72)',
  },

  container: {
    flex: 1,
    backgroundColor: '#1A0310',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },

  glowTL: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor:
      'rgba(92,10,45,0.45)',
  },

  glowBR: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor:
      'rgba(11,110,79,0.12)',
  },

  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor:
      'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor:
      'rgba(201,168,76,0.25)',
    borderRadius: 28,
    padding: 32,
    overflow: 'hidden',
  },

  cardDesktop: {
    maxWidth: 440,
    padding: 44,
  },

  cardTopLine: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 1,
    backgroundColor:
      'rgba(201,168,76,0.5)',
  },

  backBtn: {
    marginBottom: 20,
  },

  backTxt: {
    color: 'rgba(201,168,76,0.7)',
    fontSize: 13,
    fontWeight: '700',
  },

  iconWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },

  iconBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor:
      'rgba(201,168,76,0.1)',
    borderWidth: 1.5,
    borderColor:
      'rgba(201,168,76,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },

  sub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },

  primaryBtn: {
    backgroundColor: '#C9A84C',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },

  verifyBtnSpacing: {
    marginTop: 14,
  },

  disabledBtn: {
    opacity: 0.55,
  },

  primaryBtnTxt: {
    color: '#1A0310',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },

  phoneHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
  },

  statusTxt: {
    color: '#7BE0B8',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 18,
  },

  errorTxt: {
    color: '#FF8C8C',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 18,
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor:
      'rgba(255,255,255,0.06)',
    paddingTop: 14,
    alignItems: 'center',
  },

  footerTxt: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    textAlign: 'center',
  },

  sdkStateTxt: {
    color: 'rgba(255,255,255,0.16)',
    fontSize: 10,
    marginTop: 5,
  },

  webInputWrap: {
    marginTop: 8,
    marginBottom: 12,
  },

  webLabel: {
    color: 'rgba(201,168,76,0.75)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },

  webTextInput: {
    color: '#fff',
    fontSize: 20,
    textAlign: 'center',
    backgroundColor:
      'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor:
      'rgba(201,168,76,0.3)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
});
